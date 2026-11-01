import { object, string, array, assert } from '../../system/api/decode.ts';
import { decodeTerrainConfig, type TerrainConfig } from '../training/TerrainConfig.ts';
import { decodeWorldBounds, type WorldBounds } from './WorldBounds.ts';
import { decodeWorldSpawn, type WorldSpawn } from './WorldSpawn.ts';
import { decodeWorldObject, type WorldObject } from './WorldObject.ts';
import { decodeWorldDrone, type WorldDrone } from './WorldDrone.ts';
import { decodeWorldMarker, type WorldMarker } from './WorldMarker.ts';
export interface WorldDefinition {
 readonly schemaVersion: 1; readonly title: string; readonly terrain: TerrainConfig;
 readonly bounds: WorldBounds; readonly spawn: WorldSpawn; readonly objects: readonly WorldObject[];
 readonly drones: readonly WorldDrone[]; readonly beacon: WorldMarker; readonly extraction: WorldMarker;
}
/** Structural boundary. Geometric/reachability validation is shared separately by the editor. */
export function decodeWorldDefinition(value: unknown, path = '$'): WorldDefinition {
 const v = object(value, path); assert(v.schemaVersion === 1, path + '.schemaVersion', 'world schema 1');
 const title = string(v.title, path + '.title', 1, 80); assert(title.trim().length > 0, path + '.title', 'nonblank title');
 return { schemaVersion: 1, title, terrain: decodeTerrainConfig(v.terrain, path + '.terrain'), bounds: decodeWorldBounds(v.bounds, path + '.bounds'),
 spawn: decodeWorldSpawn(v.spawn, path + '.spawn'), objects: array(v.objects, decodeWorldObject, path + '.objects', 0, 48),
 drones: array(v.drones, decodeWorldDrone, path + '.drones', 1, 8), beacon: decodeWorldMarker(v.beacon, path + '.beacon'), extraction: decodeWorldMarker(v.extraction, path + '.extraction') };
}
