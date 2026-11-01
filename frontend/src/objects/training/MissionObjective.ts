import { object, literal } from '../../system/api/decode.ts';
import { decodeWorldEntityId } from '../worlds/WorldEntityId.ts';
export type MissionObjective = { readonly kind: 'clear_drones' } | { readonly kind: 'activate_extract'; readonly beaconId: string; readonly extractionId: string };
export function decodeMissionObjective(value: unknown, path = '$'): MissionObjective {
 const v = object(value, path), kind = literal(v.kind, ['clear_drones', 'activate_extract'], path + '.kind');
 return kind === 'clear_drones' ? { kind } : { kind, beaconId: decodeWorldEntityId(v.beaconId, path + '.beaconId'), extractionId: decodeWorldEntityId(v.extractionId, path + '.extractionId') };
}
