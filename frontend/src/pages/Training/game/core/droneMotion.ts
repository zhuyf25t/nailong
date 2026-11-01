import { moveWithCollisions, type Obstacle, type GroundVector } from './movement.ts';
import type { DroneBrain, DronePoint } from './droneBrain.ts';
import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';
import { segmentSphereTime } from './shootingMath.ts';

export const DRONE_PATROL_SPEED = DEFAULT_DRONE_RULES.patrolSpeed;
export const DRONE_CHASE_SPEED = DEFAULT_DRONE_RULES.chaseSpeed;
export const DRONE_RADIUS = DEFAULT_DRONE_RULES.contactRadius;
export const DRONE_HOVER_HEIGHT = 2.2;
export const DRONE_CHASE_HEIGHT = 1.2;
export const DRONE_GROUNDED_HEIGHT = .82;
export const DRONE_TAKEOFF_SECONDS = 1.25;
export const DRONE_SPAWN_GRACE = DEFAULT_DRONE_RULES.spawnGraceSeconds;
const PLAYER_RADIUS = 0.5;
const WAYPOINTS = 6;
const steerAngles = [0, .55, -.55, 1.05, -1.05, 1.5, -1.5];

export interface DroneMotion {
  readonly spawn: GroundVector;
  readonly phase: number;
  readonly avoidDirection: -1 | 1;
  readonly rules: DroneRules;
  readonly patrol: readonly GroundVector[];
  readonly halfSize: number;
  waypoint: number;
  stuckTime: number;
}

export function createDroneMotion(position: GroundVector, id: number, rules: DroneRules = DEFAULT_DRONE_RULES,
  options: { patrol?: readonly GroundVector[]; halfSize?: number } = {}): DroneMotion {
  return { spawn: { x: position.x, z: position.z }, rules, phase: id * 1.73, avoidDirection: id % 2 ? -1 : 1,
    patrol: options.patrol?.map(point => ({ ...point })) ?? [], halfSize: options.halfSize ?? 38, waypoint: 0, stuckTime: 0 };
}

export function resetDroneMotion(motion: DroneMotion) { motion.waypoint = 0; motion.stuckTime = 0; }

/** World-space eye height; takeoff is deterministic at every rendered frame rate. */
export function droneTakeoffHeight(elapsed: number, duration: number, floor: number): number {
  const t = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
  const eased = t * t * (3 - 2 * t);
  return floor + DRONE_GROUNDED_HEIGHT + (DRONE_HOVER_HEIGHT - DRONE_GROUNDED_HEIGHT) * eased + .12 * Math.sin(Math.PI * t) ** 2;
}

function flightHeight(y: number, floor: number, chasing: boolean, dt: number) {
  const target = floor + (chasing ? DRONE_CHASE_HEIGHT : DRONE_HOVER_HEIGHT);
  return Math.max(floor + DRONE_GROUNDED_HEIGHT, target + (y - target) * Math.exp(-6 * dt));
}

/** Swept circle movement uses the same boxes as the player. Drones hover over
 * gentle ground but cannot fly through crates or climb the enclosing cliffs. */
export function advanceDroneMotion(
  motion: DroneMotion, position: DronePoint, brain: Pick<DroneBrain, 'state' | 'lastSeen'> & Partial<Pick<DroneBrain, 'investigate'>>,
  dt: number, obstacles: readonly Obstacle[], sampleHeight: (x: number, z: number) => number,
): DronePoint {
  if (!Number.isFinite(dt) || dt <= 0 || brain.state === 'destroyed') return { ...position };
  let result = { ...position };
  const stepCount = Math.ceil(Math.min(dt, .25) * 120);
  const step = Math.min(dt, .25) / stepCount;
  for (let i = 0; i < stepCount; i++) {
    const previousY = result.y;
    if (brain.state === 'alert' && !brain.investigate) {
      result.y = flightHeight(result.y, sampleHeight(result.x, result.z), false, step);
      continue;
    }
    const angle = motion.phase + motion.waypoint * Math.PI * 2 / WAYPOINTS;
    const destination = brain.state === 'locked' ? brain.lastSeen : brain.investigate ?? motion.patrol[motion.waypoint] ?? {
      x: motion.spawn.x + Math.sin(angle) * motion.rules.patrolRadius,
      z: motion.spawn.z + Math.cos(angle) * motion.rules.patrolRadius,
    };
    if (!destination) break;
    const dx = destination.x - result.x, dz = destination.z - result.z;
    const distance = Math.hypot(dx, dz);
    if (distance < .15) {
      if (brain.state === 'scanning' && !brain.investigate) motion.waypoint = (motion.waypoint + 1) % (motion.patrol.length || WAYPOINTS);
      else { result.y = flightHeight(result.y, sampleHeight(result.x, result.z), brain.state === 'locked', step); continue; }
      continue;
    }
    const speed = brain.state === 'locked' ? motion.rules.chaseSpeed : motion.rules.patrolSpeed;
    const travel = Math.min(distance, speed * step);
    let best = result;
    let bestScore = -Infinity;
    for (const turn of steerAngles) {
      const x = (dx * Math.cos(turn) - dz * Math.sin(turn)) / distance * travel;
      const z = (dx * Math.sin(turn) + dz * Math.cos(turn)) / distance * travel;
      const candidate = moveWithCollisions(result, { x, z }, obstacles, motion.halfSize, motion.rules.contactRadius);
      const overlapsBox = obstacles.some(box => {
        const bx = Math.max(0, Math.abs(candidate.x - box.x) - box.halfX);
        const bz = Math.max(0, Math.abs(candidate.z - box.z) - box.halfZ);
        return bx * bx + bz * bz < motion.rules.contactRadius * motion.rules.contactRadius - 1e-8;
      });
      if (overlapsBox) continue;
      const moved = Math.hypot(candidate.x - result.x, candidate.z - result.z);
      const floor = sampleHeight(candidate.x, candidate.z);
      const rise = floor - sampleHeight(result.x, result.z);
      if (!Number.isFinite(floor) || rise > moved * 1.05 + 1e-5) continue;
      // A persistent side preference prevents left/right oscillation when a box
      // lies exactly on the route. The other side remains available if blocked.
      const score = moved / Math.max(travel, 1e-6) - Math.abs(turn) * .13 + (Math.sign(turn) === motion.avoidDirection ? .12 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { x: candidate.x, y: floor + DRONE_HOVER_HEIGHT, z: candidate.z };
      }
      if (turn === 0 && moved >= travel * .99) break;
    }
    const progress = Math.hypot(best.x - result.x, best.z - result.z);
    motion.stuckTime = progress < travel * .2 ? motion.stuckTime + step : 0;
    if (motion.stuckTime > .5 && brain.state === 'scanning' && !brain.investigate) {
      motion.waypoint = (motion.waypoint + 1) % (motion.patrol.length || WAYPOINTS);
      motion.stuckTime = 0;
    }
    result = best;
    result.y = flightHeight(previousY, sampleHeight(result.x, result.z), brain.state === 'locked', step);
  }
  return result;
}

