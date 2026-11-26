/**
 * Stress: many random + hand-built layouts → trainUntilLap + race-blend lap + walls.
 */
import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer, FAST_INPUTS } from "../src/sim/FastTrainer.ts";
import { DRIVE, driveHalf } from "../src/sim/driveParams.ts";
import { DEFAULT_CONTROL_POINTS, generateRandomTrack } from "../src/track/defaultTrack.ts";

const HAND = [
  {
    name: "hairpin-oval",
    pts: [
      { x: 0, z: -50 },
      { x: 40, z: -55 },
      { x: 55, z: -20 },
      { x: 40, z: 10 },
      { x: 55, z: 40 },
      { x: 10, z: 55 },
      { x: -40, z: 45 },
      { x: -55, z: 10 },
      { x: -40, z: -20 },
      { x: -50, z: -45 },
    ],
  },
  {
    name: "tight-s",
    pts: [
      { x: 0, z: -45 },
      { x: 30, z: -50 },
      { x: 45, z: -15 },
      { x: 15, z: 5 },
      { x: 40, z: 30 },
      { x: 5, z: 50 },
      { x: -35, z: 35 },
      { x: -20, z: 5 },
      { x: -45, z: -25 },
      { x: -25, z: -50 },
    ],
  },
  {
    name: "crazy-fold",
    pts: [
      { x: 0, z: -40 },
      { x: 35, z: -55 },
      { x: 55, z: -20 },
      { x: 25, z: 5 },
      { x: 50, z: 30 },
      { x: 10, z: 50 },
      { x: -25, z: 40 },
      { x: -45, z: 10 },
      { x: -20, z: -5 },
      { x: -55, z: -25 },
      { x: -30, z: -50 },
    ],
  },
];

function raceBlendLap(track, brain, maxFrames = 6000) {
  const input = new Float32Array(FAST_INPUTS);
  const out = new Float32Array(3);
  const s = track.getSpawn(0, 0);
  let x = s.x,
    z = s.z,
    yaw = s.yaw,
    speed = 6,
    progress = s.progress,
    alive = true,
    laps = 0;
  const dt = 1 / 36;
  const rays = DRIVE.rayCount;
  const total = Math.max(track.totalLength, 1);
  for (let i = 0; i < maxFrames && alive; i++) {
    for (let ri = 0; ri < rays; ri++) {
      const t = ri / (rays - 1);
      const rel = DRIVE.raySpread / 2 - DRIVE.raySpread * t;
      const ang = yaw + rel;
      input[ri] = track.raycast(x, z, Math.sin(ang), Math.cos(ang), DRIVE.rayRange, progress);
    }
    const proj = track.project(x, z, progress);
    input[rays] = Math.min(1, speed / 22);
    input[rays + 1] = Math.max(-1, Math.min(1, proj.lateral / (track.width * 0.5)));
    input[rays + 2] = Math.sin(yaw) * proj.tx + Math.cos(yaw) * proj.tz;
    brain.think(input, out);
    brain.crashBook.apply(proj.progress, proj.lateral, input[Math.floor(rays / 2)], out);
    const front = input[Math.floor(rays / 2)];
    const latN = input[rays + 1];
    const absLat = Math.abs(latN);
    if (front > 0.55 && absLat < 0.22 && input[rays + 2] > 0.55) out[1] *= 0.25;
    if (absLat > 0.14) {
      const pull = Math.min(0.58, absLat * 0.42);
      const cen = track.sampleAtProgress(progress);
      x += (cen.x - x) * pull * 0.24;
      z += (cen.z - z) * pull * 0.24;
    }
    let look = Math.max(6, Math.min(17, 6 + speed * 0.42));
    if (front < 0.5) look *= 0.45;
    if (absLat > 0.38) look = Math.min(look, 7);
    const peek = track.sampleAtProgress(progress + 12 / total);
    const here = track.sampleAtProgress(progress);
    const turnDot = here.tx * peek.tx + here.tz * peek.tz;
    if (turnDot < 0.8) look = Math.min(look, 8);
    const target = track.sampleAtProgress(progress + look / total);
    let err = Math.atan2(target.x - x, target.z - z) - yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    let pSteer = err * 1.55 - latN * 0.95;
    if (pSteer > 1) pSteer = 1;
    if (pSteer < -1) pSteer = -1;
    const pBrake =
      front < 0.28 ? 0.85 : front < 0.42 || Math.abs(err) > 0.7 || turnDot < 0.75 ? 0.36 : 0.05;
    const pThr =
      front < 0.28 ? 0.2 : Math.abs(err) > 0.7 || turnDot < 0.75 ? 0.52 : Math.abs(err) > 0.35 ? 0.75 : 0.92;
    const assist = Math.min(
      0.85,
      0.48 + absLat * 0.48 + (front < 0.4 ? 0.2 : 0) + (turnDot < 0.8 ? 0.1 : 0),
    );
    let throttle = out[0] * (1 - assist) + pThr * assist;
    let steer = out[1] * (1 - assist) + pSteer * assist;
    let brake = out[2] * (1 - assist) + pBrake * assist;

    if (brake > DRIVE.brakeThresh && throttle < DRIVE.throttleThresh) {
      speed = Math.max(0, speed - DRIVE.accel * DRIVE.brakeMult * dt);
    } else {
      speed = Math.min(DRIVE.maxSpeed, speed + DRIVE.accel * Math.max(DRIVE.minThrottle, throttle) * dt);
      speed = Math.max(0, speed - DRIVE.accel * DRIVE.drag * dt);
    }
    if (front < DRIVE.frontSlow) speed = Math.min(speed, DRIVE.frontMin + front * DRIVE.frontScale);
    const auth = Math.max(DRIVE.steerMinAuth, Math.min(1, Math.abs(speed) / DRIVE.steerSpeedGate));
    const sf = DRIVE.steerBase + DRIVE.steerSpeed * Math.min(1, Math.abs(speed) / DRIVE.maxSpeed);
    yaw += steer * auth * DRIVE.rotSpeed * sf * dt;

    const prefer = progress;
    const moveDist = Math.abs(speed) * dt;
    const subs = Math.max(1, Math.min(10, Math.ceil(moveDist / DRIVE.wallStep)));
    const sdt = dt / subs;
    for (let s = 0; s < subs; s++) {
      x += Math.sin(yaw) * speed * sdt;
      z += Math.cos(yaw) * speed * sdt;
      const hit = track.resolveWall(x, z, prefer);
      x = hit.x;
      z = hit.z;
      if (hit.hit && hit.breach) {
        alive = false;
        break;
      }
    }
    if (!alive) return { ok: false, frames: i, prog: prefer + laps };
    const guided = track.project(x, z, prefer);
    const wrapped = track.crossedFinish(prefer, guided.progress);
    if (wrapped) laps += 1;
    progress = guided.progress;
    if (laps >= 1) return { ok: true, frames: i, prog: 1 };
  }
  return { ok: false, frames: maxFrames, prog: laps + progress };
}

