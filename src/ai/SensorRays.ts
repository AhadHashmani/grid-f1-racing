import * as THREE from "three";
import { DRIVE } from "../sim/driveParams";

/** Draws raycast beams for the training leader so learning is visible. */
export class SensorRays {
  group = new THREE.Group();
  private lines: THREE.Line[] = [];
  private readonly rayCount: number;

  constructor(rayCount = DRIVE.rayCount) {
    this.rayCount = rayCount;
    for (let i = 0; i < rayCount; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, 1),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: i === Math.floor(rayCount / 2) ? 0xff8700 : 0x00d2be,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        linewidth: 2,
      });
      const line = new THREE.Line(geo, mat);
      this.lines.push(line);
      this.group.add(line);
    }
    this.group.visible = false;
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  /**
   * @param distances normalized 0..1 clearances (same as network inputs)
   * @param maxRange world units matching the trainer raycast
   */
  update(
    x: number,
    y: number,
    z: number,
    yaw: number,
    distances: ArrayLike<number>,
    maxRange = DRIVE.rayRange,
  ) {
    const spread = DRIVE.raySpread;
    for (let i = 0; i < this.rayCount; i++) {
      const t = i / (this.rayCount - 1);
      const rel = spread / 2 - spread * t;
      const ang = yaw + rel;
      const len = Math.max(0.35, (distances[i] ?? 0) * maxRange);
      const line = this.lines[i];
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, x, y + 0.45, z);
      pos.setXYZ(1, x + Math.sin(ang) * len, y + 0.45, z + Math.cos(ang) * len);
      pos.needsUpdate = true;
      const mat = line.material as THREE.LineBasicMaterial;
      const d = distances[i] ?? 1;
      // Red = wall close — makes barrier sensing obvious during training
      mat.color.setHex(d < 0.22 ? 0xe10600 : d < 0.45 ? 0xff8700 : 0x00d2be);
      mat.opacity = d < 0.35 ? 0.95 : 0.75;
    }
  }

  dispose() {
    for (const line of this.lines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
  }
}
