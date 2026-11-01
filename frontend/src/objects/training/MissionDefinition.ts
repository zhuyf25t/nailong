import { object, string, array, assert } from '../../system/api/decode.ts';
import { parseMissionId, type MissionId } from './MissionId.ts';
import { decodeMissionObjective, type MissionObjective } from './MissionObjective.ts';
import { decodeToolKind, type ToolKind } from './ToolKind.ts';
import { parseMapVersionId, type MapVersionId } from '../worlds/MapVersionId.ts';
export interface MissionDefinition {
 readonly id: MissionId; readonly version: string; readonly title: string; readonly description: string;
 readonly objective: MissionObjective; readonly mapVersionId: MapVersionId; readonly allowedTools: readonly ToolKind[]; readonly configVersion: string;
}
export function decodeMissionDefinition(value: unknown, path = '$'): MissionDefinition {
 const v = object(value, path), allowedTools = array(v.allowedTools, decodeToolKind, path + '.allowedTools', 1, 4);
 assert(new Set(allowedTools).size === allowedTools.length, path + '.allowedTools', 'unique allowed tools');
 return { id: parseMissionId(v.id, path + '.id'), version: string(v.version, path + '.version', 1, 80), title: string(v.title, path + '.title', 1, 80),
 description: string(v.description, path + '.description', 1, 2000), objective: decodeMissionObjective(v.objective, path + '.objective'),
 mapVersionId: parseMapVersionId(v.mapVersionId, path + '.mapVersionId'), allowedTools, configVersion: string(v.configVersion, path + '.configVersion', 1, 1000) };
}
