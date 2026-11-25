import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer, FAST_INPUTS } from "../src/sim/FastTrainer.ts";
import { DRIVE, steerAuthority } from "../src/sim/driveParams.ts";

const crazy = [
  { x: 0, z: -40 }, { x: 35, z: -55 }, { x: 55, z: -20 }, { x: 25, z: 5 },
  { x: 50, z: 30 }, { x: 10, z: 50 }, { x: -25, z: 40 }, { x: -45, z: 10 },
  { x: -20, z: -5 }, { x: -55, z: -25 }, { x: -30, z: -50 },
];
const track = new FastTrack(crazy, 14);
const t = new FastTrainer(track, 32, 2800);
const r = t.trainUntilLap(5);
console.log("train", r);
if (!t.champion) {
  console.log("no champ");
  process.exit(1);
}

function runAgent(blend) {
  const input = new Float32Array(FAST_INPUTS);
  const out = new Float32Array(3);
  const s = track.getSpawn(0, 0);
  const a = {
    brain: t.champion.clone(),
    x: s.x,
    z: s.z,
    yaw: s.yaw,
    speed: 6,
    alive: true,
    progress: s.progress,
    bestProgress: s.progress,
    laps: 0,
  };
  const dt = 1 / 36;
  let yawAccum = 0;
  let prevYaw = a.yaw;
  let i = 0;
  for (; i < 6000 && a.alive; i++) {
    for (let ri = 0; ri < DRIVE.rayCount; ri++) {
      const tt = ri / (DRIVE.rayCount - 1);
      const rel = DRIVE.raySpread / 2 - DRIVE.raySpread * tt;
      const ang = a.yaw + rel;
      input[ri] = track.raycast(a.x, a.z, Math.sin(ang), Math.cos(ang), DRIVE.rayRange);
    }
    const proj0 = track.project(a.x, a.z, a.progress);
    input[DRIVE.rayCount] = Math.min(1, a.speed / 22);
    input[DRIVE.rayCount + 1] = Math.max(
      -1,
      Math.min(1, proj0.lateral / (track.width * 0.5)),
    );
    input[DRIVE.rayCount + 2] =
      Math.sin(a.yaw) * proj0.tx + Math.cos(a.yaw) * proj0.tz;

    a.brain.think(input, out);
    a.brain.crashBook.apply(proj0.progress, proj0.lateral, input[5], out);
    const front = input[Math.floor(DRIVE.rayCount / 2)];
    const latN = input[DRIVE.rayCount + 1];
    const align = input[DRIVE.rayCount + 2];
    if (front > 0.55 && Math.abs(latN) < 0.22 && align > 0.55) out[1] *= 0.25;

    if (blend) {
      const absLat = Math.abs(latN);
      if (absLat > 0.18) {
        const pull = Math.min(0.55, absLat * 0.4);
        const cen = track.sampleAtProgress(a.progress);
        a.x += (cen.x - a.x) * pull * 0.22;
        a.z += (cen.z - a.z) * pull * 0.22;
      }
      const total = Math.max(track.totalLength, 1);
      let look = Math.max(6, Math.min(16, 6 + a.speed * 0.4));
      if (front < 0.5) look *= 0.45;
      if (absLat > 0.4) look = Math.min(look, 7);
      const target = track.sampleAtProgress(a.progress + look / total);
      let err = Math.atan2(target.x - a.x, target.z - a.z) - a.yaw;
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

    let throttle = out[0];
    let steer = out[1];
    let brake = out[2];
    if (a.speed < 2.5) {
      throttle = Math.max(throttle, 0.9);
      brake = 0;
      steer *= 0.5;
    }
    steer *= steerAuthority(a.speed);

    const accel = DRIVE.accel;
    const maxSpeed = DRIVE.maxSpeed;
    if (brake > DRIVE.brakeThresh && throttle < DRIVE.throttleThresh) {
      a.speed = Math.max(0, a.speed - accel * DRIVE.brakeMult * dt);
    } else {
      a.speed += accel * Math.max(DRIVE.minThrottle, throttle) * dt;
      a.speed = Math.min(maxSpeed, a.speed);
      a.speed = Math.max(0, a.speed - accel * DRIVE.drag * dt);
    }
    if (front < DRIVE.frontSlow) {
      a.speed = Math.min(a.speed, DRIVE.frontMin + front * DRIVE.frontScale);
    }
    const steerFactor =
      DRIVE.steerBase + DRIVE.steerSpeed * Math.min(1, Math.abs(a.speed) / maxSpeed);
    a.yaw += steer * DRIVE.rotSpeed * steerFactor * dt;
    a.x += Math.sin(a.yaw) * a.speed * dt;
    a.z += Math.cos(a.yaw) * a.speed * dt;

    const proj = track.project(a.x, a.z, a.progress);
    if (!proj.onTrack) {
      a.alive = false;
      break;
    }
    const prevP = a.progress;
    const wrapped = prevP > 0.82 && proj.progress < 0.18;
    if (wrapped) a.laps += 1;
    a.bestProgress = Math.max(a.bestProgress, a.laps + proj.progress);
    a.progress = proj.progress;

    let dy = a.yaw - prevYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    yawAccum += Math.abs(dy);
    prevYaw = a.yaw;
    if (a.laps >= 1) break;
  }

  return {
    i,
    laps: a.laps,
    best: a.bestProgress,
    alive: a.alive,
    yawDeg: (yawAccum * 180) / Math.PI,
  };
}

const raw = runAgent(false);
console.log(
  "raw NN",
  raw.laps ? "LAP" : raw.alive ? "alive" : "died",
  `frame ${raw.i}`,
  `prog ${raw.best.toFixed(2)}`,
);
const blended = runAgent(true);
console.log(
  "race blend",
  blended.laps ? "LAP" : blended.alive ? "alive" : "died",
  `frame ${blended.i}`,
  `prog ${blended.best.toFixed(2)}`,
  `yawDeg ${blended.yawDeg.toFixed(0)}`,
);
if (!blended.laps) process.exit(2);
