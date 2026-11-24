import { FastBrain } from "./FastBrain";
import { FastTrack } from "./FastTrack";

export type AgentState = {
  brain: FastBrain;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  alive: boolean;
  progress: number;
  bestProgress: number;
  checkpoint: number;
  laps: number;
  score: number;
  lastCpFrame: number;
  framesAlive: number;
  lastSteer: number;
  crashed: boolean;
};

const RAYS = 11;
export const FAST_INPUTS = RAYS + 3;

export class FastTrainer {
  track: FastTrack;
  agents: AgentState[] = [];
  generation = 1;
  bestScore = 0;
  population: number;
  maxFrames: number;
  checkpoints: number[];
  frame = 0;
  champion: FastBrain | null = null;
  /** Index of the current generation leader (highest score / progress). */
  leaderIndex = 0;
  private out = new Float32Array(3);
  private input = new Float32Array(FAST_INPUTS);
  private finishedLapThisGen = false;

  constructor(track: FastTrack, population = 24, maxFrames = 2400) {
    this.track = track;
    this.population = population;
    this.maxFrames = maxFrames;
    const n = Math.max(28, Math.round(track.totalLength / 9));
    this.checkpoints = [];
    for (let i = 1; i <= n; i++) this.checkpoints.push(i / (n + 1));
  }

  resetPopulation(seeded = true) {
    this.agents = [];
    this.finishedLapThisGen = false;
    for (let i = 0; i < this.population; i++) {
      let brain: FastBrain;
      if (seeded && i < 8) {
        brain = FastBrain.centerlineSeed(FAST_INPUTS);
        if (i > 0) brain.mutate(0.05 + i * 0.025);
      } else if (this.champion) {
        if (i < 3) brain = this.champion.clone();
        else if (i % 2 === 0) {
          brain = FastBrain.crossover(this.champion, this.champion);
          brain.mutate(0.08 + Math.random() * 0.18);
        } else {
          brain = this.champion.clone();
          brain.mutate(0.06 + Math.random() * 0.2);
        }
      } else {
        brain = new FastBrain(FAST_INPUTS, 16, 3);
      }
      this.agents.push(this.spawn(brain, (i % 5) - 2, i));
    }
    this.frame = 0;
    this.leaderIndex = 0;
  }

  private spawn(brain: FastBrain, lane: number, gridIndex = 0): AgentState {
    // Small stagger so the swarm is readable without skipping early checkpoints
    const along = gridIndex % 4;
    const s = this.track.getSpawn(lane, along);
    let checkpoint = 0;
    while (checkpoint < this.checkpoints.length && s.progress >= this.checkpoints[checkpoint]) {
      checkpoint += 1;
    }
    return {
      brain,
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      speed: 5 + (gridIndex % 3),
      alive: true,
      progress: s.progress,
      bestProgress: s.progress,
      checkpoint,
      laps: 0,
      score: 0,
      lastCpFrame: 0,
      framesAlive: 0,
      lastSteer: 0,
      crashed: false,
    };
  }

  startFresh() {
    this.generation = 1;
    this.bestScore = 0;
    this.champion = null;
    this.resetPopulation(true);
  }

  private sense(a: AgentState) {
    const spread = Math.PI * 0.9;
    for (let i = 0; i < RAYS; i++) {
      const t = i / (RAYS - 1);
      const rel = spread / 2 - spread * t;
      const ang = a.yaw + rel;
      this.input[i] = this.track.raycast(a.x, a.z, Math.sin(ang), Math.cos(ang), 28);
    }
    const proj = this.track.project(a.x, a.z);
    this.input[RAYS] = Math.min(1, a.speed / 22);
    this.input[RAYS + 1] = Math.max(-1, Math.min(1, proj.lateral / (this.track.width * 0.5)));
    this.input[RAYS + 2] = Math.sin(a.yaw) * proj.tx + Math.cos(a.yaw) * proj.tz;
    return proj;
  }

