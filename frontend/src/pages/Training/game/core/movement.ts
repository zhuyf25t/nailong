import { WORLD_SAFETY_HALF_SIZE } from './worldLayout.ts';

/** The visible central rectangle occupies this fraction of the canvas. */
export const DEAD_ZONE = { width: 0.36, height: 0.5 } as const;

export const CHARACTER_RADIUS = 0.5;
export const CRATE_HEIGHT = 1.31;
// Numerical fail-safe behind the mountains, rather than a wall around the old arena.
export const ARENA_HALF_SIZE = WORLD_SAFETY_HALF_SIZE;
export const WALK_SPEED = 4.8;
export const JUMP_SPEED = 8.1;
export const GRAVITY = 22;
export const MAX_WALK_SLOPE = Math.PI * 40 / 180;
export const GROUND_SNAP_DISTANCE = 0.28;

export interface GroundVector { x: number; z: number }
export interface Obstacle { x: number; z: number; halfX: number; halfZ: number; height?: number }
export interface JumpState { y: number; verticalVelocity: number; grounded: boolean }
export interface TerrainSurface {
  sampleHeight(x: number, z: number): number;
  normalAt(x: number, z: number): { x: number; y: number; z: number };
}

export function safeDelta(dt: number): number {
  return Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
}

/** Positive forward points away from the camera; positive right is screen-right. */
export function movementDirection(right: number, forward: number, yaw: number): GroundVector {
  const length = Math.hypot(right, forward);
  if (!length) return { x: 0, z: 0 };
  const magnitude = Math.max(1, length);
  const x = right / magnitude;
  const z = forward / magnitude;
  return {
    x: Math.cos(yaw) * x - Math.sin(yaw) * z,
    z: -Math.sin(yaw) * x - Math.cos(yaw) * z,
  };
}

/** Integrate an exponential approach exactly, avoiding a frame-rate-dependent acceleration. */
export function advancePlanarVelocity(
  velocity: GroundVector,
  target: GroundVector,
  dt: number,
  response = 14,
): { velocity: GroundVector; displacement: GroundVector } {
  const decay = Math.exp(-response * dt);
  const integral = (1 - decay) / response;
  return {
    velocity: {
      x: target.x + (velocity.x - target.x) * decay,
      z: target.z + (velocity.z - target.z) * decay,
    },
    displacement: {
      x: target.x * dt + (velocity.x - target.x) * integral,
      z: target.z * dt + (velocity.z - target.z) * integral,
    },
  };
}

/** Sweep the circular footprint against box sides; each axis slides independently. */
export function moveWithCollisions(
  position: GroundVector,
  displacement: GroundVector,
  obstacles: readonly Obstacle[],
  arenaHalfSize = ARENA_HALF_SIZE,
  radius = CHARACTER_RADIUS,
): GroundVector {
  const limit = arenaHalfSize - radius;
  let x = Math.max(-limit, Math.min(limit, position.x + displacement.x));
  for (const obstacle of obstacles) {
    const dz = Math.max(0, Math.abs(position.z - obstacle.z) - obstacle.halfZ);
    if (dz > radius || (dz === radius && radius > 0)) continue;
    const padding = Math.sqrt(radius * radius - dz * dz);
    const left = obstacle.x - obstacle.halfX - padding;
    const right = obstacle.x + obstacle.halfX + padding;
    if (position.x <= left && x > left) x = left;
    else if (position.x >= right && x < right) x = right;
  }

  let z = Math.max(-limit, Math.min(limit, position.z + displacement.z));
  for (const obstacle of obstacles) {
    const dx = Math.max(0, Math.abs(x - obstacle.x) - obstacle.halfX);
    if (dx > radius || (dx === radius && radius > 0)) continue;
    const padding = Math.sqrt(radius * radius - dx * dx);
    const front = obstacle.z - obstacle.halfZ - padding;
    const back = obstacle.z + obstacle.halfZ + padding;
    if (position.z <= front && z > front) z = front;
    else if (position.z >= back && z < back) z = back;
  }
  return { x, z };
}

