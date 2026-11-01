import { number, object } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
import { replayPoint } from './replayDecode.ts';
export interface ReplayCameraState {
    readonly position: Point3;
    readonly target: Point3;
    readonly fov: number;
}
export function decodeReplayCameraState(value: unknown, path = '$'): ReplayCameraState { const v = object(value, path); return { position: replayPoint(v.position, path + '.position'), target: replayPoint(v.target, path + '.target'), fov: number(v.fov, path + '.fov', 10, 120) }; }
