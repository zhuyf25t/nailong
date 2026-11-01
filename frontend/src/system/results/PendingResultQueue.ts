import { parsePlayerId, type PlayerId } from '../../objects/player/PlayerId.ts';
import { decodeResultSubmission } from '../../objects/records/ResultSubmission.ts';
import { decodeTrainingResult } from '../../objects/records/TrainingResult.ts';
import { parseSessionToken } from '../../objects/system/SessionToken.ts';
import { parseRunId, type RunId } from '../../objects/training/RunId.ts';
import { ApiError } from '../api/ApiError.ts';
import { DecodeError } from '../api/DecodeError.ts';
import * as decode from '../api/decode.ts';
import type { PendingQueueSnapshot } from './PendingQueueSnapshot.ts';
import type { PendingResultItem } from './PendingResultItem.ts';
import type { PendingSaveState } from './PendingSaveState.ts';
import type { QueueStorage } from './QueueStorage.ts';
import type { ResultOwnerSession } from './ResultOwnerSession.ts';
import type { SaveAttempt } from './SaveAttempt.ts';
import type { SaveFailure } from './SaveFailure.ts';
import type { SubmissionSaver } from './SubmissionSaver.ts';

export const PENDING_RESULTS_STORAGE_KEY = 'bloom-valley.pending-results.v1';
export const PENDING_RESULT_STORAGE_PREFIX = 'bloom-valley.pending-result.v2:';
const LEGACY_SAVED_PREFIX = 'bloom-valley.legacy-result-saved.v1:';
const MAX_QUEUE_ITEMS = 500;
const MAX_STORAGE_CHARACTERS = 2_000_000;

function itemKey(playerId: PlayerId, runId: RunId): string {
  return `${playerId}:${runId}`;
}

export function pendingResultStorageKey(playerId: PlayerId, runId: RunId): string {
  return `${PENDING_RESULT_STORAGE_PREFIX}${itemKey(playerId, runId)}`;
}

export function isPendingResultsStorageKey(key: string | null): boolean {
  return key === null || key === PENDING_RESULTS_STORAGE_KEY || key.startsWith(PENDING_RESULT_STORAGE_PREFIX) || key.startsWith(LEGACY_SAVED_PREFIX);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  decode.assert(Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), path, `exact fields ${keys.join(', ')}`);
}

/** Both browser storage and enqueue callers cross this runtime boundary. */
function decodeItem(value: unknown, path = '$'): PendingResultItem {
  const item = decode.object(value, path);
  exactKeys(item, ['playerId', 'runId', 'submission'], path);
  const submission = decode.object(item.submission, `${path}.submission`);
  exactKeys(submission, ['outcome', 'shotsFired', 'hits', 'destroyed', 'elapsedMs'], `${path}.submission`);
  return Object.freeze({
    playerId: parsePlayerId(item.playerId, `${path}.playerId`),
    runId: parseRunId(item.runId, `${path}.runId`),
    submission: Object.freeze(decodeResultSubmission(submission, `${path}.submission`)),
  });
}

export function decodePendingResults(value: unknown): readonly PendingResultItem[] {
  const root = decode.object(value);
  exactKeys(root, ['version', 'items'], '$');
  decode.assert(root.version === 1, '$.version', 'queue version 1');
  const items = decode.array(root.items, decodeItem, '$.items', 0, MAX_QUEUE_ITEMS);
  const keys = new Set<string>();
  for (const item of items) {
    const key = itemKey(item.playerId, item.runId);
    decode.assert(!keys.has(key), '$.items', 'unique playerId + runId');
    keys.add(key);
  }
  return Object.freeze(items);
}

function sameSubmission(left: PendingResultItem['submission'], right: PendingResultItem['submission']): boolean {
  return left.outcome === right.outcome && left.shotsFired === right.shotsFired
    && left.hits === right.hits && left.destroyed === right.destroyed && left.elapsedMs === right.elapsedMs;
}

