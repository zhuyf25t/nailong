import type { RecordedRun } from '../../objects/records/RecordedRun.ts';
import type { ReplayQueueItemStatus } from './ReplayQueueItemStatus.ts';

export interface StoredReplay extends Omit<ReplayQueueItemStatus, 'durable'> {
  readonly version: 1;
  readonly key: string;
  readonly recorded: RecordedRun;
}