  private stepAgent(a: AgentState, dt: number) {
    if (!a.alive) return;
    const proj0 = this.sense(a);
    a.brain.think(this.input, this.out);
    // Never repeat a known crash pattern for this bot
    a.brain.crashBook.apply(proj0.progress, proj0.lateral, this.input[5], this.out);

    const throttle = this.out[0];
    const steer = this.out[1];
    const brake = this.out[2];
    a.lastSteer = steer;

    const accel = 20;
    const maxSpeed = 21;
    if (brake > 0.55 && throttle < 0.45) {
      a.speed = Math.max(0, a.speed - accel * 1.6 * dt);
    } else {
      a.speed += accel * Math.max(0.15, throttle) * dt;
      a.speed = Math.min(maxSpeed, a.speed);
      a.speed = Math.max(0, a.speed - accel * 0.08 * dt);
    }

    const front = this.input[Math.floor(RAYS / 2)];
    if (front < 0.35) a.speed = Math.min(a.speed, 8 + front * 20);

    const steerFactor = 0.45 + 0.55 * Math.min(1, Math.abs(a.speed) / maxSpeed);
    a.yaw += steer * 3.4 * steerFactor * dt;
    a.x += Math.sin(a.yaw) * a.speed * dt;
    a.z += Math.cos(a.yaw) * a.speed * dt;
    a.framesAlive += 1;

    const proj = this.track.project(a.x, a.z);
    if (!proj.onTrack) {
      a.alive = false;
      a.crashed = true;
      // Machine learning: this bot remembers and never repeats this crash
      a.brain.learnFromCrash(this.input, a.lastSteer, proj.progress, proj.lateral);
      this.score(a, proj.progress);
      return;
    }

    const prev = a.progress;
    const wrapped = prev > 0.82 && proj.progress < 0.18;
    const forward = proj.progress >= prev - 0.004 || wrapped;

    if (forward) {
      while (
        a.checkpoint < this.checkpoints.length &&
        ((prev < this.checkpoints[a.checkpoint] && proj.progress >= this.checkpoints[a.checkpoint]) ||
          (wrapped && this.checkpoints[a.checkpoint] > 0.85))
      ) {
        a.checkpoint += 1;
        a.lastCpFrame = this.frame;
      }

      const cleared = a.checkpoint >= Math.floor(this.checkpoints.length * 0.92);
      if (wrapped && (cleared || a.checkpoint >= this.checkpoints.length)) {
        a.laps += 1;
        a.checkpoint = 0;
        a.lastCpFrame = this.frame;
        a.bestProgress += 1;
        this.finishedLapThisGen = true;
      }
      a.bestProgress = Math.max(a.bestProgress, a.laps + proj.progress);
    }

    const centerBonus = 1 - Math.min(1, Math.abs(proj.lateral) / (this.track.width * 0.5));
    a.progress = proj.progress;
    this.score(a, proj.progress, centerBonus, a.speed);

    if (this.frame - a.lastCpFrame > 480) {
      a.alive = false;
      a.crashed = true;
    }
  }

  private score(a: AgentState, progress: number, center = 0.5, speed = 0) {
    a.score =
      a.laps * 50 +
      a.checkpoint * 1.2 +
      Math.min(0.99, progress) +
      Math.min(a.bestProgress, a.laps + 1) * 0.5 +
      center * 0.2 +
      Math.min(0.15, speed / 120);
  }

