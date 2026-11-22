import * as THREE from "three";
import { driveWithFastBrain } from "../ai/FastDriver";
import { Trainer } from "../ai/Trainer";
import { ChaseCamera } from "../camera/ChaseCamera";
import { Car } from "../car/Car";
import { Input } from "../input/Input";
import type { FastBrain } from "../sim/FastBrain";
import { Track } from "../track/Track";
import { TrackEditor } from "../track/TrackEditor";
import { DEFAULT_CONTROL_POINTS } from "../track/defaultTrack";
import { Hud, type GameMode } from "../ui/Hud";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private chase: ChaseCamera;
  private clock = new THREE.Clock();
  private track: Track;
  private editor: TrackEditor;
  private trainer = new Trainer();
  private input = new Input();
  private hud: Hud;
  private mode: GameMode = "menu";
  private carGroup = new THREE.Group();
  private sensorGroup = new THREE.Group();
  private visualCars: Car[] = [];
  private player: Car | null = null;
  private rival: Car | null = null;
  private rivalBrain: FastBrain | null = null;
  private watchCar: Car | null = null;
  private watchBrain: FastBrain | null = null;
  private checkpoints: number[] = [];
  private sessionTime = 0;
  private raceLaps = 2;
  private finished = false;
  private overviewCenter = new THREE.Vector3(0, 0, 0);
  private anim = 0;
  private container: HTMLElement;
  private difficulty: DifficultyId = "pro";
  private trackDirty = false;
  private colors = [0xe10600, 0x00d2be, 0xff8700, 0x3b82f6, 0xa855f7, 0xf43f5e, 0x22c55e, 0xeab308];

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.zIndex = "0";
    this.renderer.domElement.style.position = "absolute";
    container.appendChild(this.renderer.domElement);

    this.chase = new ChaseCamera(container.clientWidth / container.clientHeight);
    this.track = new Track(DEFAULT_CONTROL_POINTS);
    this.scene.add(this.track.meshGroup);
    this.scene.add(this.carGroup);
    this.scene.add(this.sensorGroup);

    this.buildWorld();
    this.editor = new TrackEditor(this.scene, this.chase.camera, this.track, this.renderer.domElement);
    this.editor.setOnChange(() => {
      this.checkpoints = this.track.getCheckpointProgresses();
      this.trackDirty = true;
      this.fitOverview();
      if (this.mode === "edit") this.setEditCamera();
    });
    this.trainer.setTrackHash(this.track.hashLayout());
    this.checkpoints = this.track.getCheckpointProgresses();

    this.hud = new Hud(container);
    this.hud.setHandlers(
      (mode) => this.setMode(mode),
      (action) => this.handleAction(action),
      (id) => this.setDifficulty(id),
    );
    this.setDifficulty("pro");

    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && this.mode === "train") {
        e.preventDefault();
        this.setMode("watch");
      }
    });

    this.fitOverview();
    this.editor.setEnabled(false);
    this.renderer.domElement.style.pointerEvents = "none";
    this.hud.setMode("menu");
    this.tick();
  }

  private buildWorld() {
    this.scene.background = new THREE.Color(0x0b1020);
    this.scene.fog = new THREE.Fog(0x0b1020, 80, 260);

    const hemi = new THREE.HemisphereLight(0x9eb7ff, 0x1a1510, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 1.35);
    sun.position.set(40, 70, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(180, 64),
      new THREE.MeshStandardMaterial({ color: 0x152012, roughness: 0.95, metalness: 0.0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const towerMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 18, 2.2), towerMat);
      tower.position.set(Math.cos(ang) * 95, 9, Math.sin(ang) * 95);
      tower.castShadow = true;
      this.scene.add(tower);
      const lamp = new THREE.PointLight(0xffd9a8, 1.2, 55);
      lamp.position.set(Math.cos(ang) * 88, 16, Math.sin(ang) * 88);
      this.scene.add(lamp);
    }

    const hillMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 1, metalness: 0 });
    for (let i = 0; i < 12; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(18 + Math.random() * 20, 16, 12), hillMat);
      const ang = Math.random() * Math.PI * 2;
      const r = 130 + Math.random() * 40;
      hill.position.set(Math.cos(ang) * r, -8, Math.sin(ang) * r);
      hill.scale.y = 0.35;
      this.scene.add(hill);
    }
  }

  private fitOverview() {
    let cx = 0;
    let cz = 0;
    for (const p of this.track.controlPoints) {
      cx += p.x;
      cz += p.z;
    }
    cx /= this.track.controlPoints.length;
    cz /= this.track.controlPoints.length;
    this.overviewCenter.set(cx, 0, cz);
    this.chase.setOrbitOverview(this.overviewCenter, 100, 82);
  }

  private setDifficulty(id: DifficultyId) {
    this.difficulty = id;
    const cfg = DIFFICULTIES[id];
    this.trainer.applyDifficulty(cfg);
    this.raceLaps = cfg.raceLaps;
    this.hud.setDifficulty(id);
  }

  private handleAction(action: string) {
    switch (action) {
      case "start-edit":
        this.setMode("edit");
        break;
      case "start-train":
        this.setMode("train");
        break;
      case "start-race":
        this.setMode("race");
        break;
      case "retry-race":
        this.setMode("race");
        break;
      case "back-menu":
        this.setMode("menu");
        break;
      case "watch-champ":
        this.setMode("watch");
        break;
      case "reset-track":
        this.editor.resetToDefault(DEFAULT_CONTROL_POINTS);
        this.checkpoints = this.track.getCheckpointProgresses();
        this.trackDirty = true;
        this.fitOverview();
        this.setEditCamera();
        this.hud.showBanner("TRACK RESET");
        break;
      case "retrain-fresh":
        this.beginTraining(true);
        this.hud.showBanner("FRESH TRAINING");
        break;
      case "quick-train": {
        this.beginTraining(this.trackDirty);
        const r = this.trainer.quickTrain();
        this.syncVisualFromFast();
        this.hud.showBanner(
          r.success ? `LEARNED IN ${r.generations} GEN · ${(r.ms / 1000).toFixed(1)}s` : "KEEP TRAINING",
        );
        if (r.success) this.setMode("watch");
        break;
      }
    }
  }

  private setEditCamera() {
    this.chase.camera.position.set(this.overviewCenter.x, 110, this.overviewCenter.z + 8);
    this.chase.camera.lookAt(this.overviewCenter.x, 0, this.overviewCenter.z);
    this.chase.camera.updateProjectionMatrix();
  }

  private beginTraining(forceFresh: boolean) {
    const hash = this.track.hashLayout();
    this.trainer.setTrackHash(hash);
    this.trainer.startForCurrentTrack(this.track.controlPoints, this.track.width, hash, forceFresh);
    this.trackDirty = false;
    this.mode = "train";
    this.hud.hideOverlay();
    this.hud.setMode("train");
    this.editor.setEnabled(false);
    this.renderer.domElement.style.pointerEvents = "auto";
    this.buildVisualSwarm();
    this.fitOverview();
  }

  setMode(mode: GameMode) {
    this.mode = mode;
    this.finished = false;
    this.sessionTime = 0;
    this.hud.hideOverlay();
    this.hud.setMode(mode);
    this.editor.setEnabled(mode === "edit");
    this.renderer.domElement.style.pointerEvents = mode === "menu" ? "none" : "auto";
    this.clearCars();
    this.sensorGroup.clear();
    this.chase.reset();
    this.watchCar = null;
    this.watchBrain = null;
    this.rivalBrain = null;

    if (mode === "menu" || mode === "edit") {
      this.fitOverview();
      if (mode === "edit") {
        this.setEditCamera();
        this.hud.showBanner("DRAG THE ORANGE BALLS");
      }
      if (mode === "menu") {
        this.hud.setMode("menu");
        this.renderer.domElement.style.pointerEvents = "none";
      }
      return;
    }

    if (mode === "train") {
      this.beginTraining(this.trackDirty);
      // Instant first burst so the user sees a competent swarm quickly
      const burst = this.trainer.turboStep(2);
      this.syncVisualFromFast();
      this.hud.showBanner(burst.success ? "LAP LEARNED" : "TURBO TRAINING");
      return;
    }

    if (mode === "watch") {
      const brain = this.trainer.champion ?? this.trainer.loadChampionBrain();
      if (!brain) {
        this.beginTraining(true);
        this.trainer.quickTrain();
      }
      this.watchBrain = (this.trainer.champion ?? this.trainer.loadChampionBrain())!.clone();
      this.watchCar = new Car(0xe10600);
      this.watchCar.reset(this.track, 0);
      this.carGroup.add(this.watchCar.mesh);
      this.chase.update(this.watchCar, 1);
      this.hud.showBanner("CHAMPION");
      return;
    }

    if (mode === "race") this.startRace();
  }

  private startRace() {
    const cfg = DIFFICULTIES[this.difficulty];
    this.trainer.setTrackHash(this.track.hashLayout());
    let brain = this.trainer.champion ?? this.trainer.loadChampionBrain();
    const trained = brain != null;
    if (!brain) {
      this.trainer.startForCurrentTrack(this.track.controlPoints, this.track.width, this.track.hashLayout(), true);
      this.trainer.quickTrain();
      brain = this.trainer.champion;
    }

    const baseMax = 24;
    const baseRot = 2.9;
    const baseAccel = 16;

    this.player = new Car(0xe10600, baseMax * cfg.playerSpeedMult, baseRot, baseAccel);
    this.rival = new Car(0x00d2be, baseMax * cfg.botSpeedMult, baseRot * cfg.botSteerMult, baseAccel);
    this.rivalBrain = brain ? brain.clone() : null;
    this.player.reset(this.track, -1);
    this.rival.reset(this.track, 1);
    this.raceLaps = cfg.raceLaps;
    this.carGroup.add(this.player.mesh, this.rival.mesh);
    this.chase.reset();
    this.chase.update(this.player, 1);
    this.hud.showBanner(trained ? `LIGHTS OUT · ${cfg.label}` : `AUTO-TRAINED · ${cfg.label}`);
  }

  private clearCars() {
    while (this.carGroup.children.length) this.carGroup.remove(this.carGroup.children[0]);
    this.visualCars = [];
    this.player = null;
    this.rival = null;
  }

  private buildVisualSwarm() {
    this.clearCars();
    const n = Math.min(18, this.trainer.fast?.agents.length ?? 12);
    for (let i = 0; i < n; i++) {
      const car = new Car(this.colors[i % this.colors.length]);
      car.reset(this.track, (i % 5) - 2);
      this.visualCars.push(car);
      this.carGroup.add(car.mesh);
    }
    this.syncVisualFromFast();
  }

  private syncVisualFromFast() {
    const agents = this.trainer.fast?.agents;
    if (!agents) return;
    for (let i = 0; i < this.visualCars.length; i++) {
      const a = agents[i];
      const car = this.visualCars[i];
      if (!a) continue;
      car.position.set(a.x, 0.35, a.z);
      car.yaw = a.yaw;
      car.speed = a.speed;
      car.alive = a.alive;
      car.setGhost(!a.alive);
      car.syncMesh();
    }
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.chase.camera.aspect = w / h;
    this.chase.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private tick = () => {
    requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.anim += dt;
    this.sessionTime += dt;

    if (this.mode === "edit") {
      this.setEditCamera();
      this.editor.updateVisuals(this.anim);
    } else if (this.mode === "menu") {
      const r = 100;
      const t = this.anim * 0.12;
      this.chase.camera.position.set(
        this.overviewCenter.x + Math.cos(t) * r * 0.55,
        78,
        this.overviewCenter.z + Math.sin(t) * r * 0.55,
      );
      this.chase.camera.lookAt(this.overviewCenter);
    } else if (this.mode === "train") {
      this.updateTraining();
      this.fitOverviewSoft();
    } else if (this.mode === "watch") {
      this.updateWatch(dt);
    } else if (this.mode === "race") {
      this.updateRace(dt);
    }

    this.updateHud();
    this.renderer.render(this.scene, this.chase.camera);
  };

  private fitOverviewSoft() {
    const r = 105;
    const t = this.anim * 0.08;
    this.chase.camera.position.set(
      this.overviewCenter.x + Math.cos(t) * r * 0.5,
      88,
      this.overviewCenter.z + Math.sin(t) * r * 0.5,
    );
    this.chase.camera.lookAt(this.overviewCenter);
  }

  private updateTraining() {
    // 2 full generations per frame ≈ learns a lap in about a second of wall time
    const result = this.trainer.turboStep(2);
    this.syncVisualFromFast();
    if (result.success && this.sessionTime > 0.4) {
      // Keep refining a bit, but banner once
      if (Math.floor(this.sessionTime * 2) % 7 === 0) {
        this.hud.showBanner(`LAP OK · GEN ${result.generation}`, 900);
      }
    }
  }

  private updateWatch(dt: number) {
    if (!this.watchCar || !this.watchBrain) return;
    driveWithFastBrain(this.watchCar, this.watchBrain, this.track, dt);
    this.watchCar.updateRaceProgress(this.track, this.checkpoints, Math.floor(this.sessionTime * 60), false);
    if (!this.watchCar.alive || this.watchCar.lapCount >= 1) {
      this.watchCar.reset(this.track, 0);
    }
    this.chase.update(this.watchCar, dt);
  }

  private updateRace(dt: number) {
    if (!this.player || !this.rival || this.finished) return;

    const controls = this.input.getRacingControls();
    this.player.applyControls(controls, dt);
    this.player.updateRaceProgress(this.track, this.checkpoints, Math.floor(this.sessionTime * 60), false);

    if (this.rival.alive && this.rivalBrain) {
      driveWithFastBrain(this.rival, this.rivalBrain, this.track, dt);
      this.rival.updateRaceProgress(this.track, this.checkpoints, Math.floor(this.sessionTime * 60), false);
    }

    if (!this.player.alive) {
      this.finished = true;
      this.hud.showResult("DNF", "You left the racing line. Reset and attack the lap again.", [
        { label: "Retry", action: "retry-race", primary: true },
        { label: "Edit Track", action: "start-edit" },
        { label: "Menu", action: "back-menu" },
      ]);
      return;
    }

    this.chase.update(this.player, dt);

    if (this.player.lapCount >= this.raceLaps || this.rival.lapCount >= this.raceLaps) {
      this.finished = true;
      const playerWins =
        this.player.lapCount > this.rival.lapCount ||
        (this.player.lapCount === this.rival.lapCount && this.player.score >= this.rival.score);
      this.hud.showResult(
        playerWins ? "P1" : "P2",
        playerWins
          ? `You beat the champion in ${this.sessionTime.toFixed(1)}s.`
          : `The ML bot took it in ${this.sessionTime.toFixed(1)}s. Retrain or reshape the circuit.`,
        [
          { label: "Rematch", action: "retry-race", primary: true },
          { label: "Train AI", action: "start-train" },
          { label: "Menu", action: "back-menu" },
        ],
      );
    }
  }

  private updateHud() {
    let alive = 0;
    let lap = 0;
    let speed = 0;
    const gen = this.trainer.generation;
    let best = this.trainer.bestScore;

    if (this.mode === "train") {
      alive = this.trainer.getAliveCount();
      const lead = this.trainer.fast?.agents[0];
      lap = lead?.laps ?? 0;
      speed = lead?.speed ?? 0;
    } else if (this.mode === "watch" && this.watchCar) {
      alive = this.watchCar.alive ? 1 : 0;
      lap = this.watchCar.lapCount;
      speed = this.watchCar.speed;
    } else if (this.mode === "race" && this.player) {
      alive = this.player.alive ? 1 : 0;
      lap = this.player.lapCount;
      speed = this.player.speed;
      best = Math.max(best, this.player.score, this.rival?.score ?? 0);
    }

    this.hud.updateStats({
      generation: gen,
      bestScore: Math.round(best * 10) / 10,
      alive,
      lap,
      timeSec: this.sessionTime,
      speed,
      mode: this.mode,
    });
  }
}
