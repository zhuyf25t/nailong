import { object, assert } from '../../system/api/decode.ts';
export interface ObjectiveProgress { readonly beaconActivated: boolean; readonly extracted: boolean; }
export function decodeObjectiveProgress(value: unknown, path = '$'): ObjectiveProgress {
 const v = object(value, path); const beaconActivated = v.beaconActivated, extracted = v.extracted;
 assert(typeof beaconActivated === 'boolean', path + '.beaconActivated', 'boolean'); assert(typeof extracted === 'boolean', path + '.extracted', 'boolean');
 assert(!extracted || beaconActivated, path + '.extracted', 'beacon activated before extraction'); return { beaconActivated, extracted };
}
