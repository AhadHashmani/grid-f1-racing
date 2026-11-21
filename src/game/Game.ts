import * as THREE from "three";
import { Trainer } from "../ai/Trainer";
import { ChaseCamera } from "../camera/ChaseCamera";
import { Car } from "../car/Car";
import { Input } from "../input/Input";
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
  private trainer: Trainer;
  private input = new Input();
  private hud: Hud;
  private mode: GameMode = "menu";
  private carGroup = new THREE.Group();
  private sensorGroup = new THREE.Group();
  private player: Car | null = null;
  private rival: Car | null = null;
  private checkpoints: number[] = [];
  private sessionTime = 0;
  private raceLaps = 2;
  private finished = false;
  private overviewCenter = new THREE.Vector3(0, 0, 0);
  private anim = 0;
  private container: HTMLElement;

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
      this.checkpoints = this.track.getCheckpointProgresses(16);
      this.fitOverview();
    });
    this.trainer = new Trainer(this.track);
    this.checkpoints = this.track.getCheckpointProgresses(16);

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
      new THREE.MeshStandardMaterial({
        color: 0x152012,
        roughness: 0.95,
        metalness: 0.0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Soft grandstand / light towers for F1 atmosphere
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

    // Distant hills
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
    }
  }

  setMode(mode: GameMode) {
    this.mode = mode;
    this.finished = false;
    this.sessionTime = 0;
    this.hud.hideOverlay();
    this.hud.setMode(mode);
    // Only allow track dragging in edit mode — never under the menu overlay
    this.editor.setEnabled(mode === "edit");
    this.renderer.domElement.style.pointerEvents = mode === "menu" ? "none" : "auto";
    this.clearCars();
    this.sensorGroup.clear();
    this.chase.reset();

    if (mode === "menu" || mode === "edit") {
      this.fitOverview();
      if (mode === "menu") {
        this.hud.setMode("menu");
        this.renderer.domElement.style.pointerEvents = "none";
      }
      return;
    }

    if (mode === "train") {
      if (this.trainer.hasSavedChampion()) this.trainer.continueFromChampion();
      else this.trainer.startFresh();
      this.attachTrainerCars();
      this.fitOverview();
      this.hud.showBanner("TRAINING");
      return;
    }

    if (mode === "watch") {
      this.trainer.watchChampion();
      this.attachTrainerCars();
      const focus = this.trainer.cars[0];
      if (focus) {
        this.chase.update(focus, 1);
      }
      this.hud.showBanner("CHAMPION");
      return;
    }

    if (mode === "race") {
      this.startRace();
    }
  }

  private startRace() {
    let bot = this.trainer.loadChampionCar();
    const trained = bot != null;
    if (!bot) {
      bot = new Car(0x00d2be);
    }

    this.player = new Car(0xe10600);
    this.rival = bot.cloneBrainCar(0x00d2be);
    this.player.reset(this.track, -1);
    this.rival.reset(this.track, 1);
    this.carGroup.add(this.player.mesh, this.rival.mesh);
    this.chase.reset();
    this.chase.update(this.player, 1);
    this.hud.showBanner(trained ? "LIGHTS OUT" : "UNTRAINED RIVAL");
  }

  private clearCars() {
    while (this.carGroup.children.length) {
      this.carGroup.remove(this.carGroup.children[0]);
    }
    this.player = null;
    this.rival = null;
  }

  private attachTrainerCars() {
    this.clearCars();
    for (const car of this.trainer.cars) {
      this.carGroup.add(car.mesh);
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

    if (this.mode === "edit" || this.mode === "menu") {
      // Slow orbit for atmosphere
      const r = 100;
      const t = this.anim * 0.12;
      this.chase.camera.position.set(
        this.overviewCenter.x + Math.cos(t) * r * 0.55,
        78,
        this.overviewCenter.z + Math.sin(t) * r * 0.55,
      );
      this.chase.camera.lookAt(this.overviewCenter);
    } else if (this.mode === "train") {
      this.updateTraining(dt);
      this.fitOverviewSoft();
    } else if (this.mode === "watch") {
      this.updateWatch(dt);
    } else if (this.mode === "race") {
      this.updateRace(dt);
    }

    this.drawSensors();
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

  private updateTraining(dt: number) {
    // Substep for smoother learning sim
    const steps = 2;
    const stepDt = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.trainer.frame += 1;
      for (const car of this.trainer.cars) {
        if (!car.alive) continue;
        car.sensor.update(this.track);
        const outputs = car.brain.feedForward(car.sensor.readings);
        car.applyAiOutputs(outputs, stepDt);
        car.updateRaceProgress(this.track, this.checkpoints, this.trainer.frame);
        car.checkStuck(this.trainer.frame);
      }

      if (this.trainer.generationOver(this.checkpoints)) {
        this.trainer.endGeneration(60);
        this.attachTrainerCars();
        break;
      }
    }
  }

  private updateWatch(dt: number) {
    const car = this.trainer.cars[0];
    if (!car) return;
    this.trainer.frame += 1;
    car.sensor.update(this.track);
    const outputs = car.brain.feedForward(car.sensor.readings);
    car.applyAiOutputs(outputs, dt);
    car.updateRaceProgress(this.track, this.checkpoints, this.trainer.frame);

    if (!car.alive || car.lapCount >= 1 || this.trainer.frame > this.trainer.maxFrames) {
      car.reset(this.track, 0);
      this.trainer.frame = 0;
    }
    this.chase.update(car, dt);
  }

  private updateRace(dt: number) {
    if (!this.player || !this.rival || this.finished) return;

    const controls = this.input.getRacingControls();
    this.player.applyControls(controls, dt);
    this.player.updateRaceProgress(this.track, this.checkpoints, Math.floor(this.sessionTime * 60));

    if (this.rival.alive) {
      this.rival.sensor.update(this.track);
      const outputs = this.rival.brain.feedForward(this.rival.sensor.readings);
      this.rival.applyAiOutputs(outputs, dt);
      this.rival.updateRaceProgress(this.track, this.checkpoints, Math.floor(this.sessionTime * 60));
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
      const playerWins = this.player.lapCount > this.rival.lapCount ||
        (this.player.lapCount === this.rival.lapCount && this.player.score >= this.rival.score);
      this.hud.showResult(
        playerWins ? "P1" : "P2",
        playerWins
          ? `You beat the champion in ${this.sessionTime.toFixed(1)}s.`
          : `The ML bot took it in ${this.sessionTime.toFixed(1)}s. Train harder or reshape the circuit.`,
        [
          { label: "Rematch", action: "retry-race", primary: true },
          { label: "Train AI", action: "start-train" },
          { label: "Menu", action: "back-menu" },
        ],
      );
    }
  }

  private drawSensors() {
    while (this.sensorGroup.children.length) {
      const line = this.sensorGroup.children.pop()!;
      this.sensorGroup.remove(line);
      const mesh = line as THREE.Line;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    const cars: Car[] = [];
    if (this.mode === "train" || this.mode === "watch") cars.push(...this.trainer.cars.filter((c) => c.alive).slice(0, 6));
    if (this.mode === "race" && this.rival?.alive) cars.push(this.rival);

    for (const car of cars) {
      for (const [start, end] of car.sensor.debugLines) {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({
          color: 0xffe566,
          transparent: true,
          opacity: 0.35,
        });
        this.sensorGroup.add(new THREE.Line(geo, mat));
      }
    }
  }

  private updateHud() {
    let alive = 0;
    let lap = 0;
    let speed = 0;
    let gen = this.trainer.generation;
    let best = this.trainer.bestScore;

    if (this.mode === "train" || this.mode === "watch") {
      alive = this.trainer.getAliveCount();
      const lead = this.trainer.cars[0];
      lap = lead?.lapCount ?? 0;
      speed = lead?.speed ?? 0;
    } else if (this.mode === "race" && this.player) {
      alive = this.player.alive ? 1 : 0;
      lap = this.player.lapCount;
      speed = this.player.speed;
      best = Math.max(best, this.player.score, this.rival?.score ?? 0);
    }

    this.hud.updateStats({
      generation: gen,
      bestScore: best,
      alive,
      lap,
      timeSec: this.sessionTime,
      speed,
      mode: this.mode,
    });
  }
}
