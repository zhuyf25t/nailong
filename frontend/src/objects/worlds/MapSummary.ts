import { object, string, integer, nullable, assert } from '../../system/api/decode.ts';
import { parseMapId, type MapId } from './MapId.ts';
import { parseMapVersionId, type MapVersionId } from './MapVersionId.ts';
import { parseInstant, type Instant } from '../system/Instant.ts';
export interface MapSummary { readonly mapId: MapId; readonly title: string; readonly revision: number; readonly latestVersionId: MapVersionId | null; readonly updatedAt: Instant; readonly builtIn: boolean; }
export function decodeMapSummary(value: unknown, path = '$'): MapSummary { const v = object(value, path), builtIn = v.builtIn; assert(typeof builtIn === 'boolean', path + '.builtIn', 'boolean'); return {
 mapId: parseMapId(v.mapId, path + '.mapId'), title: string(v.title, path + '.title', 1, 80), revision: integer(v.revision, path + '.revision', 1), latestVersionId: nullable(v.latestVersionId, parseMapVersionId, path + '.latestVersionId'), updatedAt: parseInstant(v.updatedAt, path + '.updatedAt'), builtIn }; }
