import * as THREE from "three";
import type { Car } from "../car/Car";

export class ChaseCamera {
  camera: THREE.PerspectiveCamera;
  private idealOffset = new THREE.Vector3(0, 4.8, -10.5);
  private idealLook = new THREE.Vector3(0, 1.2, 8);
  private currentPos = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 600);
  }

  reset() {
    this.initialized = false;
  }

  update(car: Car, dt: number) {
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
    const offset = this.idealOffset.clone().applyQuaternion(quat).add(car.position);
    const look = this.idealLook.clone().applyQuaternion(quat).add(car.position);

    // Speed-based camera pullback
    const speedPull = Math.min(Math.abs(car.speed) * 0.12, 4);
    offset.addScaledVector(new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw)), -speedPull);

    if (!this.initialized) {
      this.currentPos.copy(offset);
      this.currentLook.copy(look);
      this.initialized = true;
    } else {
      const follow = 1 - Math.exp(-6 * dt);
      this.currentPos.lerp(offset, follow);
      this.currentLook.lerp(look, follow);
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  setOrbitOverview(center: THREE.Vector3, radius = 95, height = 78) {
    this.camera.position.set(center.x + radius * 0.35, height, center.z + radius * 0.55);
    this.camera.lookAt(center.x, 0, center.z);
    this.initialized = false;
  }
}
