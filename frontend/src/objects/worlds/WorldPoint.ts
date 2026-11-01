import { object, number } from '../../system/api/decode.ts';
export interface WorldPoint { readonly x: number; readonly z: number; }
export function decodeWorldPoint(value: unknown, path = '$'): WorldPoint {
 const v = object(value, path); return { x: number(v.x, path + '.x', -48, 48), z: number(v.z, path + '.z', -48, 48) };
}
