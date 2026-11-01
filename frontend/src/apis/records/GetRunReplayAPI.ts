import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import { decodeRunReplayLookupResponse, type RunReplayLookupResponse } from '../../objects/records/apiTypes/RunReplayLookupResponse.ts';
export class GetRunReplayAPI extends APIWithTokenMessage<RunReplayLookupResponse> {
    readonly runId: RunId;
    constructor(runId: RunId) { super(); this.runId = runId; }
    override decodeResponse(value: unknown): RunReplayLookupResponse { return decodeRunReplayLookupResponse(value); }
    override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId }; }
}
