import { object, number } from '../../system/api/decode.ts';
export interface TerrainConfig {
  readonly hillHeight: number; readonly hillWidth: number;
  readonly hillX: number; readonly hillZ: number; readonly ripple: number;
}
export function decodeTerrainConfig(value: unknown, path = '$'): TerrainConfig {
  const v = object(value, path);
  return { hillHeight: number(v.hillHeight, `${path}.hillHeight`, 0, 4), hillWidth: number(v.hillWidth, `${path}.hillWidth`, 2.5, 9),
    hillX: number(v.hillX, `${path}.hillX`, -8, 8), hillZ: number(v.hillZ, `${path}.hillZ`, -8, 8),
    ripple: number(v.ripple, `${path}.ripple`, 0, 0.8) };
}

