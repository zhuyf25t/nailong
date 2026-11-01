import { object, array } from '../../system/api/decode.ts';
import { decodeWorldSpawn, type WorldSpawn } from './WorldSpawn.ts';
import { decodeWorldPoint, type WorldPoint } from './WorldPoint.ts';
import { decodeWorldEntityId } from './WorldEntityId.ts';
export interface WorldDrone extends WorldSpawn { readonly id: string; readonly patrol: readonly WorldPoint[]; }
export function decodeWorldDrone(value: unknown, path = '$'): WorldDrone {
 const v = object(value, path); return { ...decodeWorldSpawn(v, path), id: decodeWorldEntityId(v.id, path + '.id'), patrol: array(v.patrol, decodeWorldPoint, path + '.patrol', 0, 12) };
}
