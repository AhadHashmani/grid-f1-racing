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

type OpacityMaterial = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;

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
  bestProgress = 0;
  sensor: Sensor;
  brain: NeuralNetwork;
  maxSpeed: number;
  rotSpeed: number;
  acceleration: number;
  color: number;
  translucent = false;
  private offTrackFrames = 0;
  private baseOpacityMaterials: OpacityMaterial[] = [];

  constructor(
    color = 0xe10600,
    maxSpeed = 22,
    rotSpeed = 3.1,
    acceleration = 16,
    detailed = true,
  ) {
    this.color = color;
    this.maxSpeed = maxSpeed;
    this.rotSpeed = rotSpeed;
    this.acceleration = acceleration;
    this.mesh = createF1CarMesh(color, detailed);
    this.sensor = new Sensor(this);
    this.brain = new NeuralNetwork([this.sensor.rayCount, 28, 4]);
    this.cacheMaterials();
  }

  private cacheMaterials() {
    this.mesh.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const m = mat as OpacityMaterial;
          if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial) {
            this.baseOpacityMaterials.push(m);
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
    this.bestProgress = 0;
    this.offTrackFrames = 0;
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
    const lean = THREE.MathUtils.clamp(this.speed * 0.002, 0, 0.12);
    this.mesh.rotation.z = Math.sin(performance.now() * 0.002) * 0.01;
    this.mesh.position.y =
      0.02 + Math.abs(Math.sin(performance.now() * 0.01 + this.speed)) * 0.01 * lean;
  }

  applyControls(controls: CarControls, dt: number) {
    if (!this.alive) return;

    if (controls.forward) {
      this.speed = Math.min(this.speed + this.acceleration * dt, this.maxSpeed);
    } else if (controls.backward) {
      this.speed = Math.max(this.speed - this.acceleration * 1.2 * dt, -this.maxSpeed * 0.4);
    } else {
      const drag = this.acceleration * 0.35 * dt;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - drag);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + drag);
    }

    const steerFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / this.maxSpeed, 0.35, 1);
    if (controls.left && !controls.right) this.yaw += this.rotSpeed * steerFactor * dt;
    if (controls.right && !controls.left) this.yaw -= this.rotSpeed * steerFactor * dt;

    this.position.x += Math.sin(this.yaw) * this.speed * dt;
    this.position.z += Math.cos(this.yaw) * this.speed * dt;
    this.syncMesh();
  }

  applyAiOutputs(outputs: ArrayLike<number>, dt: number) {
    const forward = (outputs[0] ?? 0) > 0.45;
    const left = (outputs[1] ?? 0) > 0.45;
    const right = (outputs[2] ?? 0) > 0.45;
    const backward = (outputs[3] ?? 0) > 0.55;

    const anySteer = left || right;
    this.applyControls(
      {
        forward: forward || (!backward && !anySteer) || (anySteer && !backward),
        left: left && !right,
        right: right && !left,
        backward: backward && !forward,
      },
      dt,
    );
  }

  /** Continuous controls from FastBrain: throttle 0..1, steer -1..1, brake 0..1 */
  applyAnalog(throttle: number, steer: number, brake: number, dt: number) {
    if (!this.alive) return;
    if (brake > 0.6 && throttle < 0.4) {
      this.speed = Math.max(0, this.speed - this.acceleration * 1.5 * dt);
    } else {
      this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * Math.max(0.12, throttle) * dt);
      this.speed = Math.max(0, this.speed - this.acceleration * 0.08 * dt);
    }
    const steerFactor = 0.4 + 0.6 * Math.min(1, Math.abs(this.speed) / this.maxSpeed);
    this.yaw += steer * this.rotSpeed * steerFactor * dt;
    this.position.x += Math.sin(this.yaw) * this.speed * dt;
    this.position.z += Math.cos(this.yaw) * this.speed * dt;
    this.syncMesh();
  }

  updateRaceProgress(track: Track, checkpoints: number[], frame: number, training = false) {
    const { progress, onTrack, lateral } = track.project(this.position);

    if (!onTrack) {
      this.offTrackFrames += 1;
      // Short grace + gentle recenter during training so genes can recover from near-misses
      if (training && this.offTrackFrames <= 8) {
        this.speed *= 0.82;
        const sample = track.sampleAtProgress(progress);
        this.position.lerp(sample.position.clone().setY(this.position.y), 0.18);
        this.yaw = THREE.MathUtils.lerp(
          this.yaw,
          Math.atan2(sample.tangent.x, sample.tangent.z),
          0.12,
        );
        this.syncMesh();
      } else {
        this.alive = false;
        this.setGhost(true);
        this.updateScore(checkpoints.length, progress);
        return;
      }
    } else {
      this.offTrackFrames = 0;
      // Soft keep-center pressure helps survival on tight edits
      if (training && Math.abs(lateral) > track.width * 0.28) {
        this.speed *= 0.985;
      }
    }

    const wrappedForward = this.lastProgress > 0.88 && progress < 0.12;
    const forward = progress >= this.lastProgress - 0.004 || wrappedForward;

    if (forward && this.checkpointIndex < checkpoints.length) {
      const next = checkpoints[this.checkpointIndex];
      const crossed =
        (this.lastProgress < next && progress >= next) ||
        (wrappedForward && next > 0.9);
      if (crossed) {
        this.checkpointIndex += 1;
        this.frameOfLastCp = frame;
      }
    }

    // Continuous progress reward (handles long gaps between checkpoints)
    if (forward) {
      if (progress >= this.bestProgress || wrappedForward) {
        if (wrappedForward) this.bestProgress = Math.max(this.bestProgress, progress + 1);
        else this.bestProgress = Math.max(this.bestProgress, progress);
      }
    }

    if (this.checkpointIndex >= checkpoints.length) {
      if (this.lastProgress > 0.8 && progress < 0.12) {
        this.lapCount += 1;
        this.checkpointIndex = 0;
        this.frameOfLastCp = frame;
        this.bestProgress = Math.max(this.bestProgress, 1);
      }
    }

    this.lastProgress = progress;
    this.updateScore(checkpoints.length, progress);
  }

  private updateScore(checkpointCount: number, progress: number) {
    // Discrete CPs + continuous progress so partial corner clears still rank higher
    const continuous = Math.min(0.99, Math.max(progress, this.bestProgress % 1));
    this.score =
      this.lapCount * (checkpointCount + 2) +
      this.checkpointIndex +
      continuous;
  }

  checkStuck(frame: number, maxIdle = 420) {
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
