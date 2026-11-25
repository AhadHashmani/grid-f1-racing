import { FastBrain } from "../sim/FastBrain";
import { FastTrack } from "../sim/FastTrack";
import { FastTrainer } from "../sim/FastTrainer";
import type { ControlPoint } from "../track/Track";

const SAVE_KEY = "grid-f1-champion-v4";

export type ChampionSave = {
  brain: ReturnType<FastBrain["toJSON"]>;
  generation: number;
  bestScore: number;
  trackHash?: string;
};

export class Trainer {
  generation = 1;
  bestScore = 0;
  bestLapTime: number | null = null;
  training = true;
  trackHash = "";
  champion: FastBrain | null = null;
  fast: FastTrainer | null = null;
  private population = 32;
  private maxFrames = 2800;
  private lapAnnounced = false;
  private lastSyncedGen = -1;

  setTrackHash(hash: string) {
    this.trackHash = hash;
  }

  ensureFast(points: ControlPoint[], width: number) {
    const ft = new FastTrack(points, width);
    this.fast = new FastTrainer(ft, this.population, this.maxFrames);
    if (this.champion) this.fast.champion = this.champion.clone();
    return this.fast;
  }

  startFresh(points: ControlPoint[], width: number) {
    localStorage.removeItem(SAVE_KEY);
    this.generation = 1;
    this.bestScore = 0;
    this.bestLapTime = null;
    this.champion = null;
    this.training = true;
    this.lapAnnounced = false;
    this.ensureFast(points, width);
    this.fast!.startFresh();
    this.syncStats();
  }

  startForCurrentTrack(points: ControlPoint[], width: number, hash: string, forceFresh = false) {
    this.trackHash = hash;
    const saved = this.peekSave();
    const sameTrack = saved?.trackHash != null && saved.trackHash === hash;
    this.ensureFast(points, width);
    this.lapAnnounced = false;

    if (forceFresh || !sameTrack || !saved) {
      this.startFresh(points, width);
      return;
    }

    try {
      this.champion = FastBrain.fromJSON(saved.brain);
      this.generation = saved.generation;
      this.bestScore = saved.bestScore;
      this.fast!.champion = this.champion.clone();
      this.fast!.generation = this.generation;
      this.fast!.bestScore = this.bestScore;
      this.fast!.resetPopulation(true);
      this.training = true;
    } catch {
      this.startFresh(points, width);
    }
  }

  private peekSave(): ChampionSave | null {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ChampionSave;
    } catch {
      return null;
    }
  }

  /**
   * Visible live training — step every car a few physics ticks.
   * Returns whether a bot just completed a lap this generation.
   */
  liveStep(steps = 4): {
    success: boolean;
    generation: number;
    bestScore: number;
    alive: number;
    generationDone: boolean;
    leaderIndex: number;
    justLapped: boolean;
  } {
    if (!this.fast) {
      return {
        success: false,
        generation: this.generation,
        bestScore: this.bestScore,
        alive: 0,
        generationDone: false,
        leaderIndex: 0,
        justLapped: false,
      };
    }

    let lapComplete = false;
    let generationDone = false;
    let alive = 0;
    let leaderIndex = 0;

    for (let i = 0; i < steps; i++) {
      const r = this.fast.liveStep(1 / 48);
      alive = r.alive;
      leaderIndex = r.leaderIndex;
      if (r.lapComplete) lapComplete = true;
      if (r.generationDone) {
        generationDone = true;
        break;
      }
    }

    const justLapped = lapComplete && !this.lapAnnounced;
    if (lapComplete) this.lapAnnounced = true;
    if (generationDone) this.lapAnnounced = false;

    this.syncStats(generationDone || justLapped);
    if (lapComplete && this.champion) this.persist();

    return {
      success: lapComplete,
      generation: this.generation,
      bestScore: this.bestScore,
      alive,
      generationDone,
      leaderIndex,
      justLapped,
    };
  }

  /** Headless solve for race/watch fallback when no champion exists yet. */
  quickTrain(): { success: boolean; generations: number; ms: number } {
    if (!this.fast) return { success: false, generations: 0, ms: 0 };
    const r = this.fast.trainUntilLap(35);
    this.syncStats();
    if (r.success) this.persist();
    return r;
  }

  private syncStats(forceClone = true) {
    if (!this.fast) return;
    this.generation = this.fast.generation;
    this.bestScore = this.fast.bestScore;
    // Avoid cloning the champion every physics burst — only on gen change / persist
    if (forceClone || this.generation !== this.lastSyncedGen) {
      this.champion = this.fast.champion ? this.fast.champion.clone() : null;
      this.lastSyncedGen = this.generation;
    } else if (this.fast.champion && !this.champion) {
      this.champion = this.fast.champion.clone();
    }
  }

  persist() {
    if (!this.champion) return;
    const payload: ChampionSave = {
      brain: this.champion.toJSON(),
      generation: this.generation,
      bestScore: this.bestScore,
      trackHash: this.trackHash,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }

  loadChampionBrain(): FastBrain | null {
    const saved = this.peekSave();
    if (!saved) return null;
    if (saved.trackHash && this.trackHash && saved.trackHash !== this.trackHash) return null;
    try {
      this.champion = FastBrain.fromJSON(saved.brain);
      this.generation = saved.generation;
      this.bestScore = saved.bestScore;
      return this.champion;
    } catch {
      return null;
    }
  }

  hasSavedChampion(): boolean {
    const saved = this.peekSave();
    if (!saved) return false;
    if (saved.trackHash && this.trackHash && saved.trackHash !== this.trackHash) return false;
    return true;
  }

  getAliveCount(): number {
    return this.fast?.agents.filter((a) => a.alive).length ?? 0;
  }
}
