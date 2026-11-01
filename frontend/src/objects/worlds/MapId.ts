import { uuid } from '../../system/api/decode.ts';
declare const brand: unique symbol;
export type MapId = string & { readonly [brand]: 'MapId' };
export function parseMapId(value: unknown, path = '$'): MapId { return uuid(value, path) as MapId; }
