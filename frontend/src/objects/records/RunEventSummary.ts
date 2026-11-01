import { array, assert, integer, object } from '../../system/api/decode.ts';
import { decodeRunEvent, type RunEvent } from './RunEvent.ts';
import { MAX_RECORDING_MS, replayBoolean } from './replayDecode.ts';
export interface RunEventSummary {
    readonly formatVersion: 1;
    readonly runDurationMs: number;
    readonly resultAtMs: number;
    readonly truncated: boolean;
    readonly events: readonly RunEvent[];
}
export function validateEventOrder(events: readonly RunEvent[], path: string) { for (let i = 1; i < events.length; i++) {
    assert(events[i].seq > events[i - 1].seq, path, 'strict event sequence');
    assert(events[i].tMs >= events[i - 1].tMs, path, 'nondecreasing event time');
} }
export function decodeRunEventSummary(value: unknown, path = '$'): RunEventSummary { const v = object(value, path); integer(v.formatVersion, path + '.formatVersion', 1, 1); const duration = integer(v.runDurationMs, path + '.runDurationMs', 0, MAX_RECORDING_MS), resultAt = integer(v.resultAtMs, path + '.resultAtMs', 0, duration), truncated = replayBoolean(v.truncated, path + '.truncated'), events = array(v.events, decodeRunEvent, path + '.events', 0, 10000); validateEventOrder(events, path + '.events'); assert(events.every(e => e.tMs <= duration), path, 'events within duration'); assert(truncated || events.length === 0 || events[0].seq === 0, path, 'complete events start at seq zero'); return { formatVersion: 1, runDurationMs: duration, resultAtMs: resultAt, truncated, events }; }
