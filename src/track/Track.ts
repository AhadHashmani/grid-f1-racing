import * as THREE from "three";
import { DRIVE, driveHalf, wallFace } from "../sim/driveParams";
import { DEFAULT_CONTROL_POINTS, TRACK_SAMPLES, TRACK_WIDTH } from "./defaultTrack";

export type ControlPoint = { x: number; z: number };

export type TrackSample = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
};

export class Track {
  controlPoints: ControlPoint[];
  width: number;
  samples: TrackSample[] = [];
  totalLength = 0;
  meshGroup = new THREE.Group();
  private roadMesh: THREE.Mesh | null = null;
  private markerGroup = new THREE.Group();
  private finishMesh: THREE.Mesh | null = null;

  constructor(controlPoints: ControlPoint[] = DEFAULT_CONTROL_POINTS, width = TRACK_WIDTH) {
    this.controlPoints = controlPoints.map((p) => ({ ...p }));
    this.width = width;
    this.meshGroup.name = "track";
    this.rebuild();
  }

  setControlPoints(points: ControlPoint[]) {
    this.controlPoints = points.map((p) => ({ ...p }));
    this.rebuild();
  }

  rebuild() {
    while (this.meshGroup.children.length) {
      const child = this.meshGroup.children[0];
      this.meshGroup.remove(child);
      this.disposeObject(child);
    }
    this.roadMesh = null;
    this.finishMesh = null;
    this.markerGroup = new THREE.Group();

    this.buildSamples();
    this.buildMeshes();
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material.dispose();
      }
    });
  }

  private catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
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

  private pointAt(i: number, t: number): THREE.Vector3 {
    const n = this.controlPoints.length;
    const p0 = this.controlPoints[(i - 1 + n) % n];
    const p1 = this.controlPoints[i % n];
    const p2 = this.controlPoints[(i + 1) % n];
    const p3 = this.controlPoints[(i + 2) % n];
    return new THREE.Vector3(
      this.catmullRom(p0.x, p1.x, p2.x, p3.x, t),
      0,
      this.catmullRom(p0.z, p1.z, p2.z, p3.z, t),
    );
  }

  private buildSamples() {
    const raw: THREE.Vector3[] = [];
    const n = this.controlPoints.length;
    const stepsPerSeg = Math.max(8, Math.floor(TRACK_SAMPLES / n));

    for (let i = 0; i < n; i++) {
      for (let s = 0; s < stepsPerSeg; s++) {
        raw.push(this.pointAt(i, s / stepsPerSeg));
      }
    }

    this.samples = [];
    this.totalLength = 0;
    let dist = 0;

    for (let i = 0; i < raw.length; i++) {
      const curr = raw[i];
      const next = raw[(i + 1) % raw.length];
      const prev = raw[(i - 1 + raw.length) % raw.length];
      const tangent = next.clone().sub(prev).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      this.samples.push({
        position: curr.clone(),
        tangent,
        normal,
        distance: dist,
      });
      dist += curr.distanceTo(next);
    }
    this.totalLength = dist;
  }

  private buildMeshes() {
    const half = this.width * 0.5;
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];

    for (const sample of this.samples) {
      left.push(sample.position.clone().addScaledVector(sample.normal, half));
      right.push(sample.position.clone().addScaledVector(sample.normal, -half));
    }

    // Road ribbon
    const roadGeo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < this.samples.length; i++) {
      const l = left[i];
      const r = right[i];
      positions.push(l.x, 0.02, l.z, r.x, 0.02, r.z);
      const u = this.samples[i].distance / Math.max(this.totalLength, 1);
      uvs.push(0, u * 20, 1, u * 20);
    }

    for (let i = 0; i < this.samples.length; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = ((i + 1) % this.samples.length) * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }

    roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshLambertMaterial({ color: 0x1a1d24 });
    this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
    this.meshGroup.add(this.roadMesh);

    const dummy = new THREE.Object3D();

    // Center dashes — one InstancedMesh
    const dashCount = Math.ceil(this.samples.length / 4);
    const dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.04, 1.4),
      new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }),
      dashCount,
    );
    let di = 0;
    for (let i = 0; i < this.samples.length; i += 4) {
      const s = this.samples[i];
      dummy.position.copy(s.position).setY(0.04);
      dummy.lookAt(s.position.clone().add(s.tangent));
      dummy.updateMatrix();
      dashes.setMatrixAt(di++, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    this.meshGroup.add(dashes);

    // Kerbs flush with asphalt edge — dense red/white so the boundary reads clearly
    const kerbStep = 1;
    const kerbPerSide = Math.ceil(this.samples.length / kerbStep);
    const kerbRed = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.16, 1.15),
      new THREE.MeshLambertMaterial({ color: 0xe10600 }),
      kerbPerSide * 2,
    );
    const kerbWhite = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.16, 1.15),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }),
      kerbPerSide * 2,
    );
    let ri = 0;
    let wi = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < this.samples.length; i += kerbStep) {
        const s = this.samples[i];
        const edge = s.position.clone().addScaledVector(s.normal, side * (half - 0.05));
        dummy.position.copy(edge).setY(0.08);
        dummy.lookAt(edge.clone().add(s.tangent));
        dummy.updateMatrix();
        if (Math.floor(i / kerbStep) % 2 === 0) kerbRed.setMatrixAt(ri++, dummy.matrix);
        else kerbWhite.setMatrixAt(wi++, dummy.matrix);
      }
    }
    kerbRed.count = ri;
    kerbWhite.count = wi;
    kerbRed.instanceMatrix.needsUpdate = true;
    kerbWhite.instanceMatrix.needsUpdate = true;
    this.meshGroup.add(kerbRed, kerbWhite);

    // Runoff gravel outside the walls — makes the “out of bounds” zone obvious
    this.meshGroup.add(this.buildRunoffRibbon(1, half));
    this.meshGroup.add(this.buildRunoffRibbon(-1, half));

    // Dense overlapping barrier blocks — readable as a solid wall from top-down
    const segLen = Math.max(1.1, this.totalLength / Math.max(this.samples.length, 1) * 1.25);
    const wallBlocks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.85, 1.55, segLen),
      new THREE.MeshLambertMaterial({ color: 0xa8b0bc }),
      this.samples.length * 2,
    );
    let wallI = 0;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const pos = s.position.clone().addScaledVector(s.normal, side * (half + 0.42));
        dummy.position.copy(pos).setY(0.78);
        dummy.lookAt(pos.clone().add(s.tangent));
        dummy.updateMatrix();
        wallBlocks.setMatrixAt(wallI++, dummy.matrix);
      }
    }
    wallBlocks.count = wallI;
    wallBlocks.instanceMatrix.needsUpdate = true;
    this.meshGroup.add(wallBlocks);

    // Wide top deck (Armco-style) — thick band visible from overview camera
    this.meshGroup.add(this.buildWallTopDeck(1, half));
    this.meshGroup.add(this.buildWallTopDeck(-1, half));

    // Accent stripe on the inner wall face so bots’ “wall” reads clearly
    this.meshGroup.add(this.buildWallFaceStripe(1, half));
    this.meshGroup.add(this.buildWallFaceStripe(-1, half));

    // Finish / start stripe
    const start = this.samples[0];
    const finishGeo = new THREE.PlaneGeometry(this.width * 0.92, 2.2);
    const finishMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.finishMesh = new THREE.Mesh(finishGeo, finishMat);
    this.finishMesh.rotation.x = -Math.PI / 2;
    this.finishMesh.position.copy(start.position).setY(0.05);
    const yaw = Math.atan2(start.tangent.x, start.tangent.z);
    this.finishMesh.rotation.z = -yaw;
    this.meshGroup.add(this.finishMesh);

    // Checkered texture via alternating boxes on finish
    const checkMatA = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const checkMatB = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const checks = 8;
    for (let i = 0; i < checks; i++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(this.width / checks, 0.05, 1.0),
        i % 2 === 0 ? checkMatA : checkMatB,
      );
      const offset = (i - (checks - 1) / 2) * (this.width / checks);
      box.position
        .copy(start.position)
        .addScaledVector(start.normal, offset)
        .setY(0.06);
      box.lookAt(box.position.clone().add(start.tangent));
      this.meshGroup.add(box);
    }

    this.meshGroup.add(this.markerGroup);
  }

  getStartPose(): { position: THREE.Vector3; yaw: number } {
    const s = this.samples[0];
    return {
      position: s.position.clone().setY(0.35),
      yaw: Math.atan2(s.tangent.x, s.tangent.z),
    };
  }

  getSpawnPose(lane = 0): { position: THREE.Vector3; yaw: number } {
    const s = this.samples[Math.min(4, this.samples.length - 1)];
    // Keep cars well inside the asphalt even on tight edited corners
    const maxLateral = this.width * 0.28;
    const lateral = THREE.MathUtils.clamp(lane * 1.6, -maxLateral, maxLateral);
    return {
      position: s.position.clone().addScaledVector(s.normal, lateral).setY(0.35),
      yaw: Math.atan2(s.tangent.x, s.tangent.z),
    };
  }

  /** Stable fingerprint so we can invalidate brains after the layout changes. */
  hashLayout(): string {
    const parts = this.controlPoints.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    return `${parts.join("|")}|w${this.width.toFixed(1)}`;
  }

  /** Dark gravel band outside the wall so off-track is visually distinct. */
  private buildRunoffRibbon(side: number, half: number): THREE.Mesh {
    const n = this.samples.length;
    const inner = half + 0.05;
    const outer = half + 3.2;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const ix = s.position.x + s.normal.x * side * inner;
      const iz = s.position.z + s.normal.z * side * inner;
      const ox = s.position.x + s.normal.x * side * outer;
      const oz = s.position.z + s.normal.z * side * outer;
      positions.push(ix, 0.01, iz, ox, 0.01, oz);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      if (side > 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0x2a2e26, side: THREE.DoubleSide }),
    );
  }

  /** Wide horizontal top of the barrier — unmistakable from the overview cam. */
  private buildWallTopDeck(side: number, half: number): THREE.Mesh {
    const n = this.samples.length;
    const y = 1.52;
    const inner = half + 0.05;
    const outer = half + 0.95;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const ix = s.position.x + s.normal.x * side * inner;
      const iz = s.position.z + s.normal.z * side * inner;
      const ox = s.position.x + s.normal.x * side * outer;
      const oz = s.position.z + s.normal.z * side * outer;
      positions.push(ix, y, iz, ox, y, oz);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      if (side > 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xd7dde6, side: THREE.DoubleSide }),
    );
  }

  /** Bright inner face stripe at asphalt edge — reads as the hard wall line. */
  private buildWallFaceStripe(side: number, half: number): THREE.Mesh {
    const n = this.samples.length;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const x = s.position.x + s.normal.x * side * half;
      const z = s.position.z + s.normal.z * side * half;
      positions.push(x, 0.05, z, x, 1.5, z);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      if (side > 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0xff8700, side: THREE.DoubleSide }),
    );
  }

  /** Returns signed progress 0..1 and nearest sample index. */
  project(position: THREE.Vector3): { progress: number; index: number; lateral: number; onTrack: boolean } {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const d = position.distanceToSquared(this.samples[i].position);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const sample = this.samples[best];
    const toCar = position.clone().sub(sample.position);
    const lateral = toCar.dot(sample.normal);
    const onTrack = Math.abs(lateral) <= driveHalf(this.width);
    const progress = sample.distance / Math.max(this.totalLength, 1);
    return { progress, index: best, lateral, onTrack };
  }

  /**
   * Clamp a world position onto the inner wall face.
   * Mutates `position` XZ; returns true if it hit (caller should crash).
   */
  resolveWall(position: THREE.Vector3): boolean {
    const proj = this.project(position);
    const limit = driveHalf(this.width);
    if (Math.abs(proj.lateral) <= limit) return false;
    const sample = this.samples[proj.index];
    const lat = Math.sign(proj.lateral) * limit;
    position.x = sample.position.x + sample.normal.x * lat;
    position.z = sample.position.z + sample.normal.z * lat;
    return true;
  }

  /**
   * Raycast in XZ plane from origin along direction.
   * Hits the asphalt/wall face so bots “see” barriers early and clearly.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDist = DRIVE.rayRange): number {
    const dir = direction.clone().setY(0).normalize();
    const step = DRIVE.rayStep;
    const start = 0.45;
    const face = wallFace(this.width);
    for (let d = start; d <= maxDist; d += step) {
      const p = origin.clone().addScaledVector(dir, d);
      const { lateral } = this.project(p);
      if (Math.abs(lateral) >= face) {
        return Math.max(0, (d - start) / (maxDist - start));
      }
    }
    return 1;
  }

  /** Auto-place checkpoints evenly around the track (denser on longer circuits). */
  getCheckpointProgresses(count?: number): number[] {
    const n = count ?? Math.max(20, Math.round(this.totalLength / 12));
    const result: number[] = [];
    for (let i = 1; i <= n; i++) {
      result.push(i / (n + 1));
    }
    return result;
  }

  sampleAtProgress(progress: number): TrackSample {
    const target = ((progress % 1) + 1) % 1;
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i].distance / Math.max(this.totalLength, 1);
      const diff = Math.abs(p - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    return this.samples[best];
  }
}
