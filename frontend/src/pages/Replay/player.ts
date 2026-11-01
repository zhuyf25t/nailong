import type { ReplayPayload } from '../../objects/records/ReplayPayload.ts';
import type { ReplayFrame } from '../../objects/records/ReplayFrame.ts';
import type { RunEvent } from '../../objects/records/RunEvent.ts';
import type { ReplayDroneState } from '../../objects/records/ReplayDroneState.ts';
import { CURTAIN_SECONDS, DECOY_SECONDS } from '../Training/game/core/tacticalTools.ts';

type Point = { x: number; y: number; z: number };
const lerp = (a: number, b: number, weight: number) => a + (b - a) * weight;
const point = (a: Point, b: Point, weight: number): Point => ({ x: lerp(a.x, b.x, weight), y: lerp(a.y, b.y, weight), z: lerp(a.z, b.z, weight) });

/** Recorded stun is discrete: never infer it from interpolated distance to a pulse. */
export function replayScanRange(drone: ReplayDroneState | undefined, configuredRange: number, visible: boolean): number {
  return visible && drone && drone.hp > 0 && drone.state !== 'destroyed' && drone.flight !== 'taking-off' && !drone.stunned ? configuredRange : 0;
}

export function clampReplayTime(replay: ReplayPayload, time: number): number {
  const { fromMs, toMs } = replay.manifest.coverage;
  return Math.min(toMs, Math.max(fromMs, Number.isFinite(time) ? time : fromMs));
}

