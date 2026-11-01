import { string, assert } from '../../system/api/decode.ts';
declare const brand: unique symbol;
export type MissionId = string & { readonly [brand]: 'MissionId' };
export function parseMissionId(value: unknown, path = '$'): MissionId {
 const id = string(value, path, 1, 64); assert(/^[a-z][a-z0-9-]{0,63}$/.test(id), path, 'lowercase mission slug'); return id as MissionId;
}
