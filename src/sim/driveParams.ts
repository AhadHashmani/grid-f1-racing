/** Shared continuous-drive constants so training and race/watch match. */
export const DRIVE = {
  accel: 20,
  maxSpeed: 21,
  rotSpeed: 3.4,
  brakeThresh: 0.55,
  throttleThresh: 0.45,
  brakeMult: 1.6,
  drag: 0.08,
  minThrottle: 0.15,
  steerBase: 0.45,
  steerSpeed: 0.55,
  frontSlow: 0.35,
  frontMin: 8,
  frontScale: 20,
  rayCount: 11,
  rayRange: 28,
  raySpread: Math.PI * 0.9,
} as const;
