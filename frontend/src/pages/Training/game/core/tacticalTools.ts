import { moveWithCollisions, type Obstacle } from './movement.ts';
import type { DronePoint, DroneLineOfSight } from './droneBrain.ts';
import type { ToolKind } from '../../../../objects/training/ToolKind.ts';

export const CURTAIN_RADIUS = 3;
export const CURTAIN_HEIGHT = 4;
export const CURTAIN_SECONDS = 4;
export const DECOY_RADIUS = 8;
export const DECOY_SECONDS = 5;
export const PULSE_RADIUS = 5;
export const PULSE_STUN_SECONDS = .65;
export const PULSE_PUSH_DISTANCE = 2.4;

export interface TacticalEffect {
  id: string;
  kind: Exclude<ToolKind, 'none'>;
  /** Floor-level world position. Curtain occupies [y, y + height]. */
  position: DronePoint;
  remaining: number;
  duration: number;
  radius: number;
  height: number;
}

/** Exact finite-cylinder intersection; this is perception only, never physics. */
export function curtainBlocksSegment(effect: TacticalEffect, from: DronePoint, to: DronePoint): boolean {
  if (effect.kind !== 'curtain' || effect.remaining <= 0) return false;
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const ox = from.x - effect.position.x, oz = from.z - effect.position.z;
  const a = dx * dx + dz * dz, c = ox * ox + oz * oz - effect.radius ** 2;
  let enter = 0, exit = 1;
  if (a < 1e-12) { if (c > 0) return false; }
  else {
    const b = ox * dx + oz * dz, discriminant = b * b - a * c;
    if (discriminant < 0) return false;
    const root = Math.sqrt(discriminant);
    enter = Math.max(enter, (-b - root) / a); exit = Math.min(exit, (-b + root) / a);
  }
  const bottom = effect.position.y, top = bottom + effect.height;
  if (Math.abs(dy) < 1e-12) { if (from.y < bottom || from.y > top) return false; }
  else {
    const one = (bottom - from.y) / dy, two = (top - from.y) / dy;
    enter = Math.max(enter, Math.min(one, two)); exit = Math.min(exit, Math.max(one, two));
  }
  return enter <= exit;
}

/** Pure bounded tool state. Pausing means not calling advance. One charge total. */
export function createTacticalTools(sampleHeight: (x: number, z: number) => number,
  obstacles: readonly Obstacle[], halfSize = 38) {
  let used = false;
  const active: TacticalEffect[] = [];
  const stuns = new Map<string, number>();
  return {
    use(kind: ToolKind, player: DronePoint, facing: number): TacticalEffect | null {
      if (used || kind === 'none' || !['curtain', 'decoy', 'pulse'].includes(kind) ||
        ![player.x, player.y, player.z, facing].every(Number.isFinite)) return null;
      // Devices cannot be thrown through the same closed gates/boxes used by AI.
      const distance = kind === 'decoy' ? 3 : 0;
      const ground = moveWithCollisions(player, { x: Math.sin(facing) * distance, z: Math.cos(facing) * distance }, obstacles, halfSize, .16);
      const floor = sampleHeight(ground.x, ground.z);
      if (!Number.isFinite(floor)) return null;
      const duration = kind === 'curtain' ? CURTAIN_SECONDS : kind === 'decoy' ? DECOY_SECONDS : .6;
      const effect: TacticalEffect = { id: 'tool-1', kind, position: { ...ground, y: floor + .05 },
        remaining: duration, duration, radius: kind === 'curtain' ? CURTAIN_RADIUS : kind === 'decoy' ? DECOY_RADIUS : PULSE_RADIUS,
        height: kind === 'curtain' ? CURTAIN_HEIGHT : 0 };
      used = true; active.push(effect);
      return { ...effect, position: { ...effect.position } };
    },
    advance(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      for (const effect of active) effect.remaining = Math.max(0, effect.remaining - dt);
      for (let i = active.length - 1; i >= 0; i--) if (active[i].remaining === 0) active.splice(i, 1);
      for (const [id, time] of stuns) { if (time <= dt) stuns.delete(id); else stuns.set(id, time - dt); }
    },
    blocksSight(from: DronePoint, to: DronePoint) { return active.some(effect => curtainBlocksSegment(effect, from, to)); },
    decoyAt(from: DronePoint, lineOfSight: DroneLineOfSight): DronePoint | null {
      const decoy = active.find(effect => effect.kind === 'decoy');
      if (!decoy) return null;
      const point = { ...decoy.position, y: decoy.position.y + .6 };
      return Math.hypot(point.x - from.x, point.z - from.z) <= decoy.radius && lineOfSight(from, point) ? point : null;
    },
    stun(id: string, seconds = PULSE_STUN_SECONDS) { if (Number.isFinite(seconds) && seconds > 0) stuns.set(id, Math.max(stuns.get(id) ?? 0, seconds)); },
    stunRemaining(id: string) { return stuns.get(id) ?? 0; },
    snapshot() { return { used, active: active.map(effect => ({ ...effect, position: { ...effect.position } })), stunnedDroneIds: [...stuns.keys()] }; },
    reset() { used = false; active.length = 0; stuns.clear(); },
  };
}
