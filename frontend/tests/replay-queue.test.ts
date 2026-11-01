import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePlayerId } from '../src/objects/player/PlayerId.ts';
import { decodeRecordedRun, type RecordedRun } from '../src/objects/records/RecordedRun.ts';
import { replayContentHash } from '../src/objects/records/ReplayEnvelope.ts';
import { parseSessionToken } from '../src/objects/system/SessionToken.ts';
import { parseRunId, type RunId } from '../src/objects/training/RunId.ts';
import { decodeWorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';
import { PRACTICE_CONFIG } from '../src/pages/Training/functions/practiceConfig.ts';
import { ApiError } from '../src/system/api/ApiError.ts';
import { ReplayQueue } from '../src/system/replays/ReplayQueue.ts';
import type { ReplayOwnerSession, ReplayQueueDependencies } from '../src/system/replays/ReplayQueueDependencies.ts';
import { ReplayContentConflict, ReplayStorageError, type ReplayStorage } from '../src/system/replays/ReplayStorage.ts';
import { decodeStoredReplay, mergeStoredReplay, replayStorageKey } from '../src/system/replays/replayStorageCodec.ts';
import type { StoredReplay } from '../src/system/replays/StoredReplay.ts';

const ownerA = parsePlayerId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const ownerB = parsePlayerId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const runA = parseRunId('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
const runB = parseRunId('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
const tokenA = parseSessionToken('a'.repeat(43));
const tokenNew = parseSessionToken('n'.repeat(43));
const tokenB = parseSessionToken('b'.repeat(43));
const sessionA: ReplayOwnerSession = { ownerId: ownerA, token: tokenA };
const sessionB: ReplayOwnerSession = { ownerId: ownerB, token: tokenB };
const world = decodeWorldDefinition(JSON.parse(readFileSync(new URL('../../shared/worlds/garden-courtyard.json', import.meta.url), 'utf8')) as unknown);

async function recorded(runId: RunId = runA, alternate = false): Promise<RecordedRun> {
  const end = { seq: 0, tMs: 1000, kind: 'round-end', actorId: 'player', targetId: null, position: null, value: null, detail: 'defeat' };
  const frame = (tMs: number) => ({ tMs, scoreElapsedMs: tMs, throughEventSeq: tMs === 1000 ? 0 : -1,
    player: { position: { x: alternate ? 1 : 0, y: 0, z: 0 }, yaw: 0, animation: 'idle', animationTime: 0, aimWeight: 0, alive: tMs !== 1000 },
    drones: world.drones.map(drone => ({ id: drone.id, position: { x: drone.x, y: 2.2, z: drone.z }, yaw: drone.yaw, hp: 3, state: 'scanning', flight: 'cruising' })),
    projectiles: [], tools: [], world: { openGateIds: [], beaconActivated: false, extracted: false },
    camera: { position: { x: 0, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, fov: 50 },
  });
  const payloadJson = JSON.stringify({ manifest: { formatVersion: 1, runId, config: PRACTICE_CONFIG, world, mapVersionId: null,
    missionId: 'clear-drones', assetVersion: 'garden-v1', sampleHz: 10,
    coverage: { kind: 'complete', reason: null, fromMs: 0, toMs: 1000, resultAtMs: 1000, runDurationMs: 1000 } },
    frames: [frame(0), frame(1000)], events: [end] });
  return decodeRecordedRun({ summary: { formatVersion: 1, runDurationMs: 1000, resultAtMs: 1000, truncated: false, events: [end] },
    replay: { contentHash: await replayContentHash(payloadJson), payloadJson } });
}

class MemoryStorage implements ReplayStorage {
  readonly rows = new Map<string, StoredReplay>();
  failWrites = false;
  failReads = false;
  async get(key: string) { if (this.failReads) throw new Error('unavailable'); return structuredClone(this.rows.get(key)); }
  async list(ownerId: string) { if (this.failReads) throw new Error('unavailable'); return structuredClone([...this.rows.values()].filter(item => item.ownerId === ownerId)); }
  async put(item: StoredReplay) {
    if (this.failWrites) throw new Error('quota');
    const merged = mergeStoredReplay(this.rows.get(item.key), item);
    this.rows.set(item.key, structuredClone(merged));
    return structuredClone(merged);
  }
}

function dependencies(overrides: Partial<ReplayQueueDependencies> = {}): ReplayQueueDependencies {
  return { resultExists: async () => true, saveEvents: async () => {}, saveReplay: async () => {}, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const offline = () => new ApiError({ kind: 'network', message: 'offline' });
const conflict = () => new ApiError({ kind: 'http', status: 409, code: 'conflict', message: 'different data' });

test('recordings are partitioned by owner and only the active owner can read or upload them', async () => {
  const storage = new MemoryStorage();
  const uploads: string[] = [];
  const queue = new ReplayQueue(storage, dependencies({ saveEvents: async (item, session) => { uploads.push(`${item.ownerId}:${session.token}`); } }));
  await queue.enqueue(ownerA, runA, await recorded(runA));
  await queue.enqueue(ownerB, runB, await recorded(runB));
  queue.setSession(sessionA);
  await queue.retry();
  assert.deepEqual(uploads, [`${ownerA}:${tokenA}`]);
  assert.equal(queue.getSnapshot().items.length, 1);
  assert.equal(await queue.getLocal(ownerB, runB), null);
  assert.equal(queue.getStatus(ownerB, runB), undefined);
  queue.setSession(sessionB);
  await queue.retry();
  assert.deepEqual(uploads, [`${ownerA}:${tokenA}`, `${ownerB}:${tokenB}`]);
  assert.equal(storage.rows.size, 2, 'upload success keeps the local replay');
});

test('event success and replay failure persist independently across page reload and retry', async () => {
  const storage = new MemoryStorage();
  let eventCalls = 0, replayCalls = 0;
  const first = new ReplayQueue(storage, dependencies({ saveEvents: async () => { eventCalls++; }, saveReplay: async () => { replayCalls++; throw offline(); } }));
  first.setSession(sessionA);
  await first.enqueue(ownerA, runA, await recorded());
  await first.retry();
  assert.equal(first.getStatus(ownerA, runA)?.events.status, 'saved');
  assert.equal(first.getStatus(ownerA, runA)?.replay.status, 'pending');
  const reloaded = new ReplayQueue(storage, dependencies({ saveEvents: async () => { eventCalls++; }, saveReplay: async () => { replayCalls++; } }));
  reloaded.setSession(sessionA);
  await reloaded.retry();
  assert.equal(eventCalls, 1);
  assert.equal(replayCalls, 2);
  assert.equal(reloaded.getStatus(ownerA, runA)?.replay.status, 'saved');
  assert.equal((await reloaded.getLocal(ownerA, runA))?.replay.contentHash, (await recorded()).replay.contentHash);
});

test('no recording uploads until the corresponding score exists', async () => {
  let exists = false, uploads = 0;
  const storage = new MemoryStorage();
  const queue = new ReplayQueue(storage, dependencies({ resultExists: async () => exists, saveEvents: async () => { uploads++; }, saveReplay: async () => { uploads++; } }));
  queue.setSession(sessionA);
  await queue.enqueue(ownerA, runA, await recorded());
  await queue.retry();
  assert.equal(uploads, 0);
  assert.match(queue.getStatus(ownerA, runA)!.events.message!, /等待成绩/);
  assert.equal(storage.rows.size, 1);
  exists = true;
  await queue.retry();
  assert.equal(uploads, 2);
});

test('409 before a score exists is retriable, content conflict after score existence remains blocked', async () => {
  let checkCalls = 0, uploadCalls = 0;
  const queue = new ReplayQueue(new MemoryStorage(), dependencies({
    resultExists: async () => { checkCalls++; if (checkCalls === 1) throw conflict(); return true; },
    saveEvents: async () => { uploadCalls++; throw conflict(); },
  }));
  queue.setSession(sessionA); await queue.enqueue(ownerA, runA, await recorded());
  await queue.retry(); assert.equal(uploadCalls, 0);
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'pending');
  await queue.retry();
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'blocked');
  assert.equal(queue.getStatus(ownerA, runA)?.replay.status, 'saved', 'event conflict does not discard independent replay');
  await queue.retry(); assert.equal(uploadCalls, 1, 'permanent conflict is not automatically hammered');
});

test('upload 404 followed by missing result stays queued instead of becoming a permanent conflict', async () => {
  let checks = 0;
  const queue = new ReplayQueue(new MemoryStorage(), dependencies({
    resultExists: async () => ++checks % 2 === 1,
    saveEvents: async () => { throw new ApiError({ kind: 'http', status: 404, code: 'not_found', message: 'result missing' }); },
  }));
  queue.setSession(sessionA); await queue.enqueue(ownerA, runA, await recorded()); await queue.retry();
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'pending');
  assert.match(queue.getStatus(ownerA, runA)!.events.message!, /等待成绩/);
});

test('logout aborts a pending request and late responses cannot mark a recording saved', async () => {
  const began = deferred<AbortSignal>(), response = deferred<void>();
  const storage = new MemoryStorage();
  let replayCalls = 0;
  const queue = new ReplayQueue(storage, dependencies({ saveEvents: async (_item, _session, signal) => { began.resolve(signal); await response.promise; }, saveReplay: async () => { replayCalls++; } }));
  queue.setSession(sessionA); await queue.enqueue(ownerA, runA, await recorded());
  const attempt = queue.retry();
  const signal = await began.promise;
  queue.setSession(null);
  assert.equal(signal.aborted, true);
  response.resolve(); await attempt;
  assert.equal(queue.getSnapshot().items.length, 0);
  queue.setSession(sessionA);
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'pending');
  assert.equal(replayCalls, 0);
  assert.notEqual(storage.rows.get(replayStorageKey(ownerA, runA))?.events.status, 'saved');
});

test('new login token retries only the same owner while another account never adopts old work', async () => {
  const tokens: string[] = [];
  const queue = new ReplayQueue(new MemoryStorage(), dependencies({ saveEvents: async (_item, session) => { tokens.push(session.token); if (session.token === tokenA) throw offline(); } }));
  queue.setSession(sessionA); await queue.enqueue(ownerA, runA, await recorded()); await queue.retry();
  queue.setSession(sessionB); await queue.retry();
  assert.deepEqual(tokens, [tokenA]);
  queue.setSession({ ownerId: ownerA, token: tokenNew }); await queue.retry();
  assert.deepEqual(tokens, [tokenA, tokenNew]);
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'saved');
});

test('quota failure explicitly rejects enqueue but retains memory data through logout and a later successful retry', async () => {
  const storage = new MemoryStorage(); storage.failWrites = true;
  const queue = new ReplayQueue(storage, dependencies({ resultExists: async () => false }));
  queue.setSession(sessionA);
  const input = await recorded();
  await assert.rejects(queue.enqueue(ownerA, runA, input), ReplayStorageError);
  assert.equal(queue.getStatus(ownerA, runA)?.durable, false);
  assert.equal((await queue.getLocal(ownerA, runA))?.replay.contentHash, input.replay.contentHash);
  assert.equal(queue.hasUnpersisted(), true);
  queue.setSession(null); assert.equal(queue.hasUnpersisted(), true, 'logout does not hide unload data-loss protection');
  queue.setSession(sessionA); storage.failWrites = false; await queue.retry();
  assert.equal(queue.getStatus(ownerA, runA)?.durable, true);
  assert.equal(queue.hasUnpersisted(), false);
  assert.equal(storage.rows.size, 1);
});

test('different local content cannot replace a run, and identical retries preserve saved parts', async () => {
  const storage = new MemoryStorage();
  const queue = new ReplayQueue(storage, dependencies()); queue.setSession(sessionA);
  const first = await recorded(); await queue.enqueue(ownerA, runA, first); await queue.retry();
  await assert.rejects(queue.enqueue(ownerA, runA, await recorded(runA, true)), ReplayContentConflict);
  await queue.enqueue(ownerA, runA, first);
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'saved');
  assert.equal((await queue.getLocal(ownerA, runA))?.replay.contentHash, first.replay.contentHash);
});

