import { object } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
import { replayId, replayPoint } from './replayDecode.ts';
export interface ReplayProjectileState {
    readonly id: string;
    readonly position: Point3;
    readonly direction: Point3;
}
export function decodeReplayProjectileState(value: unknown, path = '$'): ReplayProjectileState { const v = object(value, path); return { id: replayId(v.id, path + '.id'), position: replayPoint(v.position, path + '.position'), direction: replayPoint(v.direction, path + '.direction') }; }
