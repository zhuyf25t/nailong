import type { TrainingResult } from '../../objects/records/TrainingResult';
import type { PendingResultItem } from './PendingResultItem';
import type { ResultOwnerSession } from './ResultOwnerSession';

export type SubmissionSaver = (
  item: PendingResultItem,
  session: ResultOwnerSession,
) => Promise<TrainingResult>;
