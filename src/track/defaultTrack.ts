import type { ControlPoint } from "./Track";
import { isCleanLayout, sanitizeControlPoints } from "./layoutSanitize";

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

/** Hand-built irregular bases — Random Layout mutates one of these so it never looks like the oval. */
const RANDOM_BASES: ControlPoint[][] = [
  // Squashed peanut with a deep inlet
  [
    { x: 0, z: -52 }, { x: 38, z: -48 }, { x: 58, z: -18 }, { x: 22, z: 2 },
    { x: 55, z: 28 }, { x: 18, z: 48 }, { x: -28, z: 42 }, { x: -52, z: 12 },
    { x: -18, z: -2 }, { x: -58, z: -22 }, { x: -40, z: -48 },
  ],
  // Spaghetti / hairpin maze
  [
    { x: 0, z: -45 }, { x: 42, z: -50 }, { x: 28, z: -12 }, { x: 52, z: 8 },
    { x: 12, z: 22 }, { x: 48, z: 40 }, { x: 0, z: 36 }, { x: -35, z: 48 },
    { x: -20, z: 10 }, { x: -55, z: -5 }, { x: -30, z: -28 }, { x: -48, z: -48 },
  ],
  // Triangular circuit with clipped corners
  [
    { x: 0, z: -55 }, { x: 50, z: -35 }, { x: 45, z: 5 }, { x: 55, z: 40 },
    { x: 5, z: 50 }, { x: -40, z: 45 }, { x: -55, z: 5 }, { x: -48, z: -35 },
  ],
  // Narrow hourglass
  [
    { x: -10, z: -50 }, { x: 35, z: -55 }, { x: 50, z: -20 }, { x: 12, z: -5 },
    { x: 48, z: 25 }, { x: 20, z: 50 }, { x: -25, z: 48 }, { x: -50, z: 20 },
    { x: -15, z: 0 }, { x: -52, z: -25 }, { x: -30, z: -50 },
  ],
];

/**
 * Procedural closed circuit that is obviously not the default oval.
 * Jitter is milder, then sanitize/retry so walls never cross the asphalt.
 */
export function generateRandomTrack(seed = Date.now()): ControlPoint[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  for (let attempt = 0; attempt < 14; attempt++) {
    const base = RANDOM_BASES[Math.floor(rnd() * RANDOM_BASES.length)].map((p) => ({ ...p }));
    const rot = (rnd() - 0.5) * 0.9;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const scale = 0.9 + rnd() * 0.35;
    // Milder yank on later attempts so we converge on a clean loop
    const yankScale = attempt < 4 ? 1 : Math.max(0.25, 1 - attempt * 0.08);
    const raw = base.map((p, i) => {
      const yank = (i % 3 === 0 ? 10 + rnd() * 10 : 5 + rnd() * 8) * yankScale;
      const jx = (rnd() - 0.5) * yank;
      const jz = (rnd() - 0.5) * yank;
      const x = (p.x + jx) * scale;
      const z = (p.z + jz) * scale;
      return { x: x * cos - z * sin, z: x * sin + z * cos };
    });
    const cleaned = sanitizeControlPoints(raw, TRACK_WIDTH);
    if (isCleanLayout(cleaned, TRACK_WIDTH)) return cleaned;
  }

  // Guaranteed-clean fallback: lightly jitter a known-good base then sanitize
  const safe = RANDOM_BASES[0].map((p) => ({
    x: p.x + (rnd() - 0.5) * 4,
    z: p.z + (rnd() - 0.5) * 4,
  }));
  return sanitizeControlPoints(safe, TRACK_WIDTH);
}
