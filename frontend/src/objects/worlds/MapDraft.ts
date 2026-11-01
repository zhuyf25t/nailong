import { object, string, integer } from '../../system/api/decode.ts';
import { parseMapId, type MapId } from './MapId.ts';
import { decodeWorldDefinition, type WorldDefinition } from './WorldDefinition.ts';
import { parseInstant, type Instant } from '../system/Instant.ts';
export interface MapDraft { readonly mapId: MapId; readonly title: string; readonly revision: number; readonly world: WorldDefinition; readonly updatedAt: Instant; }
export function decodeMapDraft(value: unknown, path = '$'): MapDraft { const v = object(value, path); return {
 mapId: parseMapId(v.mapId, path + '.mapId'), title: string(v.title, path + '.title', 1, 80), revision: integer(v.revision, path + '.revision', 1), world: decodeWorldDefinition(v.world, path + '.world'), updatedAt: parseInstant(v.updatedAt, path + '.updatedAt') }; }
