import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createExplosions, EXPLOSION_SECONDS } from '../src/game/explosion.ts';
import { createDroneVisuals, type DroneVisualItem } from '../src/game/droneVisuals.ts';

test('explosions have a bounded reusable pool and finish without advancing gameplay', () => {
  const scene = new THREE.Scene();
  const explosions = createExplosions(scene, () => 0);
  const initialMeshCount = scene.getObjectByName('DroneExplosionEffects')!.children.length;
  for (let i = 0; i < 100; i++) explosions.emit(new THREE.Vector3(i, 1.2, 0), i % 2 ? 'contact' : 'destroyed');
  assert.equal(explosions.activeCount(), 5);
  assert.equal(scene.getObjectByName('DroneExplosionEffects')!.children.length, initialMeshCount);
  explosions.update(.5); assert.equal(explosions.activeCount(), 5);
  explosions.update(EXPLOSION_SECONDS); assert.equal(explosions.activeCount(), 0);
  explosions.emit(new THREE.Vector3(), 'contact'); explosions.reset(); assert.equal(explosions.activeCount(), 0);
  explosions.dispose(); assert.equal(scene.getObjectByName('DroneExplosionEffects'), undefined);
});

test('moving scanner recomputes line of sight from the live eye, including when terrain changes', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  let eyeX = 0, calls = 0;
  const item: DroneVisualItem = { id: 0, position: new THREE.Vector3(0, 1.2, 0), yaw: 0, hp: 3, maxHp: 3, mode: 'locked', range: 12,
    hasLineOfSight(point) { calls++; return point.x < eyeX + 2; } };
  const visuals = createDroneVisuals(scene, () => 0);
  visuals.update([item], camera, .016);
  const firstCalls = calls;
  eyeX = 5; item.position.x = 5;
  visuals.update([item], camera, .016);
  assert.ok(calls > firstCalls);
  const sector = scene.getObjectByName('GroundScanSector') as THREE.Mesh;
  assert.equal(sector.parent!.position.x, 5);
  visuals.invalidateTerrain(); visuals.update([item], camera, .016);
  assert.ok(calls > firstCalls * 2);
  visuals.dispose();
});
