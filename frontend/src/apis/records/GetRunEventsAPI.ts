import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import { decodeRunEventsLookupResponse, type RunEventsLookupResponse } from '../../objects/records/apiTypes/RunEventsLookupResponse.ts';
export class GetRunEventsAPI extends APIWithTokenMessage<RunEventsLookupResponse> {
    readonly runId: RunId;
    constructor(runId: RunId) { super(); this.runId = runId; }
    override decodeResponse(value: unknown): RunEventsLookupResponse { return decodeRunEventsLookupResponse(value); }
    override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId }; }
}
