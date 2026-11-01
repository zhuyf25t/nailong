import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DEFAULT_DRONE_RULES, DEFAULT_WEAPON_CONFIG, type DroneRules } from '../src/game/defaultRules.ts';
import { DEFAULT_TERRAIN_CONFIG } from '../src/game/terrain.ts';
import { createDroneBrain, canDroneDetect, updateDroneBrain, hitDrone, resetDroneBrain } from '../src/game/droneBrain.ts';
import { createDroneMotion, advanceDroneMotion, droneTouchesPlayer } from '../src/game/droneMotion.ts';
import { createDroneVisuals } from '../src/game/droneVisuals.ts';
import { createDroneEncounter } from '../src/game/droneEncounter.ts';
import { createShooting } from '../src/game/shooting.ts';
import type { Target } from '../src/game/scene.ts';

const configured = (override: Partial<DroneRules>): DroneRules => ({ ...DEFAULT_DRONE_RULES, ...override });
const origin = { x: 0, y: 1.2, z: 0 };
const outside = { x: 0, y: 1, z: 100 };
const observe = (player = outside, visible = true) => ({ position: origin, player, hasLineOfSight: () => visible });
const targetAt = (x: number, z: number): Target => {
  const root = new THREE.Group(); root.position.set(x, 0.4, z);
  return { root, center: new THREE.Vector3(x, 1.2, z), alive: true, cooldown: 0, pulse: 0 };
};

test('offline defaults equal the deployed Scala configuration for every terrain, drone and weapon field', () => {
  const config = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/game-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.terrain, DEFAULT_TERRAIN_CONFIG);
  assert.deepEqual(config.drones, DEFAULT_DRONE_RULES);
  assert.deepEqual(config.weapon, DEFAULT_WEAPON_CONFIG);
});

test('configured health, scan width and range replace prototype constants', () => {
  const rules = configured({ maxHp: 5, scanRange: 7, scanFovDegrees: 40 });
  const brain = createDroneBrain({ rules });
  const thirtyDegrees = { x: 2.5, y: 1, z: Math.sqrt(3) * 2.5 };
  assert.equal(canDroneDetect(origin, 0, thirtyDegrees), true);
  assert.equal(canDroneDetect(origin, 0, thirtyDegrees, undefined, rules), false);
  assert.equal(canDroneDetect(origin, 0, { x: 0, y: 1, z: 7 }, undefined, rules), true);
  assert.equal(canDroneDetect(origin, 0, { x: 0, y: 1, z: 7.01 }, undefined, rules), false);
  for (let i = 0; i < 4; i++) assert.equal(hitDrone(brain).destroyed, false);
  assert.equal(hitDrone(brain).destroyed, true);
  resetDroneBrain(brain); assert.equal(brain.hp, 5);
});

test('configured normal and alert angular speeds, scan duration and acquisition delay drive transitions', () => {
  const rules = configured({ scanSpeed: 0.9, alertSpeed: 1.5, alertSeconds: 0.6, hitScanSeconds: 0.25 });
  const brain = createDroneBrain({ rules, rng: () => 0.75 });
  updateDroneBrain(brain, 0.2, observe());
  assert.ok(Math.abs(brain.yaw - 0.18) < 1e-9);
  hitDrone(brain);
  updateDroneBrain(brain, 0.2, observe({ x: 0, y: 1, z: 3 }));
  assert.equal(brain.state, 'alert');
  assert.ok(Math.abs(brain.yaw - 0.48) < 1e-9);
  updateDroneBrain(brain, 0.06, observe({ x: 0, y: 1, z: 3 }));
  assert.equal(brain.state, 'locked');
  hitDrone(brain, false);
  updateDroneBrain(brain, 0.61, observe());
  assert.equal(brain.state, 'scanning');
});

test('configured loss-of-sight time and zero-duration alerts terminate without hanging', () => {
  const brain = createDroneBrain({ rules: configured({ lostSightSeconds: 0.12 }), rng: () => 0.75 });
  updateDroneBrain(brain, 0.01, observe({ x: 0, y: 1, z: 3 }));
  updateDroneBrain(brain, 0.1, observe(outside, false));
  assert.equal(brain.state, 'locked');
  updateDroneBrain(brain, 0.03, observe(outside, false));
  assert.equal(brain.state, 'alert');
  const immediate = createDroneBrain({ rules: configured({ alertSeconds: 0, hitScanSeconds: 0 }) });
  hitDrone(immediate); updateDroneBrain(immediate, 0.1, observe());
  assert.equal(immediate.state, 'scanning');
});

test('100 radian-per-second scans cannot skip a stationary target through a ten-degree cone', () => {
  const rules = configured({ scanSpeed: 100, alertSpeed: 100, scanFovDegrees: 10, hitScanSeconds: 0 });
  const behind = { x: 0, y: 1, z: -3 };
  for (const initialState of ['scanning', 'alert'] as const) {
    const brain = createDroneBrain({ rules, rng: () => 0.75 });
    if (initialState === 'alert') hitDrone(brain);
    assert.equal(canDroneDetect(origin, brain.yaw, behind, undefined, rules), false);
    // One revolution has identical start/end bearings. A 1/120 s step spans
    // 47.7 degrees and can miss a 10 degree cone; adaptive steps must acquire it.
    updateDroneBrain(brain, Math.PI * 2 / 100, observe(behind));
    assert.equal(brain.state, 'locked', `${initialState} skipped the target mid-frame`);
    assert.ok(Math.abs(brain.yaw - Math.PI) < 1e-9);
    assert.deepEqual(brain.lastSeen, behind);
  }
});

