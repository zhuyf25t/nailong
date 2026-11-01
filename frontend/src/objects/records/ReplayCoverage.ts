import { assert, integer, literal, nullable, object } from '../../system/api/decode.ts';
import { MAX_RECORDING_MS } from './replayDecode.ts';
export interface ReplayCoverage {
    readonly kind: 'complete' | 'ending-clip';
    readonly reason: null | 'byte-limit' | 'duration-limit' | 'frame-limit';
    readonly fromMs: number;
    readonly toMs: number;
    readonly runDurationMs: number;
    readonly resultAtMs: number;
}
export function decodeReplayCoverage(value: unknown, path = '$'): ReplayCoverage { const v = object(value, path), kind = literal(v.kind, ['complete', 'ending-clip'], path + '.kind'), reason = nullable(v.reason, (x, p) => literal(x, ['byte-limit', 'duration-limit', 'frame-limit'], p), path + '.reason'), duration = integer(v.runDurationMs, path + '.runDurationMs', 0, MAX_RECORDING_MS), fromMs = integer(v.fromMs, path + '.fromMs', 0, duration), toMs = integer(v.toMs, path + '.toMs', fromMs, duration), resultAtMs = integer(v.resultAtMs, path + '.resultAtMs', fromMs, toMs); assert(toMs === duration, path + '.toMs', 'coverage ends at recorded duration'); assert(kind === 'complete' ? fromMs === 0 && reason === null : reason !== null, path, 'honest full/clip coverage'); return { kind, reason, fromMs, toMs, runDurationMs: duration, resultAtMs }; }
