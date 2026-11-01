import { integer, literal, object } from '../../../system/api/decode.ts';
import { decodeReplayEnvelope, type ReplayEnvelope } from '../ReplayEnvelope.ts';
export type RunReplayLookupResponse = {
    readonly status: 'available';
    readonly replay: ReplayEnvelope;
} | {
    readonly status: 'missing_legacy';
} | {
    readonly status: 'unsupported_version';
    readonly formatVersion: number;
};
export function decodeRunReplayLookupResponse(value: unknown, path = '$'): RunReplayLookupResponse { const v = object(value, path), status = literal(v.status, ['available', 'missing_legacy', 'unsupported_version'], path + '.status'); return status === 'available' ? { status, replay: decodeReplayEnvelope(v.replay, path + '.replay') } : status === 'unsupported_version' ? { status, formatVersion: integer(v.formatVersion, path + '.formatVersion', 1, 100000) } : { status }; }
