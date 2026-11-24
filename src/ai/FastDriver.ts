import * as THREE from "three";
import type { Car } from "../car/Car";
import type { FastBrain } from "../sim/FastBrain";
import type { Track } from "../track/Track";

const RAYS = 11;
const input = new Float32Array(RAYS + 3);
const out = new Float32Array(3);

/** Drive a visual Car with a FastBrain using the rendered Track. */
export function driveWithFastBrain(car: Car, brain: FastBrain, track: Track, dt: number) {
  if (!car.alive) return;

  const origin = car.position;
  const spread = Math.PI * 0.9;
  for (let i = 0; i < RAYS; i++) {
    const t = i / (RAYS - 1);
    const rel = spread / 2 - spread * t;
    const ang = car.yaw + rel;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    input[i] = track.raycast(origin, dir, 28);
  }
  const proj = track.project(origin);
  input[RAYS] = Math.min(1, car.speed / 22);
  input[RAYS + 1] = Math.max(-1, Math.min(1, proj.lateral / (track.width * 0.5)));
  const sample = track.samples[proj.index];
  input[RAYS + 2] = Math.sin(car.yaw) * sample.tangent.x + Math.cos(car.yaw) * sample.tangent.z;

  brain.think(input, out);
  // Apply crash lessons so the champion never repeats known mistakes
  brain.crashBook.apply(proj.progress, proj.lateral, input[5], out);

  // Match FastTrainer corner slowdown so race rivals behave like training
  const front = input[Math.floor(RAYS / 2)];
  car.applyAnalog(out[0], out[1], out[2], dt);
  if (front < 0.35) {
    car.speed = Math.min(car.speed, 8 + front * 20);
  }
}

/** Sense-only helper for drawing leader rays during training. */
export function senseForDisplay(
  x: number,
  z: number,
  yaw: number,
  speed: number,
  track: Track,
  outDistances: Float32Array,
): void {
  const origin = new THREE.Vector3(x, 0.35, z);
  const spread = Math.PI * 0.9;
  for (let i = 0; i < RAYS; i++) {
    const t = i / (RAYS - 1);
    const rel = spread / 2 - spread * t;
    const ang = yaw + rel;
    const dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
    outDistances[i] = track.raycast(origin, dir, 28);
  }
  void speed;
}
