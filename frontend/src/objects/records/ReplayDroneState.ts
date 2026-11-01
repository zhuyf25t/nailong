import { integer, literal, number, object } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
import { replayBoolean, replayId, replayPoint } from './replayDecode.ts';
export interface ReplayDroneState {
    readonly id: string;
    readonly position: Point3;
    readonly yaw: number;
    readonly hp: number;
    readonly state: 'scanning' | 'alert' | 'locked' | 'destroyed';
    readonly flight: 'taking-off' | 'cruising' | 'diving';
    readonly stunned?: boolean;
}
export function decodeReplayDroneState(value: unknown, path = '$'): ReplayDroneState { const v = object(value, path); return { id: replayId(v.id, path + '.id'), position: replayPoint(v.position, path + '.position'), yaw: number(v.yaw, path + '.yaw', -1000000, 1000000), hp: integer(v.hp, path + '.hp', 0, 20), state: literal(v.state, ['scanning', 'alert', 'locked', 'destroyed'], path + '.state'), flight: literal(v.flight, ['taking-off', 'cruising', 'diving'], path + '.flight'), stunned: v.stunned == null ? false : replayBoolean(v.stunned, path + '.stunned') }; }
