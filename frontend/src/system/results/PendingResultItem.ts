import type { PlayerId } from '../../objects/player/PlayerId';
import type { ResultSubmission } from '../../objects/records/ResultSubmission';
import type { RunId } from '../../objects/training/RunId';

/** A frozen terminal result. Tokens are deliberately never persisted with it. */
export interface PendingResultItem {
  readonly playerId: PlayerId;
  readonly runId: RunId;
  readonly submission: Readonly<ResultSubmission>;
}
