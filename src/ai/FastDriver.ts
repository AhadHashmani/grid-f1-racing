import * as THREE from "three";
import type { Car } from "../car/Car";
import type { FastBrain } from "../sim/FastBrain";
import { DRIVE } from "../sim/driveParams";
import type { FastTrack } from "../sim/FastTrack";
import type { Track } from "../track/Track";

const input = new Float32Array(DRIVE.rayCount + 3);
const out = new Float32Array(3);

function fillSense(
  x: number,
  z: number,
  yaw: number,
  speed: number,
  width: number,
  lateral: number,
  tx: number,
  tz: number,
  rayFn: (ox: number, oz: number, dx: number, dz: number) => number,
) {
  const rays = DRIVE.rayCount;
  for (let i = 0; i < rays; i++) {
    const t = i / (rays - 1);
    const rel = DRIVE.raySpread / 2 - DRIVE.raySpread * t;
    const ang = yaw + rel;
    input[i] = rayFn(x, z, Math.sin(ang), Math.cos(ang));
  }
  input[rays] = Math.min(1, speed / 22);
  input[rays + 1] = Math.max(-1, Math.min(1, lateral / (width * 0.5)));
  input[rays + 2] = Math.sin(yaw) * tx + Math.cos(yaw) * tz;
}

/** Drive a visual Car with a FastBrain — prefer FastTrack sensing (same as training). */
export function driveWithFastBrain(
  car: Car,
  brain: FastBrain,
  track: Track,
  dt: number,
  fastTrack?: FastTrack | null,
) {
  if (!car.alive) return;

  let progress = 0;
  let lateral = 0;
  let front = 1;

  if (fastTrack) {
    const proj = fastTrack.project(car.position.x, car.position.z, car.lastProgress);
    progress = proj.progress;
    lateral = proj.lateral;
    fillSense(
      car.position.x,
      car.position.z,
      car.yaw,
      car.speed,
      fastTrack.width,
      proj.lateral,
      proj.tx,
      proj.tz,
      (ox, oz, dx, dz) => fastTrack.raycast(ox, oz, dx, dz, DRIVE.rayRange),
    );
    if (!proj.onTrack) {
      car.alive = false;
      car.setGhost(true);
      return;
    }
  } else {
    const origin = car.position;
    const proj = track.project(origin);
    progress = proj.progress;
    lateral = proj.lateral;
    const sample = track.samples[proj.index];
    fillSense(
      origin.x,
      origin.z,
      car.yaw,
      car.speed,
      track.width,
      proj.lateral,
      sample.tangent.x,
      sample.tangent.z,
      (ox, oz, dx, dz) =>
        track.raycast(new THREE.Vector3(ox, 0.35, oz), new THREE.Vector3(dx, 0, dz), DRIVE.rayRange),
    );
    if (!proj.onTrack) {
      car.alive = false;
      car.setGhost(true);
      return;
    }
  }

  brain.think(input, out);
  brain.crashBook.apply(progress, lateral, input[5], out);
  front = input[Math.floor(DRIVE.rayCount / 2)];
  const align = input[DRIVE.rayCount + 2];
  const latN = input[DRIVE.rayCount + 1];
  if (front > 0.55 && Math.abs(latN) < 0.22 && align > 0.55) {
    out[1] *= 0.25;
  }

  // Blend NN with pure-pursuit + soft recenter so race/watch survive custom layouts
  if (fastTrack) {
    const absLat = Math.abs(latN);
    if (absLat > 0.18) {
      const pull = Math.min(0.55, absLat * 0.4);
      const cen = fastTrack.sampleAtProgress(progress);
      car.position.x += (cen.x - car.position.x) * pull * 0.22;
      car.position.z += (cen.z - car.position.z) * pull * 0.22;
    }
    const total = Math.max(fastTrack.totalLength, 1);
    let look = Math.max(6, Math.min(16, 6 + car.speed * 0.4));
    if (front < 0.5) look *= 0.45;
    if (absLat > 0.4) look = Math.min(look, 7);
    const target = fastTrack.sampleAtProgress(progress + look / total);
    const dx = target.x - car.position.x;
    const dz = target.z - car.position.z;
    let err = Math.atan2(dx, dz) - car.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    let pSteer = err * 1.55 - latN * 0.95;
    if (pSteer > 1) pSteer = 1;
    if (pSteer < -1) pSteer = -1;
    const pBrake = front < 0.28 ? 0.85 : front < 0.42 || Math.abs(err) > 0.7 ? 0.35 : 0.05;
    const pThr = front < 0.28 ? 0.2 : Math.abs(err) > 0.7 ? 0.55 : 0.92;
    const assist = Math.min(0.78, 0.4 + absLat * 0.5 + (front < 0.4 ? 0.22 : 0));
    out[0] = out[0] * (1 - assist) + pThr * assist;
    out[1] = out[1] * (1 - assist) + pSteer * assist;
    out[2] = out[2] * (1 - assist) + pBrake * assist;
  }

  car.applyAnalog(out[0], out[1], out[2], dt);
  if (front < DRIVE.frontSlow) {
    car.speed = Math.min(car.speed, DRIVE.frontMin + front * DRIVE.frontScale);
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
  fastTrack?: FastTrack | null,
): void {
  const rays = DRIVE.rayCount;
  for (let i = 0; i < rays; i++) {
    const t = i / (rays - 1);
    const rel = DRIVE.raySpread / 2 - DRIVE.raySpread * t;
    const ang = yaw + rel;
    if (fastTrack) {
      outDistances[i] = fastTrack.raycast(x, z, Math.sin(ang), Math.cos(ang), DRIVE.rayRange);
    } else {
      outDistances[i] = track.raycast(
        new THREE.Vector3(x, 0.35, z),
        new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)),
        DRIVE.rayRange,
      );
    }
  }
  void speed;
}
