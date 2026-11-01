import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeAbandonRunResponse, type AbandonRunResponse } from '../../objects/training/apiTypes/AbandonRunResponse.ts';
import type { RunId } from '../../objects/training/RunId.ts';

export class AbandonTrainingRunAPI extends APIWithTokenMessage<AbandonRunResponse> {
  readonly runId: RunId;
  constructor(runId: RunId) {
    super();
    this.runId = runId;
  }
  override decodeResponse(value: unknown): AbandonRunResponse { return decodeAbandonRunResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId }; }
}

