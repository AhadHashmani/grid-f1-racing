/** Shared continuous-drive constants so training and race/watch match. */
export const DRIVE = {
  accel: 18,
  maxSpeed: 20,
  /** Cap yaw rate so full steer can't carve mini doughnuts. */
  rotSpeed: 2.05,
  brakeThresh: 0.55,
  throttleThresh: 0.45,
  brakeMult: 1.55,
  drag: 0.08,
  minThrottle: 0.15,
  steerBase: 0.16,
  steerSpeed: 0.78,
  /** Need real speed before full steer authority — kills spot-turns. */
  steerSpeedGate: 8.5,
  steerMinAuth: 0.16,
  frontSlow: 0.38,
  frontMin: 7.5,
  frontScale: 18,
  rayCount: 11,
  rayRange: 28,
  raySpread: Math.PI * 0.9,
} as const;

/** How much of commanded steer is allowed at the current speed. */
export function steerAuthority(speed: number): number {
  return Math.max(
    DRIVE.steerMinAuth,
    Math.min(1, Math.abs(speed) / DRIVE.steerSpeedGate),
  );
}
