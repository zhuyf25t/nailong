import { uuid } from '../../system/api/decode.ts';
declare const runIdBrand: unique symbol;
export type RunId = string & { readonly [runIdBrand]: 'RunId' };
export function parseRunId(value: unknown, path = '$'): RunId {
  return uuid(value, path) as RunId;
}