/** Reject uphill movement on steep terrain, preserving sliding along reachable axes. */
export function moveAcrossTerrain(
  position: GroundVector,
  candidate: GroundVector,
  feetY: number,
  grounded: boolean,
  terrain: TerrainSurface,
): GroundVector {
  function reachable(from: GroundVector, to: GroundVector) {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    if (distance < 1e-9) return true;
    const height = terrain.sampleHeight(to.x, to.z);
    const rise = height - terrain.sampleHeight(from.x, from.z);
    if (rise <= 1e-5) return true;
    // A jump may clear the face of a hill, but walking cannot ratchet up it.
    if (!grounded && feetY >= height + 0.08) return true;
    const normal = terrain.normalAt(to.x, to.z);
    const normalLength = Math.hypot(normal.x, normal.y, normal.z);
    const slopeCosine = normalLength > 0 ? normal.y / normalLength : 1;
    return slopeCosine >= Math.cos(MAX_WALK_SLOPE) && rise / distance <= Math.tan(MAX_WALK_SLOPE);
  }
  if (reachable(position, candidate)) return candidate;
  const alongX = { x: candidate.x, z: position.z };
  const partial = reachable(position, alongX) ? alongX : { ...position };
  const alongZ = { x: partial.x, z: candidate.z };
  return reachable(partial, alongZ) ? alongZ : partial;
}

/** World-space jump integration; jumpPressed is an edge, never a held button. */
export function advanceJump(
  state: JumpState,
  dt: number,
  jumpPressed: boolean,
  groundHeight = 0,
  jumpMultiplier = 1,
): JumpState {
  let velocity = state.verticalVelocity;
  let grounded = state.grounded;
  let startY = state.y;
  if (jumpPressed && grounded) {
    velocity = JUMP_SPEED * jumpMultiplier;
    startY = Math.max(startY, groundHeight);
    grounded = false;
  } else if (grounded && startY - groundHeight > GROUND_SNAP_DISTANCE) {
    // A cliff starts a fall; gentle downhill terrain stays under the feet.
    velocity = 0;
    grounded = false;
  }
  if (grounded) return { y: groundHeight, verticalVelocity: 0, grounded: true };
  const y = startY + velocity * dt - 0.5 * GRAVITY * dt * dt;
  velocity -= GRAVITY * dt;
  return y <= groundHeight
    ? { y: groundHeight, verticalVelocity: 0, grounded: true }
    : { y, verticalVelocity: velocity, grounded: false };
}

/** Boxes stand on the same sampled ground height as their rendered models. */
export function obstacleTop(obstacle: Obstacle, sampleHeight: TerrainSurface['sampleHeight']): number {
  return sampleHeight(obstacle.x, obstacle.z) + (obstacle.height ?? CRATE_HEIGHT);
}

/** Only a top already below the feet can become a support; a wall never lifts the player. */
export function supportHeight(
  position: GroundVector,
  feetY: number,
  obstacles: readonly Obstacle[],
  sampleHeight: TerrainSurface['sampleHeight'],
  radius = CHARACTER_RADIUS,
): number {
  let height = sampleHeight(position.x, position.z);
  for (const obstacle of obstacles) {
    const top = obstacleTop(obstacle, sampleHeight);
    if (top > feetY + 1e-6 || top <= height) continue;
    const dx = Math.max(0, Math.abs(position.x - obstacle.x) - obstacle.halfX);
    const dz = Math.max(0, Math.abs(position.z - obstacle.z) - obstacle.halfZ);
    // A tangential contact with the side is not a top contact. The circular foot
    // footprint also prevents standing on empty space outside a box's corner.
    if (dx * dx + dz * dz < radius * radius - 1e-8) height = top;
  }
  return height;
}

