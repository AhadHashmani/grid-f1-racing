/**
 * Assert cars never sit past driveHalf after resolveWall (anti-phase check).
 */
import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer } from "../src/sim/FastTrainer.ts";
import { driveHalf } from "../src/sim/driveParams.ts";
import { DEFAULT_CONTROL_POINTS, generateRandomTrack } from "../src/track/defaultTrack.ts";

function maxLateral(track, agents) {
  let worst = 0;
  const limit = driveHalf(track.width);
  for (const a of agents) {
    const p = track.project(a.x, a.z, a.progress);
    const over = Math.abs(p.lateral) - limit;
    if (over > worst) worst = over;
  }
  return worst;
}

function runLayout(name, pts) {
  const track = new FastTrack(pts, 14);
  const trainer = new FastTrainer(track, 32, 2800);
  trainer.startFresh();
  let worst = 0;
  for (let i = 0; i < 900; i++) {
    trainer.liveStep(1 / 48);
    const w = maxLateral(track, trainer.agents);
    if (w > worst) worst = w;
  }
  const ok = worst < 0.08;
  console.log(`${name}: worstOver=${worst.toFixed(4)} limit=${driveHalf(14).toFixed(2)} ${ok ? "OK" : "FAIL"}`);
  return ok;
}

const a = runLayout("default", DEFAULT_CONTROL_POINTS);
const b = runLayout("random", generateRandomTrack());
if (!a || !b) process.exit(1);
console.log("walls hold");
