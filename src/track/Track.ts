import * as THREE from "three";
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
  private wallMeshes: THREE.Mesh[] = [];
  private kerbMeshes: THREE.Mesh[] = [];
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
    this.wallMeshes = [];
    this.kerbMeshes = [];
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

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d24,
      roughness: 0.88,
      metalness: 0.08,
    });
    this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
    this.roadMesh.receiveShadow = false;
    this.meshGroup.add(this.roadMesh);

    // Center dashed line
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
    for (let i = 0; i < this.samples.length; i += 4) {
      const s = this.samples[i];
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 1.4), dashMat);
      dash.position.copy(s.position).setY(0.04);
      dash.lookAt(s.position.clone().add(s.tangent));
      this.meshGroup.add(dash);
    }

    // Kerbs
    const kerbColors = [0xe10600, 0xffffff];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        const edge = s.position.clone().addScaledVector(s.normal, side * half);
        const kerb = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.12, 1.05),
          new THREE.MeshStandardMaterial({
            color: kerbColors[i % 2],
            roughness: 0.55,
            metalness: 0.1,
          }),
        );
        kerb.position.copy(edge).setY(0.06);
        kerb.lookAt(edge.clone().add(s.tangent));
        kerb.castShadow = false;
        this.kerbMeshes.push(kerb);
        this.meshGroup.add(kerb);
      }
    }

    // Soft walls / barriers
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xb8bec8,
      roughness: 0.65,
      metalness: 0.2,
    });
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < this.samples.length; i += 2) {
        const s = this.samples[i];
        const pos = s.position.clone().addScaledVector(s.normal, side * (half + 0.7));
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 2.1), wallMat);
        wall.position.copy(pos).setY(0.55);
        wall.lookAt(pos.clone().add(s.tangent));
        wall.castShadow = false;
        wall.receiveShadow = false;
        this.wallMeshes.push(wall);
        this.meshGroup.add(wall);
      }
    }

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
    const onTrack = Math.abs(lateral) <= this.width * 0.5 + 0.35;
    const progress = sample.distance / Math.max(this.totalLength, 1);
    return { progress, index: best, lateral, onTrack };
  }

  /**
   * Raycast in XZ plane from origin along direction.
   * Returns normalized distance 0..1 (1 = no hit within maxDist).
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDist = 28): number {
    const dir = direction.clone().setY(0).normalize();
    const step = 0.45;
    for (let d = 0.6; d <= maxDist; d += step) {
      const p = origin.clone().addScaledVector(dir, d);
      const { onTrack } = this.project(p);
      if (!onTrack) {
        return Math.max(0, (d - 0.6) / (maxDist - 0.6));
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
