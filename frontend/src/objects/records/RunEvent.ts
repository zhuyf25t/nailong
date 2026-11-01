import { integer, literal, nullable, number, object, string } from '../../system/api/decode.ts';
import type { Point3 } from '../training/Point3.ts';
import { MAX_RECORDING_MS, replayId, replayPoint } from './replayDecode.ts';
export const RUN_EVENT_KINDS = ['shot', 'hit', 'drone-state', 'destroyed', 'tool', 'beacon', 'gate', 'extract', 'contact', 'round-end'] as const;
export type RunEventKind = typeof RUN_EVENT_KINDS[number];
export interface RunEvent {
    readonly seq: number;
    readonly tMs: number;
    readonly kind: RunEventKind;
    readonly actorId: string | null;
    readonly targetId: string | null;
    readonly position: Point3 | null;
    readonly value: number | null;
    readonly detail: string | null;
}
export type RunEventInput = Pick<RunEvent, 'kind'> & Partial<Omit<RunEvent, 'seq' | 'tMs' | 'kind'>>;
export function decodeRunEvent(value: unknown, path = '$'): RunEvent { const v = object(value, path); return { seq: integer(v.seq, path + '.seq', 0, 10000000), tMs: integer(v.tMs, path + '.tMs', 0, MAX_RECORDING_MS), kind: literal(v.kind, RUN_EVENT_KINDS, path + '.kind'), actorId: nullable(v.actorId, replayId, path + '.actorId'), targetId: nullable(v.targetId, replayId, path + '.targetId'), position: nullable(v.position, replayPoint, path + '.position'), value: nullable(v.value, (x, p) => number(x, p, -1000000, 1000000), path + '.value'), detail: nullable(v.detail, (x, p) => string(x, p, 0, 100), path + '.detail') }; }
