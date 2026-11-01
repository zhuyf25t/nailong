import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDroneEncounter } from '../src/game/droneEncounter.ts';
import { DEFAULT_DRONE_RULES } from '../src/game/defaultRules.ts';
import { DRONE_GROUNDED_HEIGHT, DRONE_HOVER_HEIGHT, DRONE_TAKEOFF_SECONDS } from '../src/game/droneMotion.ts';
import type { Target } from '../src/game/scene.ts';

function makeEncounter() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const target: Target = { root: new THREE.Group(), center: new THREE.Vector3(), alive: true, cooldown: 0, pulse: 0 };
  target.root.position.set(10, 0, 10);
  const rules = { ...DEFAULT_DRONE_RULES, patrolSpeed: 0, spawns: [{ x: 10, z: 10, yaw: 0 }] };
  const encounter = createDroneEncounter(scene, [target], () => .4, rules);
  encounter.setEnabled(true);
  return { encounter, target, camera };
}

test('takeoff rises visibly from ground to cruise without planar drift at 30, 60 and 144 FPS', () => {
  const heights: number[] = [];
  for (const fps of [30, 60, 144]) {
    const { encounter, target, camera } = makeEncounter();
    assert.equal(target.center.y, .4 + DRONE_GROUNDED_HEIGHT);
    let remaining = .6, previous = target.center.y;
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / fps); remaining -= dt;
      encounter.update(dt, new THREE.Vector3(0, 0, 40), camera, true);
      assert.ok(target.center.y >= previous); previous = target.center.y;
      assert.equal(target.root.position.x, 10); assert.equal(target.root.position.z, 10);
      assert.ok(Math.abs(target.root.position.y + .8 - target.center.y) < 1e-9);
    }
    heights.push(target.center.y);
    assert.ok(target.center.y > 1.7 && target.center.y < .4 + DRONE_HOVER_HEIGHT);
    encounter.update(DRONE_TAKEOFF_SECONDS - .6, new THREE.Vector3(0, 0, 40), camera, true);
    assert.ok(Math.abs(target.center.y - (.4 + DRONE_HOVER_HEIGHT)) < 1e-9);
    assert.equal(encounter.snapshot()[0].flight, 'cruising');
    encounter.dispose();
  }
  for (const height of heights) assert.ok(Math.abs(height - heights[0]) < 1e-9);
});

test('takeoff and grace reject contact, pause freezes lift, and reset restores launch pose', () => {
  const { encounter, target, camera } = makeEncounter();
  const player = new THREE.Vector3(10, .4, 10);
  for (let i = 0; i < 12; i++) assert.equal(encounter.update(.1, player, camera, true).contact, null);
  const airborne = target.center.y;
  encounter.update(5, player, camera, false); assert.equal(target.center.y, airborne);
  assert.equal(encounter.update(.1, player, camera, true).contact, null);
  encounter.reset(); assert.equal(target.center.y, .4 + DRONE_GROUNDED_HEIGHT);
  assert.equal(encounter.snapshot()[0].flight, 'taking-off');
  assert.equal(encounter.effectCount(), 0); assert.equal(encounter.brains[0].hp, 3);
  for (let i = 0; i < 24; i++) assert.equal(encounter.update(.1, player, camera, true).contact, null);
  const result = encounter.update(.2, player, camera, true);
  assert.equal(result.contact, 0); assert.equal(encounter.brains[0].state, 'destroyed');
  encounter.dispose();
});

test('the real encounter keeps chasing after visible hits and searches after a new ridge occludes it', () => {
  let ridge = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const target: Target = { root: new THREE.Group(), center: new THREE.Vector3(), alive: true, cooldown: 0, pulse: 0 };
  target.root.position.set(10, 0, 10);
  const rules = { ...DEFAULT_DRONE_RULES, spawnGraceSeconds: 0, spawns: [{ x: 10, z: 10, yaw: 0 }] };
  const encounter = createDroneEncounter(scene, [target], (_x, z) => ridge && z > 14 && z < 16 ? 6 : 0, rules);
  const player = new THREE.Vector3(10, 0, 20); encounter.setEnabled(true);
  encounter.update(.05, player, camera, true);
  assert.equal(encounter.brains[0].state, 'locked');
  const before = target.center.z;
  encounter.hit(target); assert.equal(encounter.brains[0].state, 'locked');
  encounter.update(.05, player, camera, true);
  assert.ok(Math.abs(target.center.z - before - .36) < 1e-9);
  assert.ok(target.center.y > 1.2 && target.center.y < DRONE_HOVER_HEIGHT);
  ridge = true;
  encounter.update(.05, player, camera, true);
  assert.equal(encounter.brains[0].state, 'locked');
  encounter.hit(target); assert.equal(encounter.brains[0].state, 'alert');
  assert.equal(encounter.brains[0].hp, 1);
  encounter.dispose();
});
