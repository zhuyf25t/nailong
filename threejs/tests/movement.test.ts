import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/game/terrain.ts';
import { WORLD_SAFETY_HALF_SIZE, mountainBoundaryRadius, mountainProgress } from '../src/game/worldLayout.ts';
import {
  DEAD_ZONE,
  CHARACTER_RADIUS,
  CRATE_HEIGHT,
  GRAVITY,
  JUMP_SPEED,
  WALK_SPEED,
  advanceJump,
  advanceCharacterMovement,
  advancePlanarVelocity,
  aimFacing,
  dampAngle,
  edgeTurn,
  movementDirection,
  moveAcrossTerrain,
  moveWithCollisions,
  safeDelta,
  supportHeight,
  type JumpState,
  type TerrainSurface,
} from '../src/game/movement.ts';

function close(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
}

test('diagonal input is normalized and forward follows camera yaw', () => {
  const straight = movementDirection(0, 1, 0);
  const diagonal = movementDirection(1, 1, 0);
  close(Math.hypot(straight.x, straight.z), 1);
  close(Math.hypot(diagonal.x, diagonal.z), 1);
  close(straight.z, -1);
  assert.ok(diagonal.x > 0 && diagonal.z < 0);
  const rotated = movementDirection(0, 1, Math.PI / 2);
  close(rotated.x, -1);
  close(rotated.z, 0);
  assert.deepEqual(movementDirection(0, 0, 2), { x: 0, z: 0 });
});

test('movement acceleration and travel are independent of 30, 60 and 144 FPS', () => {
  function simulate(fps: number) {
    let velocity = { x: 0, z: 0 };
    let distance = 0;
    for (let i = 0; i < fps * 2; i++) {
      const next = advancePlanarVelocity(velocity, { x: WALK_SPEED, z: 0 }, 1 / fps);
      velocity = next.velocity;
      distance += next.displacement.x;
    }
    return { speed: velocity.x, distance };
  }
  const reference = simulate(30);
  for (const fps of [60, 144]) {
    close(simulate(fps).distance, reference.distance);
    close(simulate(fps).speed, reference.speed);
  }
  close(reference.distance, WALK_SPEED * 2 - WALK_SPEED * (1 - Math.exp(-28)) / 14);
});

test('jump height follows the same ballistic path across frame rates and lands exactly at zero', () => {
  function simulate(fps: number, seconds: number) {
    let state: JumpState = { y: 0, verticalVelocity: 0, grounded: true };
    for (let i = 0; i < fps * seconds; i++) state = advanceJump(state, 1 / fps, i === 0);
    return state;
  }
  const expectedHeight = JUMP_SPEED * 0.5 - 0.5 * GRAVITY * 0.5 ** 2;
  for (const fps of [30, 60, 144]) {
    close(simulate(fps, 0.5).y, expectedHeight);
    const landed = simulate(fps, 2);
    assert.deepEqual(landed, { y: 0, verticalVelocity: 0, grounded: true });
    assert.deepEqual(advanceJump(landed, 1 / fps, false), landed);
  }
});

test('pressing jump in mid-air does not add another impulse', () => {
  const airborne = advanceJump({ y: 0, verticalVelocity: 0, grounded: true }, 0.1, true);
  assert.deepEqual(advanceJump(airborne, 0.1, true), advanceJump(airborne, 0.1, false));
});

test('jump starts on elevated terrain and lands on the current terrain height', () => {
  const airborne = advanceJump({ y: 2.5, verticalVelocity: 0, grounded: true }, 0.1, true, 2.5);
  close(airborne.y, 2.5 + JUMP_SPEED * 0.1 - 0.5 * GRAVITY * 0.1 ** 2);
  let state = airborne;
  for (let i = 0; i < 100; i++) state = advanceJump(state, 1 / 60, false, 3);
  assert.deepEqual(state, { y: 3, verticalVelocity: 0, grounded: true });
});

test('grounded movement follows gentle changes, but a ledge starts a fall', () => {
  const grounded = { y: 1, verticalVelocity: 0, grounded: true };
  assert.deepEqual(advanceJump(grounded, 1 / 60, false, 1.1), { y: 1.1, verticalVelocity: 0, grounded: true });
  assert.deepEqual(advanceJump(grounded, 1 / 60, false, 0.9), { y: 0.9, verticalVelocity: 0, grounded: true });
  const falling = advanceJump(grounded, 1 / 60, false, -1);
  assert.equal(falling.grounded, false);
  assert.ok(falling.y < 1 && falling.y > 0.9);
  assert.ok(falling.verticalVelocity < 0);
});

