import { object, integer, array } from '../../system/api/decode.ts';
import { decodeMapSummary, type MapSummary } from './MapSummary.ts';
import { decodeMapVersion, type MapVersion } from './MapVersion.ts';
export interface MapListResponse { readonly maps: readonly MapSummary[]; readonly total: number; readonly templates: readonly MapVersion[]; }
export function decodeMapListResponse(value: unknown, path = '$'): MapListResponse { const v = object(value, path); return {
 maps: array(v.maps, decodeMapSummary, path + '.maps', 0, 100), total: integer(v.total, path + '.total'), templates: array(v.templates, decodeMapVersion, path + '.templates', 0, 100) }; }
