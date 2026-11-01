import type { PlayerId } from '../../objects/player/PlayerId.ts';
import type { RecordedRun } from '../../objects/records/RecordedRun.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import type { ReplayQueueItemStatus } from './ReplayQueueItemStatus.ts';
import type { ReplayQueueSnapshot } from './ReplayQueueSnapshot.ts';

export interface ReplaysContextValue extends ReplayQueueSnapshot {
  readonly enqueue: (ownerId: PlayerId, runId: RunId, recorded: RecordedRun) => Promise<void>;
  readonly getLocal: (ownerId: PlayerId, runId: RunId) => Promise<RecordedRun | null>;
  readonly getStatus: (ownerId: PlayerId, runId: RunId) => ReplayQueueItemStatus | undefined;
  readonly retry: (runId?: RunId) => Promise<void>;
}
