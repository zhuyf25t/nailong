import { object } from '../../system/api/decode.ts';
import { parseMissionId, type MissionId } from './MissionId.ts';
import { decodeLoadout, type Loadout } from './Loadout.ts';
import { parseMapVersionId, type MapVersionId } from '../worlds/MapVersionId.ts';
export interface RunSelection { readonly missionId: MissionId; readonly mapVersionId?: MapVersionId; readonly loadout: Loadout; }
export function decodeRunSelection(value: unknown, path = '$'): RunSelection {
 const v = object(value, path); return { missionId: parseMissionId(v.missionId, path + '.missionId'), loadout: decodeLoadout(v.loadout, path + '.loadout'),
 ...(v.mapVersionId === undefined || v.mapVersionId === null ? {} : { mapVersionId: parseMapVersionId(v.mapVersionId, path + '.mapVersionId') }) };
}
