import type { PlayerId } from '../../objects/player/PlayerId.ts';
import type { RunId } from '../../objects/training/RunId.ts';
import type { ReplayUploadState } from './ReplayUploadState.ts';

export interface ReplayQueueItemStatus {
  readonly ownerId: PlayerId;
  readonly runId: RunId;
  readonly createdAt: number;
  readonly events: ReplayUploadState;
  readonly replay: ReplayUploadState;
  /** False means the recording exists only in this page's memory. */
  readonly durable: boolean;
}
