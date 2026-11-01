import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';
import type { TrainingRun } from '../../../objects/training/TrainingRun.ts';

export type ResultPageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'not-found' }
  | { kind: 'failed'; message: string }
  | { kind: 'saved'; result: TrainingResult }
  | { kind: 'unsubmitted'; run: TrainingRun };