test('jump boost changes only the launch impulse, not a jump already in flight', () => {
  const launched = advanceJump({ y: 0, verticalVelocity: 0, grounded: true }, 0.1, true, 0, 1.25);
  close(launched.verticalVelocity, JUMP_SPEED * 1.25 - GRAVITY * 0.1);
  const continued = advanceJump(launched, 0.1, false, 0, 1);
  assert.deepEqual(continued, advanceJump(launched, 0.1, false, 0, 2));
});

test('terrain permits gentle slopes and downhill travel, and blocks steep uphill travel', () => {
  const gentle = { sampleHeight: (x: number) => x * 0.3, normalAt: () => ({ x: -0.3, y: 1, z: 0 }) };
  const steep = { sampleHeight: (x: number) => x * 1.2, normalAt: () => ({ x: -1.2, y: 1, z: 0 }) };
  assert.deepEqual(moveAcrossTerrain({ x: 0, z: 0 }, { x: 0.2, z: 0.2 }, 0, true, gentle), { x: 0.2, z: 0.2 });
  assert.deepEqual(moveAcrossTerrain({ x: 0, z: 0 }, { x: 0.2, z: 0.2 }, 0, true, steep), { x: 0, z: 0.2 });
  assert.deepEqual(moveAcrossTerrain({ x: 1, z: 0 }, { x: 0.8, z: 0 }, 1.2, true, steep), { x: 0.8, z: 0 });
});

test('a jump can clear a steep edge, but walking cannot climb it in tiny steps', () => {
  const steep = { sampleHeight: (x: number) => x * 2, normalAt: () => ({ x: -2, y: 1, z: 0 }) };
  assert.deepEqual(moveAcrossTerrain({ x: 0, z: 0 }, { x: 0.01, z: 0 }, 0, true, steep), { x: 0, z: 0 });
  assert.deepEqual(moveAcrossTerrain({ x: 0, z: 0 }, { x: 0.2, z: 0 }, 1, false, steep), { x: 0.2, z: 0 });
});

test('collision stops movement before a box while preserving motion along its edge', () => {
  const box = [{ x: 0, z: 0, halfX: 1, halfZ: 1 }];
  assert.deepEqual(moveWithCollisions({ x: -3, z: 0 }, { x: 5, z: 0 }, box), { x: -1.5, z: 0 });
  assert.deepEqual(moveWithCollisions({ x: -2, z: 0 }, { x: 1, z: 0.75 }, box), { x: -1.5, z: 0.75 });
  assert.deepEqual(moveWithCollisions({ x: 0, z: 3 }, { x: 0, z: -5 }, box), { x: 0, z: 1.5 });
  assert.deepEqual(moveWithCollisions({ x: -1.5, z: 0 }, { x: -1, z: 0 }, box), { x: -2.5, z: 0 });
});

test('movement crosses the former arena boundary and the numerical limit remains beyond the mountains', () => {
  assert.deepEqual(moveWithCollisions({ x: 10, z: -10 }, { x: 5, z: -5 }, []), { x: 15, z: -15 });
  const limit = WORLD_SAFETY_HALF_SIZE - CHARACTER_RADIUS;
  assert.deepEqual(moveWithCollisions({ x: 77, z: -77 }, { x: 5, z: -5 }, []), { x: limit, z: -limit });
  // Callers can still specify a custom small boundary for an isolated test arena.
  assert.deepEqual(moveWithCollisions({ x: 10, z: -10 }, { x: 5, z: -5 }, [], 11), { x: 10.5, z: -10.5 });
});

const levelGround: TerrainSurface = { sampleHeight: () => 0, normalAt: () => ({ x: 0, y: 1, z: 0 }) };
const crate = { x: 0, z: 0, halfX: 0.72, halfZ: 0.72 };

test('repeated boosted jumps cannot use a steep slope to refresh a jump or climb the surrounding mountains', () => {
  const terrain = createTerrain();
  for (const fps of [30, 60, 144]) {
    for (let direction = 0; direction < 8; direction++) {
      const angle = direction * Math.PI / 4;
      const foot = mountainBoundaryRadius(angle);
      let position = { x: Math.sin(angle) * (foot - 4), z: Math.cos(angle) * (foot - 4) };
      let jump: JumpState = { y: terrain.sampleHeight(position.x, position.z), verticalVelocity: 0, grounded: true };
      for (let frame = 0; frame < fps * 12; frame++) {
        const result = advanceCharacterMovement(position, jump,
          { x: Math.sin(angle) * WALK_SPEED / fps, z: Math.cos(angle) * WALK_SPEED / fps },
          1 / fps, true, [], terrain, 1.25);
        position = result.position;
        jump = result.jump;
        assert.ok(mountainProgress(position.x, position.z) < 0.5,
          `boosted jump must remain inside the mountain flank at ${fps} FPS, direction ${direction}`);
      }
    }
  }
});

