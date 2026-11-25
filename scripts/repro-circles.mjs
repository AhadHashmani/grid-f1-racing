import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer } from "../src/sim/FastTrainer.ts";
import { DRIVE, steerAuthority } from "../src/sim/driveParams.ts";

const crazy = [
  { x: 0, z: -40 }, { x: 35, z: -55 }, { x: 55, z: -20 }, { x: 25, z: 5 },
  { x: 50, z: 30 }, { x: 10, z: 50 }, { x: -25, z: 40 }, { x: -45, z: 10 },
  { x: -20, z: -5 }, { x: -55, z: -25 }, { x: -30, z: -50 },
];
const spaghetti = [
  { x: 0, z: -30 }, { x: 40, z: -40 }, { x: 20, z: 0 }, { x: 45, z: 25 },
  { x: 0, z: 40 }, { x: -40, z: 20 }, { x: -15, z: -5 }, { x: -40, z: -35 },
];

for (const spd of [3, 6, 10, 16]) {
  const sf = DRIVE.steerBase + DRIVE.steerSpeed * Math.min(1, spd / DRIVE.maxSpeed);
  const auth = steerAuthority(spd);
  const yawRate = DRIVE.rotSpeed * sf * auth;
  console.log(`v=${spd}: auth=${auth.toFixed(2)} r=${(spd / yawRate).toFixed(2)}m`);
}

for (const [name, pts] of [["crazy", crazy], ["spaghetti", spaghetti]]) {
  const trials = [];
  for (let t = 0; t < 4; t++) {
    const r = new FastTrainer(new FastTrack(pts, 13), 32, 2800).trainUntilLap(45);
    trials.push(r);
    console.log(name, `#${t+1}`, r.success ? "LAP" : "fail", `gen=${r.generations}`, `${(r.ms/1000).toFixed(1)}s`);
  }
  const ok = trials.filter(t => t.success);
  console.log(name, "rate", `${ok.length}/${trials.length}`, "avgGen", ok.length ? (ok.reduce((a,b)=>a+b.generations,0)/ok.length).toFixed(1) : "—");
}
