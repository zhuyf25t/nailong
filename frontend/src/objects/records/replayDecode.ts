import { assert, number, object, string } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
export function replayPoint(value: unknown, path: string): Point3 { const v = object(value, path); return { x: number(v.x, path + '.x', -1000, 1000), y: number(v.y, path + '.y', -1000, 1000), z: number(v.z, path + '.z', -1000, 1000) }; }
export function replayBoolean(value: unknown, path: string): boolean { assert(typeof value === 'boolean', path, 'boolean'); return value; }
export function replayId(value: unknown, path: string): string { const id = string(value, path, 1, 80); assert(/^[a-zA-Z0-9_-]+$/.test(id), path, 'bounded entity identifier'); return id; }
export function uniqueIds(values: readonly {
    id: string;
}[], path: string) { assert(new Set(values.map(v => v.id)).size === values.length, path, 'unique entity IDs'); }
export const MAX_RECORDING_MS = 86401200;
export const MAX_REPLAY_BYTES = 6 * 1024 * 1024;
export const MAX_REPLAY_HTTP_BYTES = 8 * 1024 * 1024;
export function utf8Bytes(value: string) { return new TextEncoder().encode(value).byteLength; }
