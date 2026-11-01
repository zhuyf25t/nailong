import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import type { ReplayEnvelope } from '../../objects/records/ReplayEnvelope.ts';
import { decodeRecordingSavedResponse, type RecordingSavedResponse } from '../../objects/records/apiTypes/RecordingSavedResponse.ts';
export class SaveRunReplayAPI extends APIWithTokenMessage<RecordingSavedResponse> {
    readonly runId: RunId;
    readonly replay: ReplayEnvelope;
    constructor(runId: RunId, replay: ReplayEnvelope) { super(); this.runId = runId; this.replay = replay; }
    override decodeResponse(value: unknown): RecordingSavedResponse { return decodeRecordingSavedResponse(value); }
    override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId, replay: this.replay }; }
}