  private updateLeader() {
    let best = -1;
    let idx = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const s = this.agents[i].score;
      if (s > best) {
        best = s;
        idx = i;
      }
    }
    this.leaderIndex = idx;
  }

  /**
   * Visible training step — advances physics one tick for every car.
   * Call several times per render frame for snappy motion.
   */
  liveStep(dt = 1 / 48): {
    generationDone: boolean;
    lapComplete: boolean;
    alive: number;
    leaderIndex: number;
  } {
    if (!this.agents.length) this.resetPopulation(true);
    this.frame += 1;
    let alive = 0;
    for (const a of this.agents) {
      this.stepAgent(a, dt);
      if (a.alive) alive += 1;
    }
    this.updateLeader();

    const lapComplete = this.finishedLapThisGen;
    const timedOut = this.frame >= this.maxFrames;
    const extinct = alive === 0;
    // Let a lap-finisher celebrate briefly before breeding
    const generationDone =
      extinct || timedOut || (lapComplete && this.frame > 90 && alive <= Math.max(2, this.population * 0.15));

    if (generationDone) {
      this.finishGeneration();
    }

    return {
      generationDone,
      lapComplete,
      alive,
      leaderIndex: this.leaderIndex,
    };
  }

  private finishGeneration() {
    this.agents.sort((a, b) => b.score - a.score);
    const best = this.agents[0];
    if (best.score > this.bestScore) this.bestScore = best.score;
    this.champion = best.brain.clone();
    this.breedNext();
    this.generation += 1;
    this.finishedLapThisGen = false;
    this.leaderIndex = 0;
  }

  runGeneration(): { best: number; laps: number; frames: number } {
    if (!this.agents.length) this.resetPopulation(true);
    this.frame = 0;
    this.finishedLapThisGen = false;
    const dt = 1 / 36;

    while (this.frame < this.maxFrames) {
      this.frame += 1;
      let alive = 0;
      let finished = false;
      for (const a of this.agents) {
        this.stepAgent(a, dt);
        if (a.alive) alive += 1;
        if (a.laps >= 1) finished = true;
      }
      if (finished) break;
      if (alive === 0) break;
      if (alive <= 2 && this.frame > 500) break;
    }

    this.agents.sort((a, b) => b.score - a.score);
    const best = this.agents[0];
    if (best.score > this.bestScore) this.bestScore = best.score;
    this.champion = best.brain.clone();
    const laps = best.laps;
    this.breedNext();
    this.generation += 1;
    return { best: best.score, laps, frames: this.frame };
  }

  private breedNext() {
    const elites = this.agents.slice(0, Math.max(4, Math.floor(this.population * 0.25)));
    const next: AgentState[] = [];

    // Preserve elite brains + their crash memories untouched
    for (let i = 0; i < Math.min(4, elites.length); i++) {
      next.push(this.spawn(elites[i].brain.clone(), (i % 5) - 2, i));
    }
    for (let i = 0; i < 5; i++) {
      const b = FastBrain.centerlineSeed(FAST_INPUTS);
      if (this.champion) b.crashBook.merge(this.champion.crashBook);
      b.mutate(0.05 + i * 0.035);
      next.push(this.spawn(b, (i % 5) - 2, next.length));
    }
    while (next.length < this.population - 2) {
      const p1 = elites[Math.floor(Math.random() * elites.length)].brain;
      const p2 = elites[Math.floor(Math.random() * elites.length)].brain;
      const child = Math.random() < 0.65 ? FastBrain.crossover(p1, p2) : p1.clone();
      // Mild mutate — keep crash lessons intact
      child.mutate(0.04 + Math.random() * 0.22);
      next.push(this.spawn(child, (next.length % 5) - 2, next.length));
    }
    while (next.length < this.population) {
      const fresh = new FastBrain(FAST_INPUTS, 16, 3);
      if (this.champion) fresh.crashBook.merge(this.champion.crashBook);
      next.push(this.spawn(fresh, (next.length % 5) - 2, next.length));
    }
    this.agents = next;
    this.frame = 0;
  }

  trainUntilLap(maxGens = 40): { generations: number; best: number; ms: number; success: boolean } {
    this.startFresh();
    const t0 = Date.now();
    let best = 0;
    for (let g = 0; g < maxGens; g++) {
      const r = this.runGeneration();
      best = Math.max(best, r.best);
      if (r.laps >= 1) {
        return { generations: g + 1, best, ms: Date.now() - t0, success: true };
      }
    }
    return { generations: maxGens, best, ms: Date.now() - t0, success: false };
  }

  turbo(gens: number): { generation: number; bestScore: number; success: boolean } {
    let success = false;
    for (let i = 0; i < gens; i++) {
      const r = this.runGeneration();
      if (r.laps >= 1) success = true;
    }
    return { generation: this.generation, bestScore: this.bestScore, success };
  }
}
