import { literal, number, object } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
import { replayBoolean, replayPoint } from './replayDecode.ts';
export interface ReplayPlayerState {
    readonly position: Point3;
    readonly yaw: number;
    readonly animation: 'idle' | 'walk' | 'jump' | 'aim';
    readonly animationTime: number;
    readonly aimWeight: number;
    readonly alive: boolean;
}
export function decodeReplayPlayerState(value: unknown, path = '$'): ReplayPlayerState { const v = object(value, path); return { position: replayPoint(v.position, path + '.position'), yaw: number(v.yaw, path + '.yaw', -1000000, 1000000), animation: literal(v.animation, ['idle', 'walk', 'jump', 'aim'], path + '.animation'), animationTime: number(v.animationTime, path + '.animationTime', 0, 1000000), aimWeight: number(v.aimWeight, path + '.aimWeight', 0, 1), alive: replayBoolean(v.alive, path + '.alive') }; }