test('landing on an unwalkable slope slides down instead of creating a jump platform', () => {
  const slope: TerrainSurface = { sampleHeight: (x: number) => x * 2, normalAt: () => ({ x: -2, y: 1, z: 0 }) };
  const result = advanceCharacterMovement({ x: 2, z: 0 }, { y: 4, verticalVelocity: 0, grounded: true },
    { x: 0, z: 0 }, 1 / 60, true, [], slope, 1.25);
  assert.ok(result.position.x < 2);
  assert.ok(result.jump.y < 4);
  assert.equal(result.jump.grounded, false);
});

test('walking or an insufficient jump cannot snap the feet up a crate side', () => {
  for (const height of [0.2, CRATE_HEIGHT, 2]) {
    let state = { position: { x: -2, z: 0 }, jump: { y: 0, verticalVelocity: 0, grounded: true } };
    for (let i = 0; i < 120; i++) {
      state = advanceCharacterMovement(state.position, state.jump, { x: WALK_SPEED / 60, z: 0 }, 1 / 60, height === 2 && i === 0, [{ ...crate, height }], levelGround);
      assert.ok(state.position.x <= -crate.halfX - CHARACTER_RADIUS + 1e-8);
    }
    close(state.jump.y, 0);
    assert.equal(state.jump.grounded, true);
  }
});

test('jumping toward a crate clears its side, lands on its top, and stays there at 30, 60 and 144 FPS', () => {
  for (const fps of [30, 60, 144]) {
    let state = { position: { x: -2, z: 0 }, jump: { y: 0, verticalVelocity: 0, grounded: true } };
    let enteredTop = false;
    for (let i = 0; i < fps * 2; i++) {
      const movement = Math.min(WALK_SPEED / fps, Math.max(0, -state.position.x));
      state = advanceCharacterMovement(state.position, state.jump, { x: movement, z: 0 }, 1 / fps, i === 0, [crate], levelGround);
      if (state.position.x > -crate.halfX - CHARACTER_RADIUS + 1e-8) {
        enteredTop = true;
        assert.ok(state.jump.y >= CRATE_HEIGHT - 1e-8, `feet cannot pass through a side at ${fps} FPS`);
      }
    }
    assert.equal(enteredTop, true);
    close(state.position.x, 0);
    assert.deepEqual(state.jump, { y: CRATE_HEIGHT, verticalVelocity: 0, grounded: true });
    const launchAgain = advanceCharacterMovement(state.position, state.jump, { x: 0, z: 0 }, 1 / fps, true, [crate], levelGround);
    assert.ok(launchAgain.jump.y > CRATE_HEIGHT);
    assert.equal(launchAgain.jump.grounded, false);
  }
});

test('walking off the crate loses support and falls instead of floating or snapping to the ground', () => {
  for (const fps of [30, 60, 144]) {
    let state = { position: { x: 0, z: 0 }, jump: { y: CRATE_HEIGHT, verticalVelocity: 0, grounded: true } };
    let wasFalling = false;
    for (let i = 0; i < fps; i++) {
      state = advanceCharacterMovement(state.position, state.jump, { x: WALK_SPEED / fps, z: 0 }, 1 / fps, false, [crate], levelGround);
      if (state.position.x > crate.halfX + CHARACTER_RADIUS && state.jump.y > 0) {
        assert.equal(state.jump.grounded, false);
        assert.ok(state.jump.verticalVelocity < 0);
        wasFalling = true;
      }
    }
    assert.equal(wasFalling, true);
    close(state.position.x, WALK_SPEED);
    assert.deepEqual(state.jump, { y: 0, verticalVelocity: 0, grounded: true });
  }
});

test('box top is level at the box base height even when the surrounding terrain slopes', () => {
  const slope: TerrainSurface = { sampleHeight: (x: number) => 2 - x * 0.12, normalAt: () => ({ x: 0.12, y: 1, z: 0 }) };
  for (const fps of [30, 60, 144]) {
    let state = { position: { x: -2, z: 0 }, jump: { y: slope.sampleHeight(-2, 0), verticalVelocity: 0, grounded: true } };
    for (let i = 0; i < fps * 2; i++) {
      state = advanceCharacterMovement(state.position, state.jump, { x: Math.min(WALK_SPEED / fps, Math.max(0, 0.3 - state.position.x)), z: 0 }, 1 / fps, i === 0, [crate], slope);
    }
    close(state.position.x, 0.3);
    close(state.jump.y, 2 + CRATE_HEIGHT);
    assert.equal(state.jump.grounded, true);
    for (let i = 0; i < fps; i++) state = advanceCharacterMovement(state.position, state.jump, { x: WALK_SPEED / fps, z: 0 }, 1 / fps, false, [crate], slope);
    close(state.jump.y, slope.sampleHeight(state.position.x, state.position.z));
    assert.equal(state.jump.grounded, true);
  }
});

