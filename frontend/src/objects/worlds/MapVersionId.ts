import { uuid } from '../../system/api/decode.ts';
declare const brand: unique symbol;
export type MapVersionId = string & { readonly [brand]: 'MapVersionId' };
export function parseMapVersionId(value: unknown, path = '$'): MapVersionId { return uuid(value, path) as MapVersionId; }
