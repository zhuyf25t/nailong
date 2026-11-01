import rawMaps from '../../../../shared/worlds/templates.json';
import rawClear from '../../../../shared/missions/clear-drones.json';
import rawBeacon from '../../../../shared/missions/forest-beacon.json';
import { array } from '../../system/api/decode.ts';
import { decodeMapVersion } from '../worlds/MapVersion.ts';
import type { MapVersionId } from '../worlds/MapVersionId.ts';
import { decodeMissionDefinition } from './MissionDefinition.ts';
import type { MissionId } from './MissionId.ts';
import type { ToolKind } from './ToolKind.ts';
import { decodeRunSetup, type RunSetup } from './RunSetup.ts';
export const builtinMaps = array(rawMaps, decodeMapVersion, '$.builtinMaps');
export const builtinMissions = [decodeMissionDefinition(rawClear), decodeMissionDefinition(rawBeacon)];
/** Offline practice uses exactly the same decoded world/mission JSON as the server. */
export function getBuiltinSetup(missionId: MissionId | string, tool: ToolKind = 'none', mapVersionId?: MapVersionId): RunSetup {
 const mission = builtinMissions.find((item) => item.id === missionId);
 if (!mission) throw new Error('Unknown builtin mission: ' + missionId);
 const map = builtinMaps.find((item) => item.id === (mapVersionId ?? mission.mapVersionId));
 if (!map) throw new Error('Unknown builtin map version; custom worlds must be loaded explicitly');
 const objective = mission.objective.kind === 'activate_extract' ? { kind: 'activate_extract', beaconId: map.world.beacon.id, extractionId: map.world.extraction.id } : mission.objective;
 return decodeRunSetup({ mission: { ...mission, mapVersionId: map.id, objective }, world: map.world, mapVersionId: map.id, loadout: { tool }, seed: 104729, assetVersion: 'garden-v1' });
}
