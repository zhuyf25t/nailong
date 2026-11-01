import { parsePlayerId, type PlayerId } from '../../objects/player/PlayerId.ts';
import { decodeRecordedRun, type RecordedRun } from '../../objects/records/RecordedRun.ts';
import { verifyReplayEnvelope } from '../../objects/records/ReplayEnvelope.ts';
import { parseRunId, type RunId } from '../../objects/training/RunId.ts';
import { ApiError } from '../api/ApiError.ts';
import type { ReplayOwnerSession, ReplayQueueDependencies } from './ReplayQueueDependencies.ts';
import type { ReplayQueueItemStatus } from './ReplayQueueItemStatus.ts';
import type { ReplayQueueSnapshot } from './ReplayQueueSnapshot.ts';
import { ReplayContentConflict, ReplayStorageError, type ReplayStorage } from './ReplayStorage.ts';
import { decodeStoredReplay, mergeStoredReplay, replayStorageKey, sameRecorded } from './replayStorageCodec.ts';
import type { ReplayUploadState } from './ReplayUploadState.ts';
import type { StoredReplay } from './StoredReplay.ts';

interface MemoryEntry { item: StoredReplay; durable: boolean }
const pending = (message: string | null = null): ReplayUploadState => ({ status: 'pending', message });
const isAuth = (error: unknown) => error instanceof ApiError && (error.status === 401 || error.kind === 'auth');

/** Session-aware durable outbox. Upload success never deletes the local recording. */
export class ReplayQueue {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly jobs = new Map<string, { epoch: number; controller: AbortController; promise: Promise<void> }>();
  private session: ReplayOwnerSession | null = null;
  private epoch = 0;
  private warning: string | null = null;
  private corruptWarning: string | null = null;
  private snapshot: ReplayQueueSnapshot = { revision: 0, items: [], storageWarning: null };

  constructor(private readonly storage: ReplayStorage, private readonly dependencies: ReplayQueueDependencies) {}

  readonly getSnapshot = (): ReplayQueueSnapshot => this.snapshot;
  readonly hasUnpersisted = (): boolean => [...this.entries.values()].some(entry => !entry.durable
    && (entry.item.events.status !== 'saved' || entry.item.replay.status !== 'saved'));
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly setSession = (session: ReplayOwnerSession | null): void => {
    if (session?.ownerId === this.session?.ownerId && session?.token === this.session?.token) return;
    this.epoch += 1;
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
    this.session = session === null ? null : { ...session };
    // A cancelled request may already have reached the server: retries are idempotent.
    for (const entry of this.entries.values()) {
      entry.item = { ...entry.item,
        events: entry.item.events.status === 'uploading' ? pending() : entry.item.events,
        replay: entry.item.replay.status === 'uploading' ? pending() : entry.item.replay };
    }
    this.publish();
  };

  readonly getStatus = (ownerId: PlayerId, runId: RunId): ReplayQueueItemStatus | undefined => {
    if (this.session?.ownerId !== ownerId) return undefined;
    const entry = this.entries.get(replayStorageKey(ownerId, runId));
    return entry ? this.status(entry) : undefined;
  };

  readonly refresh = async (): Promise<void> => {
    const ownerId = this.session?.ownerId;
    const epoch = this.epoch;
    if (!ownerId) return;
    try {
      const rows = await this.storage.list(ownerId);
      if (epoch !== this.epoch) return;
      for (const raw of rows) {
        try {
          const stored = decodeStoredReplay(raw);
          if (stored.ownerId !== ownerId) throw new Error('Stored owner mismatch');
          if (this.jobs.has(stored.key)) continue;
          const current = this.entries.get(stored.key);
          this.entries.set(stored.key, { item: mergeStoredReplay(current?.item, stored), durable: true });
        } catch { this.corruptWarning = '部分本机回放无法读取或内容冲突，原始数据仍保留；其余记录可正常补传。'; }
      }
    } catch { this.warning = '暂时无法读取本机回放存储，当前页面中的记录仍保留。'; }
    this.publish();
  };

