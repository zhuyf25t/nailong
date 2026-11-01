import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeResultLookupResponse, type ResultLookupResponse } from '../../objects/records/apiTypes/ResultLookupResponse.ts';
import type { RunId } from '../../objects/training/RunId.ts';

export class GetTrainingResultAPI extends APIWithTokenMessage<ResultLookupResponse> {
  readonly runId: RunId;
  constructor(runId: RunId) {
    super();
    this.runId = runId;
  }
  override decodeResponse(value: unknown): ResultLookupResponse { return decodeResultLookupResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId }; }
}

