import { array, integer, object } from '../../system/api/decode.ts';
import { decodeReplayPlayerState, type ReplayPlayerState } from './ReplayPlayerState.ts';
import { decodeReplayDroneState, type ReplayDroneState } from './ReplayDroneState.ts';
import { decodeReplayProjectileState, type ReplayProjectileState } from './ReplayProjectileState.ts';
import { decodeReplayToolState, type ReplayToolState } from './ReplayToolState.ts';
import { decodeReplayWorldState, type ReplayWorldState } from './ReplayWorldState.ts';
import { decodeReplayCameraState, type ReplayCameraState } from './ReplayCameraState.ts';
import { MAX_RECORDING_MS, uniqueIds } from './replayDecode.ts';
export interface ReplayFrame {
    readonly tMs: number;
    readonly scoreElapsedMs: number;
    readonly throughEventSeq: number;
    readonly player: ReplayPlayerState;
    readonly drones: readonly ReplayDroneState[];
    readonly projectiles: readonly ReplayProjectileState[];
    readonly tools: readonly ReplayToolState[];
    readonly world: ReplayWorldState;
    readonly camera: ReplayCameraState;
}
export type ReplayFrameInput = Omit<ReplayFrame, 'tMs' | 'scoreElapsedMs' | 'throughEventSeq'>;
export function decodeReplayFrame(value: unknown, path = '$'): ReplayFrame { const v = object(value, path), drones = array(v.drones, decodeReplayDroneState, path + '.drones', 0, 32), projectiles = array(v.projectiles, decodeReplayProjectileState, path + '.projectiles', 0, 64), tools = array(v.tools, decodeReplayToolState, path + '.tools', 0, 16); uniqueIds(drones, path + '.drones'); uniqueIds(projectiles, path + '.projectiles'); uniqueIds(tools, path + '.tools'); return { tMs: integer(v.tMs, path + '.tMs', 0, MAX_RECORDING_MS), scoreElapsedMs: integer(v.scoreElapsedMs, path + '.scoreElapsedMs', 0, 86400000), throughEventSeq: integer(v.throughEventSeq, path + '.throughEventSeq', -1, 10000000), player: decodeReplayPlayerState(v.player, path + '.player'), drones, projectiles, tools, world: decodeReplayWorldState(v.world, path + '.world'), camera: decodeReplayCameraState(v.camera, path + '.camera') }; }
