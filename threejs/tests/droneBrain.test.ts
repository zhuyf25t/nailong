import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDroneDetect, createDroneBrain, updateDroneBrain, hitDrone, resetDroneBrain,
  DRONE_RANGE, DRONE_ALERT_SPEED, DRONE_SCAN_SPEED,
} from '../src/game/droneBrain.ts';

const origin = { x: 0, y: 2, z: 0 };
const front = { x: 0, y: 0.8, z: 5 };
const farAway = { x: 0, y: 0, z: 100 };
const observation = (player = front, hasLineOfSight?: () => boolean) => ({ position: origin, player, hasLineOfSight });
const angleDistance = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('detection requires a 90 degree horizontal cone, 12 meter range and visibility', () => {
  assert.equal(canDroneDetect(origin, 0, front), true);
  assert.equal(canDroneDetect(origin, 0, { x: 5, y: 0, z: 5 }), true);
  assert.equal(canDroneDetect(origin, 0, { x: 5.01, y: 0, z: 5 }), false);
  assert.equal(canDroneDetect(origin, 0, { x: 0, y: 0, z: DRONE_RANGE }), true);
  assert.equal(canDroneDetect(origin, 0, { x: 0, y: 0, z: DRONE_RANGE + 0.01 }), false);
  assert.equal(canDroneDetect(origin, 0, front, () => false), false);
  assert.equal(canDroneDetect(origin, Math.PI - 0.1, { x: -0.1, y: 0, z: -5 }), true);
  let checkedVisibility = false;
  canDroneDetect(origin, 0, farAway, () => { checkedVisibility = true; return true; });
  assert.equal(checkedVisibility, false);
});

test('normal scan changes direction using injected randomness at the scheduled time', () => {
  const values = [0, 0, 1, 0];
  const brain = createDroneBrain({ rng: () => values.shift() ?? 0.5 });
  updateDroneBrain(brain, 2, observation(farAway));
  assert.equal(brain.state, 'scanning');
  assert.equal(brain.turnDirection, 1);
  assert.ok(Math.abs(brain.yaw - (-1.5 * DRONE_SCAN_SPEED + 0.5 * DRONE_SCAN_SPEED)) < 1e-9);
});

test('an unaware drone visibly spins after a hit before detection can resume', () => {
  const brain = createDroneBrain({ rng: () => 0.75 });
  assert.equal(brain.state, 'scanning');
  assert.deepEqual(hitDrone(brain), { hit: true, destroyed: false, hp: 2 });
  updateDroneBrain(brain, 0.05, observation());
  assert.equal(brain.state, 'alert');
  assert.ok(angleDistance(brain.yaw, DRONE_ALERT_SPEED * 0.05) < 1e-9);
  updateDroneBrain(brain, 0.74, observation());
  assert.equal(brain.state, 'alert');
  updateDroneBrain(brain, 1, observation());
  assert.equal(brain.state, 'locked');
  assert.equal(brain.yaw, 0);
});

test('damage cannot interrupt a visible lock or reset its pursuit bearing', () => {
  const brain = createDroneBrain({ rng: () => .75 });
  updateDroneBrain(brain, .01, observation());
  for (const hp of [2, 1]) {
    assert.deepEqual(hitDrone(brain), { hit: true, destroyed: false, hp });
    assert.equal(brain.state, 'locked'); assert.equal(brain.yaw, 0);
    assert.equal(brain.alertRemaining, 0); assert.equal(brain.acquireDelay, 0);
    updateDroneBrain(brain, .1, observation({ x: 1, y: .8, z: 5 }));
    assert.equal(brain.state, 'locked'); assert.ok(brain.yaw > 0);
    updateDroneBrain(brain, .01, observation());
  }
  assert.equal(hitDrone(brain).destroyed, true);
  assert.equal(brain.state, 'destroyed');
});

test('a lock that lost sight before impact searches rather than tracking through cover', () => {
  const brain = createDroneBrain();
  updateDroneBrain(brain, .01, observation());
  updateDroneBrain(brain, .1, observation({ x: 5, y: .8, z: 0 }, () => false));
  assert.equal(brain.state, 'locked');
  hitDrone(brain);
  assert.equal(brain.state, 'alert'); assert.ok(brain.acquireDelay > 0);
  // The encounter may also discover a newly occluded target between brain update and impact.
  const newlyBlocked = createDroneBrain(); updateDroneBrain(newlyBlocked, .01, observation());
  hitDrone(newlyBlocked, false); assert.equal(newlyBlocked.state, 'alert');
});