function failureOf(error: unknown): SaveFailure {
  if (error instanceof ApiError) return Object.freeze({ message: error.message, kind: error.kind, code: error.code ?? null });
  if (error instanceof DecodeError) return Object.freeze({ message: '服务器返回的成绩格式不正确，结果仍待保存。', kind: 'decode', code: null });
  return Object.freeze({ message: '暂时无法保存成绩，请稍后用原账号重试。', kind: 'local', code: null });
}

function decodeStoredItem(raw: string, storageKey: string) {
  decode.assert(raw.length <= 10_000, '$', 'bounded pending item');
  const parsed: unknown = JSON.parse(raw);
  const value = decode.object(parsed);
  exactKeys(value, ['version', 'legacy', 'item'], '$');
  decode.assert(value.version === 2, '$.version', 'item version 2');
  decode.assert(typeof value.legacy === 'boolean', '$.legacy', 'boolean');
  const item = decodeItem(value.item);
  decode.assert(storageKey === pendingResultStorageKey(item.playerId, item.runId), '$.item', 'owner and run matching the storage key');
  return { item, legacy: value.legacy === true };
}

/** Persistence/network boundary. The domain data inside it stays immutable. */
export class PendingResultQueue {
  private items: readonly PendingResultItem[] = Object.freeze([]);
  private readonly states = new Map<string, PendingSaveState>();
  private readonly inFlight = new Map<string, Promise<SaveAttempt>>();
  private readonly listeners = new Set<() => void>();
  private readonly dirty = new Set<string>();
  private readonly legacyOrigins = new Set<string>();
  private corruptStorage: string | null = null;
  private storageWarning: string | null = null;
  private snapshot: PendingQueueSnapshot;

  constructor(private readonly storage: QueueStorage | null, private readonly save: SubmissionSaver) {
    if (storage === null) {
      this.storageWarning = '浏览器不允许保存本地数据；尚未上传的成绩只保留在当前页面，请勿刷新或关闭。';
    } else this.readStorage();
    this.snapshot = Object.freeze({ revision: 0, items: this.items, corruptStorage: this.corruptStorage, storageWarning: this.storageWarning });
  }

  readonly getSnapshot = (): PendingQueueSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly itemsFor = (playerId: PlayerId): readonly PendingResultItem[] => this.items.filter((item) => item.playerId === playerId);

  readonly getStatus = (playerId: PlayerId, runId: RunId): PendingSaveState | undefined => this.states.get(itemKey(playerId, runId));

  /** Called by the storage event, and explicitly before mutations. No writes here. */
  readonly refreshFromStorage = (): void => {
    this.readStorage();
    this.publish();
  };

  /** Returns a frozen copy even when the caller later mutates its original object. */
  readonly enqueue = (input: PendingResultItem): PendingResultItem => {
    this.readStorage();
    this.migrateLegacy();
    const item = decodeItem(input);
    const key = itemKey(item.playerId, item.runId);
    const current = this.items.find((candidate) => itemKey(candidate.playerId, candidate.runId) === key);
    if (current !== undefined) {
      if (!sameSubmission(current.submission, item.submission)) throw new Error('同一局已经有不同的待保存结果，不能覆盖。');
      this.publish();
      return current;
    }
    const saved = this.states.get(key);
    if (saved?.status === 'saved') {
      if (!sameSubmission(saved.result, item.submission)) throw new Error('同一局已经保存过不同的结果，不能覆盖。');
      this.publish();
      return item;
    }
    this.items = Object.freeze([...this.items, item]);
    this.states.set(key, Object.freeze({ status: 'pending' }));
    this.persistItem(item);
    this.publish();
    return item;
  };

