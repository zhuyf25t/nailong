import { object } from '../../system/api/decode.ts';
import { decodeRunEventSummary, type RunEventSummary } from './RunEventSummary.ts';
import { decodeReplayEnvelope, type ReplayEnvelope } from './ReplayEnvelope.ts';
export interface RecordedRun {
    readonly summary: RunEventSummary;
    readonly replay: ReplayEnvelope;
}
export function decodeRecordedRun(value: unknown, path = '$'): RecordedRun { const v = object(value, path); return { summary: decodeRunEventSummary(v.summary, path + '.summary'), replay: decodeReplayEnvelope(v.replay, path + '.replay') }; }
