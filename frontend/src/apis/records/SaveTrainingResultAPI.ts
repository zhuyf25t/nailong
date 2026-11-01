import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeTrainingResult, type TrainingResult } from '../../objects/records/TrainingResult.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import type { ResultSubmission } from '../../objects/records/ResultSubmission.ts';

export class SaveTrainingResultAPI extends APIWithTokenMessage<TrainingResult> {
  readonly runId: RunId;
  readonly submission: ResultSubmission;
  constructor(runId: RunId, submission: ResultSubmission) {
    super();
    this.runId = runId;
    this.submission = submission;
  }
  override decodeResponse(value: unknown): TrainingResult { return decodeTrainingResult(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { runId: this.runId, submission: this.submission }; }
}