  readonly enqueue = async (ownerInput: PlayerId, runInput: RunId, input: RecordedRun): Promise<void> => {
    const ownerId = parsePlayerId(ownerInput);
    const runId = parseRunId(runInput);
    // Clone before crossing any asynchronous boundary so callers cannot mutate a queued run.
    const recorded = decodeRecordedRun(structuredClone(input));
    const payload = await verifyReplayEnvelope(recorded.replay);
    if (payload.manifest.runId !== runId) throw new Error('录制内容与局次不匹配，不能上传。');
    const key = replayStorageKey(ownerId, runId);
    let current = this.entries.get(key);
    if (!current) {
      try {
        const raw = await this.storage.get(key);
        if (raw !== undefined) {
          const stored = decodeStoredReplay(raw);
          if (stored.key !== key) throw new ReplayContentConflict();
          current = { item: stored, durable: true };
        }
      } catch (error) {
        if (error instanceof ReplayContentConflict) throw error;
        // A read failure is not proof of absence. Atomic put below still refuses overwrites.
      }
    }
    if (current && !sameRecorded(current.item.recorded, recorded)) throw new ReplayContentConflict();
    const entry: MemoryEntry = current ?? { durable: false, item: {
      version: 1, key, ownerId, runId, recorded, createdAt: Date.now(), events: pending(), replay: pending(),
    } };
    this.entries.set(key, entry);
    try {
      entry.item = await this.storage.put(entry.item);
      entry.durable = true;
      this.dependencies.onPersisted?.();
      this.clearStorageWarningIfDurable();
    } catch (error) {
      if (error instanceof ReplayContentConflict) {
        if (!current) this.entries.delete(key);
        this.publish();
        throw error;
      }
      this.warning = new ReplayStorageError().message;
      this.publish();
      throw new ReplayStorageError();
    }
    this.publish();
  };

  readonly getLocal = async (ownerId: PlayerId, runId: RunId): Promise<RecordedRun | null> => {
    if (this.session?.ownerId !== ownerId) return null;
    const epoch = this.epoch;
    const key = replayStorageKey(ownerId, runId);
    const cached = this.entries.get(key);
    if (cached) return structuredClone(cached.item.recorded);
    const raw = await this.storage.get(key);
    if (epoch !== this.epoch || this.session?.ownerId !== ownerId) return null;
    if (raw === undefined) return null;
    const stored = decodeStoredReplay(raw);
    if (stored.key !== key) throw new Error('本机回放归属与请求不匹配。');
    this.entries.set(key, { item: stored, durable: true });
    this.publish();
    return structuredClone(stored.recorded);
  };

  readonly retry = async (runId?: RunId): Promise<void> => {
    const epoch = this.epoch;
    await this.refresh();
    const session = this.session;
    if (!session || epoch !== this.epoch) return;
    // Serial uploads limit peak JSON/network memory. Two browser tabs may safely retry the same payload.
    for (const entry of this.entries.values()) {
      if (this.epoch !== epoch) return;
      if (entry.item.ownerId !== session.ownerId || (runId && entry.item.runId !== runId)) continue;
      const running = this.jobs.get(entry.item.key);
      if (running?.epoch === epoch) { await running.promise; continue; }
      const controller = new AbortController();
      const promise = this.upload(entry, session, epoch, controller.signal).finally(() => {
        if (this.jobs.get(entry.item.key)?.controller === controller) this.jobs.delete(entry.item.key);
      });
      this.jobs.set(entry.item.key, { epoch, controller, promise });
      await promise;
    }
  };

  private active(session: ReplayOwnerSession, epoch: number, signal: AbortSignal): boolean {
    return !signal.aborted && this.epoch === epoch && this.session?.ownerId === session.ownerId && this.session.token === session.token;
  }

