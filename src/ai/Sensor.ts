import * as THREE from "three";
import type { Car } from "../car/Car";
import type { Track } from "../track/Track";

export class Sensor {
  car: Car;
  rayCount = 11;
  rayLength = 32;
  raySpread = Math.PI * 0.85;
  readings: number[] = [];
  debugLines: THREE.Vector3[][] = [];

  constructor(car: Car) {
    this.car = car;
  }

  update(track: Track) {
    this.readings = [];
    this.debugLines = [];
    const origin = this.car.position.clone().setY(0.4);

    for (let i = 0; i < this.rayCount; i++) {
      const t = this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1);
      const rel = THREE.MathUtils.lerp(this.raySpread / 2, -this.raySpread / 2, t);
      const angle = this.car.yaw + rel;
      const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const reading = track.raycast(origin, dir, this.rayLength);
      this.readings.push(reading);

      const end = origin.clone().addScaledVector(dir, 0.6 + reading * (this.rayLength - 0.6));
      this.debugLines.push([origin.clone(), end]);
    }
  }
}