function wallCheck(track, trainer, ticks = 400) {
  const limit = driveHalf(track.width);
  let worst = 0;
  for (let i = 0; i < ticks; i++) {
    trainer.liveStep(1 / 48);
    for (const a of trainer.agents) {
      const p = track.project(a.x, a.z, a.progress);
      worst = Math.max(worst, Math.abs(p.lateral) - limit);
    }
  }
  return worst;
}

function evalLayout(name, pts, maxGens = 6) {
  const track = new FastTrack(pts, 14);
  const t0 = performance.now();
  const trainer = new FastTrainer(track, 28, 3200);
  const train = trainer.trainUntilLap(maxGens);
  const wall = wallCheck(track, trainer, 200);
  let race = { ok: false, frames: 0, prog: 0 };
  if (trainer.champion) {
    race = raceBlendLap(track, trainer.champion);
  }
  const ms = Math.round(performance.now() - t0);
  const row = {
    name,
    trainOk: !!train.success,
    gens: train.generations,
    best: Number(train.best?.toFixed?.(1) ?? train.best),
    raceOk: race.ok,
    raceProg: Number(race.prog.toFixed(2)),
    wallOver: Number(wall.toFixed(4)),
    len: Math.round(track.totalLength),
    ms,
  };
  console.log(JSON.stringify(row));
  return row;
}

const results = [];
results.push(evalLayout("default", DEFAULT_CONTROL_POINTS, 4));
for (const h of HAND) results.push(evalLayout(h.name, h.pts, 6));
for (let i = 0; i < 8; i++) {
  results.push(evalLayout(`random-${i}`, generateRandomTrack(), 6));
}

const trainPass = results.filter((r) => r.trainOk).length;
const racePass = results.filter((r) => r.raceOk).length;
const wallFail = results.filter((r) => r.wallOver >= 0.08).length;
console.log(
  `SUMMARY train ${trainPass}/${results.length} race ${racePass}/${results.length} wallFails ${wallFail}`,
);
if (trainPass < results.length - 2 || racePass < results.length - 3 || wallFail > 0) {
  process.exit(1);
}