  private async upload(entry: MemoryEntry, session: ReplayOwnerSession, epoch: number, signal: AbortSignal): Promise<void> {
    const active = () => this.active(session, epoch, signal);
    if (!entry.durable) {
      try {
        const stored = await this.storage.put(entry.item);
        if (!active()) return;
        entry.item = stored; entry.durable = true;
        this.dependencies.onPersisted?.(); this.clearStorageWarningIfDurable(); this.publish();
      } catch (error) {
        if (!active()) return;
        if (error instanceof ReplayContentConflict) {
          entry.item = { ...entry.item, events: { status: 'blocked', message: error.message }, replay: { status: 'blocked', message: error.message } };
          this.publish(); return;
        }
        this.warning = new ReplayStorageError().message;
        this.publish(); // A cloud upload can still rescue memory-only data.
      }
    }
    if (!['events', 'replay'].some(part => entry.item[part as 'events' | 'replay'].status === 'pending')) return;
    try {
      if (!await this.dependencies.resultExists(entry.item, session, signal)) {
        if (active()) await this.waitForResult(entry);
        return;
      }
    } catch (error) {
      if (!active()) return;
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) await this.waitForResult(entry);
      else for (const part of ['events', 'replay'] as const) {
        if (!active()) return;
        if (entry.item[part].status === 'pending') await this.failPart(entry, part, error, session);
      }
      return;
    }
    for (const part of ['events', 'replay'] as const) {
      if (!active()) return;
      if (entry.item[part].status !== 'pending') continue;
      await this.setPart(entry, part, { status: 'uploading', message: null });
      if (!active()) return;
      try {
        await (part === 'events' ? this.dependencies.saveEvents : this.dependencies.saveReplay)(entry.item, session, signal);
        if (active()) await this.setPart(entry, part, { status: 'saved', message: null });
      } catch (error) {
        if (!active()) return;
        // After an upload conflict, check whether the prerequisite result vanished/not yet exists.
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          let exists = true;
          try { exists = await this.dependencies.resultExists(entry.item, session, signal); }
          catch (lookupError) {
            if (lookupError instanceof ApiError && (lookupError.status === 404 || lookupError.status === 409)) exists = false;
            else if (active()) { await this.failPart(entry, part, lookupError, session); return; }
          }
          if (!active()) return;
          if (!exists) { await this.setPart(entry, part, pending('等待成绩保存成功后自动补传。')); continue; }
        }
        await this.failPart(entry, part, error, session);
      }
    }
  }

  private async waitForResult(entry: MemoryEntry): Promise<void> {
    for (const part of ['events', 'replay'] as const) {
      if (entry.item[part].status === 'pending') await this.setPart(entry, part, pending('等待成绩保存成功后自动补传。'));
    }
  }

  private async failPart(entry: MemoryEntry, part: 'events' | 'replay', error: unknown, session: ReplayOwnerSession): Promise<void> {
    if (isAuth(error)) {
      await this.setPart(entry, part, pending('登录已过期，请用原账号重新登录后补传。'));
      this.dependencies.onUnauthorized?.(session.token);
      return;
    }
    const blocked = error instanceof ApiError && (error.status === 400 || error.status === 403 || error.status === 409 || error.status === 413);
    const message = blocked
      ? (error.status === 409 ? '服务器已有不同的过程记录，不能覆盖；本机原始记录已保留。' : `过程记录未被接受：${error.message}。本机原始记录已保留。`)
      : '暂时无法上传，恢复网络后将自动重试；本机记录保留。';
    await this.setPart(entry, part, { status: blocked ? 'blocked' : 'pending', message });
  }

  private async setPart(entry: MemoryEntry, part: 'events' | 'replay', state: ReplayUploadState): Promise<void> {
    entry.item = { ...entry.item, [part]: state };
    this.publish();
    try {
      const stored = await this.storage.put(entry.item);
      // A write started before logout must not resurrect the visible 'uploading' state.
      entry.item = mergeStoredReplay(stored, entry.item);
      entry.durable = true;
      this.dependencies.onPersisted?.();
      this.clearStorageWarningIfDurable();
    } catch { this.warning = entry.durable ? '回放仍在本机，但上传状态暂未写入；重试不会重复生成成绩。' : new ReplayStorageError().message; }
    this.publish();
  }

  private clearStorageWarningIfDurable(): void {
    if ([...this.entries.values()].every(entry => entry.durable)) this.warning = null;
  }

  private status(entry: MemoryEntry): ReplayQueueItemStatus {
    const { ownerId, runId, createdAt, events, replay } = entry.item;
    return Object.freeze({ ownerId, runId, createdAt, events, replay, durable: entry.durable });
  }

  private publish(): void {
    this.snapshot = Object.freeze({ revision: this.snapshot.revision + 1,
      items: Object.freeze([...this.entries.values()].filter(entry => entry.item.ownerId === this.session?.ownerId).map(entry => this.status(entry))),
      storageWarning: this.corruptWarning ?? this.warning });
    for (const listener of this.listeners) listener();
  }
}