test('a corner without foot overlap provides no invisible platform and still blocks a later low approach', () => {
  const corner = { x: crate.halfX + 0.4, z: crate.halfZ + 0.4 };
  close(supportHeight(corner, CRATE_HEIGHT, [crate], levelGround.sampleHeight), 0);
  let state = { position: corner, jump: { y: CRATE_HEIGHT, verticalVelocity: 0, grounded: true } };
  for (let i = 0; i < 60; i++) state = advanceCharacterMovement(state.position, state.jump, { x: 0, z: 0 }, 1 / 60, false, [crate], levelGround);
  close(state.jump.y, 0);
  for (let i = 0; i < 60; i++) state = advanceCharacterMovement(state.position, state.jump, { x: -WALK_SPEED / 60, z: -WALK_SPEED / 60 }, 1 / 60, false, [crate], levelGround);
  const dx = Math.max(0, Math.abs(state.position.x) - crate.halfX);
  const dz = Math.max(0, Math.abs(state.position.z) - crate.halfZ);
  assert.ok(dx * dx + dz * dz >= CHARACTER_RADIUS ** 2 - 1e-8);
  close(state.jump.y, 0);
});

test('blue rectangle, including its boundary, leaves the camera stable', () => {
  assert.deepEqual(edgeTurn(0, 0), { x: 0, y: 0 });
  close(edgeTurn(DEAD_ZONE.width, DEAD_ZONE.height).x, 0);
  close(edgeTurn(-DEAD_ZONE.width, -DEAD_ZONE.height).y, 0);
  close(edgeTurn(0.3, -0.2).x, 0);
  close(edgeTurn(0.3, -0.2).y, 0);
});

test('all four edges turn progressively and vertical screen directions have opposite signs', () => {
  assert.ok(edgeTurn(0.75, 0).x > 0);
  assert.ok(edgeTurn(-0.75, 0).x < 0);
  assert.ok(edgeTurn(0, -0.75).y < 0);
  assert.ok(edgeTurn(0, 0.75).y > 0);
  assert.ok(edgeTurn(0.75, 0).x < edgeTurn(0.9, 0).x);
  assert.deepEqual(edgeTurn(1, -1), { x: 1, y: -1 });
  close(edgeTurn(2, 2).x, 1);
});

test('angular smoothing follows the shortest route around the wrap boundary', () => {
  const angle = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.1);
  assert.ok(angle > Math.PI - 0.1 && angle < Math.PI + 0.1);
});

test('aiming tracks both sides of the cursor while staying in the camera forward hemisphere', () => {
  const view = Math.PI;
  assert.ok(aimFacing({ x: 3, z: -10 }, view) < view);
  assert.ok(aimFacing({ x: -3, z: -10 }, view) > view);
  for (const direction of [{ x: 0, z: 10 }, { x: 20, z: 1 }, { x: -20, z: 1 }]) {
    assert.ok(Math.cos(aimFacing(direction, view) - view) > 0.4);
  }
});

test('aim facing stays valid across an orbit wrap and a zero-length aim vector', () => {
  const view = Math.PI - 0.01;
  close(aimFacing({ x: -0.01, z: -1 }, view), Math.PI + Math.atan(0.01));
  close(aimFacing({ x: 0, z: 0 }, view), view);
  close(aimFacing({ x: NaN, z: 1 }, view), view);
});

test('aiming eases rather than snapping and converges consistently across frame rates', () => {
  const start = Math.PI, target = Math.PI + 0.75;
  const first = dampAngle(start, target, 1 / 60, 12);
  assert.ok(first > start && first < start + 0.2);
  const expected = dampAngle(start, target, 0.5, 12);
  for (const fps of [30, 60, 144]) {
    let angle = start;
    for (let i = 0; i < fps / 2; i++) angle = dampAngle(angle, target, 1 / fps, 12);
    close(angle, expected);
  }
});

test('unsafe frame deltas cannot cause a time spike or reverse movement', () => {
  close(safeDelta(1 / 60), 1 / 60);
  close(safeDelta(5), 0.05);
  close(safeDelta(-1), 0);
  close(safeDelta(Number.NaN), 0);
});
