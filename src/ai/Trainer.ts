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
};

export class Trainer {
  cars: Car[] = [];
  generation = 1;
  bestScore = 0;
  bestLapTime: number | null = null;
  frame = 0;
  population = 24;
  maxFrames = 2800;
  maxLaps = 1;
  mutationBoost = 0;
  training = true;
  champion: Car | null = null;
  private colors = [0xe10600, 0x00d2be, 0xff8700, 0x3b82f6, 0xa855f7, 0xf43f5e, 0x22c55e, 0xeab308];
  private track: Track;

  constructor(track: Track) {
    this.track = track;
  }

  applyDifficulty(cfg: DifficultyConfig) {
    this.population = cfg.population;
    this.maxFrames = cfg.maxFrames;
    this.mutationBoost = cfg.mutationBoost;
  }

  startFresh() {
    localStorage.removeItem(SAVE_KEY);
    this.generation = 1;
    this.bestScore = 0;
    this.bestLapTime = null;
    this.frame = 0;
    this.training = true;
    this.champion = null;
    this.spawnRandom();
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
      const car = new Car(this.colors[i % this.colors.length]);
      car.reset(this.track, (i % 5) - 2);
      this.cars.push(car);
    }
  }

  spawnFromChampion() {
    if (!this.champion) {
      this.spawnRandom();
      return;
    }
    const mutation = Math.max(0.02, getMutation(this.generation) + this.mutationBoost);
    this.cars = [];
    for (let i = 0; i < this.population; i++) {
      const car = this.champion.cloneBrainCar(this.colors[i % this.colors.length]);
      if (i > 0) car.brain.mutate(mutation);
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
    if (this.training && this.cars.some((c) => c.score >= checkpoints.length + 1)) return true;
    return false;
  }

  endGeneration(fps: number) {
    const champ = this.getChampionCandidate();
    this.champion = champ.cloneBrainCar(0xe10600);

    let lapTime: number | null = null;
    if (champ.lapCount >= this.maxLaps) {
      lapTime = this.frame / fps;
    }

    if (champ.score > 0) {
      this.saveChampion(champ, lapTime);
    }

    this.generation += 1;
    this.frame = 0;

    if (champ.score === 0) {
      this.spawnRandom();
    } else {
      this.spawnFromChampion();
    }
  }

  saveChampion(car: Car, lapTime: number | null) {
    const improvedScore = car.score > this.bestScore;
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
    return localStorage.getItem(SAVE_KEY) != null;
  }
}
