import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';

export type DroneState = 'scanning' | 'alert' | 'locked' | 'destroyed';
export type DronePoint = { x: number; y: number; z: number };
export type DroneLineOfSight = (from: DronePoint, to: DronePoint) => boolean;

export const DRONE_MAX_HP = DEFAULT_DRONE_RULES.maxHp;
export const DRONE_RANGE = DEFAULT_DRONE_RULES.scanRange;
export const DRONE_FOV = DEFAULT_DRONE_RULES.scanFovDegrees * Math.PI / 180;
export const DRONE_SCAN_SPEED = DEFAULT_DRONE_RULES.scanSpeed;
export const DRONE_ALERT_SPEED = DEFAULT_DRONE_RULES.alertSpeed;
export const DRONE_ALERT_SECONDS = DEFAULT_DRONE_RULES.alertSeconds;
export const DRONE_HIT_SCAN_SECONDS = DEFAULT_DRONE_RULES.hitScanSeconds;
export const DRONE_LOST_SIGHT_SECONDS = DEFAULT_DRONE_RULES.lostSightSeconds;

const MAX_SUBSTEP = 1 / 120;
const EPSILON = 1e-9;
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export type DroneBrain = {
  state: DroneState;
  hp: number;
  readonly maxHp: number;
  readonly rules: DroneRules;
  /** Three.js convention: zero points toward +Z; positive turns toward +X. */
  yaw: number;
  turnDirection: -1 | 1;
  directionRemaining: number;
  alertRemaining: number;
  acquireDelay: number;
  lostSightTime: number;
  /** Updated only with a visible observation; a hidden player is never tracked. */
  lastSeen: DronePoint | null;
  readonly initialYaw: number;
  readonly initialTurnDirection: -1 | 1;
  readonly initialDirectionDuration: number;
  readonly rng: () => number;
};

export type DroneObservation = {
  position: DronePoint;
  player: DronePoint;
  /** Supply terrain/obstacle visibility here; the brain never imports rendering code. */
  hasLineOfSight?: DroneLineOfSight;
};

function randomUnit(rng: () => number) {
  const value = rng();
  return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : 0.5;
}

/** Horizontal cone test. Vertical occlusion belongs to the caller's line-of-sight test. */
export function canDroneDetect(position: DronePoint, yaw: number, player: DronePoint, hasLineOfSight?: DroneLineOfSight, rules: DroneRules = DEFAULT_DRONE_RULES): boolean {
  const dx = player.x - position.x;
  const dz = player.z - position.z;
  const distanceSquared = dx * dx + dz * dz;
  if (!Number.isFinite(distanceSquared) || !Number.isFinite(yaw) || distanceSquared > rules.scanRange * rules.scanRange + EPSILON) return false;
  if (distanceSquared > EPSILON && Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)) > rules.scanFovDegrees * Math.PI / 360 + EPSILON) return false;
  return hasLineOfSight?.(position, player) ?? true;
}

export function createDroneBrain(options: { yaw?: number; rng?: () => number; rules?: DroneRules } = {}): DroneBrain {
  const rules = options.rules ?? DEFAULT_DRONE_RULES;
  const rng = options.rng ?? Math.random;
  const yaw = Number.isFinite(options.yaw) ? wrapAngle(options.yaw!) : 0;
  const turnDirection = randomUnit(rng) < 0.5 ? -1 : 1;
  const directionDuration = 1.5 + randomUnit(rng) * 2.5;
  return {
    state: 'scanning', hp: rules.maxHp, maxHp: rules.maxHp, rules, yaw,
    turnDirection, directionRemaining: directionDuration,
    alertRemaining: 0, acquireDelay: 0, lostSightTime: 0, lastSeen: null,
    initialYaw: yaw, initialTurnDirection: turnDirection, initialDirectionDuration: directionDuration, rng,
  };
}

function startAlert(brain: DroneBrain, minimumScanTime: number) {
  brain.state = 'alert';
  brain.alertRemaining = brain.rules.alertSeconds;
  brain.acquireDelay = minimumScanTime;
  brain.lostSightTime = 0;
}

function chooseScanDirection(brain: DroneBrain) {
  brain.turnDirection = randomUnit(brain.rng) < 0.5 ? -1 : 1;
  brain.directionRemaining = 1.5 + randomUnit(brain.rng) * 2.5;
}

function lockPlayer(brain: DroneBrain, observation: DroneObservation) {
  brain.state = 'locked';
  brain.yaw = Math.atan2(observation.player.x - observation.position.x, observation.player.z - observation.position.z);
  brain.alertRemaining = 0;
  brain.acquireDelay = 0;
  brain.lostSightTime = 0;
  brain.lastSeen = { ...observation.player };
}

