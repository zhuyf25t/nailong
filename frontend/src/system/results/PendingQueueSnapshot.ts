import type { PendingResultItem } from './PendingResultItem';

export interface PendingQueueSnapshot {
  readonly revision: number;
  readonly items: readonly PendingResultItem[];
  readonly corruptStorage: string | null;
  readonly storageWarning: string | null;
}