test('fast scanning detects a player crossed mid-frame even if both frame endpoints face away', () => {
  const brain = createDroneBrain({ rng: () => 0.75 });
  hitDrone(brain);
  updateDroneBrain(brain, 0.8, observation(farAway));
  const behind = brain.yaw + Math.PI;
  const player = { x: Math.sin(behind) * 5, y: 0.8, z: Math.cos(behind) * 5 };
  assert.equal(canDroneDetect(origin, brain.yaw, player), false);
  // Exactly one full revolution: an endpoint-only cone check would still miss.
  updateDroneBrain(brain, Math.PI * 2 / DRONE_ALERT_SPEED, observation(player));
  assert.equal(brain.state, 'locked');
  assert.ok(angleDistance(brain.yaw, behind) < 1e-9);
});

test('occlusion retains the last bearing briefly, then searches and can reacquire', () => {
  const brain = createDroneBrain({ rng: () => 0.75 });
  updateDroneBrain(brain, 0.01, observation());
  const hiddenPlayer = { x: 5, y: 0, z: 0 };
  updateDroneBrain(brain, 0.9, observation(hiddenPlayer, () => false));
  assert.equal(brain.state, 'locked');
  assert.equal(brain.yaw, 0);
  updateDroneBrain(brain, 0.11, observation(hiddenPlayer, () => false));
  assert.equal(brain.state, 'alert');
  updateDroneBrain(brain, 1, observation(hiddenPlayer, () => true));
  assert.equal(brain.state, 'locked');
  assert.ok(angleDistance(brain.yaw, Math.PI / 2) < 1e-9);
});

test('four seconds without detecting a player returns an alert drone to normal scanning', () => {
  const brain = createDroneBrain({ rng: () => 0.75 });
  hitDrone(brain);
  updateDroneBrain(brain, 3.99, observation(farAway));
  assert.equal(brain.state, 'alert');
  updateDroneBrain(brain, 0.02, observation(farAway));
  assert.equal(brain.state, 'scanning');
  assert.equal(brain.alertRemaining, 0);
});

test('three hits destroy a drone permanently until a reset restores its initial state', () => {
  const brain = createDroneBrain({ yaw: 1.2, rng: () => 0.25 });
  hitDrone(brain); hitDrone(brain);
  assert.deepEqual(hitDrone(brain), { hit: true, destroyed: true, hp: 0 });
  const destroyedYaw = brain.yaw;
  updateDroneBrain(brain, 10, observation());
  assert.equal(brain.state, 'destroyed');
  assert.equal(brain.yaw, destroyedYaw);
  assert.deepEqual(hitDrone(brain), { hit: false, destroyed: true, hp: 0 });
  resetDroneBrain(brain);
  assert.equal(brain.state, 'scanning');
  assert.equal(brain.hp, 3);
  assert.ok(angleDistance(brain.yaw, 1.2) < 1e-9);
  assert.equal(brain.acquireDelay, 0);
});

test('normal scan timing and random changes are consistent at 30, 60 and 144 FPS', () => {
  function simulate(fps: number) {
    let seed = 123;
    const brain = createDroneBrain({ rng: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; } });
    for (let i = 0; i < fps * 8; i++) updateDroneBrain(brain, 1 / fps, observation(farAway));
    return brain;
  }
  const reference = simulate(30);
  for (const fps of [60, 144]) {
    const result = simulate(fps);
    assert.ok(angleDistance(result.yaw, reference.yaw) < 1e-8);
    assert.equal(result.turnDirection, reference.turnDirection);
    assert.ok(Math.abs(result.directionRemaining - reference.directionRemaining) < 1e-8);
  }
});

test('zero, negative and nonfinite deltas cannot move or detect while paused', () => {
  const brain = createDroneBrain({ rng: () => 0.5 });
  const before = { ...brain };
  for (const dt of [0, -1, NaN, Infinity]) updateDroneBrain(brain, dt, observation());
  assert.deepEqual(brain, before);
});
