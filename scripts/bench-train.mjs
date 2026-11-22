import { FastTrack, TRACKS } from "../src/sim/FastTrack.ts";
import { FastTrainer } from "../src/sim/FastTrainer.ts";

console.log("Benchmarking turbo trainer on 4 track layouts...\n");
const results = [];

for (const name of Object.keys(TRACKS)) {
  const trials = [];
  for (let trial = 0; trial < 5; trial++) {
    const track = new FastTrack(TRACKS[name], 12);
    const trainer = new FastTrainer(track, 36, 1200);
    const r = trainer.trainUntilLap(25);
    trials.push(r);
    console.log(
      `${name.padEnd(10)} #${trial + 1}: ${r.success ? "LAP" : "fail"} in ${String(r.generations).padStart(2)} gens | best=${r.best.toFixed(1).padStart(5)} | ${(r.ms / 1000).toFixed(2)}s`,
    );
  }
  const ok = trials.filter((t) => t.success);
  const avgG = ok.length ? ok.reduce((a, b) => a + b.generations, 0) / ok.length : Infinity;
  const avgMs = trials.reduce((a, b) => a + b.ms, 0) / trials.length;
  results.push({ name, rate: ok.length / trials.length, avgG, avgMs });
}

console.log("\n=== SUMMARY ===");
for (const r of results) {
  console.log(
    `${r.name.padEnd(10)} success ${(r.rate * 100).toFixed(0)}% | avg gens to lap ${r.avgG === Infinity ? "—" : r.avgG.toFixed(1)} | avg time ${(r.avgMs / 1000).toFixed(2)}s`,
  );
}
