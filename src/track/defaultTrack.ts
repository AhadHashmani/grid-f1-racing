import type { ControlPoint } from "./Track";

/** Default F1-inspired closed circuit control points (XZ plane). */
export const DEFAULT_CONTROL_POINTS: ControlPoint[] = [
  { x: 0, z: -48 },
  { x: 28, z: -52 },
  { x: 52, z: -36 },
  { x: 58, z: -8 },
  { x: 46, z: 18 },
  { x: 22, z: 34 },
  { x: -4, z: 46 },
  { x: -30, z: 42 },
  { x: -50, z: 24 },
  { x: -56, z: -4 },
  { x: -42, z: -28 },
  { x: -18, z: -44 },
];

export const TRACK_WIDTH = 14;
/** Denser samples = smoother continuous walls on generated layouts. */
export const TRACK_SAMPLES = 220;

/** Procedural closed circuit — irregular ring with pinch points and hairpins. */
export function generateRandomTrack(seed = Date.now()): ControlPoint[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const n = 10 + Math.floor(rnd() * 6);
  const pts: ControlPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
    // Alternate fat / pinched radii so the silhouette isn't a bland oval
    const pinch = i % 3 === 0 ? 0.55 + rnd() * 0.25 : 0.85 + rnd() * 0.55;
    const r = (22 + rnd() * 28) * pinch;
    pts.push({
      x: Math.cos(a) * r + (rnd() - 0.5) * 18,
      z: Math.sin(a) * r + (rnd() - 0.5) * 18,
    });
  }
  return pts;
}
