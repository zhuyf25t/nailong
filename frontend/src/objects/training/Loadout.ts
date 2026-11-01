import { object } from '../../system/api/decode.ts';
import { decodeToolKind, type ToolKind } from './ToolKind.ts';
export interface Loadout { readonly tool: ToolKind; }
export function decodeLoadout(value: unknown, path = '$'): Loadout { const v = object(value, path); return { tool: decodeToolKind(v.tool, path + '.tool') }; }
