import { literal, object } from '../../../system/api/decode.ts';
import { decodeRunEventSummary, type RunEventSummary } from '../RunEventSummary.ts';
export type RunEventsLookupResponse = {
    readonly status: 'available';
    readonly summary: RunEventSummary;
} | {
    readonly status: 'missing_legacy';
};
export function decodeRunEventsLookupResponse(value: unknown, path = '$'): RunEventsLookupResponse { const v = object(value, path), status = literal(v.status, ['available', 'missing_legacy'], path + '.status'); return status === 'available' ? { status, summary: decodeRunEventSummary(v.summary, path + '.summary') } : { status }; }
