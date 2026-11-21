import * as THREE from "three";
import { NeuralNetwork } from "../ai/Network";
import { Sensor } from "../ai/Sensor";
import type { Track } from "../track/Track";
import { createF1CarMesh } from "./CarMesh";

export type CarControls = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
};

export class Car {
  mesh: THREE.Group;
  position = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  alive = true;
  lapCount = 0;
  checkpointIndex = 0;
  score = 0;
  frameOfLastCp = 0;
  lastProgress = 0;
  sensor: Sensor;
  brain: NeuralNetwork;
  maxSpeed: number;
  rotSpeed: number;
  acceleration: number;
  color: number;
  translucent = false;
  private baseOpacityMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(
    color = 0xe10600,
    maxSpeed = 28,
    rotSpeed = 2.4,
    acceleration = 18,
  ) {
    this.color = color;
    this.maxSpeed = maxSpeed;
    this.rotSpeed = rotSpeed;
    this.acceleration = acceleration;
    this.mesh = createF1CarMesh(color);
    this.sensor = new Sensor(this);
    this.brain = new NeuralNetwork([this.sensor.rayCount, 20, 4]);
    this.cacheMaterials();
  }

  private cacheMaterials() {
    this.mesh.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
            this.baseOpacityMaterials.push(mat as THREE.MeshStandardMaterial);
          }
        }
      }
    });
  }

  reset(track: Track, lane = 0) {
    const pose = track.getSpawnPose(lane);
    this.position.copy(pose.position);
    this.yaw = pose.yaw;
    this.speed = 0;
    this.alive = true;
    this.lapCount = 0;
    this.checkpointIndex = 0;
    this.score = 0;
    this.frameOfLastCp = 0;
    this.lastProgress = 0;
    this.setGhost(false);
    this.syncMesh();
  }

  setGhost(ghost: boolean) {
    this.translucent = ghost;
    for (const mat of this.baseOpacityMaterials) {
      mat.transparent = ghost;
      mat.opacity = ghost ? 0.35 : 1;
      mat.needsUpdate = true;
    }
  }

  syncMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    // Subtle bank / lean into turns based on yaw rate proxy via lateral speed feel
    const lean = THREE.MathUtils.clamp(this.speed * 0.002, 0, 0.12);
    this.mesh.rotation.z = Math.sin(performance.now() * 0.002) * 0.01;
    this.mesh.position.y = 0.02 + Math.abs(Math.sin(performance.now() * 0.01 + this.speed)) * 0.01 * lean;
  }

  applyControls(controls: CarControls, dt: number) {
    if (!this.alive) return;

    if (controls.forward) {
      this.speed = Math.min(this.speed + this.acceleration * dt, this.maxSpeed);
    } else if (controls.backward) {
      this.speed = Math.max(this.speed - this.acceleration * 1.2 * dt, -this.maxSpeed * 0.4);
    } else {
      // Coast / drag
      const drag = this.acceleration * 0.35 * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - drag);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + drag);
    }

    const steerFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / this.maxSpeed, 0.25, 1);
    if (controls.left) this.yaw += this.rotSpeed * steerFactor * dt;
    if (controls.right) this.yaw -= this.rotSpeed * steerFactor * dt;

    this.position.x += Math.sin(this.yaw) * this.speed * dt;
    this.position.z += Math.cos(this.yaw) * this.speed * dt;
    this.syncMesh();
  }

  applyAiOutputs(outputs: ArrayLike<number>, dt: number, threshold = 0.5) {
    this.applyControls(
      {
        forward: (outputs[0] ?? 0) > threshold,
        left: (outputs[1] ?? 0) > threshold,
        right: (outputs[2] ?? 0) > threshold,
        backward: (outputs[3] ?? 0) > threshold,
      },
      dt,
    );
  }

  updateRaceProgress(track: Track, checkpoints: number[], frame: number) {
    const { progress, onTrack } = track.project(this.position);
    if (!onTrack) {
      this.alive = false;
      this.setGhost(true);
      return;
    }

    // Forward progress only (handles wrap near finish)
    const forward =
      progress >= this.lastProgress - 0.002 ||
      (this.lastProgress > 0.9 && progress < 0.1);

    if (forward && this.checkpointIndex < checkpoints.length) {
      const next = checkpoints[this.checkpointIndex];
      if (progress >= next && (this.lastProgress < next || (this.lastProgress > 0.9 && next < 0.1))) {
        this.checkpointIndex += 1;
        this.frameOfLastCp = frame;
      }
    }

    // Lap complete after clearing checkpoints and crossing start
    if (this.checkpointIndex >= checkpoints.length) {
      if (this.lastProgress > 0.82 && progress < 0.1) {
        this.lapCount += 1;
        this.checkpointIndex = 0;
        this.frameOfLastCp = frame;
      }
    }

    this.lastProgress = progress;
    this.score = this.lapCount * (checkpoints.length + 1) + this.checkpointIndex;
  }

  checkStuck(frame: number, maxIdle = 220) {
    if (frame - this.frameOfLastCp > maxIdle) {
      this.alive = false;
      this.setGhost(true);
    }
  }

  cloneBrainCar(color?: number): Car {
    const car = new Car(color ?? this.color, this.maxSpeed, this.rotSpeed, this.acceleration);
    car.brain = this.brain.clone();
    return car;
  }
}
