import type { DifficultyConfig } from "../game/difficulty";
import { FastBrain } from "../sim/FastBrain";
import { FastTrack } from "../sim/FastTrack";
import { FastTrainer } from "../sim/FastTrainer";
import type { ControlPoint } from "../track/Track";

const SAVE_KEY = "grid-f1-champion-v2";

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
  private population = 36;
  private maxFrames = 1200;

  applyDifficulty(cfg: DifficultyConfig) {
    this.population = Math.max(32, cfg.population + 8);
    this.maxFrames = Math.min(1400, Math.max(900, cfg.maxFrames / 2));
  }

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
    this.ensureFast(points, width);
    this.fast!.startFresh();
    this.syncStats();
  }

  startForCurrentTrack(points: ControlPoint[], width: number, hash: string, forceFresh = false) {
    this.trackHash = hash;
    const saved = this.peekSave();
    const sameTrack = saved?.trackHash != null && saved.trackHash === hash;
    this.ensureFast(points, width);

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

  /** Run several full generations quickly (call from the train loop). */
  turboStep(gens = 2): { success: boolean; generation: number; bestScore: number } {
    if (!this.fast) return { success: false, generation: this.generation, bestScore: this.bestScore };
    let success = false;
    for (let i = 0; i < gens; i++) {
      const r = this.fast.runGeneration();
      if (r.laps >= 1) success = true;
    }
    this.syncStats();
    if (this.champion) this.persist();
    return { success, generation: this.generation, bestScore: this.bestScore };
  }

  /** Block until a lap is learned (usually under a second). */
  quickTrain(): { success: boolean; generations: number; ms: number } {
    if (!this.fast) return { success: false, generations: 0, ms: 0 };
    const r = this.fast.trainUntilLap(30);
    this.syncStats();
    if (r.success) this.persist();
    return r;
  }

  private syncStats() {
    if (!this.fast) return;
    this.generation = this.fast.generation;
    this.bestScore = this.fast.bestScore;
    this.champion = this.fast.champion ? this.fast.champion.clone() : null;
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
