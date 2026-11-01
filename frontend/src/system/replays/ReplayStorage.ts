import type { PlayerId } from '../../objects/player/PlayerId.ts';
import type { StoredReplay } from './StoredReplay.ts';

export interface ReplayStorage {
  get(key: string): Promise<unknown | undefined>;
  list(ownerId: PlayerId): Promise<readonly unknown[]>;
  /** Atomically rejects different content and merges successful part uploads. */
  put(item: StoredReplay): Promise<StoredReplay>;
}

export class ReplayContentConflict extends Error {
  constructor() { super('这局已经有另一份过程记录，原记录保留，不能覆盖。'); }
}

export class ReplayStorageError extends Error {
  constructor() { super('回放未能写入本机存储，当前只保留在此页面，请勿刷新或关闭。可以释放浏览器空间后重试。'); }
}
