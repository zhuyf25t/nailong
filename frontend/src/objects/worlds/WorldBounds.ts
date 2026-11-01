import { object, number } from '../../system/api/decode.ts';
export interface WorldBounds { readonly halfSize: number; }
export function decodeWorldBounds(value: unknown, path = '$'): WorldBounds {
 const v = object(value, path); return { halfSize: number(v.halfSize, path + '.halfSize', 12, 48) };
}
