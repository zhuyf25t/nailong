import type { TrainingConfig } from '../../../objects/training/TrainingConfig.ts';
import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';

export type BestState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; best: TrainingResult | null; config: TrainingConfig };
