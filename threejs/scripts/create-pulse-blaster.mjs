import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Compact pulse sidearm. Grip attachment is the origin; the barrel points +Z. */
export function createPulseBlaster() {
  const root = new THREE.Group();
  root.name = 'PulseBlaster';
  root.userData = { forward: '+Z', origin: 'grip mounting point', attachment: 'muzzle' };
  const shell = new THREE.MeshStandardMaterial({ color: '#f6eedb', roughness: 0.45, metalness: 0.12 });
  shell.name = 'Pulse_CeramicShell';
  const frame = new THREE.MeshStandardMaterial({ color: '#173e40', roughness: 0.55, metalness: 0.23 });
  frame.name = 'Pulse_DeepTealFrame';
  const recess = new THREE.MeshStandardMaterial({ color: '#0e2429', roughness: 0.7 });
  recess.name = 'Pulse_DarkRecess';
  const emitter = new THREE.MeshStandardMaterial({ color: '#ffd78b', emissive: '#ffbd52', emissiveIntensity: 1.25, roughness: 0.35, metalness: 0.08 });
  emitter.name = 'Pulse_AmberEmitter';

  function rounded(name, material, position, size, bevel = 0.025, segments = 2) {
    const shape = new THREE.Mesh(new RoundedBoxGeometry(...size, segments, Math.min(bevel, ...size.map(v => v / 3))), material);
    shape.name = name;
    shape.position.set(...position);
    shape.castShadow = true;
    shape.receiveShadow = true;
    root.add(shape);
    return shape;
  }

  // A single, broad ceramic slide gives the gun a readable silhouette at game scale.
  rounded('Pulse_MainShell', shell, [0, 0.30, 0.135], [0.28, 0.245, 0.54], 0.055);
  rounded('Pulse_UnderFrame', frame, [0, 0.212, 0.15], [0.235, 0.115, 0.54], 0.035);
  const grip = rounded('Pulse_RubberGrip', frame, [0, 0.078, -0.018], [0.15, 0.30, 0.18], 0.035);
  grip.rotation.x = -0.16;
  rounded('Pulse_GripHeel', shell, [0, -0.057, 0.004], [0.163, 0.055, 0.19], 0.018, 1);
  rounded('Pulse_RearCap', frame, [0, 0.31, -0.143], [0.225, 0.17, 0.065], 0.028);
  rounded('Pulse_RecessedTopRail', frame, [0, 0.424, 0.15], [0.092, 0.027, 0.31], 0.008, 1);

  // Stub nose and inset emitter replace the old stack of cylindrical water-gun rings.
  rounded('Pulse_Nose', frame, [0, 0.30, 0.438], [0.235, 0.185, 0.13], 0.035);
  rounded('Pulse_EmitterRecess', recess, [0, 0.30, 0.505], [0.178, 0.126, 0.012], 0.012, 1);
  rounded('Pulse_EmitterWindow', emitter, [0, 0.30, 0.514], [0.11, 0.047, 0.012], 0.012, 1);
  for (const side of [-1, 1]) {
    rounded(`Pulse_StatusInset_${side}`, frame, [side * 0.14, 0.303, 0.105], [0.012, 0.067, 0.18], 0.004, 1);
    rounded(`Pulse_ChargeStrip_${side}`, emitter, [side * 0.148, 0.304, 0.105], [0.009, 0.022, 0.13], 0.003, 1);
  }
  rounded('Pulse_Trigger', recess, [0, 0.142, 0.105], [0.034, 0.07, 0.04], 0.01, 1);

  const muzzle = new THREE.Group();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0.30, 0.54);
  root.add(muzzle);
  return root;
}
