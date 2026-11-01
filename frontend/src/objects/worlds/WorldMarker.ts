import { object, number } from '../../system/api/decode.ts';
import { decodeWorldPoint, type WorldPoint } from './WorldPoint.ts';
import { decodeWorldEntityId } from './WorldEntityId.ts';
export interface WorldMarker extends WorldPoint { readonly id: string; readonly radius: number; }
export function decodeWorldMarker(value: unknown, path = '$'): WorldMarker {
 const v = object(value, path); return { ...decodeWorldPoint(v, path), id: decodeWorldEntityId(v.id, path + '.id'), radius: number(v.radius, path + '.radius', 0.6, 4) };
}