test('configured patrol and pursuit speed, patrol radius and contact sphere alter physical behaviour', () => {
  const rules = configured({ patrolSpeed: 0.3, chaseSpeed: 1.2, patrolRadius: 0.6, contactRadius: 0.2 });
  const motion = createDroneMotion(origin, 0, rules);
  const first = advanceDroneMotion(motion, origin, { state: 'scanning', lastSeen: null }, 0.1, [], () => 0);
  assert.ok(Math.abs(first.z - 0.03) < 1e-9);
  let position = { ...origin }, furthest = 0;
  for (let i = 0; i < 1200; i++) {
    position = advanceDroneMotion(motion, position, { state: 'scanning', lastSeen: null }, 1 / 60, [], () => 0);
    furthest = Math.max(furthest, Math.hypot(position.x, position.z));
  }
  assert.ok(furthest > 0.4 && furthest <= 0.6 + 1e-9);
  const pursuit = advanceDroneMotion(motion, origin, { state: 'locked', lastSeen: outside }, 0.1, [], () => 0);
  assert.ok(Math.abs(pursuit.z - 0.12) < 1e-9);
  const player = { x: 0, y: 0, z: 1 };
  assert.equal(droneTouchesPlayer(origin, player), true);
  assert.equal(droneTouchesPlayer(origin, player, rules.contactRadius), false);
});

test('configured spawn count, headings and grace period reach the encounter instead of hardcoded four slots', () => {
  const rules = configured({ maxHp: 5, patrolSpeed: 0, chaseSpeed: 0, spawnGraceSeconds: 0.4,
    spawns: [{ x: 10, z: 10, yaw: 0 }, { x: 15, z: 10, yaw: Math.PI / 2 }] });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const targets = rules.spawns.map(spawn => targetAt(spawn.x, spawn.z));
  const encounter = createDroneEncounter(scene, targets, () => 0, rules);
  encounter.setEnabled(true);
  assert.equal(encounter.brains.length, 2);
  assert.equal(encounter.brains[1].yaw, Math.PI / 2);
  const player = new THREE.Vector3(10, 0, 12);
  encounter.update(0.2, player, camera, true);
  assert.equal(encounter.brains[0].state, 'scanning');
  encounter.update(0.21, player, camera, true);
  assert.equal(encounter.brains[0].state, 'locked');
  encounter.hit(targets[0]); assert.equal(encounter.brains[0].hp, 4);
  encounter.reset(); assert.equal(encounter.brains[0].hp, 5);
  encounter.dispose(); assert.equal(scene.children.length, 0);
});

test('scan geometry and health cells display the configured field of view and maximum health', () => {
  const rules = configured({ maxHp: 5, scanFovDegrees: 60, scanRange: 8, spawns: [{ x: 0, z: 0, yaw: 0 }] });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const visuals = createDroneVisuals(scene, () => 0, rules);
  visuals.update([{ id: 0, position: new THREE.Vector3(0, 1.2, 0), yaw: 0, hp: 2, maxHp: 5,
    range: 8, mode: 'scanning', hasLineOfSight: () => true }], camera, 0.1);
  assert.equal(scene.getObjectByName('DroneScanVisuals')!.children.length, 1);
  const health = scene.getObjectByName('DroneHealth') as THREE.Mesh;
  assert.equal(health.geometry.getAttribute('position').count, 24);
  const sector = scene.getObjectByName('GroundScanSector') as THREE.Mesh;
  const points = sector.geometry.getAttribute('position');
  const firstOuter = 6 * 17;
  assert.ok(Math.abs(points.getX(firstOuter) + 4) < 1e-5);
  assert.ok(Math.abs(points.getZ(firstOuter) - Math.sqrt(48)) < 1e-5);
  visuals.dispose();
});

test('configured fire interval, speed and maximum range determine real projectiles and impacts', () => {
  const scene = new THREE.Scene();
  let hits = 0;
  const target = targetAt(0, 6);
  target.center.y = 3;
  const shooting = createShooting(scene, [target], () => { hits++; }, undefined,
    { fireIntervalMs: 100, projectileSpeed: 10, projectileRange: 4 });
  const from = new THREE.Vector3(0, 3, 0), direction = new THREE.Vector3(0, 0, 1);
  assert.equal(shooting.fire(from, direction), true);
  shooting.update(0.05); assert.equal(shooting.fire(from, direction), false);
  shooting.update(0.05); assert.equal(shooting.fire(from, direction), true);
  const effects = scene.getObjectByName('PulseEffects')!;
  assert.ok(Math.abs(effects.children[0].position.z - 1) < 1e-9);
  shooting.update(1); assert.equal(hits, 0); assert.equal(effects.children[0].position.z, 4);
  shooting.dispose();
  const longer = createShooting(scene, [target], () => { hits++; }, undefined,
    { fireIntervalMs: 100, projectileSpeed: 10, projectileRange: 8 });
  longer.fire(from, direction); longer.update(0.3); assert.equal(hits, 0);
  longer.update(0.3); assert.equal(hits, 1);
  longer.dispose(); assert.equal(scene.children.length, 0);
});

test('a fast weapon accepts distinct simultaneous projectile hits without a hidden target cooldown', () => {
  const scene = new THREE.Scene(), target = targetAt(0, 6);
  target.center.y = 3;
  let hits = 0;
  const shooting = createShooting(scene, [target], () => { hits++; }, undefined,
    { fireIntervalMs: 50, projectileSpeed: 10, projectileRange: 8 });
  const from = new THREE.Vector3(0, 3, 0), direction = new THREE.Vector3(0, 0, 1);
  shooting.fire(from, direction); shooting.update(0.05); shooting.fire(from, direction);
  shooting.update(0.6); assert.equal(hits, 2);
  shooting.dispose();
});
