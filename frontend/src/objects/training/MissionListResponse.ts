import { object, array } from '../../system/api/decode.ts';
import { decodeMissionDefinition, type MissionDefinition } from './MissionDefinition.ts';
export interface MissionListResponse { readonly missions: readonly MissionDefinition[]; }
export function decodeMissionListResponse(value: unknown, path = '$'): MissionListResponse {
 const v = object(value, path); return { missions: array(v.missions, decodeMissionDefinition, path + '.missions', 0, 100) };
}
