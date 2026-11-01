import type { PendingQueueSnapshot } from './PendingQueueSnapshot.ts';
import type { PendingResultQueue } from './PendingResultQueue.ts';

export interface PendingResultsContextValue extends PendingQueueSnapshot {
  readonly itemsFor: PendingResultQueue['itemsFor'];
  readonly enqueue: PendingResultQueue['enqueue'];
  readonly retry: PendingResultQueue['retry'];
  readonly retryAll: PendingResultQueue['retryAll'];
  readonly getStatus: PendingResultQueue['getStatus'];
}
