import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import type { RunEventSummary } from '../../objects/records/RunEventSummary.ts';
import { decodeRecordingSavedResponse, type RecordingSavedResponse } from '../../objects/records/apiTypes/RecordingSavedResponse.ts';
export class SaveRunEventsAPI extends APIWithTokenMessage<RecordingSavedResponse> {
    readonly runId: RunId;
    readonly summary: RunEventSummary;
    constructor(runId: RunId, summary: RunEventSummary) { super(); this.runId = runId; this.summary = summary; }
    override decodeResponse(value: unknown): RecordingSavedResponse { return decodeRecordingSavedResponse(value); }
    override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId, summary: this.summary }; }
}
