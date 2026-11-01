import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';

export type HistoryState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; items: readonly TrainingResult[]; total: number; nextOffset: number };
