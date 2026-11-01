import { integer, literal, number, object } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
import { MAX_RECORDING_MS, replayBoolean, replayId, replayPoint } from './replayDecode.ts';
export interface ReplayToolState {
    readonly id: string;
    readonly kind: 'curtain' | 'decoy' | 'pulse';
    readonly position: Point3;
    readonly radius: number;
    readonly remainingMs: number;
    readonly active: boolean;
}
export function decodeReplayToolState(value: unknown, path = '$'): ReplayToolState { const v = object(value, path); return { id: replayId(v.id, path + '.id'), kind: literal(v.kind, ['curtain', 'decoy', 'pulse'], path + '.kind'), position: replayPoint(v.position, path + '.position'), radius: number(v.radius, path + '.radius', 0, 100), remainingMs: integer(v.remainingMs, path + '.remainingMs', 0, MAX_RECORDING_MS), active: replayBoolean(v.active, path + '.active') }; }
