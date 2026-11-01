import { object, string, integer, assert } from '../../system/api/decode.ts';
import { parseMapId, type MapId } from './MapId.ts';
import { parseMapVersionId, type MapVersionId } from './MapVersionId.ts';
import { decodeWorldDefinition, type WorldDefinition } from './WorldDefinition.ts';
import { parseInstant, type Instant } from '../system/Instant.ts';
export interface MapVersion { readonly id: MapVersionId; readonly mapId: MapId; readonly version: number; readonly title: string; readonly world: WorldDefinition; readonly createdAt: Instant; readonly builtIn: boolean; }
export function decodeMapVersion(value: unknown, path = '$'): MapVersion { const v = object(value, path), builtIn = v.builtIn; assert(typeof builtIn === 'boolean', path + '.builtIn', 'boolean'); return {
 id: parseMapVersionId(v.id, path + '.id'), mapId: parseMapId(v.mapId, path + '.mapId'), title: string(v.title, path + '.title', 1, 80), version: integer(v.version, path + '.version', 1), world: decodeWorldDefinition(v.world, path + '.world'), createdAt: parseInstant(v.createdAt, path + '.createdAt'), builtIn }; }
