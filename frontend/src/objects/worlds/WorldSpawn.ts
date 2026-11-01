import { object, number } from '../../system/api/decode.ts';
import { decodeWorldPoint, type WorldPoint } from './WorldPoint.ts';
export interface WorldSpawn extends WorldPoint { readonly yaw: number; }
export function decodeWorldSpawn(value: unknown, path = '$'): WorldSpawn {
 const v = object(value, path); return { ...decodeWorldPoint(v, path), yaw: number(v.yaw, path + '.yaw') };
}
