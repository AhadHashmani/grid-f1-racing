import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer } from "../src/sim/FastTrainer.ts";
import { FastBrain } from "../src/sim/FastBrain.ts";
import { FAST_INPUTS } from "../src/sim/FastTrainer.ts";

const maps = {
  crazy: [
    { x: 0, z: -40 }, { x: 35, z: -55 }, { x: 55, z: -20 }, { x: 25, z: 5 },
    { x: 50, z: 30 }, { x: 10, z: 50 }, { x: -25, z: 40 }, { x: -45, z: 10 },
    { x: -20, z: -5 }, { x: -55, z: -25 }, { x: -30, z: -50 },
  ],
  spaghetti: [
    { x: 0, z: -30 }, { x: 40, z: -40 }, { x: 20, z: 0 }, { x: 45, z: 25 },
    { x: 0, z: 40 }, { x: -40, z: 20 }, { x: -15, z: -5 }, { x: -40, z: -35 },
  ],
  oval: [
    { x: 0, z: -48 }, { x: 28, z: -52 }, { x: 52, z: -36 }, { x: 58, z: -8 },
    { x: 46, z: 18 }, { x: 22, z: 34 }, { x: -4, z: 46 }, { x: -30, z: 42 },
    { x: -50, z: 24 }, { x: -56, z: -4 }, { x: -42, z: -28 }, { x: -18, z: -44 },
  ],
};

for (const [name, pts] of Object.entries(maps)) {
  const track = new FastTrack(pts, 13);
  const t = new FastTrainer(track, 4, 5000);
  t.agents = [];
  // only pure seeds, no mutation
  for (let i = 0; i < 4; i++) {
    const b = FastBrain.centerlineSeed(FAST_INPUTS);
    t.agents.push(t["spawn"](b, (i%5)-2, i));
  }
  t.frame = 0;
  let laps = 0;
  let best = 0;
  while (t.frame < 5000) {
    const r = t.liveStep(1/36);
    best = Math.max(best, ...t.agents.map(a => a.bestProgress));
    if (t.agents.some(a => a.laps >= 1)) { laps = 1; break; }
    if (r.alive === 0) break;
  }
  console.log(name, "seed-only", laps ? "LAP" : "fail", "bestProg", best.toFixed(2), "frames", t.frame);
}