/** A pulse displacement sweeps the same footprint as ordinary flight. Splitting
 * the impulse also prevents jumping across a steep terrain edge in one step. */
export function pushDroneAway(position: DronePoint, source: DronePoint, distance: number,
  obstacles: readonly Obstacle[], sampleHeight: (x: number, z: number) => number,
  radius = DRONE_RADIUS, halfSize = 38): DronePoint {
  if (!Number.isFinite(distance) || distance <= 0) return { ...position };
  let result = { ...position };
  const length = Math.hypot(position.x - source.x, position.z - source.z);
  const direction = length > 1e-8 ? { x: (position.x - source.x) / length, z: (position.z - source.z) / length } : { x: 0, z: 1 };
  const steps = Math.ceil(distance / .08);
  for (let i = 0; i < steps; i++) {
    const candidate = moveWithCollisions(result, { x: direction.x * distance / steps, z: direction.z * distance / steps }, obstacles, halfSize, radius);
    const floor = sampleHeight(candidate.x, candidate.z), oldFloor = sampleHeight(result.x, result.z);
    const moved = Math.hypot(candidate.x - result.x, candidate.z - result.z);
    if (!Number.isFinite(floor) || floor - oldFloor > moved * 1.05 + 1e-5) break;
    result = { ...candidate, y: Math.max(floor + DRONE_GROUNDED_HEIGHT, result.y + floor - oldFloor) };
  }
  return result;
}

/** Sphere versus the player's vertical capsule. Jumping over the drone can avoid contact. */
export function droneTouchesPlayer(drone: DronePoint, playerFeet: DronePoint, contactRadius = DEFAULT_DRONE_RULES.contactRadius): boolean {
  const capsuleY = Math.max(playerFeet.y + PLAYER_RADIUS, Math.min(playerFeet.y + 1.45, drone.y));
  const distanceSquared = (drone.x - playerFeet.x) ** 2 + (drone.y - capsuleY) ** 2 + (drone.z - playerFeet.z) ** 2;
  return Number.isFinite(distanceSquared) && distanceSquared <= (contactRadius + PLAYER_RADIUS) ** 2;
}

/** Exact relative sweep against the player's vertical capsule. Both actors may
 * move during the frame; a fast dive cannot pass through a player between samples. */
export function droneContactTime(from: DronePoint, to: DronePoint, playerFrom: DronePoint, playerTo: DronePoint, contactRadius = DEFAULT_DRONE_RULES.contactRadius): number | null {
  const a = { x: from.x - playerFrom.x, y: from.y - playerFrom.y, z: from.z - playerFrom.z };
  const b = { x: to.x - playerTo.x, y: to.y - playerTo.y, z: to.z - playerTo.z };
  if (![a.x, a.y, a.z, b.x, b.y, b.z, contactRadius].every(Number.isFinite) || contactRadius < 0) return null;
  if (droneTouchesPlayer(a, { x: 0, y: 0, z: 0 }, contactRadius)) return 0;
  const radius = contactRadius + PLAYER_RADIUS;
  let first = Infinity;
  for (const y of [PLAYER_RADIUS, 1.45]) {
    const time = segmentSphereTime(a, b, { x: 0, y, z: 0 }, radius);
    if (time !== null) first = Math.min(first, time);
  }
  const dx = b.x - a.x, dz = b.z - a.z;
  const quadratic = dx * dx + dz * dz;
  const linear = a.x * dx + a.z * dz;
  const constant = a.x * a.x + a.z * a.z - radius * radius;
  const discriminant = linear * linear - quadratic * constant;
  if (quadratic > 1e-16 && discriminant >= 0) {
    for (const sign of [-1, 1]) {
      const t = (-linear + sign * Math.sqrt(discriminant)) / quadratic;
      const y = a.y + (b.y - a.y) * t;
      if (t >= 0 && t <= 1 && y >= PLAYER_RADIUS && y <= 1.45) first = Math.min(first, t);
    }
  }
  return Number.isFinite(first) ? first : null;
}
