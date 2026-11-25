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

/**
 * Procedural closed circuit that is obviously not the default oval:
 * hairpin inlets, wide bulges, and a couple of hard kinks.
 */
export function generateRandomTrack(seed = Date.now()): ControlPoint[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const n = 12 + Math.floor(rnd() * 4);
  const pts: ControlPoint[] = [];
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    // Uneven step — sometimes almost skip, sometimes double-back a bit
    const step = (Math.PI * 2) / n;
    a += step * (0.55 + rnd() * 0.9);
    if (i % 5 === 2) a += (rnd() - 0.5) * 0.85; // kink

    let pinch: number;
    if (i % 5 === 0) pinch = 0.32 + rnd() * 0.18; // deep hairpin
    else if (i % 5 === 1) pinch = 0.48 + rnd() * 0.18;
    else if (i % 5 === 3) pinch = 1.15 + rnd() * 0.55; // fat bulge
    else pinch = 0.75 + rnd() * 0.45;

    const r = (18 + rnd() * 34) * pinch;
    pts.push({
      x: Math.cos(a) * r + (rnd() - 0.5) * 26,
      z: Math.sin(a) * r + (rnd() - 0.5) * 26,
    });
  }
  return pts;
}
