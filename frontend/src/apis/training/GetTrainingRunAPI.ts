import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeTrainingRun, type TrainingRun } from '../../objects/training/TrainingRun.ts';
import type { RunId } from '../../objects/training/RunId.ts';

export class GetTrainingRunAPI extends APIWithTokenMessage<TrainingRun> {
  readonly runId: RunId;
  constructor(runId: RunId) {
    super();
    this.runId = runId;
  }
  override decodeResponse(value: unknown): TrainingRun { return decodeTrainingRun(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId }; }
}

