import { object, number } from '../../system/api/decode.ts';
export interface Point3 { readonly x: number; readonly y: number; readonly z: number }
export function decodePoint3(value: unknown, path = '$'): Point3 {
  const v = object(value, path);
  return { x: number(v.x, `${path}.x`), y: number(v.y, `${path}.y`), z: number(v.z, `${path}.z`) };
}

