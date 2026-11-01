import { object, number, integer } from '../../system/api/decode.ts';
export interface WeaponConfig { readonly fireIntervalMs: number; readonly projectileSpeed: number; readonly projectileRange: number }
export function decodeWeaponConfig(value: unknown, path = '$'): WeaponConfig {
  const v = object(value, path);
  return { fireIntervalMs: integer(v.fireIntervalMs, `${path}.fireIntervalMs`, 100, 5000),
    projectileSpeed: number(v.projectileSpeed, `${path}.projectileSpeed`, 1, 100),
    projectileRange: number(v.projectileRange, `${path}.projectileRange`, 1, 100) };
}
