import { FastTrack } from "../src/sim/FastTrack.ts";
import { FastTrainer } from "../src/sim/FastTrainer.ts";
import { FastBrain } from "../src/sim/FastBrain.ts";
import { FAST_INPUTS } from "../src/sim/FastTrainer.ts";

const crazy = [
  { x: 0, z: -40 }, { x: 35, z: -55 }, { x: 55, z: -20 }, { x: 25, z: 5 },
  { x: 50, z: 30 }, { x: 10, z: 50 }, { x: -25, z: 40 }, { x: -45, z: 10 },
  { x: -20, z: -5 }, { x: -55, z: -25 }, { x: -30, z: -50 },
];

const track = new FastTrack(crazy, 13);
const t = new FastTrainer(track, 1, 20000);
t.agents = [];
const brain = FastBrain.centerlineSeed(FAST_INPUTS);
// manual spawn coach
const s = track.getSpawn(0, 0);
t.agents.push({
  brain, x: s.x, z: s.z, yaw: s.yaw, speed: 8, alive: true,
  progress: s.progress, bestProgress: s.progress, checkpoint: 0, laps: 0,
  score: 0, lastCpFrame: 0, framesAlive: 0, lastSteer: 0, crashed: false, coach: true,
});
t.frame = 0;
t.finishedLapThisGen = false;

for (let i = 0; i < 400; i++) {
  // call step without generation end: patch by using liveStep but prevent finish
  const a = t.agents[0];
  const before = { prog: a.progress, yaw: a.yaw, speed: a.speed, x: a.x, z: a.z };
  // One physics step via private path: liveStep may breed - set maxFrames huge and keep alive
  t.maxFrames = 99999;
  // Monkeypatch finishGeneration
  const orig = t.finishGeneration.bind(t);
  t.finishGeneration = () => {};
  t.liveStep(1/36);
  t.finishGeneration = orig;
  if (i < 5 || i % 50 === 0) {
    const proj = track.project(a.x, a.z, a.progress);
    console.log(i, {
      prog: a.progress.toFixed(3),
      best: a.bestProgress.toFixed(3),
      speed: a.speed.toFixed(1),
      steer: a.lastSteer.toFixed(2),
      lat: proj.lateral.toFixed(2),
      on: proj.onTrack,
      alive: a.alive,
      yaw: a.yaw.toFixed(2),
      align: (Math.sin(a.yaw)*proj.tx+Math.cos(a.yaw)*proj.tz).toFixed(2),
    });
  }
  if (!a.alive) { console.log("died at", i); break; }
  if (a.laps >= 1) { console.log("LAP", i); break; }
}
