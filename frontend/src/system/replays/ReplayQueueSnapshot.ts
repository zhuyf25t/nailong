import type { ReplayQueueItemStatus } from './ReplayQueueItemStatus.ts';

export interface ReplayQueueSnapshot {
  readonly revision: number;
  readonly items: readonly ReplayQueueItemStatus[];
  readonly storageWarning: string | null;
}
