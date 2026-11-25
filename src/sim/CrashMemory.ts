/** Compact "don't crash like that again" memory for a single brain. */

export type CrashLesson = {
  /** Track progress bucket 0..31 */
  progressBin: number;
  /** Wall side at impact: -1 left, +1 right */
  side: number;
  /** How open the forward ray was (0..1) */
  front: number;
  /** Corrective steer to apply next time (−1..1) */
  steer: number;
  /** Corrective brake to apply next time (0..1) */
  brake: number;
};

const MAX_LESSONS = 18;

export class CrashBook {
  lessons: CrashLesson[] = [];

  clone(): CrashBook {
    const c = new CrashBook();
    c.lessons = this.lessons.map((l) => ({ ...l }));
    return c;
  }

  merge(other: CrashBook) {
    for (const lesson of other.lessons) this.add(lesson);
  }

  add(lesson: CrashLesson) {
    const idx = this.lessons.findIndex(
      (l) =>
        l.progressBin === lesson.progressBin &&
        l.side === lesson.side &&
        Math.abs(l.front - lesson.front) < 0.18,
    );
    if (idx >= 0) this.lessons[idx] = lesson;
    else this.lessons.push(lesson);
    if (this.lessons.length > MAX_LESSONS) this.lessons.shift();
  }

  /** Record a crash and a gentle corrective action. */
  remember(
    progress: number,
    lateral: number,
    frontRay: number,
    badSteer: number,
  ): CrashLesson {
    const side = lateral >= 0 ? 1 : -1;
    const lesson: CrashLesson = {
      progressBin: Math.max(0, Math.min(31, Math.floor(progress * 32))),
      side,
      front: frontRay,
      // Mild steer away from the wall — hard ±1 corrections caused doughnuts
      steer: Math.max(-0.55, Math.min(0.55, -side * 0.5 - Math.sign(badSteer) * 0.1)),
      brake: frontRay < 0.45 ? 0.85 : 0.55,
    };
    this.add(lesson);
    return lesson;
  }

  /**
   * Bias outputs only when drifting toward a remembered wall.
   * Prefers braking over slamming full opposite steer (which caused mini-circles).
   */
  apply(
    progress: number,
    lateral: number,
    frontRay: number,
    out: Float32Array,
  ): boolean {
    const bin = Math.max(0, Math.min(31, Math.floor(progress * 32)));
    const side = lateral >= 0 ? 1 : -1;
    let hit = false;

    for (const lesson of this.lessons) {
      const binDist = Math.min(
        Math.abs(lesson.progressBin - bin),
        32 - Math.abs(lesson.progressBin - bin),
      );
      if (binDist > 1) continue;
      if (lesson.side !== side) continue;
      // Only when actually leaning into that wall
      if (Math.abs(lateral) < 1.2) continue;
      if (frontRay > 0.7 && Math.abs(lateral) < 2.5) continue;

      const strength = 0.28 + (1 - binDist / 2) * 0.15;
      out[1] = out[1] * (1 - strength) + lesson.steer * strength;
      out[2] = Math.max(out[2], lesson.brake * (0.45 + strength));
      out[0] *= 1 - 0.35 * strength;
      hit = true;
    }
    return hit;
  }

  toJSON(): CrashLesson[] {
    return this.lessons.map((l) => ({ ...l }));
  }

  static fromJSON(data: CrashLesson[] | undefined): CrashBook {
    const book = new CrashBook();
    if (!data?.length) return book;
    for (const lesson of data) book.add(lesson);
    return book;
  }
}
