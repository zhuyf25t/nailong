import * as THREE from 'three';
import { segmentBoxTime, segmentTerrainTime, type Point3, type ProjectileBox } from './shootingMath.ts';

/** Sweep a small camera volume, so the near plane cannot cut through solid scenery. */
export function cameraClearFraction(from: Point3, desired: Point3, boxes: readonly ProjectileBox[], sampleHeight: (x: number, z: number) => number, radius = 0.35) {
  let fraction = segmentTerrainTime(from, desired, sampleHeight, radius) ?? 1;
  for (const box of boxes) fraction = Math.min(fraction, segmentBoxTime(from, desired, box, radius) ?? 1);
  return fraction;
}

/** The movement controller supplies the unobstructed pose each frame; only recovery is damped. */
export function createCameraObstruction() {
  const offset = new THREE.Vector3();
  let distance = Infinity;
  return {
    update(camera: THREE.PerspectiveCamera, focus: THREE.Vector3, boxes: readonly ProjectileBox[], sampleHeight: (x: number, z: number) => number, dt: number) {
      offset.copy(camera.position).sub(focus);
      const desired = offset.length();
      if (desired < 1e-6) return;
      const allowed = Math.max(0, desired * cameraClearFraction(focus, camera.position, boxes, sampleHeight) - 0.06);
      distance = allowed < distance ? allowed : THREE.MathUtils.lerp(distance, allowed, 1 - Math.exp(-5 * dt));
      camera.position.copy(focus).addScaledVector(offset, distance / desired);
      camera.lookAt(focus);
    },
    reset() { distance = Infinity; },
  };
}
