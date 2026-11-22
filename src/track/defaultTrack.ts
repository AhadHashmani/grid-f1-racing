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

export const TRACK_WIDTH = 12;
export const TRACK_SAMPLES = 280;
