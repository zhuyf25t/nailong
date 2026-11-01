import test from 'node:test';
import assert from 'node:assert/strict';
import { firstProjectileImpact, segmentBoxTime, segmentSphereTime, segmentTerrainTime } from '../src/game/shootingMath.ts';

test('a fast bubble cannot cross a whole crate between two frames', () => {
  const from = { x: 0, y: 1, z: 0 }; const to = { x: 0, y: 1, z: 10 };
  const box = { min: { x: -0.7, y: 0, z: 3 }, max: { x: 0.7, y: 1.31, z: 4.4 } };
  const impact = firstProjectileImpact(from, to, [{ center: { x: 0, y: 1, z: 6 }, active: true }], 0.68, [box], 0.13);
  assert.equal(impact?.kind, 'block');
  assert.ok(Math.abs(impact!.time - 0.287) < 1e-9);
  // The next frame end is beyond the crate: endpoint-only collision would miss it.
  assert.ok(to.z > box.max.z && from.z < box.min.z);
});

test('nearest target wins even when target array order is far-to-near', () => {
  const impact = firstProjectileImpact({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }, [
    { center: { x: 0, y: 1, z: 7 }, active: true },
    { center: { x: 0, y: 1, z: 3 }, active: true },
  ], 0.68, [], 0.13);
  assert.equal(impact?.kind, 'target');
  assert.equal(impact?.kind === 'target' && impact.index, 1);
  assert.ok(Math.abs(impact!.time - 0.232) < 1e-9);
});

test('a target in front of a crate is hit, while a cooling target is skipped', () => {
  const from = { x: 0, y: 1, z: 0 }; const to = { x: 0, y: 1, z: 10 };
  const targets = [{ center: { x: 0, y: 1, z: 2 }, active: false }, { center: { x: 0, y: 1, z: 4 }, active: true }];
  const boxes = [{ min: { x: -1, y: 0, z: 6 }, max: { x: 1, y: 2, z: 7 } }];
  const impact = firstProjectileImpact(from, to, targets, 0.68, boxes, 0.13);
  assert.equal(impact?.kind === 'target' && impact.index, 1);
});

test('crate collision uses elevated bottom and allows shots underneath an elevated box', () => {
  const elevated = { min: { x: -0.7, y: 2, z: 3 }, max: { x: 0.7, y: 3.31, z: 4.4 } };
  assert.equal(segmentBoxTime({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 8 }, elevated, 0.13), null);
  assert.notEqual(segmentBoxTime({ x: 0, y: 2.5, z: 0 }, { x: 0, y: 2.5, z: 8 }, elevated, 0.13), null);
  assert.equal(segmentBoxTime({ x: 0, y: 2.5, z: 3.5 }, { x: 0, y: 2.5, z: 8 }, elevated, 0.13), 0);
});

test('terrain between airborne segment endpoints blocks a target behind a hill', () => {
  const ground = (_x: number, z: number) => Math.max(0, 2 - Math.abs(z - 4));
  const impact = firstProjectileImpact({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }, [
    { center: { x: 0, y: 1, z: 8 }, active: true },
  ], 0.68, [], 0.13, ground);
  assert.equal(impact?.kind, 'block');
  assert.ok(Math.abs(impact!.time - 0.287) < 0.0001);
  const flatGround = segmentTerrainTime({ x: 0, y: 2, z: 0 }, { x: 0, y: -2, z: 0 }, () => 0, 0.13);
  assert.ok(Math.abs(flatGround! - 0.4675) < 0.0001);
});

test('sphere sweep handles tangency, starting inside and targets beyond the segment', () => {
  const center = { x: 0, y: 0, z: 3 };
  assert.equal(segmentSphereTime({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 6 }, center, 1), 0.5);
  assert.equal(segmentSphereTime(center, center, center, 1), 0);
  assert.equal(segmentSphereTime({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, center, 1), null);
});

test('a larger bubble can catch a near miss without changing normal shot reach', () => {
  const from = { x: 0.73, y: 1, z: 0 }; const to = { x: 0.73, y: 1, z: 6 };
  const target = [{ center: { x: 0, y: 1, z: 3 }, active: true }];
  assert.equal(firstProjectileImpact(from, to, target, 0.68, [], 0.13), null);
  assert.equal(firstProjectileImpact(from, to, target, 0.78, [], 0.24)?.kind, 'target');
});
