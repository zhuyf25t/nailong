import type { TrainingResult } from '../../objects/records/TrainingResult';
import type { SaveFailure } from './SaveFailure';

export type PendingSaveState =
  | { readonly status: 'pending' }
  | { readonly status: 'saving' }
  | ({ readonly status: 'failed' } & SaveFailure)
  | { readonly status: 'saved'; readonly result: TrainingResult };