/** Absolute recorded times survive clipping. No simulator, callbacks, network, or mutable cursor. */
export function sampleReplay(replay: ReplayPayload, requestedTime: number): ReplayFrame | null {
  if (replay.frames.length === 0) return null;
  const time = clampReplayTime(replay, requestedTime);
  let lower = 0, upper = replay.frames.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (replay.frames[middle].tMs <= time) lower = middle; else upper = middle - 1;
  }
  const head = replay.frames[lower];
  const next = replay.frames[Math.min(lower + 1, replay.frames.length - 1)];
  const weight = next.tMs > head.tMs ? Math.min(1, Math.max(0, (time - head.tMs) / (next.tMs - head.tMs))) : 0;
  const pulse = replay.events.find(event => event.seq > head.throughEventSeq && event.kind === 'tool' && event.detail === 'pulse' && event.tMs > head.tMs && event.tMs <= next.tMs);
  // Explicit copying keeps all nested state separate from the immutable recording.
  const drones = head.drones.map(drone => {
    const after = next.drones.find(candidate => candidate.id === drone.id);
    // A pulse pushes instantaneously. Its affected set comes from recorded stun,
    // never a new range/collision calculation. Without a pre-impact sample we hold
    // the last known pose until the event, rather than leaking its future push.
    const pushedAt = pulse && after?.stunned && !drone.stunned ? pulse.tMs : null;
    const pushed = pushedAt !== null && time >= pushedAt;
    const position = pushedAt !== null ? { ...(pushed ? after!.position : drone.position) }
      : after ? point(drone.position, after.position, weight) : { ...drone.position };
    return { ...drone, position, stunned: pushed ? after!.stunned : drone.stunned,
      yaw: after ? lerp(drone.yaw, after.yaw, weight) : drone.yaw };
  });
  const projectiles = head.projectiles.map(projectile => {
    const after = next.projectiles.find(candidate => candidate.id === projectile.id);
    return { ...projectile, position: after ? point(projectile.position, after.position, weight) : { ...projectile.position }, direction: { ...projectile.direction } };
  });
  const tools = head.tools.map(tool => ({ ...tool, position: { ...tool.position }, remainingMs: Math.max(0, tool.remainingMs - (time - head.tMs)) }));
  const world = { ...head.world, openGateIds: [...head.world.openGateIds] };
  let alive = head.player.alive;
  let throughEventSeq = head.throughEventSeq;
  for (const event of replay.events) {
    if (event.tMs > time) break;
    if (event.seq <= head.throughEventSeq) continue;
    throughEventSeq = event.seq;
    if (event.kind === 'hit') {
      const drone = drones.find(candidate => candidate.id === event.targetId);
      if (drone && event.value !== null) drone.hp = Math.max(0, event.value);
      const index = projectiles.findIndex(candidate => candidate.id === event.actorId);
      if (index >= 0) projectiles.splice(index, 1);
    }
    if (event.kind === 'destroyed' || event.kind === 'contact') {
      const drone = drones.find(candidate => candidate.id === (event.kind === 'contact' ? event.actorId : event.targetId));
      if (drone) { drone.hp = 0; drone.state = 'destroyed'; }
      if (event.kind === 'contact') alive = false;
    }
    if (event.kind === 'drone-state') {
      const drone = drones.find(candidate => candidate.id === event.actorId);
      const mode = event.detail?.split(':')[0];
      if (drone && (mode === 'scanning' || mode === 'alert' || mode === 'locked')) drone.state = mode;
    }
    if (event.kind === 'gate' && event.targetId && !world.openGateIds.includes(event.targetId)) world.openGateIds.push(event.targetId);
    if (event.kind === 'beacon') world.beaconActivated = true;
    if (event.kind === 'extract') world.extracted = true;
    if (event.kind === 'tool' && event.targetId && event.position && event.value !== null && !tools.some(tool => tool.id === event.targetId)) {
      const kind = event.detail;
      if (kind === 'curtain' || kind === 'decoy' || kind === 'pulse') {
        const durationMs = (kind === 'curtain' ? CURTAIN_SECONDS : kind === 'decoy' ? DECOY_SECONDS : .6) * 1000;
        const remainingMs = Math.max(0, durationMs - (time - event.tMs));
        tools.push({ id: event.targetId, kind, position: { ...event.position }, radius: event.value, remainingMs, active: remainingMs > 0 });
      }
    }
    if (event.kind === 'shot' && event.targetId && event.position && !projectiles.some(candidate => candidate.id === event.targetId)) {
      const after = next.projectiles.find(candidate => candidate.id === event.targetId);
      if (after) {
        const flightWeight = next.tMs > event.tMs ? Math.min(1, Math.max(0, (time - event.tMs) / (next.tMs - event.tMs))) : 0;
        projectiles.push({ ...after, position: point(event.position, after.position, flightWeight), direction: { ...after.direction } });
      }
    }
  }
  return {
    ...head, tMs: time, throughEventSeq, scoreElapsedMs: Math.round(lerp(head.scoreElapsedMs, next.scoreElapsedMs, weight)),
    player: { ...head.player, alive, position: point(head.player.position, next.player.position, weight),
      yaw: lerp(head.player.yaw, next.player.yaw, weight), animationTime: lerp(head.player.animationTime, next.player.animationTime, weight),
      aimWeight: lerp(head.player.aimWeight, next.player.aimWeight, weight) },
    drones, projectiles, tools, world,
    camera: { position: point(head.camera.position, next.camera.position, weight), target: point(head.camera.target, next.camera.target, weight), fov: lerp(head.camera.fov, next.camera.fov, weight) },
  };
}

export function eventJumpTime(replay: ReplayPayload, event: RunEvent): number {
  return clampReplayTime(replay, event.tMs - 2000);
}

export function replayTimeLabel(timeMs: number): string {
  const seconds = Math.max(0, timeMs) / 1000;
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`;
}

export function eventLabel(event: RunEvent): string {
  switch (event.kind) {
    case 'shot': return '发射脉冲';
    case 'hit': return '命中无人机';
    case 'drone-state': return event.detail === 'locked:saw-player' ? '被发现，开始追击' : event.detail === 'alert:hit-unaware' ? '无人机受击搜索' : event.detail === 'alert:lost-sight' ? '无人机丢失目标' : '无人机恢复扫描';
    case 'destroyed': return '击落无人机';
    case 'tool': return '使用战术道具';
    case 'beacon': return '信标已激活';
    case 'gate': return '捷径门已开启';
    case 'extract': return '到达撤离区';
    case 'contact': return '无人机接触自爆';
    case 'round-end': return event.detail === 'victory' ? '任务完成' : '本局结束';
  }
}