  readonly retry = (input: PendingResultItem, session: ResultOwnerSession): Promise<SaveAttempt> => {
    // Never substitute the latest logged-in token for the explicitly captured owner.
    if (input.playerId !== session.playerId) return Promise.resolve(Object.freeze({ status: 'wrong-account' }));
    this.migrateLegacy();
    const key = itemKey(input.playerId, input.runId);
    const running = this.inFlight.get(key);
    if (running !== undefined) return running;
    const existingState = this.states.get(key);
    if (existingState?.status === 'saved') {
      if (sameSubmission(existingState.result, input.submission)) return Promise.resolve(existingState);
      return Promise.resolve(Object.freeze({ status: 'failed', message: '该局已经保存了另一份结果，不能覆盖。', kind: 'local', code: 'conflict' }));
    }
    const item = this.items.find((candidate) => candidate.playerId === input.playerId && candidate.runId === input.runId);
    if (item === undefined || !sameSubmission(item.submission, input.submission)) {
      return Promise.resolve(Object.freeze({ status: 'failed', message: '这份结果尚未加入待保存队列，请重新保存。', kind: 'local', code: null }));
    }
    let credentials: ResultOwnerSession;
    try {
      credentials = Object.freeze({ playerId: parsePlayerId(session.playerId), token: parseSessionToken(session.token) });
    } catch {
      const failure = Object.freeze({ status: 'failed', message: '登录凭证无效，请用原账号重新登录后保存。', kind: 'auth', code: 'unauthorized' } as const);
      this.states.set(key, failure);
      this.publish();
      return Promise.resolve(failure);
    }
    this.states.set(key, Object.freeze({ status: 'saving' }));
    this.publish();
    const attempt: Promise<SaveAttempt> = Promise.resolve().then(() => this.save(item, credentials)).then((response): SaveAttempt => {
      const result = decodeTrainingResult(response);
      if (result.playerId !== item.playerId || result.runId !== item.runId || !sameSubmission(result, item.submission)) {
        throw new DecodeError('$', 'result matching the submitted owner, run and frozen values');
      }
      const success = Object.freeze({ status: 'saved', result } as const);
      this.states.set(key, success);
      this.items = Object.freeze(this.items.filter((candidate) => itemKey(candidate.playerId, candidate.runId) !== key));
      // A failure removing the local copy is separate from successful server saving.
      this.removePersistedItem(item);
      this.publish();
      return success;
    }).catch((error: unknown): SaveAttempt => {
      const failure = Object.freeze({ status: 'failed', ...failureOf(error) } as const);
      this.states.set(key, failure);
      this.publish();
      return failure;
    }).finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, attempt);
    return attempt;
  };

  readonly retryAll = (session: ResultOwnerSession): Promise<SaveAttempt[]> => Promise.all(this.itemsFor(session.playerId).map((item) => this.retry(item, session)));

  private warnCorrupt(): void {
    this.corruptStorage = '部分本地待保存成绩已损坏或冲突，未自动提交其中的数据；原始内容保留，其他有效成绩仍可保存。';
  }

  private warnStorage(): void {
    this.storageWarning = '本地保存失败；尚未上传的成绩可能只保留在当前页面，请勿刷新或关闭。已成功上传的成绩仍可从历史查看。';
  }

  private readLegacy(): readonly PendingResultItem[] | null {
    if (this.storage === null) return null;
    const raw = this.storage.getItem(PENDING_RESULTS_STORAGE_KEY);
    if (raw === null) return null;
    try {
      decode.assert(raw.length <= MAX_STORAGE_CHARACTERS, '$', 'bounded legacy queue data');
      const parsed: unknown = JSON.parse(raw);
      return decodePendingResults(parsed);
    } catch {
      this.warnCorrupt();
      return null;
    }
  }

  private readStorage(): void {
    if (this.storage === null) return;
    try {
      const loaded = new Map<string, PendingResultItem>();
      const storageKeys = Array.from({ length: this.storage.length }, (_, index) => this.storage?.key(index) ?? null);
      for (const storageKey of storageKeys) {
        if (storageKey === null || !storageKey.startsWith(PENDING_RESULT_STORAGE_PREFIX)) continue;
        const raw = this.storage.getItem(storageKey);
        if (raw === null) continue;
        try {
          const { item, legacy } = decodeStoredItem(raw, storageKey);
          const key = itemKey(item.playerId, item.runId);
          if (legacy) this.legacyOrigins.add(key);
          if (this.storage.getItem(`${LEGACY_SAVED_PREFIX}${key}`) === '1') continue;
          loaded.set(key, item);
        } catch { this.warnCorrupt(); }
      }
      for (const item of this.readLegacy() ?? []) {
        const key = itemKey(item.playerId, item.runId);
        this.legacyOrigins.add(key);
        if (this.storage.getItem(`${LEGACY_SAVED_PREFIX}${key}`) === '1') continue;
        const current = loaded.get(key);
        if (current === undefined) loaded.set(key, item);
        else if (!sameSubmission(current.submission, item.submission)) this.warnCorrupt();
      }
      // Failed local writes and active requests remain in memory even if another
      // tab changes storage. Independent stored entries never replace each other.
      for (const item of this.items) {
        const key = itemKey(item.playerId, item.runId);
        const stored = loaded.get(key);
        if (stored !== undefined) {
          if (!sameSubmission(stored.submission, item.submission)) {
            this.warnCorrupt();
            this.dirty.add(key);
          }
          loaded.set(key, item);
        }
        if (this.dirty.has(key) || this.inFlight.has(key)) loaded.set(key, item);
      }
      for (const [key, state] of this.states) {
        if (state.status === 'saved') loaded.delete(key);
        else if (!loaded.has(key)) this.states.delete(key);
      }
      this.items = Object.freeze([...loaded.values()]);
      for (const key of loaded.keys()) if (!this.states.has(key)) this.states.set(key, Object.freeze({ status: 'pending' }));
    } catch {
      this.storageWarning = '无法读取全部本地待保存成绩；当前页面中的结果仍保留，请勿刷新或关闭。';
    }
  }

  /** Migrate only at an action/effect boundary, never while React renders. */
  private migrateLegacy(): void {
    if (this.storage === null) return;
    try {
      const legacyItems = this.readLegacy();
      if (legacyItems === null) return;
      for (const item of legacyItems) {
        const key = itemKey(item.playerId, item.runId);
        this.legacyOrigins.add(key);
        if (this.storage.getItem(`${LEGACY_SAVED_PREFIX}${key}`) === '1') continue;
        const storageKey = pendingResultStorageKey(item.playerId, item.runId);
        const currentRaw = this.storage.getItem(storageKey);
        if (currentRaw !== null) {
          const current = decodeStoredItem(currentRaw, storageKey).item;
          if (!sameSubmission(current.submission, item.submission)) {
            this.warnCorrupt();
            return;
          }
        }
        this.storage.setItem(storageKey, JSON.stringify({ version: 2, legacy: true, item }));
      }
      // Remove the old whole-queue record only after every valid item is durable.
      this.storage.removeItem(PENDING_RESULTS_STORAGE_KEY);
    } catch (error: unknown) {
      if (error instanceof DecodeError || error instanceof SyntaxError) this.warnCorrupt();
      else this.warnStorage();
    }
  }

  private persistItem(item: PendingResultItem): void {
    const key = itemKey(item.playerId, item.runId);
    if (this.storage === null) { this.dirty.add(key); return; }
    try {
      this.storage.setItem(pendingResultStorageKey(item.playerId, item.runId), JSON.stringify({ version: 2, legacy: this.legacyOrigins.has(key), item }));
      this.dirty.delete(key);
      if (this.dirty.size === 0) this.storageWarning = null;
    } catch {
      this.dirty.add(key);
      this.warnStorage();
    }
  }

  private removePersistedItem(item: PendingResultItem): void {
    const key = itemKey(item.playerId, item.runId);
    this.dirty.delete(key);
    if (this.storage === null) return;
    try {
      // Legacy completion markers prevent a stale tab midway through migration
      // from reviving an already uploaded legacy result. New runs need no marker.
      if (this.legacyOrigins.has(key)) this.storage.setItem(`${LEGACY_SAVED_PREFIX}${key}`, '1');
      this.storage.removeItem(pendingResultStorageKey(item.playerId, item.runId));
      if (this.dirty.size === 0) this.storageWarning = null;
    } catch { this.warnStorage(); }
  }

  private publish(): void {
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1, items: this.items, corruptStorage: this.corruptStorage, storageWarning: this.storageWarning });
    for (const listener of this.listeners) listener();
  }
}
