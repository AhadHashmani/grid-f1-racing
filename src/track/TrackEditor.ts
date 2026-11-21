import * as THREE from "three";
import type { ControlPoint, Track } from "./Track";

export class TrackEditor {
  enabled = false;
  handles: THREE.Mesh[] = [];
  private handleGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragging: THREE.Mesh | null = null;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private onChange: (() => void) | null = null;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private track: Track;
  private dom: HTMLElement;

  constructor(scene: THREE.Scene, camera: THREE.Camera, track: Track, dom: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.track = track;
    this.dom = dom;
    this.handleGroup.name = "editor-handles";
    this.scene.add(this.handleGroup);
    this.bind();
    this.rebuildHandles();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.handleGroup.visible = enabled;
    this.dom.style.cursor = enabled ? "grab" : "default";
    if (!enabled) this.dragging = null;
  }

  setOnChange(cb: () => void) {
    this.onChange = cb;
  }

  rebuildHandles() {
    while (this.handleGroup.children.length) {
      const child = this.handleGroup.children[0] as THREE.Mesh;
      this.handleGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    this.handles = [];

    const geo = new THREE.SphereGeometry(1.1, 20, 16);
    this.track.controlPoints.forEach((p, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: i === 0 ? 0x00d2be : 0xff8700,
        emissive: i === 0 ? 0x003830 : 0x3a1c00,
        metalness: 0.2,
        roughness: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, 1.2, p.z);
      mesh.userData.index = i;
      mesh.castShadow = true;
      this.handles.push(mesh);
      this.handleGroup.add(mesh);
    });
  }

  private bind() {
    this.dom.addEventListener("pointerdown", this.onPointerDown);
    this.dom.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  dispose() {
    this.dom.removeEventListener("pointerdown", this.onPointerDown);
    this.dom.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private setPointer(event: PointerEvent) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.enabled) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.handles, false);
    if (hits.length) {
      this.dragging = hits[0].object as THREE.Mesh;
      this.dom.style.cursor = "grabbing";
      this.dom.setPointerCapture(event.pointerId);
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.enabled || !this.dragging) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      const idx = this.dragging.userData.index as number;
      this.dragging.position.x = this.hit.x;
      this.dragging.position.z = this.hit.z;
      const points: ControlPoint[] = this.track.controlPoints.map((p) => ({ ...p }));
      points[idx] = { x: this.hit.x, z: this.hit.z };
      this.track.setControlPoints(points);
      // Keep handles in sync with rebuilt track without losing drag target index
      this.syncHandlePositions();
      this.onChange?.();
    }
  };

  private onPointerUp = () => {
    if (!this.dragging) return;
    this.dragging = null;
    if (this.enabled) this.dom.style.cursor = "grab";
    this.rebuildHandles();
  };

  private syncHandlePositions() {
    for (const handle of this.handles) {
      const idx = handle.userData.index as number;
      const p = this.track.controlPoints[idx];
      if (p) handle.position.set(p.x, 1.2, p.z);
    }
  }

  addPointNear(index: number) {
    const points = this.track.controlPoints.map((p) => ({ ...p }));
    const a = points[index];
    const b = points[(index + 1) % points.length];
    points.splice(index + 1, 0, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    this.track.setControlPoints(points);
    this.rebuildHandles();
    this.onChange?.();
  }

  removePoint(index: number) {
    if (this.track.controlPoints.length <= 6) return;
    const points = this.track.controlPoints.map((p) => ({ ...p }));
    points.splice(index, 1);
    this.track.setControlPoints(points);
    this.rebuildHandles();
    this.onChange?.();
  }
}
