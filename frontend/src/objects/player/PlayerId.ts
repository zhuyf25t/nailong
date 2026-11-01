import { uuid } from '../../system/api/decode.ts';
declare const playerIdBrand: unique symbol;
export type PlayerId = string & { readonly [playerIdBrand]: 'PlayerId' };
export function parsePlayerId(value: unknown, path = '$'): PlayerId {
  return uuid(value, path) as PlayerId;
}

