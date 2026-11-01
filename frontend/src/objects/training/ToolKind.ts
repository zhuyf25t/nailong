import { literal } from '../../system/api/decode.ts';
export type ToolKind = 'none' | 'curtain' | 'decoy' | 'pulse';
export function decodeToolKind(value: unknown, path = '$'): ToolKind { return literal(value, ['none', 'curtain', 'decoy', 'pulse'], path); }
