import type { TrainingResult } from '../../objects/records/TrainingResult';
import type { SaveFailure } from './SaveFailure';

export type SaveAttempt =
  | { readonly status: 'saved'; readonly result: TrainingResult }
  | ({ readonly status: 'failed' } & SaveFailure)
  | { readonly status: 'wrong-account' };
