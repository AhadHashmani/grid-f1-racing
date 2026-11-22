export type ControlPoint = { x: number; z: number };

export type Sample = {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  distance: number;
};

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Lightweight track geometry for fast headless / in-game AI evaluation. */
export class FastTrack {
  controlPoints: ControlPoint[];
  width: number;
  samples: Sample[] = [];
  totalLength = 0;
  private grid = new Map<string, number[]>();
  private cell = 8;

  constructor(controlPoints: ControlPoint[], width = 12) {
    this.controlPoints = controlPoints.map((p) => ({ ...p }));
    this.width = width;
    this.rebuild();
  }

  rebuild() {
    this.buildSamples();
    this.buildGrid();
  }

  private pointAt(i: number, t: number): { x: number; z: number } {
    const n = this.controlPoints.length;
    const p0 = this.controlPoints[(i - 1 + n) % n];
    const p1 = this.controlPoints[i % n];
    const p2 = this.controlPoints[(i + 1) % n];
    const p3 = this.controlPoints[(i + 2) % n];
    return {
      x: catmull(p0.x, p1.x, p2.x, p3.x, t),
      z: catmull(p0.z, p1.z, p2.z, p3.z, t),
    };
  }

  private buildSamples() {
    const raw: { x: number; z: number }[] = [];
    const n = this.controlPoints.length;
    const steps = Math.max(10, Math.floor(320 / n));
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < steps; s++) raw.push(this.pointAt(i, s / steps));
    }

    this.samples = [];
    let dist = 0;
    for (let i = 0; i < raw.length; i++) {
      const curr = raw[i];
      const next = raw[(i + 1) % raw.length];
      const prev = raw[(i - 1 + raw.length) % raw.length];
      let tx = next.x - prev.x;
      let tz = next.z - prev.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      this.samples.push({
        x: curr.x,
        z: curr.z,
        tx,
        tz,
        nx: -tz,
        nz: tx,
        distance: dist,
      });
      dist += Math.hypot(next.x - curr.x, next.z - curr.z);
    }
    this.totalLength = dist;
  }

  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(z / this.cell)}`;
  }

  private buildGrid() {
    this.grid.clear();
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      const k = this.key(s.x, s.z);
      const bucket = this.grid.get(k);
      if (bucket) bucket.push(i);
      else this.grid.set(k, [i]);
    }
  }

  private candidateIndices(x: number, z: number): number[] {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.grid.get(`${cx + dx}:${cz + dz}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out.length ? out : this.samples.map((_, i) => i);
  }

  project(x: number, z: number): {
    progress: number;
    index: number;
    lateral: number;
    onTrack: boolean;
    tx: number;
    tz: number;
  } {
    let best = 0;
    let bestDist = Infinity;
    const idxs = this.candidateIndices(x, z);
    for (const i of idxs) {
      const s = this.samples[i];
      const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const s = this.samples[best];
    const lateral = (x - s.x) * s.nx + (z - s.z) * s.nz;
    return {
      progress: s.distance / Math.max(this.totalLength, 1),
      index: best,
      lateral,
      onTrack: Math.abs(lateral) <= this.width * 0.5 + 0.4,
      tx: s.tx,
      tz: s.tz,
    };
  }

  raycast(x: number, z: number, dx: number, dz: number, maxDist = 30): number {
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const step = 0.7;
    for (let d = 0.8; d <= maxDist; d += step) {
      const px = x + dx * d;
      const pz = z + dz * d;
      if (!this.project(px, pz).onTrack) {
        return Math.max(0, (d - 0.8) / (maxDist - 0.8));
      }
    }
    return 1;
  }

  getSpawn(lane = 0) {
    const s = this.samples[Math.min(4, this.samples.length - 1)];
    const maxL = this.width * 0.25;
    const lateral = Math.max(-maxL, Math.min(maxL, lane * 1.5));
    return {
      x: s.x + s.nx * lateral,
      z: s.z + s.nz * lateral,
      yaw: Math.atan2(s.tx, s.tz),
    };
  }

  hash(): string {
    return this.controlPoints.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join("|");
  }
}

export const TRACKS: Record<string, ControlPoint[]> = {
  oval: [
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
  ],
  tight: [
    { x: 0, z: -40 },
    { x: 22, z: -44 },
    { x: 40, z: -28 },
    { x: 36, z: -6 },
    { x: 48, z: 14 },
    { x: 28, z: 30 },
    { x: 4, z: 38 },
    { x: -20, z: 34 },
    { x: -38, z: 18 },
    { x: -44, z: -4 },
    { x: -30, z: -22 },
    { x: -10, z: -36 },
  ],
  chicane: [
    { x: 0, z: -50 },
    { x: 30, z: -48 },
    { x: 50, z: -30 },
    { x: 42, z: -8 },
    { x: 55, z: 10 },
    { x: 35, z: 18 },
    { x: 45, z: 32 },
    { x: 20, z: 42 },
    { x: -10, z: 44 },
    { x: -35, z: 30 },
    { x: -50, z: 8 },
    { x: -45, z: -18 },
    { x: -25, z: -38 },
  ],
  spaghetti: [
    { x: 0, z: -45 },
    { x: 25, z: -50 },
    { x: 45, z: -35 },
    { x: 50, z: -10 },
    { x: 30, z: 5 },
    { x: 48, z: 22 },
    { x: 25, z: 38 },
    { x: 0, z: 30 },
    { x: -20, z: 42 },
    { x: -42, z: 28 },
    { x: -50, z: 0 },
    { x: -35, z: -20 },
    { x: -45, z: -38 },
    { x: -15, z: -42 },
  ],
};
