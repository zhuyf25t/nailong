import { object, number, integer, array } from '../../system/api/decode.ts';
import { decodeDroneSpawn, type DroneSpawn } from './DroneSpawn.ts';
export interface DroneRules {
  readonly maxHp: number; readonly scanRange: number; readonly scanFovDegrees: number;
  readonly scanSpeed: number; readonly alertSpeed: number; readonly alertSeconds: number;
  readonly hitScanSeconds: number; readonly lostSightSeconds: number;
  readonly patrolSpeed: number; readonly chaseSpeed: number; readonly patrolRadius: number;
  readonly contactRadius: number; readonly spawnGraceSeconds: number;
  readonly spawns: readonly DroneSpawn[];
}
export function decodeDroneRules(value: unknown, path = '$'): DroneRules {
  const v = object(value, path);
  return {
    maxHp: integer(v.maxHp, `${path}.maxHp`, 1, 20),
    scanRange: number(v.scanRange, `${path}.scanRange`, 1, 100),
    scanFovDegrees: number(v.scanFovDegrees, `${path}.scanFovDegrees`, 10, 360),
    scanSpeed: number(v.scanSpeed, `${path}.scanSpeed`, 0, 100),
    alertSpeed: number(v.alertSpeed, `${path}.alertSpeed`, 0, 100),
    alertSeconds: number(v.alertSeconds, `${path}.alertSeconds`, 0, 60),
    hitScanSeconds: number(v.hitScanSeconds, `${path}.hitScanSeconds`, 0, 60),
    lostSightSeconds: number(v.lostSightSeconds, `${path}.lostSightSeconds`, 0, 60),
    patrolSpeed: number(v.patrolSpeed, `${path}.patrolSpeed`, 0, 20),
    chaseSpeed: number(v.chaseSpeed, `${path}.chaseSpeed`, 0, 20),
    patrolRadius: number(v.patrolRadius, `${path}.patrolRadius`, 0, 50),
    contactRadius: number(v.contactRadius, `${path}.contactRadius`, 0.1, 5),
    spawnGraceSeconds: number(v.spawnGraceSeconds, `${path}.spawnGraceSeconds`, 0, 60),
    spawns: array(v.spawns, decodeDroneSpawn, `${path}.spawns`, 1, 32),
  };
}
