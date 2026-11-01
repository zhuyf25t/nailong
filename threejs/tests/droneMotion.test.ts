import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDroneMotion, createDroneMotion, resetDroneMotion, droneTouchesPlayer, droneContactTime, DRONE_CHASE_SPEED, DRONE_RADIUS, DRONE_HOVER_HEIGHT } from '../src/game/droneMotion.ts';
import { createDroneBrain, updateDroneBrain } from '../src/game/droneBrain.ts';

const flat = () => 0;
const start = { x: 0, y: 1.2, z: 0 };
const chase = { state: 'locked' as const, lastSeen: { x: 0, y: 1, z: 20 } };

test('patrol changes position and remains around its spawn without seeing a player', () => {
  const motion = createDroneMotion(start, 0);
  let position = { ...start }, furthest = 0;
  for (let i = 0; i < 600; i++) {
    position = advanceDroneMotion(motion, position, { state: 'scanning', lastSeen: null }, 1 / 60, [], flat);
    furthest = Math.max(furthest, Math.hypot(position.x, position.z));
  }
  assert.ok(furthest > 1.8 && furthest <= 2.1 + 1e-6);
  assert.notEqual(motion.waypoint, 0);
  resetDroneMotion(motion);
  assert.equal(motion.waypoint, 0);
  assert.equal(motion.stuckTime, 0);
});

test('lock moves towards the last visible position at an exact bounded chase speed', () => {
  for (const fps of [30, 60, 144]) {
    const motion = createDroneMotion(start, 0);
    let position = { ...start };
    for (let i = 0; i < fps; i++) position = advanceDroneMotion(motion, position, chase, 1 / fps, [], flat);
    assert.ok(Math.abs(position.z - DRONE_CHASE_SPEED) < 1e-9);
    assert.equal(position.x, 0);
  }
});

test('a drone never steers towards an occluded updated player position', () => {
  const brain = createDroneBrain({ yaw: 0 });
  updateDroneBrain(brain, .01, { position: start, player: { x: 0, y: 1, z: 8 } });
  updateDroneBrain(brain, .1, { position: start, player: { x: 8, y: 1, z: 0 }, hasLineOfSight: () => false });
  assert.deepEqual(brain.lastSeen, { x: 0, y: 1, z: 8 });
  const position = advanceDroneMotion(createDroneMotion(start, 0), start, brain, .1, [], flat);
  assert.equal(position.x, 0);
  assert.ok(position.z > 0);
});

test('chasing steers around a crate without entering its padded footprint', () => {
  const box = { x: 0, z: 3, halfX: .72, halfZ: .72 };
  const motion = createDroneMotion(start, 0);
  let position = { ...start };
  for (let i = 0; i < 360; i++) {
    position = advanceDroneMotion(motion, position, chase, 1 / 60, [box], flat);
    const dx = Math.max(0, Math.abs(position.x - box.x) - box.halfX);
    const dz = Math.max(0, Math.abs(position.z - box.z) - box.halfZ);
    assert.ok(dx * dx + dz * dz >= DRONE_RADIUS ** 2 - 1e-7);
  }
  assert.ok(position.z > box.z + box.halfZ, `drone remained stuck at ${JSON.stringify(position)}`);
});

test('hover height follows gentle terrain but movement cannot tunnel through a cliff', () => {
  const motion = createDroneMotion(start, 0);
  const slope = (_x: number, z: number) => z * .2;
  const position = advanceDroneMotion(motion, start, chase, .1, [], slope);
  assert.ok(position.y > start.y && position.y < slope(position.x, position.z) + 1.2);
  const cliff = (_x: number, z: number) => z >= 1 ? 20 : 0;
  let at = { ...start };
  for (let i = 0; i < 240; i++) at = advanceDroneMotion(motion, at, chase, 1 / 60, [], cliff);
  assert.ok(at.z < 1);
});

test('search holds horizontal position while climbing; destroyed and paused drones cannot move', () => {
  const motion = createDroneMotion(start, 0);
  const search = advanceDroneMotion(motion, start, { state: 'alert', lastSeen: chase.lastSeen }, .1, [], flat);
  assert.equal(search.x, 0); assert.equal(search.z, 0); assert.ok(search.y > 1.2 && search.y < DRONE_HOVER_HEIGHT);
  assert.deepEqual(advanceDroneMotion(motion, start, { state: 'destroyed', lastSeen: chase.lastSeen }, 1, [], flat), start);
  for (const dt of [NaN, Infinity, -1, 0]) assert.deepEqual(advanceDroneMotion(motion, start, chase, dt, [], flat), start);
});

test('pursuit dives continuously from cruise altitude, consistently across frame rates', () => {
  let reference = 0;
  for (const fps of [30, 60, 144]) {
    const motion = createDroneMotion(start, 0); let position = { ...start, y: DRONE_HOVER_HEIGHT };
    for (let i = 0; i < fps; i++) {
      const previous = position.y;
      position = advanceDroneMotion(motion, position, chase, 1 / fps, [], flat);
      assert.ok(position.y < previous && position.y > 1.2);
    }
    if (!reference) reference = position.y;
    assert.ok(Math.abs(position.y - reference) < 1e-9);
    assert.ok(Math.abs(position.z - 7.2) < 1e-9);
  }
});

test('continuous contact catches fast crossings and moving players while allowing a clear jump', () => {
  const player = { x: 0, y: 0, z: 0 };
  const from = { x: -4, y: 1.2, z: 0 }, to = { x: 4, y: 1.2, z: 0 };
  assert.equal(droneTouchesPlayer(from, player), false); assert.equal(droneTouchesPlayer(to, player), false);
  const time = droneContactTime(from, to, player, player)!;
  assert.ok(Math.abs(time - (4 - 1.15) / 8) < 1e-9);
  assert.equal(droneContactTime(from, to, { x: 0, y: 3, z: 0 }, { x: 0, y: 3, z: 0 }), null);
  assert.ok(droneContactTime({ x: 0, y: 1.2, z: 0 }, { x: 0, y: 1.2, z: 0 }, { x: -4, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }) !== null);
  assert.equal(droneContactTime({ x: -4, y: 4, z: 0 }, { x: 4, y: 4, z: 0 }, player, player), null);
});

test('contact uses a vertical capsule, not horizontal proximity alone', () => {
  assert.equal(droneTouchesPlayer(start, { x: 0, y: 0, z: 1 }), true);
  assert.equal(droneTouchesPlayer(start, { x: 0, y: 0, z: 1.2 }), false);
  assert.equal(droneTouchesPlayer(start, { x: 0, y: 2.5, z: 0 }), false);
  assert.equal(droneTouchesPlayer(start, { x: NaN, y: 0, z: 0 }), false);
});
