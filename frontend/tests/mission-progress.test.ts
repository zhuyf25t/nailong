import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionProgress } from '../src/pages/Training/game/core/missionProgress.ts';
import { createChallenge } from '../src/pages/Training/game/core/challenge.ts';
import { advanceCharacterMovement } from '../src/pages/Training/game/core/movement.ts';
import type { WorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';

const world: WorldDefinition = { schemaVersion: 1, title: 'Objective fixture', terrain: { hillHeight: 0, hillWidth: 5, hillX: 0, hillZ: 0, ripple: 0 }, bounds: { halfSize: 20 }, spawn: { x: 0, z: 6, yaw: Math.PI }, objects: [], drones: [], beacon: { id: 'beacon', x: 0, z: -4, radius: 2 }, extraction: { id: 'exit', x: 0, z: 6, radius: 2 } };
const flat = () => 0;
const objective = { kind: 'activate_extract' as const, beaconId: 'beacon', extractionId: 'exit' };

test('returning to camp before activation cannot complete the beacon task', () => {
  const mission = createMissionProgress(objective, world);
  assert.equal(mission.extract({ x: 0, y: 0, z: 6 }, flat), false);
  assert.deepEqual(mission.state, { beaconActivated: false, extracted: false });
});

test('beacon needs proximity, appropriate height and physical line of sight', () => {
  const mission = createMissionProgress(objective, world);
  assert.equal(mission.activate({ x: 0, y: 0, z: 6 }, flat), false);
  assert.equal(mission.activate({ x: 0, y: 8, z: -4 }, flat), false);
  assert.equal(mission.activate({ x: 0, y: 0, z: -4 }, flat, () => false), false);
  assert.equal(mission.activate({ x: 0, y: 0, z: -4 }, flat), true);
  assert.equal(mission.activate({ x: 0, y: 0, z: -4 }, flat), false);
});

test('activation opens the route but only returning completes extraction, once', () => {
  const mission = createMissionProgress(objective, world);
  mission.activate({ x: 0, y: 0, z: -4 }, flat);
  assert.equal(mission.extract({ x: 0, y: 0, z: -4 }, flat), false);
  assert.equal(mission.extract({ x: 1, y: 0, z: 6 }, flat), true);
  assert.equal(mission.extract({ x: 1, y: 0, z: 6 }, flat), false);
  mission.reset(); assert.deepEqual(mission.state, { beaconActivated: false, extracted: false });
});

test('four optional kills do not end an objective mission; legacy elimination still ends', () => {
  const task = createChallenge({ mode: 'objective' }); task.reset();
  const elimination = createChallenge({ mode: 'elimination' }); elimination.reset();
  for (let index = 0; index < 4; index++) { task.destroy(index); elimination.destroy(index); }
  assert.equal(task.state.phase, 'practice'); assert.equal(task.state.destroyed, 4);
  assert.equal(elimination.state.outcome, 'victory');
  assert.equal(task.complete(), true); assert.equal(task.complete(), false);
  assert.equal(task.state.outcome, 'victory');
});

test('world bounds constrain the same character sweep used by normal movement', () => {
  const moved = advanceCharacterMovement({ x: 9.4, z: 0 }, { y: 0, verticalVelocity: 0, grounded: true }, { x: 4, z: 0 }, .05, false, [], { sampleHeight: flat, normalAt: () => ({ x: 0, y: 1, z: 0 }) }, 1, 10);
  assert.equal(moved.position.x, 9.5);
});
