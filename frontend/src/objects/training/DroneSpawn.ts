import { object, number } from '../../system/api/decode.ts';
export interface DroneSpawn { readonly x: number; readonly z: number; readonly yaw: number }
export function decodeDroneSpawn(value: unknown, path = '$'): DroneSpawn {
  const v = object(value, path);
  return { x: number(v.x, `${path}.x`, -80, 80), z: number(v.z, `${path}.z`, -80, 80), yaw: number(v.yaw, `${path}.yaw`) };
}
