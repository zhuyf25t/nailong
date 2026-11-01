import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrain, DEFAULT_TERRAIN_CONFIG, TERRAIN_HALF_SIZE } from '../src/game/terrain.ts';
import { MOUNTAIN_RISE_WIDTH, mountainBoundaryRadius } from '../src/game/worldLayout.ts';
import { MAX_WALK_SLOPE } from '../src/game/movement.ts';

test('height queries agree with the actual rendered triangles, including both cell halves', () => {
  const terrain = createTerrain();
  const raycaster = new THREE.Raycaster();
  terrain.mesh.updateMatrixWorld(true);
  for (const [x, z] of [[6.12, -4.23], [5.44, -3.58], [-4.77, 1.19], [0.13, 4.23], [10.43, -9.32], [-31.89, 31.73],
    [15.87, 16.13], [-16.22, -15.91], [44.3, 17.7], [54.11, -23.19], [-69.13, 31.52], [79.7, -79.1]]) {
    raycaster.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(terrain.mesh)[0];
    assert.ok(hit, `ray should intersect terrain at ${x}, ${z}`);
    assert.ok(Math.abs(hit.point.y - terrain.sampleHeight(x, z)) < 1e-6);
    assert.ok(hit.face!.normal.dot(terrain.normalAt(x, z)) > 1 - 1e-6);
  }
});

test('a continuous climb-resistant mountain ring encloses the valley, including after the flat preset', () => {
  const terrain = createTerrain();
  terrain.update({ ...DEFAULT_TERRAIN_CONFIG, hillHeight: 0, ripple: 0 });
  for (let degree = 0; degree < 360; degree += 5) {
    const angle = degree * Math.PI / 180;
    const foot = mountainBoundaryRadius(angle);
    const flank = foot + MOUNTAIN_RISE_WIDTH * 0.5;
    const crest = foot + MOUNTAIN_RISE_WIDTH;
    assert.ok(terrain.sampleHeight(Math.sin(angle) * crest, Math.cos(angle) * crest) > 12, `closed crest at ${degree} degrees`);
    const normal = terrain.normalAt(Math.sin(angle) * flank, Math.cos(angle) * flank);
    assert.ok(normal.y < Math.cos(MAX_WALK_SLOPE), `unwalkable flank at ${degree} degrees`);
    assert.ok(terrain.sampleHeight(Math.sin(angle) * (foot - 5), Math.cos(angle) * (foot - 5)) < 7);
  }
});

test('the larger valley preserves fine central cells and keeps a fixed triangle budget', () => {
  const terrain = createTerrain();
  const geometry = terrain.mesh.geometry;
  assert.equal(geometry.index!.count / 3, 32768);
  const positions = geometry.getAttribute('position');
  const firstRow = Array.from({ length: 129 }, (_, i) => positions.getX(i));
  assert.equal(firstRow[1] - firstRow[0], 2);
  assert.equal(firstRow[65] - firstRow[64], 0.5);
  assert.equal(firstRow[0], -80);
  assert.equal(firstRow.at(-1), 80);
});

test('editing the hill updates geometry and collision together while preserving the config reference', () => {
  const terrain = createTerrain();
  const originalConfig = terrain.config;
  const before = terrain.sampleHeight(6, -4);
  terrain.update({ ...DEFAULT_TERRAIN_CONFIG, hillHeight: 3.8 });
  assert.equal(terrain.config, originalConfig);
  assert.ok(terrain.sampleHeight(6, -4) > before + 1.4);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(6, 20, -4), new THREE.Vector3(0, -1, 0));
  const hit = raycaster.intersectObject(terrain.mesh)[0];
  assert.ok(Math.abs(hit.point.y - terrain.sampleHeight(6, -4)) < 1e-6);
});

test('spawn remains flat, normals point upward, and input limits stay finite', () => {
  const terrain = createTerrain();
  terrain.update({ hillHeight: 50, hillWidth: 0, hillX: 0, hillZ: 4, ripple: Number.NaN });
  assert.equal(terrain.sampleHeight(0, 4), 0);
  assert.equal(terrain.sampleHeight(1, 4), 0);
  assert.equal(terrain.config.hillHeight, 4);
  assert.equal(terrain.config.hillWidth, 2.5);
  for (const [x, z] of [[0, 4], [8, 8], [-11, -11], [TERRAIN_HALF_SIZE, TERRAIN_HALF_SIZE], [1e6, -1e6], [NaN, NaN]]) {
    assert.ok(Number.isFinite(terrain.sampleHeight(x, z)));
    const normal = terrain.normalAt(x, z);
    assert.ok(normal.y > 0);
    assert.ok(Math.abs(normal.length() - 1) < 1e-9);
  }
});
