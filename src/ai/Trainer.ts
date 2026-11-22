import type { DifficultyConfig } from "../game/difficulty";
import { Car } from "../car/Car";
import type { Track } from "../track/Track";
import { getMutation, NeuralNetwork } from "./Network";

const SAVE_KEY = "grid-f1-champion-v1";

export type ChampionSave = {
  brain: ReturnType<NeuralNetwork["toJSON"]>;
  generation: number;
  bestScore: number;
  bestLapTime: number | null;
  trackHash?: string;
};

export class Trainer {
  cars: Car[] = [];
  generation = 1;
  bestScore = 0;
  bestLapTime: number | null = null;
  frame = 0;
  population = 28;
  maxFrames = 3200;
  maxLaps = 1;
  mutationBoost = 0;
  training = true;
  champion: Car | null = null;
  trackHash = "";
  private colors = [0xe10600, 0x00d2be, 0xff8700, 0x3b82f6, 0xa855f7, 0xf43f5e, 0x22c55e, 0xeab308];
  private track: Track;
  private stagnantGens = 0;

  constructor(track: Track) {
    this.track = track;
  }

  applyDifficulty(cfg: DifficultyConfig) {
    this.population = Math.max(cfg.population, 24);
    this.maxFrames = Math.max(cfg.maxFrames, 3000);
    this.mutationBoost = cfg.mutationBoost;
  }

  setTrackHash(hash: string) {
    this.trackHash = hash;
  }

  startFresh() {
    localStorage.removeItem(SAVE_KEY);
    this.generation = 1;
    this.bestScore = 0;
    this.bestLapTime = null;
    this.frame = 0;
    this.stagnantGens = 0;
    this.training = true;
    this.champion = null;
    this.spawnRandom();
  }

  /** After a track edit, old champions are useless — always retrain from scratch. */
  startForCurrentTrack(hash: string, forceFresh = false) {
    this.trackHash = hash;
    const saved = this.peekSave();
    const sameTrack = saved?.trackHash != null && saved.trackHash === hash;

    if (forceFresh || !sameTrack) {
      this.startFresh();
      return;
    }

    if (this.tryLoadChampion()) {
      this.continueFromChampion();
    } else {
      this.startFresh();
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

  tryLoadChampion(): boolean {
    const car = this.loadChampionCar();
    return car != null;
  }

  continueFromChampion() {
    if (!this.champion && !this.tryLoadChampion()) {
      this.startFresh();
      return;
    }
    this.training = true;
    this.frame = 0;
    this.spawnFromChampion();
  }

  watchChampion() {
    if (!this.champion && !this.tryLoadChampion()) {
      this.startFresh();
      return;
    }
    this.training = false;
    this.frame = 0;
    const champ = this.champion!.cloneBrainCar(0xe10600);
    champ.reset(this.track, 0);
    this.cars = [champ];
  }

  spawnRandom() {
    this.cars = [];
    for (let i = 0; i < this.population; i++) {
      // Slightly slower + sharper steering makes curvy edited tracks learnable
      const car = new Car(this.colors[i % this.colors.length], 20 + Math.random() * 4, 3.0 + Math.random() * 0.4, 15);
      car.reset(this.track, (i % 5) - 2);
      this.cars.push(car);
    }
  }

  spawnFromChampion() {
    if (!this.champion) {
      this.spawnRandom();
      return;
    }
    let mutation = Math.max(0.04, getMutation(this.generation) + this.mutationBoost);
    // If stuck improving, inject bigger mutations + some fresh randoms
    if (this.stagnantGens >= 4) mutation = Math.min(0.45, mutation + 0.12);

    this.cars = [];
    const randomSlots = this.stagnantGens >= 4 ? Math.ceil(this.population * 0.25) : Math.ceil(this.population * 0.1);

    for (let i = 0; i < this.population; i++) {
      if (i >= this.population - randomSlots) {
        const car = new Car(this.colors[i % this.colors.length], 20 + Math.random() * 4, 3.1, 15);
        car.reset(this.track, (i % 5) - 2);
        this.cars.push(car);
        continue;
      }
      const car = this.champion.cloneBrainCar(this.colors[i % this.colors.length]);
      if (i > 0) {
        // Varied mutation strength across the swarm
        const amount = i < 3 ? mutation * 0.35 : i < this.population * 0.5 ? mutation : mutation * 1.4;
        car.brain.mutate(amount);
      }
      car.reset(this.track, (i % 5) - 2);
      this.cars.push(car);
    }
  }

  getAliveCount() {
    return this.cars.filter((c) => c.alive).length;
  }

  getChampionCandidate(): Car {
    return [...this.cars].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.frameOfLastCp - b.frameOfLastCp;
    })[0];
  }

  generationOver(checkpoints: number[]): boolean {
    if (this.cars.every((c) => !c.alive)) return true;
    if (this.frame >= this.maxFrames) return true;
    if (this.cars.some((c) => c.lapCount >= this.maxLaps)) return true;
    if (this.training && this.cars.some((c) => c.score >= checkpoints.length + 1.5)) return true;
    return false;
  }

  endGeneration(fps: number) {
    const champ = this.getChampionCandidate();
    const prevBest = this.bestScore;
    this.champion = champ.cloneBrainCar(0xe10600);

    let lapTime: number | null = null;
    if (champ.lapCount >= this.maxLaps) {
      lapTime = this.frame / fps;
    }

    if (champ.score > 0) {
      this.saveChampion(champ, lapTime);
    }

    if (champ.score <= prevBest + 0.05) this.stagnantGens += 1;
    else this.stagnantGens = 0;

    this.generation += 1;
    this.frame = 0;

    if (champ.score < 0.15) {
      this.spawnRandom();
    } else {
      this.spawnFromChampion();
    }
  }

  saveChampion(car: Car, lapTime: number | null) {
    const improvedScore = car.score > this.bestScore + 0.001;
    const improvedTime =
      lapTime != null && (this.bestLapTime == null || lapTime < this.bestLapTime);

    if (improvedScore || improvedTime || this.bestScore === 0) {
      if (improvedScore) this.bestScore = car.score;
      if (improvedTime && lapTime != null) this.bestLapTime = lapTime;
      if (lapTime != null && this.bestLapTime == null) this.bestLapTime = lapTime;

      const payload: ChampionSave = {
        brain: car.brain.toJSON(),
        generation: this.generation,
        bestScore: this.bestScore,
        bestLapTime: this.bestLapTime,
        trackHash: this.trackHash,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      this.champion = car.cloneBrainCar(0xe10600);
    }
  }

  loadChampionCar(): Car | null {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as ChampionSave;
      // Reject brains trained on a different layout
      if (data.trackHash && this.trackHash && data.trackHash !== this.trackHash) {
        return null;
      }
      const car = new Car(0xe10600);
      car.brain = NeuralNetwork.fromJSON(data.brain);
      this.bestScore = data.bestScore;
      this.bestLapTime = data.bestLapTime;
      this.generation = data.generation;
      this.champion = car;
      return car;
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
}
