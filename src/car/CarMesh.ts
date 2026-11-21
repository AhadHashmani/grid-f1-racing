import * as THREE from "three";

export function createF1CarMesh(color = 0xe10600): THREE.Group {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.55,
    roughness: 0.28,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    metalness: 0.4,
    roughness: 0.45,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    metalness: 0.2,
    roughness: 0.4,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0d,
    roughness: 0.95,
    metalness: 0.05,
  });

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 1.5), bodyMat);
  nose.position.set(0, 0.28, 1.35);
  nose.castShadow = true;
  group.add(nose);

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.35, 2.4), bodyMat);
  chassis.position.set(0, 0.32, 0);
  chassis.castShadow = true;
  group.add(chassis);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.7), darkMat);
  cockpit.position.set(0, 0.55, -0.05);
  cockpit.castShadow = true;
  group.add(cockpit);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 20, Math.PI), accentMat);
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 0.72, -0.05);
  group.add(halo);

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.9), bodyMat);
  engine.position.set(0, 0.42, -1.1);
  engine.castShadow = true;
  group.add(engine);

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.35), accentMat);
  frontWing.position.set(0, 0.12, 2.05);
  frontWing.castShadow = true;
  group.add(frontWing);

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.3), accentMat);
  rearWing.position.set(0, 0.85, -1.55);
  rearWing.castShadow = true;
  group.add(rearWing);

  const endplateL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.28), darkMat);
  endplateL.position.set(-0.72, 0.7, -1.55);
  group.add(endplateL);
  const endplateR = endplateL.clone();
  endplateR.position.x = 0.72;
  group.add(endplateR);

  const sidepodL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 1.2), bodyMat);
  sidepodL.position.set(-0.55, 0.28, -0.15);
  sidepodL.castShadow = true;
  group.add(sidepodL);
  const sidepodR = sidepodL.clone();
  sidepodR.position.x = 0.55;
  group.add(sidepodR);

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 16);
  const positions: [number, number, number][] = [
    [-0.7, 0.32, 1.15],
    [0.7, 0.32, 1.15],
    [-0.7, 0.32, -1.15],
    [0.7, 0.32, -1.15],
  ];
  for (const [x, y, z] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  }

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 2.2), accentMat);
  stripe.position.set(0, 0.52, 0.05);
  group.add(stripe);

  group.scale.setScalar(1.05);
  return group;
}
