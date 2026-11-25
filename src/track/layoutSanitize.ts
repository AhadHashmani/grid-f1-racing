import type { ControlPoint } from "./Track";

/** Default asphalt width — keep local to avoid circular imports with defaultTrack. */
const DEFAULT_WIDTH = 14;

type Vec = { x: number; z: number };

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

/** Dense centerline samples from a closed Catmull-Rom loop. */
export function sampleLoop(points: ControlPoint[], stepsPerSeg = 8): Vec[] {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ x: p.x, z: p.z }));
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg;
      out.push({
        x: catmull(p0.x, p1.x, p2.x, p3.x, t),
        z: catmull(p0.z, p1.z, p2.z, p3.z, t),
      });
    }
  }
  return out;
}

function orient(a: Vec, b: Vec, c: Vec): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSeg(a: Vec, b: Vec, c: Vec): boolean {
  return (
    Math.min(a.x, b.x) - 1e-6 <= c.x &&
    c.x <= Math.max(a.x, b.x) + 1e-6 &&
    Math.min(a.z, b.z) - 1e-6 <= c.z &&
    c.z <= Math.max(a.z, b.z) + 1e-6
  );
}

/** True if open segments AB and CD properly intersect. */
export function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 === 0 && onSeg(a, b, c)) return true;
  if (o2 === 0 && onSeg(a, b, d)) return true;
  if (o3 === 0 && onSeg(c, d, a)) return true;
  if (o4 === 0 && onSeg(c, d, b)) return true;
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Control polygon self-intersects (non-adjacent edges). */
export function controlPolygonCrosses(points: ControlPoint[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = points[j];
      const d = points[(j + 1) % n];
      // Skip shared vertices / adjacent edges
      if (i === j) continue;
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * Ribbon overlap: two centerline samples that are far apart along the lap
 * but closer than ~track width → walls would cut through asphalt.
 */
export function ribbonSelfOverlaps(
  points: ControlPoint[],
  width = DEFAULT_WIDTH,
  minAlongFrac = 0.12,
): { overlaps: boolean; minDist: number; i: number; j: number } {
  const samples = sampleLoop(points, 6);
  const n = samples.length;
  const minAlong = Math.max(6, Math.floor(n * minAlongFrac));
  const limit = width * 1.08;
  let best = Infinity;
  let bi = 0;
  let bj = 0;
  for (let i = 0; i < n; i++) {
    for (let k = minAlong; k <= n - minAlong; k++) {
      const j = (i + k) % n;
      if (j <= i) continue;
      const dx = samples[i].x - samples[j].x;
      const dz = samples[i].z - samples[j].z;
      const d = Math.hypot(dx, dz);
      if (d < best) {
        best = d;
        bi = i;
        bj = j;
      }
      if (d < limit) return { overlaps: true, minDist: d, i: bi, j: bj };
    }
  }
  return { overlaps: false, minDist: best, i: bi, j: bj };
}

export function isCleanLayout(points: ControlPoint[], width = DEFAULT_WIDTH): boolean {
  if (points.length < 4) return false;
  if (controlPolygonCrosses(points)) return false;
  if (ribbonSelfOverlaps(points, width).overlaps) return false;
  return true;
}

/**
 * Push control points apart / outward until the ribbon no longer folds on itself.
 * Returns a new array (does not mutate input).
 */
export function sanitizeControlPoints(
  points: ControlPoint[],
  width = DEFAULT_WIDTH,
  maxIters = 28,
): ControlPoint[] {
  const pts = points.map((p) => ({ ...p }));
  const n = pts.length;
  if (n < 4) return pts;

  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;

  for (let iter = 0; iter < maxIters; iter++) {
    if (isCleanLayout(pts, width)) return pts;

    // 1) Fix crossing edges by pulling the later vertex toward the centroid ring
    if (controlPolygonCrosses(pts)) {
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        for (let j = i + 1; j < n; j++) {
          if ((j + 1) % n === i || (i + 1) % n === j) continue;
          const c = pts[j];
          const d = pts[(j + 1) % n];
          if (!segmentsCross(a, b, c, d)) continue;
          // Push both mid-edge points outward from center
          for (const idx of [i, (i + 1) % n, j, (j + 1) % n]) {
            const p = pts[idx];
            let dx = p.x - cx;
            let dz = p.z - cz;
            const len = Math.hypot(dx, dz) || 1;
            dx /= len;
            dz /= len;
            p.x += dx * (width * 0.35);
            p.z += dz * (width * 0.35);
          }
        }
      }
    }

    // 2) Fix ribbon pinches: push the nearest control points of the tight pair apart
    const pinch = ribbonSelfOverlaps(pts, width);
    if (pinch.overlaps) {
      const samples = sampleLoop(pts, 6);
      const a = samples[pinch.i];
      const b = samples[pinch.j];
      let mx = a.x - b.x;
      let mz = a.z - b.z;
      const mlen = Math.hypot(mx, mz) || 1;
      mx /= mlen;
      mz /= mlen;
      const need = width * 1.15 - pinch.minDist;
      const push = Math.max(width * 0.2, need * 0.55);

      // Map sample indices → nearest control point
      const toCtrl = (si: number) => {
        const steps = 6;
        return Math.floor(si / steps) % n;
      };
      const ia = toCtrl(pinch.i);
      const ib = toCtrl(pinch.j);
      pts[ia].x += mx * push;
      pts[ia].z += mz * push;
      pts[ib].x -= mx * push;
      pts[ib].z -= mz * push;

      // Also nudge neighbors so Catmull doesn't re-pinch
      for (const base of [ia, ib]) {
        for (const off of [-1, 1]) {
          const k = (base + off + n) % n;
          const p = pts[k];
          let dx = p.x - cx;
          let dz = p.z - cz;
          const len = Math.hypot(dx, dz) || 1;
          p.x += (dx / len) * push * 0.25;
          p.z += (dz / len) * push * 0.25;
        }
      }
    }

    // 3) Gentle radial expand keeps the loop simple
    for (const p of pts) {
      let dx = p.x - cx;
      let dz = p.z - cz;
      const len = Math.hypot(dx, dz) || 1;
      p.x = cx + (dx / len) * (len + width * 0.04);
      p.z = cz + (dz / len) * (len + width * 0.04);
    }
  }

  // Last resort: project onto a clean rounded polygon from angles
  if (!isCleanLayout(pts, width)) {
    return forceSimpleRing(pts, width);
  }
  return pts;
}

/** Replace a broken layout with a non-crossing ring that keeps rough angular order. */
function forceSimpleRing(points: ControlPoint[], width: number): ControlPoint[] {
  const n = points.length;
  let cx = 0;
  let cz = 0;
  for (const p of points) {
    cx += p.x;
    cz += p.z;
  }
  cx /= n;
  cz /= n;

  const scored = points.map((p, i) => ({
    i,
    a: Math.atan2(p.z - cz, p.x - cx),
    r: Math.hypot(p.x - cx, p.z - cz),
  }));
  scored.sort((a, b) => a.a - b.a);

  const minR = width * 2.2;
  return scored.map((s, k) => {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    // Blend original radius with a smooth envelope so character remains
    const env = 0.7 + 0.3 * Math.sin(a * 2 + s.a);
    const r = Math.max(minR, s.r * 0.55 + 38 * env);
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
  });
}

/**
 * Clamp a dragged control point so the whole loop stays a clean non-crossing ribbon.
 * Tries the proposed position; if dirty, binary-search back toward the previous point.
 */
export function snapDraggedPoint(
  points: ControlPoint[],
  index: number,
  proposed: ControlPoint,
  previous: ControlPoint,
  width = DEFAULT_WIDTH,
): ControlPoint {
  const trial = points.map((p) => ({ ...p }));
  trial[index] = { ...proposed };
  if (isCleanLayout(trial, width)) return proposed;

  let lo = { ...previous };
  let hi = { ...proposed };
  let best = { ...previous };
  for (let i = 0; i < 10; i++) {
    const mid = { x: (lo.x + hi.x) * 0.5, z: (lo.z + hi.z) * 0.5 };
    trial[index] = mid;
    if (isCleanLayout(trial, width)) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Soft magnet: if still bad, sanitize whole layout with the proposed point and take result[index]
  trial[index] = { ...proposed };
  const fixed = sanitizeControlPoints(trial, width);
  return fixed[index] ?? best;
}
