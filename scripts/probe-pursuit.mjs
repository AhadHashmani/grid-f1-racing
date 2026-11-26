/** Can pure pursuit alone finish a lap on default + random? */
import { FastTrack } from "../src/sim/FastTrack.ts";
import { DRIVE, driveHalf } from "../src/sim/driveParams.ts";
import { DEFAULT_CONTROL_POINTS, generateRandomTrack } from "../src/track/defaultTrack.ts";

function pursuitLap(pts, name) {
  const track = new FastTrack(pts, 14);
  const s = track.getSpawn(0, 0);
  let x = s.x,
    z = s.z,
    yaw = s.yaw,
    speed = 8,
    progress = s.progress,
    laps = 0;
  const dt = 1 / 36;
  const total = Math.max(track.totalLength, 1);
  let worst = 0;
  for (let i = 0; i < 8000; i++) {
    const proj = track.project(x, z, progress);
    const latN = Math.max(-1, Math.min(1, proj.lateral / (track.width * 0.5)));
    const absLat = Math.abs(latN);
    if (absLat > 0.14) {
      const pull = Math.min(0.58, absLat * 0.42);
      const cen = track.sampleAtProgress(progress);
      x += (cen.x - x) * pull * 0.24;
      z += (cen.z - z) * pull * 0.24;
    }
    // front ray
    const front = track.raycast(x, z, Math.sin(yaw), Math.cos(yaw), DRIVE.rayRange, progress);
    let look = Math.max(6, Math.min(17, 6 + speed * 0.42));
    if (front < 0.5) look *= 0.45;
    if (absLat > 0.38) look = Math.min(look, 7);
    const target = track.sampleAtProgress(progress + look / total);
    let err = Math.atan2(target.x - x, target.z - z) - yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    let steer = err * 1.55 - latN * 0.95;
    if (steer > 1) steer = 1;
    if (steer < -1) steer = -1;
    let brake = front < 0.28 ? 0.85 : front < 0.42 || Math.abs(err) > 0.7 ? 0.36 : 0.05;
    let throttle = front < 0.28 ? 0.2 : Math.abs(err) > 0.7 ? 0.52 : 0.92;
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
      worst = Math.max(worst, Math.abs(hit.lateral) - driveHalf(14));
      if (hit.hit && hit.breach) {
        console.log(JSON.stringify({ name, ok: false, reason: "breach", i, prog: prefer, worst }));
        return false;
      }
    }
    const guided = track.project(x, z, prefer);
    const wrapped = track.crossedFinish(prefer, guided.progress);
    if (wrapped) laps += 1;
    progress = guided.progress;
    if (laps >= 1) {
      console.log(JSON.stringify({ name, ok: true, frames: i, worst }));
      return true;
    }
  }
  console.log(JSON.stringify({ name, ok: false, reason: "timeout", prog: progress, worst }));
  return false;
}

let ok = 0;
ok += pursuitLap(DEFAULT_CONTROL_POINTS, "default") ? 1 : 0;
for (let i = 0; i < 5; i++) ok += pursuitLap(generateRandomTrack(), `random-${i}`) ? 1 : 0;
console.log(`pursuit ${ok}/6`);
process.exit(ok >= 5 ? 0 : 1);
