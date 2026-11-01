import type { DroneRules } from '../../../../objects/training/DroneRules';
import type { WeaponConfig } from '../../../../objects/training/WeaponConfig';

/** Offline practice defaults. Formal runs always supply their frozen server config. */
export const DEFAULT_DRONE_RULES: DroneRules = {
  maxHp: 3,
  scanRange: 12,
  scanFovDegrees: 90,
  scanSpeed: 0.45,
  alertSpeed: Math.PI * 2 * 1.6,
  alertSeconds: 4,
  hitScanSeconds: 0.8,
  lostSightSeconds: 1,
  patrolSpeed: 1.1,
  chaseSpeed: 7.2,
  patrolRadius: 2.1,
  contactRadius: 0.65,
  spawnGraceSeconds: 2.5,
  spawns: [
    { x: -6, z: -5, yaw: 1.6 },
    { x: 6, z: -9, yaw: -1.3 },
    { x: 0, z: -17, yaw: 2.2 },
    { x: -11, z: -15, yaw: -0.4 },
  ],
};

export const DEFAULT_WEAPON_CONFIG: WeaponConfig = {
  fireIntervalMs: 250,
  projectileSpeed: 30,
  projectileRange: 40,
};

export type { DroneRules, WeaponConfig };
