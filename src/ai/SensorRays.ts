import * as THREE from "three";

/** Draws raycast beams for the training leader so learning is visible. */
export class SensorRays {
  group = new THREE.Group();
  private lines: THREE.Line[] = [];
  private readonly rayCount: number;

  constructor(rayCount = 11) {
    this.rayCount = rayCount;
    for (let i = 0; i < rayCount; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, 1),
      ]);
      const mat = new THREE.LineBasicMaterial({
        color: i === Math.floor(rayCount / 2) ? 0xff8700 : 0x00d2be,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
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
  update(x: number, y: number, z: number, yaw: number, distances: ArrayLike<number>, maxRange = 28) {
    const spread = Math.PI * 0.9;
    for (let i = 0; i < this.rayCount; i++) {
      const t = i / (this.rayCount - 1);
      const rel = spread / 2 - spread * t;
      const ang = yaw + rel;
      const len = Math.max(0.4, (distances[i] ?? 0) * maxRange);
      const line = this.lines[i];
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, x, y + 0.4, z);
      pos.setXYZ(1, x + Math.sin(ang) * len, y + 0.4, z + Math.cos(ang) * len);
      pos.needsUpdate = true;
      const mat = line.material as THREE.LineBasicMaterial;
      const d = distances[i] ?? 1;
      mat.color.setHex(d < 0.28 ? 0xe10600 : d < 0.55 ? 0xff8700 : 0x00d2be);
    }
  }

  dispose() {
    for (const line of this.lines) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
  }
}
