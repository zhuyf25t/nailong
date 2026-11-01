import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraClearFraction, createCameraObstruction } from '../src/game/cameraObstruction.ts';
import * as THREE from 'three';

const box = { min: { x: -1, y: 0, z: 3 }, max: { x: 1, y: 4, z: 4 } };
test('camera volume stops before a crate and preserves a clear view above it', () => {
  assert.ok(Math.abs(cameraClearFraction({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }, [box], () => 0) - .265) < 1e-8);
  assert.equal(cameraClearFraction({ x: 0, y: 5, z: 0 }, { x: 0, y: 5, z: 10 }, [box], () => 0), 1);
});
test('camera catches a hill between clear endpoints', () => {
  const fraction = cameraClearFraction({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }, [], (_x,z) => Math.max(0, 3 - Math.abs(z-5)));
  assert.ok(fraction > .36 && fraction < .37);
});
test('camera pulls in immediately but eases out after an obstruction clears', () => {
  const camera = new THREE.PerspectiveCamera();
  const focus = new THREE.Vector3(0,2,0);
  const guard = createCameraObstruction();
  camera.position.set(0,2,10); guard.update(camera,focus,[box],()=>0,1/60);
  const blocked = camera.position.z;
  assert.ok(blocked < 2.65);
  camera.position.set(0,2,10); guard.update(camera,focus,[],()=>0,1/60);
  assert.ok(camera.position.z > blocked && camera.position.z < 4);
});