test('bad hash or mismatched manifest runId is rejected before persistence or upload', async () => {
  const storage = new MemoryStorage(); const queue = new ReplayQueue(storage, dependencies());
  const input = await recorded();
  await assert.rejects(queue.enqueue(ownerA, runA, { ...input, replay: { ...input.replay, contentHash: '0'.repeat(64) } }));
  await assert.rejects(queue.enqueue(ownerA, runB, input), /局次不匹配/);
  assert.equal(storage.rows.size, 0);
});

test('cross-tab atomic merge does not revert saved status and detects different frozen payloads', async () => {
  const storage = new MemoryStorage(); const first = new ReplayQueue(storage, dependencies()); first.setSession(sessionA);
  await first.enqueue(ownerA, runA, await recorded());
  const stale = structuredClone(storage.rows.get(replayStorageKey(ownerA, runA))!);
  await first.retry();
  const merged = await storage.put(stale);
  assert.equal(merged.events.status, 'saved'); assert.equal(merged.replay.status, 'saved');
  await assert.rejects(storage.put({ ...stale, recorded: await recorded(runA, true) }), ReplayContentConflict);
});

test('unauthorized response remains pending and reports the captured token', async () => {
  const tokens: string[] = [];
  const queue = new ReplayQueue(new MemoryStorage(), dependencies({
    resultExists: async () => { throw new ApiError({ kind: 'http', status: 401, code: 'unauthorized', message: 'expired' }); },
    onUnauthorized: token => { tokens.push(token); },
  }));
  queue.setSession(sessionA); await queue.enqueue(ownerA, runA, await recorded()); await queue.retry();
  assert.equal(queue.getStatus(ownerA, runA)?.events.status, 'pending');
  assert.ok(tokens.every(token => token === tokenA));
});

test('malformed stored content is retained and skipped while valid recordings still upload', async () => {
  const storage = new MemoryStorage(); const queue = new ReplayQueue(storage, dependencies()); queue.setSession(sessionA);
  await queue.enqueue(ownerA, runA, await recorded()); await queue.enqueue(ownerA, runB, await recorded(runB));
  const badKey = replayStorageKey(ownerA, runB);
  const corrupted = storage.rows.get(badKey)!;
  storage.rows.set(badKey, { ...corrupted, version: 999 } as unknown as StoredReplay);
  const reloaded = new ReplayQueue(storage, dependencies()); reloaded.setSession(sessionA); await reloaded.retry();
  assert.equal(reloaded.getStatus(ownerA, runA)?.replay.status, 'saved');
  assert.equal(storage.rows.get(badKey)?.version, 999);
  assert.throws(() => decodeStoredReplay(storage.rows.get(badKey)));
});
