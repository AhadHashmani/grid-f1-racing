import * as THREE from "three";
import type { ControlPoint, Track } from "./Track";

export class TrackEditor {
  enabled = false;
  handles: THREE.Mesh[] = [];
  private handleGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragging: THREE.Mesh | null = null;
  private hovered: THREE.Mesh | null = null;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private onChange: (() => void) | null = null;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private track: Track;
  private dom: HTMLElement;
  private rings: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera, track: Track, dom: HTMLElement) {
    this.scene = scene;
    this.camera = camera;
    this.track = track;
    this.dom = dom;
    this.handleGroup.name = "editor-handles";
    this.scene.add(this.handleGroup);
    this.raycaster.params.Mesh = { threshold: 0.5 };
    this.bind();
    this.rebuildHandles();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.handleGroup.visible = enabled;
    this.dom.style.cursor = enabled ? "grab" : "default";
    if (!enabled) {
      this.dragging = null;
      this.hovered = null;
    }
  }

  setOnChange(cb: () => void) {
    this.onChange = cb;
  }

  rebuildHandles() {
    while (this.handleGroup.children.length) {
      const child = this.handleGroup.children[0];
      this.handleGroup.remove(child);
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
          else (mesh.material as THREE.Material).dispose();
        }
      });
    }
    this.handles = [];
    this.rings = [];

    const geo = new THREE.SphereGeometry(2.2, 24, 18);
    const ringGeo = new THREE.RingGeometry(2.6, 3.4, 32);

    this.track.controlPoints.forEach((p, i) => {
      const isStart = i === 0;
      const mat = new THREE.MeshStandardMaterial({
        color: isStart ? 0x00d2be : 0xff8700,
        emissive: isStart ? 0x00d2be : 0xff8700,
        emissiveIntensity: 0.55,
        metalness: 0.25,
        roughness: 0.35,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, 2.4, p.z);
      mesh.userData.index = i;
      mesh.userData.isStart = isStart;
      mesh.castShadow = true;
      this.handles.push(mesh);
      this.handleGroup.add(mesh);

      const ringMat = new THREE.MeshBasicMaterial({
        color: isStart ? 0x00d2be : 0xffc078,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.12, p.z);
      ring.userData.index = i;
      this.rings.push(ring);
      this.handleGroup.add(ring);
    });
  }

  /** Soft pulse so nodes stay obvious in edit mode. */
  updateVisuals(time: number) {
    if (!this.enabled) return;
    const pulse = 1 + Math.sin(time * 3.2) * 0.08;
    for (const handle of this.handles) {
      const hot = handle === this.dragging || handle === this.hovered;
      handle.scale.setScalar(hot ? 1.25 : pulse);
      const mat = handle.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = hot ? 1.1 : 0.55;
    }
    for (const ring of this.rings) {
      const s = 1 + Math.sin(time * 3.2 + ring.userData.index) * 0.12;
      ring.scale.setScalar(s);
    }
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

  private pickHandle(): THREE.Mesh | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Larger pick radius via recursive + distance sort
    const hits = this.raycaster.intersectObjects(this.handles, false);
    if (hits.length) return hits[0].object as THREE.Mesh;

    // Fallback: nearest handle in screen space within a generous radius
    let best: THREE.Mesh | null = null;
    let bestDist = 0.12; // NDC threshold
    for (const handle of this.handles) {
      const projected = handle.position.clone().project(this.camera as THREE.PerspectiveCamera);
      const dx = projected.x - this.pointer.x;
      const dy = projected.y - this.pointer.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = handle;
      }
    }
    return best;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.enabled) return;
    event.preventDefault();
    this.setPointer(event);
    const handle = this.pickHandle();
    if (handle) {
      this.dragging = handle;
      this.dom.style.cursor = "grabbing";
      try {
        this.dom.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.enabled) return;
    this.setPointer(event);

    if (!this.dragging) {
      this.hovered = this.pickHandle();
      this.dom.style.cursor = this.hovered ? "grab" : "default";
      return;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
      const idx = this.dragging.userData.index as number;
      this.dragging.position.x = this.hit.x;
      this.dragging.position.z = this.hit.z;
      const ring = this.rings[idx];
      if (ring) ring.position.set(this.hit.x, 0.12, this.hit.z);

      const points: ControlPoint[] = this.track.controlPoints.map((p) => ({ ...p }));
      points[idx] = { x: this.hit.x, z: this.hit.z };
      this.track.setControlPoints(points);
      this.syncHandlePositions();
      this.onChange?.();
    }
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.dragging) return;
    try {
      this.dom.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    this.dragging = null;
    if (this.enabled) this.dom.style.cursor = "grab";
    this.rebuildHandles();
  };

  private syncHandlePositions() {
    for (const handle of this.handles) {
      const idx = handle.userData.index as number;
      const p = this.track.controlPoints[idx];
      if (p) handle.position.set(p.x, 2.4, p.z);
    }
    for (const ring of this.rings) {
      const idx = ring.userData.index as number;
      const p = this.track.controlPoints[idx];
      if (p) ring.position.set(p.x, 0.12, p.z);
    }
  }

  resetToDefault(points: ControlPoint[]) {
    this.track.setControlPoints(points);
    this.rebuildHandles();
    this.onChange?.();
  }
}
