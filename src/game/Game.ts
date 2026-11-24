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
  private trackDirty = false;
  private leaderPulse = 0;
  private colors = [0xe10600, 0x00d2be, 0xff8700, 0x3b82f6, 0xa855f7, 0xf43f5e, 0x22c55e, 0xeab308];

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = false;
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
    );

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
    this.scene.fog = new THREE.Fog(0x0b1020, 100, 220);

    const hemi = new THREE.HemisphereLight(0x9eb7ff, 0x1a1510, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2dd, 0.95);
    sun.position.set(40, 70, 20);
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(160, 32),
      new THREE.MeshLambertMaterial({ color: 0x152012 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    const towerMat = new THREE.MeshLambertMaterial({ color: 0x2a3140 });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 18, 2.2), towerMat);
      tower.position.set(Math.cos(ang) * 95, 9, Math.sin(ang) * 95);
      this.scene.add(tower);
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
        this.hud.showBanner("FRESH TRAINING — WATCH THE SWARM");
        break;
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
      this.hud.showBanner("SWARM LEARNING");
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
    this.trainer.setTrackHash(this.track.hashLayout());
    let brain = this.trainer.champion ?? this.trainer.loadChampionBrain();
    const trained = brain != null;
    if (!brain) {
      this.trainer.startForCurrentTrack(this.track.controlPoints, this.track.width, this.track.hashLayout(), true);
      this.trainer.quickTrain();
      brain = this.trainer.champion;
    }

    this.player = new Car(0xe10600, 24, 2.9, 16);
    this.rival = new Car(0x00d2be, 24, 2.9, 16);
    this.rivalBrain = brain ? brain.clone() : null;
    this.player.reset(this.track, -1);
    this.rival.reset(this.track, 1);
    this.raceLaps = 2;
    this.carGroup.add(this.player.mesh, this.rival.mesh);
    this.chase.reset();
    this.chase.update(this.player, 1);
    this.hud.showBanner(trained ? "LIGHTS OUT" : "AUTO-TRAINED RIVAL");
  }

  private clearCars() {
    while (this.carGroup.children.length) this.carGroup.remove(this.carGroup.children[0]);
    this.visualCars = [];
    this.player = null;
    this.rival = null;
  }

  private buildVisualSwarm() {
    this.clearCars();
    const n = this.trainer.fast?.agents.length ?? 24;
    for (let i = 0; i < n; i++) {
      const car = new Car(this.colors[i % this.colors.length], 22, 3.1, 16, false);
      car.reset(this.track, (i % 5) - 2);
      this.visualCars.push(car);
      this.carGroup.add(car.mesh);
    }
    this.syncVisualFromFast();
  }

  private syncVisualFromFast() {
    const agents = this.trainer.fast?.agents;
    if (!agents) return;
    const leader = this.trainer.fast?.leaderIndex ?? 0;
    this.leaderPulse = (this.leaderPulse + 0.08) % (Math.PI * 2);

    // Rebuild visuals if population size changed after a generation
    if (this.visualCars.length !== agents.length) {
      this.buildVisualSwarm();
      return;
    }

    for (let i = 0; i < this.visualCars.length; i++) {
      const a = agents[i];
      const car = this.visualCars[i];
      if (!a) continue;
      car.position.set(a.x, 0.35, a.z);
      car.yaw = a.yaw;
      car.speed = a.speed;
      car.alive = a.alive;
      car.setGhost(!a.alive);
      const isLeader = i === leader && a.alive;
      car.mesh.scale.setScalar(isLeader ? 1.35 + Math.sin(this.leaderPulse) * 0.06 : 1.05);
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
    // Visible swarm: every car drives in real-time (sped up a bit)
    const result = this.trainer.liveStep(5);
    this.syncVisualFromFast();

    if (result.justLapped) {
      this.hud.showBanner(`LAP COMPLETE · GEN ${result.generation}`, 1600);
    } else if (result.generationDone) {
      this.hud.showBanner(`GEN ${result.generation} · CRASH LESSONS KEPT`, 900);
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
      const lead = this.trainer.fast?.agents[this.trainer.fast.leaderIndex];
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