/** Kinematic feet + box tops; small substeps keep landing reliable during slow frames. */
export function advanceCharacterMovement(
  position: GroundVector,
  jump: JumpState,
  displacement: GroundVector,
  rawDt: number,
  jumpPressed: boolean,
  obstacles: readonly Obstacle[],
  terrain: TerrainSurface,
  jumpMultiplier = 1,
): { position: GroundVector; jump: JumpState } {
  const dt = safeDelta(rawDt);
  if (!dt) return { position: { ...position }, jump: { ...jump } };
  const steps = Math.ceil(dt * 120);
  const stepDt = dt / steps;
  const stepMove = { x: displacement.x / steps, z: displacement.z / steps };
  let next = { ...position };
  let state = { ...jump };
  for (let step = 0; step < steps; step++) {
    const old = next;
    const oldTerrainHeight = terrain.sampleHeight(old.x, old.z);
    const oldNormal = terrain.normalAt(old.x, old.z);
    const oldSlopeCosine = oldNormal.y / Math.hypot(oldNormal.x, oldNormal.y, oldNormal.z);
    const onSteepGround = Math.abs(state.y - oldTerrainHeight) < 1e-5 && oldSlopeCosine < Math.cos(MAX_WALK_SLOPE);
    // An unwalkable face is never a platform that can refresh a jump. Box tops
    // remain valid supports even when the terrain below them is steep.
    const previous = onSteepGround ? { ...state, grounded: false } : state;
    const oldFloor = supportHeight(old, previous.y, obstacles, terrain.sampleHeight);
    const airborne = advanceJump(previous, stepDt, jumpPressed && step === 0, oldFloor, jumpMultiplier);
    const clearance = Math.max(previous.y, airborne.y);
    const walls = obstacles.filter(obstacle => obstacleTop(obstacle, terrain.sampleHeight) > clearance + 1e-6);
    const candidate = moveWithCollisions(old, stepMove, walls);
    // A box can carry the feet over a steep piece of ground underneath it.
    const groundedOnTerrain = previous.grounded && Math.abs(previous.y - terrain.sampleHeight(old.x, old.z)) < 1e-5;
    const onTerrain = moveAcrossTerrain(old, candidate, clearance, groundedOnTerrain, terrain);
    next = moveWithCollisions(old, { x: onTerrain.x - old.x, z: onTerrain.z - old.z }, walls);
    const floor = supportHeight(next, clearance, obstacles, terrain.sampleHeight);
    if (airborne.grounded) {
      // Leaving a platform starts gravity immediately; ordinary slopes still snap.
      state = advanceJump(previous, stepDt, false, floor, jumpMultiplier);
    } else if (airborne.y <= floor && airborne.verticalVelocity <= 0) {
      state = { y: floor, verticalVelocity: 0, grounded: true };
    } else {
      state = airborne;
    }
    const terrainHeight = terrain.sampleHeight(next.x, next.z);
    const normal = terrain.normalAt(next.x, next.z);
    const length = Math.hypot(normal.x, normal.y, normal.z);
    if (state.y <= terrainHeight + 1e-5 && normal.y / length < Math.cos(MAX_WALK_SLOPE)) {
      // Slide down actual triangle normals. This prevents repeated boosted jumps
      // from ratcheting up the enclosing mountain wall, without an invisible ring.
      const horizontalLength = Math.hypot(normal.x, normal.z);
      const slide = (WALK_SPEED + 1.8) * stepDt / horizontalLength;
      const slideCandidate = moveWithCollisions(next, { x: normal.x * slide, z: normal.z * slide }, walls);
      next = moveAcrossTerrain(next, slideCandidate, state.y, false, terrain);
      const slideFloor = supportHeight(next, state.y, obstacles, terrain.sampleHeight);
      state = { y: Math.min(state.y, slideFloor), verticalVelocity: 0, grounded: false };
    }
  }
  return { position: next, jump: state };
}

function edgeStrength(value: number, edge: number): number {
  const outside = Math.max(0, Math.min(1, (Math.abs(value) - edge) / (1 - edge)));
  // Smoothstep starts gently at the blue frame and reaches full speed at the canvas edge.
  return Math.sign(value) * outside * outside * (3 - 2 * outside);
}

/** Coordinates are [-1, 1], with screen-down positive on the Y axis. */
export function edgeTurn(x: number, y: number): { x: number; y: number } {
  return { x: edgeStrength(x, DEAD_ZONE.width), y: edgeStrength(y, DEAD_ZONE.height) };
}

export function dampAngle(current: number, target: number, dt: number, response = 15): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-response * dt));
}

/** A third-person shooter faces into the view; aiming near the feet must not turn it toward the camera. */
export function aimFacing(direction: GroundVector, viewYaw: number): number {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.z) || Math.hypot(direction.x, direction.z) < 0.001) return viewYaw;
  const target = Math.atan2(direction.x, direction.z);
  const relative = Math.atan2(Math.sin(target - viewYaw), Math.cos(target - viewYaw));
  const limit = Math.PI * 65 / 180;
  return viewYaw + Math.max(-limit, Math.min(limit, relative));
}
