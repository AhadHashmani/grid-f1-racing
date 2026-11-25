import { FastBrain } from "./FastBrain";
import { FastTrack } from "./FastTrack";
import { DRIVE, steerAuthority } from "./driveParams";

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
  /** Analytic teacher — drives well on any layout and imitates into its brain. */
  coach: boolean;
};

const RAYS = DRIVE.rayCount;
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

  constructor(track: FastTrack, population = 32, maxFrames = 2800) {
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
      const coach = i < 4; // dedicated teachers for every layout
      if (coach || (seeded && i < 14)) {
        brain = FastBrain.centerlineSeed(FAST_INPUTS);
        if (!coach && i > 0) brain.mutate(0.04 + (i - 4) * 0.018);
      } else if (this.champion) {
        if (i < 7) brain = this.champion.clone();
        else if (i % 2 === 0) {
          brain = FastBrain.crossover(this.champion, this.champion);
          brain.mutate(0.07 + Math.random() * 0.16);
        } else {
          brain = this.champion.clone();
          brain.mutate(0.05 + Math.random() * 0.18);
        }
      } else {
        brain = new FastBrain(FAST_INPUTS, 16, 3);
      }
      this.agents.push(this.spawn(brain, (i % 5) - 2, i, coach));
    }
    this.frame = 0;
    this.leaderIndex = 0;
  }

  private spawn(brain: FastBrain, lane: number, gridIndex = 0, coach = false): AgentState {
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
      coach,
    };
  }

  /**
   * Pure-pursuit teacher: aim at a centerline point ahead.
   * Shortens look-ahead in corners; optional magnet for dedicated coaches only.
   */
  private coachDrive(a: AgentState, out: Float32Array, magnet = true) {
    const front = this.input[Math.floor(RAYS / 2)];
    const lateral = this.input[RAYS + 1];
    const absLat = Math.abs(lateral);

    // Soft magnet to centerline so edited hairpins don't spit the teacher out
    if (magnet && absLat > 0.15) {
      const pull = Math.min(0.55, absLat * 0.35);
      const cen = this.track.sampleAtProgress(a.progress);
      a.x += (cen.x - a.x) * pull * 0.2;
      a.z += (cen.z - a.z) * pull * 0.2;
    }

    let look = Math.max(6, Math.min(18, 6 + a.speed * 0.45));
    if (front < 0.5) look *= 0.45;
    if (absLat > 0.4) look = Math.min(look, 7);
    const target = this.track.sampleAtProgress(a.progress + look / Math.max(this.track.totalLength, 1));
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const desired = Math.atan2(dx, dz);
    let err = desired - a.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;

    let steer = err * 1.5 - lateral * 0.9;
    if (steer > 1) steer = 1;
    if (steer < -1) steer = -1;

    let brake = 0.05;
    let throttle = 0.88;
    if (front < 0.3) {
      brake = 0.8;
      throttle = 0.25;
    } else if (front < 0.45 || Math.abs(err) > 0.65) {
      brake = 0.3;
      throttle = 0.5;
    }
    if (a.speed < 3.5) {
      throttle = 1;
      brake = 0;
    }

    out[0] = throttle;
    out[1] = steer;
    out[2] = brake;
  }

  startFresh() {
    this.generation = 1;
    this.bestScore = 0;
    this.champion = null;
    this.resetPopulation(true);
  }

  private sense(a: AgentState) {
    for (let i = 0; i < RAYS; i++) {
      const t = i / (RAYS - 1);
      const rel = DRIVE.raySpread / 2 - DRIVE.raySpread * t;
      const ang = a.yaw + rel;
      this.input[i] = this.track.raycast(
        a.x,
        a.z,
        Math.sin(ang),
        Math.cos(ang),
        DRIVE.rayRange,
        a.progress,
      );
    }
    const proj = this.track.project(a.x, a.z, a.progress);
    this.input[RAYS] = Math.min(1, a.speed / 22);
    this.input[RAYS + 1] = Math.max(-1, Math.min(1, proj.lateral / (this.track.width * 0.5)));
    this.input[RAYS + 2] = Math.sin(a.yaw) * proj.tx + Math.cos(a.yaw) * proj.tz;
    return proj;
  }

  private stepAgent(a: AgentState, dt: number) {
    if (!a.alive) return;
    const proj0 = this.sense(a);

    let throttle: number;
    let steer: number;
    let brake: number;

    if (a.coach) {
      // Teacher drives; NN imitates so a usable champion brain emerges
      this.coachDrive(a, this.out);
      a.brain.imitate(this.input, this.out[0], this.out[1], this.out[2], 0.09);
      throttle = this.out[0];
      steer = this.out[1];
      brake = this.out[2];
    } else {
      a.brain.think(this.input, this.out);
      a.brain.crashBook.apply(
        proj0.progress,
        proj0.lateral,
        this.input[Math.floor(RAYS / 2)],
        this.out,
      );
      throttle = this.out[0];
      steer = this.out[1];
      brake = this.out[2];
      // Soft centerline assist when learners drift — stops mini-circle death spirals
      const latN = Math.abs(this.input[RAYS + 1]);
      if (latN > 0.28 || this.input[Math.floor(RAYS / 2)] < 0.38) {
        this.coachDrive(a, this.out, true); // gentle magnet + pursuit labels
        const blend = Math.min(0.65, 0.25 + latN * 0.55);
        throttle = throttle * (1 - blend) + this.out[0] * blend;
        steer = steer * (1 - blend) + this.out[1] * blend;
        brake = brake * (1 - blend) + this.out[2] * blend;
        a.brain.imitate(this.input, this.out[0], this.out[1], this.out[2], 0.05);
      }
      // Learners also unstick instead of spinning in place
      if (a.speed < 2.5) {
        throttle = Math.max(throttle, 0.9);
        brake = 0;
        steer *= 0.5;
      }
    }

    const front = this.input[Math.floor(RAYS / 2)];
    const lateral = this.input[RAYS + 1];
    const align = this.input[RAYS + 2];
    // Going straight on open track → kill unnecessary spin
    if (front > 0.55 && Math.abs(lateral) < 0.22 && align > 0.55) {
      steer *= 0.25;
    }
    // Cap steer by speed so slow cars can't doughnut (coaches skip when crawling out)
    if (!(a.coach && a.speed < 3)) {
      steer *= steerAuthority(a.speed);
    }
    a.lastSteer = steer;

    const accel = DRIVE.accel;
    const maxSpeed = DRIVE.maxSpeed;
    if (brake > DRIVE.brakeThresh && throttle < DRIVE.throttleThresh) {
      a.speed = Math.max(0, a.speed - accel * DRIVE.brakeMult * dt);
    } else {
      a.speed += accel * Math.max(DRIVE.minThrottle, throttle) * dt;
      a.speed = Math.min(maxSpeed, a.speed);
      a.speed = Math.max(0, a.speed - accel * DRIVE.drag * dt);
    }

    if (front < DRIVE.frontSlow) {
      a.speed = Math.min(a.speed, DRIVE.frontMin + front * DRIVE.frontScale);
    }

    const steerFactor =
      DRIVE.steerBase + DRIVE.steerSpeed * Math.min(1, Math.abs(a.speed) / maxSpeed);
    a.yaw += steer * DRIVE.rotSpeed * steerFactor * dt;
    a.framesAlive += 1;

    const prev = a.progress;
    // Sub-step translation so high-speed cars can't tunnel past the wall face
    const moveDist = Math.abs(a.speed) * dt;
    const subSteps = Math.max(1, Math.min(10, Math.ceil(moveDist / DRIVE.wallStep)));
    const sdt = dt / subSteps;
    for (let s = 0; s < subSteps; s++) {
      a.x += Math.sin(a.yaw) * a.speed * sdt;
      a.z += Math.cos(a.yaw) * a.speed * sdt;
      const hit = this.track.resolveWall(a.x, a.z, a.progress);
      a.x = hit.x;
      a.z = hit.z;
      a.progress = hit.progress;
      if (hit.hit) {
        a.speed = 0;
        a.alive = false;
        a.crashed = true;
        a.brain.learnFromCrash(this.input, a.lastSteer, hit.progress, hit.lateral);
        this.score(a, hit.progress);
        return;
      }
    }
    const proj = this.track.project(a.x, a.z, a.progress);
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
    // Penalize spinning in place (high |steer| without progress gain)
    const spinPenalty = Math.abs(a.lastSteer) > 0.7 && a.speed < 6 ? 0.15 : 0;
    this.score(a, proj.progress, centerBonus, a.speed, spinPenalty);

    if (this.frame - a.lastCpFrame > 480) {
      a.alive = false;
      a.crashed = true;
    }
  }

  private score(a: AgentState, progress: number, center = 0.5, speed = 0, spinPenalty = 0) {
    a.score =
      a.laps * 50 +
      a.checkpoint * 1.2 +
      Math.min(0.99, progress) +
      Math.min(a.bestProgress, a.laps + 1) * 0.5 +
      center * 0.25 +
      Math.min(0.2, speed / 100) -
      spinPenalty;
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
    // Prefer a learner that lapped; else a coach (its NN was imitating the teacher)
    const best =
      this.agents.find((a) => !a.coach && a.laps >= 1) ??
      this.agents.find((a) => a.laps >= 1) ??
      this.agents[0];
    if (best.score > this.bestScore) this.bestScore = best.score;
    // Coach brains were trained with a position magnet — distill a fresh prior instead
    this.champion =
      best.coach && best.laps >= 1
        ? FastBrain.centerlineSeed(FAST_INPUTS)
        : best.brain.clone();
    if (best.laps >= 1) this.distillChampion(this.champion);
    this.breedNext();
    this.generation += 1;
    this.finishedLapThisGen = false;
    this.leaderIndex = 0;
  }

  /** Supervised pass: dense poses along the ribbon → pure-pursuit labels. */
  private distillChampion(brain: FastBrain) {
    const total = Math.max(this.track.totalLength, 1);
    const steps = 480;
    for (let epoch = 0; epoch < 5; epoch++) {
      for (let step = 0; step < steps; step++) {
        const progress = ((step + epoch * 37) % steps) / steps;
        const latNoise = (((step * 3 + epoch * 5) % 11) - 5) * 0.45;
        const yawNoise = (((step * 2 + epoch) % 9) - 4) * 0.06;
        const s = this.track.sampleAtProgress(progress);
        const x = s.x + s.nx * latNoise;
        const z = s.z + s.nz * latNoise;
        const yaw = Math.atan2(s.tx, s.tz) + yawNoise;
        const speed = 6 + ((step + epoch * 4) % 10);
        // Sense into this.input
        for (let i = 0; i < RAYS; i++) {
          const t = i / (RAYS - 1);
          const rel = DRIVE.raySpread / 2 - DRIVE.raySpread * t;
          const ang = yaw + rel;
          this.input[i] = this.track.raycast(
            x,
            z,
            Math.sin(ang),
            Math.cos(ang),
            DRIVE.rayRange,
            progress,
          );
        }
        const proj = this.track.project(x, z, progress);
        this.input[RAYS] = Math.min(1, speed / 22);
        this.input[RAYS + 1] = Math.max(-1, Math.min(1, proj.lateral / (this.track.width * 0.5)));
        this.input[RAYS + 2] = Math.sin(yaw) * proj.tx + Math.cos(yaw) * proj.tz;

        const front = this.input[Math.floor(RAYS / 2)];
        const lateral = this.input[RAYS + 1];
        let look = Math.max(6, Math.min(16, 6 + speed * 0.4));
        if (front < 0.5) look *= 0.45;
        if (Math.abs(lateral) > 0.4) look = Math.min(look, 7);
        const target = this.track.sampleAtProgress(progress + look / total);
        const dx = target.x - x;
        const dz = target.z - z;
        let err = Math.atan2(dx, dz) - yaw;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        let steer = err * 1.55 - lateral * 0.95;
        if (steer > 1) steer = 1;
        if (steer < -1) steer = -1;
        const brake = front < 0.28 ? 0.85 : front < 0.42 || Math.abs(err) > 0.7 ? 0.35 : 0.05;
        const throttle = front < 0.28 ? 0.2 : Math.abs(err) > 0.7 ? 0.55 : 0.92;
        brain.imitate(this.input, throttle, steer, brake, 0.1);
      }
    }
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
    const best =
      this.agents.find((a) => !a.coach && a.laps >= 1) ??
      this.agents.find((a) => a.laps >= 1) ??
      this.agents[0];
    if (best.score > this.bestScore) this.bestScore = best.score;
    this.champion =
      best.coach && best.laps >= 1
        ? FastBrain.centerlineSeed(FAST_INPUTS)
        : best.brain.clone();
    if (best.laps >= 1) this.distillChampion(this.champion);
    const laps = best.laps;
    this.breedNext();
    this.generation += 1;
    return { best: best.score, laps, frames: this.frame };
  }

  private breedNext() {
    const elites = this.agents.slice(0, Math.max(4, Math.floor(this.population * 0.25)));
    const next: AgentState[] = [];

    // Preserve elite brains + their crash memories untouched
    // Keep analytic coaches every generation
    for (let i = 0; i < 4; i++) {
      next.push(this.spawn(FastBrain.centerlineSeed(FAST_INPUTS), (i % 5) - 2, i, true));
    }
    for (let i = 0; i < Math.min(4, elites.length); i++) {
      next.push(this.spawn(elites[i].brain.clone(), (i % 5) - 2, next.length, false));
    }
    for (let i = 0; i < 5; i++) {
      const b = FastBrain.centerlineSeed(FAST_INPUTS);
      if (this.champion) b.crashBook.merge(this.champion.crashBook);
      b.mutate(0.05 + i * 0.03);
      next.push(this.spawn(b, (i % 5) - 2, next.length, false));
    }
    while (next.length < this.population - 2) {
      const p1 = elites[Math.floor(Math.random() * elites.length)].brain;
      const p2 = elites[Math.floor(Math.random() * elites.length)].brain;
      const child = Math.random() < 0.65 ? FastBrain.crossover(p1, p2) : p1.clone();
      child.mutate(0.04 + Math.random() * 0.2);
      next.push(this.spawn(child, (next.length % 5) - 2, next.length, false));
    }
    while (next.length < this.population) {
      const fresh = new FastBrain(FAST_INPUTS, 16, 3);
      if (this.champion) fresh.crashBook.merge(this.champion.crashBook);
      next.push(this.spawn(fresh, (next.length % 5) - 2, next.length, false));
    }
    this.agents = next;
    this.frame = 0;
  }

  trainUntilLap(maxGens = 60): { generations: number; best: number; ms: number; success: boolean } {
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