/**
 * Mutates one small state object. Call only while gameplay is active.
 * Substeps adapt to the configured cone and angular speed, so a fast scan
 * cannot skip a visible player between samples during a long rendered frame.
 */
export function updateDroneBrain(brain: DroneBrain, dt: number, observation: DroneObservation): DroneBrain {
  if (brain.state === 'destroyed' || !Number.isFinite(dt) || dt <= 0) return brain;
  let remaining = dt;
  while (remaining > EPSILON) {
    const angularSpeed = brain.state === 'alert' ? brain.rules.alertSpeed : brain.rules.scanSpeed;
    const angularStep = angularSpeed > 0 ? brain.rules.scanFovDegrees * Math.PI / 180 / (angularSpeed * 4) : MAX_SUBSTEP;
    let step = Math.min(remaining, MAX_SUBSTEP, angularStep);
    if (brain.state === 'scanning') step = Math.min(step, brain.directionRemaining);
    if (brain.state === 'alert') {
      step = Math.min(step, brain.alertRemaining);
      if (brain.acquireDelay > EPSILON) step = Math.min(step, brain.acquireDelay);
    }
    if (brain.state === 'locked') {
      const playerYaw = Math.atan2(observation.player.x - observation.position.x, observation.player.z - observation.position.z);
      if (canDroneDetect(observation.position, playerYaw, observation.player, observation.hasLineOfSight, brain.rules)) {
        brain.yaw = playerYaw;
        brain.lostSightTime = 0;
        if (brain.lastSeen) Object.assign(brain.lastSeen, observation.player);
        else brain.lastSeen = { ...observation.player };
      } else {
        // Keep the last visible bearing rather than tracking an occluded player.
        brain.lostSightTime += step;
        if (brain.lostSightTime + EPSILON >= brain.rules.lostSightSeconds) startAlert(brain, Math.min(0.2, brain.rules.alertSeconds));
      }
    } else {
      // Test before and after the turn, including the cone visible at frame start.
      if (brain.acquireDelay <= EPSILON && canDroneDetect(observation.position, brain.yaw, observation.player, observation.hasLineOfSight, brain.rules)) {
        lockPlayer(brain, observation);
      } else {
        const alert = brain.state === 'alert';
        brain.yaw = wrapAngle(brain.yaw + brain.turnDirection * angularSpeed * step);
        if (alert) {
          brain.alertRemaining = Math.max(0, brain.alertRemaining - step);
          brain.acquireDelay = Math.max(0, brain.acquireDelay - step);
        } else {
          brain.directionRemaining = Math.max(0, brain.directionRemaining - step);
        }
        if (brain.acquireDelay <= EPSILON && canDroneDetect(observation.position, brain.yaw, observation.player, observation.hasLineOfSight, brain.rules)) {
          lockPlayer(brain, observation);
        } else if (alert && brain.alertRemaining <= EPSILON) {
          brain.state = 'scanning';
          brain.acquireDelay = 0;
          chooseScanDirection(brain);
        } else if (!alert && brain.directionRemaining <= EPSILON) {
          chooseScanDirection(brain);
        }
      }
    }
    remaining -= step;
  }
  return brain;
}

/** A confirmed visual lock survives damage. An unaware or occluded drone spins
 * to find the attacker; shooting cannot permanently stun an active pursuer. */
export function hitDrone(brain: DroneBrain, hasVisibleTarget = brain.state === 'locked' && brain.lostSightTime === 0): { hit: boolean; destroyed: boolean; hp: number } {
  if (brain.state === 'destroyed') return { hit: false, destroyed: true, hp: 0 };
  brain.hp = Math.max(0, brain.hp - 1);
  if (brain.hp === 0) {
    brain.state = 'destroyed';
    brain.alertRemaining = 0; brain.acquireDelay = 0; brain.lostSightTime = 0;
  } else if (brain.state !== 'locked' || !hasVisibleTarget) {
    startAlert(brain, brain.rules.hitScanSeconds);
  }
  return { hit: true, destroyed: brain.hp === 0, hp: brain.hp };
}

export function resetDroneBrain(brain: DroneBrain, yaw = brain.initialYaw): DroneBrain {
  brain.state = 'scanning'; brain.hp = brain.maxHp;
  brain.yaw = Number.isFinite(yaw) ? wrapAngle(yaw) : brain.initialYaw;
  brain.turnDirection = brain.initialTurnDirection;
  brain.directionRemaining = brain.initialDirectionDuration;
  brain.alertRemaining = 0; brain.acquireDelay = 0; brain.lostSightTime = 0;
  brain.lastSeen = null;
  return brain;
}
