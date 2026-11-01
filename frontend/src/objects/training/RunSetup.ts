import { object, integer, literal, assert } from '../../system/api/decode.ts';
import { decodeMissionDefinition, type MissionDefinition } from './MissionDefinition.ts';
import { decodeWorldDefinition, type WorldDefinition } from '../worlds/WorldDefinition.ts';
import { parseMapVersionId, type MapVersionId } from '../worlds/MapVersionId.ts';
import { decodeLoadout, type Loadout } from './Loadout.ts';
export interface RunSetup { readonly mission: MissionDefinition; readonly world: WorldDefinition; readonly mapVersionId: MapVersionId; readonly loadout: Loadout; readonly seed: number; readonly assetVersion: 'garden-v1'; }
export function decodeRunSetup(value: unknown, path = '$'): RunSetup {
 const v = object(value, path), mission = decodeMissionDefinition(v.mission, path + '.mission'), loadout = decodeLoadout(v.loadout, path + '.loadout');
 assert(mission.allowedTools.includes(loadout.tool), path + '.loadout.tool', 'tool allowed by mission');
 const world = decodeWorldDefinition(v.world, path + '.world');
 const mapVersionId = parseMapVersionId(v.mapVersionId, path + '.mapVersionId');
 assert(mission.mapVersionId === mapVersionId, path + '.mapVersionId', 'mission and setup reference the same frozen map version');
 assert(mission.objective.kind !== 'activate_extract' || (mission.objective.beaconId === world.beacon.id && mission.objective.extractionId === world.extraction.id), path + '.mission.objective', 'objective references frozen world markers');
 return { mission, world, mapVersionId, loadout, seed: integer(v.seed, path + '.seed', 0, 2147483647), assetVersion: literal(v.assetVersion, ['garden-v1'], path + '.assetVersion') };
}
