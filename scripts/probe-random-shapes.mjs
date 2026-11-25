import { generateRandomTrack } from "../src/track/defaultTrack.ts";
import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer } from "../src/sim/FastTrainer.ts";

/** How oval-like is the control polygon? Lower = more irregular. */
function ovalness(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const rs = pts.map((p) => Math.hypot(p.x - cx, p.z - cz));
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r - mean) ** 2, 0) / rs.length);
  return { mean: mean.toFixed(1), cv: (sd / mean).toFixed(3), min: Math.min(...rs).toFixed(1), max: Math.max(...rs).toFixed(1) };
}

let ok = 0;
for (let i = 1; i <= 6; i++) {
  const pts = generateRandomTrack(i * 9973 + 123);
  const o = ovalness(pts);
  const track = new FastTrack(pts, 14);
  const r = new FastTrainer(track, 32, 2800).trainUntilLap(6);
  console.log(
    `#${i}`,
    "pts",
    pts.length,
    "rCV",
    o.cv,
    "r",
    `${o.min}-${o.max}`,
    "len",
    track.totalLength.toFixed(0),
    r.success ? `TRAIN-LAP g${r.generations}` : "TRAIN-FAIL",
  );
  if (r.success) ok++;
}
console.log("train", `${ok}/6`);
if (ok < 5) process.exit(2);
