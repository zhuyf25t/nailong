import { object, string } from '../../system/api/decode.ts';
import { parseTrainingConfigId, type TrainingConfigId } from './TrainingConfigId.ts';
import { decodeTerrainConfig, type TerrainConfig } from './TerrainConfig.ts';
import { decodeDroneRules, type DroneRules } from './DroneRules.ts';
import { decodeWeaponConfig, type WeaponConfig } from './WeaponConfig.ts';
export interface TrainingConfig {
  readonly id: TrainingConfigId; readonly version: string; readonly title: string;
  readonly terrain: TerrainConfig; readonly drones: DroneRules; readonly weapon: WeaponConfig;
}
export function decodeTrainingConfig(value: unknown, path = '$'): TrainingConfig {
  const v = object(value, path);
  return { id: parseTrainingConfigId(v.id, `${path}.id`), version: string(v.version, `${path}.version`, 1, 1000),
    title: string(v.title, `${path}.title`, 1, 1000), terrain: decodeTerrainConfig(v.terrain, `${path}.terrain`),
    drones: decodeDroneRules(v.drones, `${path}.drones`), weapon: decodeWeaponConfig(v.weapon, `${path}.weapon`) };
}

