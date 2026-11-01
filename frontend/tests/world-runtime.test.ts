import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorldDefinition } from '../src/objects/worlds/WorldDefinition';
import { createWorldRuntime } from '../src/pages/Training/game/core/worldRuntime';
import { moveWithCollisions } from '../src/pages/Training/game/core/movement';
import { segmentBoxTime } from '../src/pages/Training/game/core/shootingMath';
import { OBSTACLES } from '../src/pages/Training/game/core/obstacles';

function makeWorld(): WorldDefinition {
  return {
    schemaVersion: 1, title: 'Gate test', terrain: { hillHeight: 0, hillWidth: 5, hillX: 0, hillZ: 0, ripple: 0 },
    bounds: { halfSize: 20 }, spawn: { x: 0, z: 4, yaw: 0 },
    objects: [
      { id: 'gate', kind: 'gate', x: 0, z: 0, width: 4, depth: 1, height: 3 },
      { id: 'wall', kind: 'wall', x: 5, z: 0, width: 6, depth: 1, height: 4 },
      { id: 'crate', kind: 'crate', x: -5, z: 0, width: 2, depth: 2, height: 1.3 },
      { id: 'barrel', kind: 'barrel', x: -8, z: 0, width: 1, depth: 1, height: 1.1 },
    ],
    drones: [], beacon: { id: 'beacon', x: 0, z: -5, radius: 1.5 }, extraction: { id: 'extract', x: 0, z: 5, radius: 2 },
  };
}

test('world dimensions and stable IDs supply all physical box kinds', () => {
  const world = makeWorld();
  const runtime = createWorldRuntime(world, () => 2);
  assert.deepEqual(runtime.obstacles.map(item => item.id), world.objects.map(item => item.id));
  assert.deepEqual(runtime.obstacles.map(item => item.kind), ['gate', 'wall', 'crate', 'barrel']);
  assert.deepEqual(runtime.getProjectileBoxes()[0], { id: 'gate', kind: 'gate', min: { x: -2, y: 2, z: -.5 }, max: { x: 2, y: 5, z: .5 } });
});

test('opening gates updates captured movement and projectile lists in place, and closing restores order', () => {
  const runtime = createWorldRuntime(makeWorld(), () => 0);
  const movement = runtime.obstacles, projectiles = runtime.getProjectileBoxes();
  const gate = projectiles[0];
  runtime.setGateOpen(true);
  assert.equal(runtime.obstacles, movement);
  assert.equal(runtime.getProjectileBoxes(), projectiles);
  assert.deepEqual(movement.map(item => item.id), ['wall', 'crate', 'barrel']);
  assert.deepEqual(projectiles.map(item => item.id), ['wall', 'crate', 'barrel']);
  runtime.setGateOpen(true);
  assert.equal(movement.length, 3);
  runtime.setGateOpen(false);
  assert.deepEqual(movement.map(item => item.id), ['gate', 'wall', 'crate', 'barrel']);
  assert.equal(projectiles[0], gate);
});

test('the same gate stops walking, bullet sweeps and sight rays until it opens', () => {
  const runtime = createWorldRuntime(makeWorld(), () => 0);
  const boxes = runtime.getProjectileBoxes();
  const walk = () => moveWithCollisions({ x: 0, z: 2 }, { x: 0, z: -4 }, runtime.obstacles);
  const rayIsBlocked = () => boxes.some(box => segmentBoxTime({ x: 0, y: 1.2, z: 2 }, { x: 0, y: 1.2, z: -2 }, box) !== null);
  assert.equal(walk().z, 1);
  assert.equal(rayIsBlocked(), true);
  runtime.setGateOpen(true);
  assert.equal(walk().z, -2);
  assert.equal(rayIsBlocked(), false);
});

test('terrain changes refresh captured boxes without changing identity or horizontal extents', () => {
  let terrainY = 0;
  const runtime = createWorldRuntime(makeWorld(), () => terrainY);
  const box = runtime.getProjectileBoxes()[1];
  terrainY = 2.5;
  assert.equal(runtime.getProjectileBoxes()[1], box);
  assert.deepEqual(box.min, { x: 2, y: 2.5, z: -.5 });
  assert.deepEqual(box.max, { x: 8, y: 6.5, z: .5 });
});

test('gate and terrain mutations never rewrite a frozen run world definition', () => {
  const world = makeWorld(), before = structuredClone(world);
  Object.freeze(world.objects);
  world.objects.forEach(Object.freeze);
  const runtime = createWorldRuntime(world, () => 7);
  runtime.setGateOpen(true); runtime.getProjectileBoxes(); runtime.setGateOpen(false);
  assert.deepEqual(world, before);
});

test('legacy three-argument scenes retain their established layout without mutating its constants', () => {
  const before = structuredClone(OBSTACLES);
  const runtime = createWorldRuntime(undefined, () => 0);
  assert.equal(runtime.obstacles.length, OBSTACLES.length);
  assert.equal(runtime.obstacles[0].halfX, OBSTACLES[0].halfX);
  runtime.setGateOpen(true); runtime.setGateOpen(false);
  assert.deepEqual(OBSTACLES, before);
  assert.equal(new Set(runtime.obstacles.map(item => item.id)).size, OBSTACLES.length);
});
