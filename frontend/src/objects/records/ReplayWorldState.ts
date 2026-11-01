import { array, assert, object } from '../../system/api/decode.ts';
import { replayBoolean, replayId } from './replayDecode.ts';
export interface ReplayWorldState {
    readonly openGateIds: readonly string[];
    readonly beaconActivated: boolean;
    readonly extracted: boolean;
}
export function decodeReplayWorldState(value: unknown, path = '$'): ReplayWorldState { const v = object(value, path), ids = array(v.openGateIds, replayId, path + '.openGateIds', 0, 128); assert(new Set(ids).size === ids.length, path + '.openGateIds', 'unique gates'); return { openGateIds: ids, beaconActivated: replayBoolean(v.beaconActivated, path + '.beaconActivated'), extracted: replayBoolean(v.extracted, path + '.extracted') }; }
