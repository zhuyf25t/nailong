import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlayerId } from '../src/objects/player/PlayerId.ts';
import { decodeTrainingResult } from '../src/objects/records/TrainingResult.ts';
import { parseSessionToken } from '../src/objects/system/SessionToken.ts';
import { parseRunId } from '../src/objects/training/RunId.ts';
import { ApiError } from '../src/system/api/ApiError.ts';
import { PendingResultQueue, PENDING_RESULTS_STORAGE_KEY, pendingResultStorageKey } from '../src/system/results/PendingResultQueue.ts';
import type { PendingResultItem } from '../src/system/results/PendingResultItem.ts';
import type { QueueStorage } from '../src/system/results/QueueStorage.ts';

const owner = parsePlayerId('11111111-1111-4111-8111-111111111111');
const other = parsePlayerId('22222222-2222-4222-8222-222222222222');
const runId = parseRunId('33333333-3333-4333-8333-333333333333');
const token = parseSessionToken('a'.repeat(43));
const otherToken = parseSessionToken('b'.repeat(43));
const submission = { outcome: 'victory', shotsFired: 14, hits: 12, destroyed: 4, elapsedMs: 23_000 } as const;
const input = { playerId: owner, runId, submission };

class MemoryStorage implements QueueStorage {
  readonly values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('Quota exceeded');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.failWrites) throw new Error('Storage blocked');
    this.values.delete(key);
  }
}

function saved(item: PendingResultItem = input) {
  return decodeTrainingResult({
    ...item.submission, runId: item.runId, playerId: item.playerId,
    configId: 'c8137000-0000-4000-8000-000000000001', configVersion: 'drone-hunt-v1',
    terrain: { hillHeight: 1, hillWidth: 5, hillX: 0, hillZ: 0, ripple: 0.1 },
    accuracy: item.submission.hits / item.submission.shotsFired,
    submittedAt: '2026-11-01T00:00:00Z',
  });
}

test('objective progress survives reload, freezes nested state and participates in conflict checks', async () => {
  const storage = new MemoryStorage();
  const queue = new PendingResultQueue(storage, async (item) => saved(item));
  const progress = { beaconActivated: true, extracted: true };
  const item = queue.enqueue({ ...input, submission: { ...submission, objectiveProgress: progress } });
  progress.extracted = false;
  assert.deepEqual(item.submission.objectiveProgress, { beaconActivated: true, extracted: true });
  assert.equal(Object.isFrozen(item.submission.objectiveProgress), true);
  assert.throws(() => queue.enqueue({ ...input, submission: { ...submission, objectiveProgress: progress } }), /不同/);
  assert.throws(() => queue.enqueue(input), /不同/);
  const restored = new PendingResultQueue(storage, async (pending) => saved(pending));
  assert.deepEqual(restored.itemsFor(owner)[0].submission.objectiveProgress, { beaconActivated: true, extracted: true });
  assert.equal((await restored.retry(restored.itemsFor(owner)[0], { playerId: owner, token })).status, 'saved');
  assert.equal(restored.itemsFor(owner).length, 0);
});

test('legacy absent progress and nullable response progress are equivalent, but falsified progress cannot acknowledge a save', async () => {
  const queue = new PendingResultQueue(new MemoryStorage(), async (item) => ({ ...saved(item), objectiveProgress: null }));
  const item = queue.enqueue(input);
  assert.equal((await queue.retry(item, { playerId: owner, token })).status, 'saved');
  const otherQueue = new PendingResultQueue(new MemoryStorage(), async (pending) => ({ ...saved(pending), objectiveProgress: { beaconActivated: false, extracted: false } }));
  const extended = otherQueue.enqueue({ ...input, submission: { ...submission, objectiveProgress: { beaconActivated: true, extracted: true } } });
  assert.equal((await otherQueue.retry(extended, { playerId: owner, token })).status, 'failed');
  assert.equal(otherQueue.itemsFor(owner).length, 1);
});

test('enqueue freezes a copy and conflicting same-run submission cannot overwrite it', () => {
  const storage = new MemoryStorage();
  const queue = new PendingResultQueue(storage, async (item) => saved(item));
  const editable = { ...submission, shotsFired: 14 };
  const item = queue.enqueue({ ...input, submission: editable });
  editable.shotsFired = 100;
  assert.equal(item.submission.shotsFired, 14);
  assert.equal(Object.isFrozen(item), true);
  assert.equal(Object.isFrozen(item.submission), true);
  assert.equal(queue.enqueue(input), item);
  assert.throws(() => queue.enqueue({ ...input, submission: { ...submission, shotsFired: 15 } }), /不同/);
  assert.equal(queue.getSnapshot().items.length, 1);
  const restored = new PendingResultQueue(storage, async (result) => saved(result));
  assert.deepEqual(restored.getSnapshot().items, [input]);
  assert.equal(storage.getItem(pendingResultStorageKey(owner, runId))?.includes(token), false);
});

test('invalid legacy queue storage is rejected as unknown and preserved alongside new valid items', () => {
  const invalidValues: unknown[] = [
    'bad-json',
    { version: 2, items: [input] },
    { version: 1, items: [{ ...input, playerId: 'wrong-id' }] },
    { version: 1, items: [{ ...input, submission: { ...submission, hits: 15 } }] },
    { version: 1, items: [{ ...input, submission: { ...submission, elapsedMs: -1 } }] },
    { version: 1, items: [{ ...input, submission: { ...submission, outcome: 'completed' } }] },
    { version: 1, items: [{ ...input, userToken: token }] },
    { version: 1, items: [input, input] },
  ];
  for (const value of invalidValues) {
    const storage = new MemoryStorage();
    const raw = value === 'bad-json' ? '{' : JSON.stringify(value);
    storage.setItem(PENDING_RESULTS_STORAGE_KEY, raw);
    const queue = new PendingResultQueue(storage, async (item) => saved(item));
    assert.equal(queue.getSnapshot().items.length, 0);
    assert.ok(queue.getSnapshot().corruptStorage);
    assert.equal(storage.getItem(PENDING_RESULTS_STORAGE_KEY), raw);
    queue.enqueue(input);
    assert.equal(storage.getItem(PENDING_RESULTS_STORAGE_KEY), raw);
    assert.ok(storage.getItem(pendingResultStorageKey(owner, runId)));
  }
});

test('account change never submits another owner and retryAll only uses captured credentials', async () => {
  const storage = new MemoryStorage();
  const calls: { owner: string; token: string }[] = [];
  const queue = new PendingResultQueue(storage, async (item, session) => {
    calls.push({ owner: item.playerId, token: session.token });
    return saved(item);
  });
  const mine = queue.enqueue(input);
  queue.enqueue({ ...input, playerId: other });
  assert.deepEqual(await queue.retry(mine, { playerId: other, token: otherToken }), { status: 'wrong-account' });
  assert.equal(calls.length, 0);
  assert.equal(queue.itemsFor(owner).length, 1);
  await queue.retryAll({ playerId: owner, token });
  assert.deepEqual(calls, [{ owner, token }]);
  assert.equal(queue.itemsFor(other).length, 1);
  assert.equal(queue.itemsFor(owner).length, 0);
});

test('concurrent retry calls share one request, frozen owner and token, and success removes durable pending data', async () => {
  const storage = new MemoryStorage();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let callCount = 0;
  let seenToken = '';
  const queue = new PendingResultQueue(storage, async (item, session) => {
    callCount += 1;
    await gate;
    seenToken = session.token;
    return saved(item);
  });
  const item = queue.enqueue(input);
  const credentials = { playerId: owner, token };
  const first = queue.retry(item, credentials);
  const second = queue.retry(item, { playerId: owner, token: otherToken });
  credentials.token = otherToken;
  assert.equal(first, second);
  assert.equal(queue.getStatus(owner, runId)?.status, 'saving');
  release?.();
  const result = await first;
  assert.equal(result.status, 'saved');
  assert.equal(callCount, 1);
  assert.equal(seenToken, token);
  assert.equal(queue.getStatus(owner, runId)?.status, 'saved');
  assert.equal(queue.getSnapshot().items.length, 0);
  assert.equal(storage.getItem(pendingResultStorageKey(owner, runId)), null);
  await queue.retry(item, { playerId: owner, token });
  assert.equal(callCount, 1);
});

test('network failure survives provider recreation and retry uses the same run and values', async () => {
  const storage = new MemoryStorage();
  const queue = new PendingResultQueue(storage, async () => { throw new ApiError({ kind: 'network', message: '网络中断' }); });
  const item = queue.enqueue(input);
  const failed = await queue.retry(item, { playerId: owner, token });
  assert.deepEqual(failed, { status: 'failed', kind: 'network', code: null, message: '网络中断' });
  const reloaded = new PendingResultQueue(storage, async (attempt) => {
    assert.deepEqual(attempt, input);
    return saved(attempt);
  });
  assert.equal(reloaded.itemsFor(owner).length, 1);
  assert.equal((await reloaded.retry(reloaded.itemsFor(owner)[0], { playerId: owner, token })).status, 'saved');
});

test('HTTP unauthorized is surfaced for original-account re-login and never removes pending data', async () => {
  const queue = new PendingResultQueue(new MemoryStorage(), async () => {
    throw new ApiError({ kind: 'http', status: 401, code: 'unauthorized', message: '请重新登录' });
  });
  const item = queue.enqueue(input);
  const result = await queue.retry(item, { playerId: owner, token });
  assert.equal(result.status, 'failed');
  if (result.status === 'failed') assert.equal(result.code, 'unauthorized');
  assert.equal(queue.getSnapshot().items.length, 1);
});

test('wrong-owner or changed server response cannot discard the frozen local result', async () => {
  for (const response of [saved({ ...input, playerId: other }), saved({ ...input, submission: { ...submission, shotsFired: 15 } })]) {
    const queue = new PendingResultQueue(new MemoryStorage(), async () => response);
    const item = queue.enqueue(input);
    const result = await queue.retry(item, { playerId: owner, token });
    assert.equal(result.status, 'failed');
    if (result.status === 'failed') assert.equal(result.kind, 'decode');
    assert.equal(queue.getSnapshot().items.length, 1);
  }
});

test('storage failure is distinct from remote success and never claims local durability', async () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const queue = new PendingResultQueue(storage, async (item) => saved(item));
  const item = queue.enqueue(input);
  assert.equal(queue.getSnapshot().items.length, 1);
  assert.ok(queue.getSnapshot().storageWarning?.includes('只保留在当前页面'));
  assert.equal(storage.getItem(pendingResultStorageKey(owner, runId)), null);
  assert.equal((await queue.retry(item, { playerId: owner, token })).status, 'saved');
  assert.ok(queue.getSnapshot().storageWarning);
  assert.equal(queue.getStatus(owner, runId)?.status, 'saved');
});

test('blocked browser storage keeps in-memory results and clearly warns against closing', () => {
  const queue = new PendingResultQueue(null, async (item) => saved(item));
  queue.enqueue(input);
  assert.equal(queue.getSnapshot().items.length, 1);
  assert.ok(queue.getSnapshot().storageWarning?.includes('请勿刷新或关闭'));
});

test('two open tabs persist independent offline results and uploading A never deletes B', async () => {
  const storage = new MemoryStorage();
  const tabA = new PendingResultQueue(storage, async (item) => saved(item));
  const tabB = new PendingResultQueue(storage, async (item) => saved(item));
  const itemA = tabA.enqueue(input);
  const itemB = tabB.enqueue({ ...input, playerId: other });
  const reopened = new PendingResultQueue(storage, async (item) => saved(item));
  assert.equal(reopened.itemsFor(owner).length, 1);
  assert.equal(reopened.itemsFor(other).length, 1);
  const bBefore = storage.getItem(pendingResultStorageKey(other, runId));
  await tabA.retry(itemA, { playerId: owner, token });
  assert.equal(storage.getItem(pendingResultStorageKey(owner, runId)), null);
  assert.equal(storage.getItem(pendingResultStorageKey(other, runId)), bBefore);
  tabB.refreshFromStorage();
  assert.deepEqual(tabB.getSnapshot().items, [itemB]);
  const again = new PendingResultQueue(storage, async (item) => saved(item));
  assert.deepEqual(again.getSnapshot().items, [itemB]);
});

test('storage synchronization receives another tab new runs while preserving a failed local write', () => {
  const storage = new MemoryStorage();
  const tabA = new PendingResultQueue(storage, async (item) => saved(item));
  const tabB = new PendingResultQueue(storage, async (item) => saved(item));
  storage.failWrites = true;
  tabA.enqueue(input);
  storage.failWrites = false;
  const secondRun = { ...input, runId: parseRunId('44444444-4444-4444-8444-444444444444') };
  tabB.enqueue(secondRun);
  tabA.refreshFromStorage();
  assert.equal(tabA.itemsFor(owner).length, 2);
  assert.ok(tabA.getSnapshot().storageWarning);
  assert.ok(tabA.itemsFor(owner).find((item) => item.runId === runId));
});

test('legacy migration preserves other tabs new keys and stale legacy data cannot revive uploaded entries', async () => {
  const storage = new MemoryStorage();
  const legacy = JSON.stringify({ version: 1, items: [input] });
  storage.setItem(PENDING_RESULTS_STORAGE_KEY, legacy);
  const tabA = new PendingResultQueue(storage, async (item) => saved(item));
  const tabB = new PendingResultQueue(storage, async (item) => saved(item));
  const next = { ...input, playerId: other };
  tabB.enqueue(next); // Migrates the old item, then independently appends B.
  assert.equal(storage.getItem(PENDING_RESULTS_STORAGE_KEY), null);
  await tabA.retry(input, { playerId: owner, token });
  assert.ok(storage.getItem(pendingResultStorageKey(other, runId)));
  // Model a tab that was paused halfway through its old-data migration.
  storage.setItem(PENDING_RESULTS_STORAGE_KEY, legacy);
  storage.setItem(pendingResultStorageKey(owner, runId), JSON.stringify({ version: 2, legacy: true, item: input }));
  tabB.refreshFromStorage();
  assert.equal(tabB.itemsFor(owner).length, 0);
  assert.equal(tabB.itemsFor(other).length, 1);
  const reloaded = new PendingResultQueue(storage, async (item) => saved(item));
  assert.equal(reloaded.itemsFor(owner).length, 0);
  assert.equal(reloaded.itemsFor(other).length, 1);
});

test('malformed individual storage entry never prevents another valid pending result from loading', () => {
  const storage = new MemoryStorage();
  const queue = new PendingResultQueue(storage, async (item) => saved(item));
  queue.enqueue(input);
  const wrongKey = pendingResultStorageKey(other, runId);
  storage.setItem(wrongKey, JSON.stringify({ version: 2, legacy: false, item: input }));
  const reopened = new PendingResultQueue(storage, async (item) => saved(item));
  assert.deepEqual(reopened.getSnapshot().items, [input]);
  assert.ok(reopened.getSnapshot().corruptStorage);
  assert.ok(storage.getItem(wrongKey));
});

test('v2 accepts a 501st independent result and saving it preserves all 500 previous records', async () => {
  const storage = new MemoryStorage();
  for (let index = 1; index <= 500; index += 1) {
    const previous = { ...input, runId: parseRunId(`55555555-5555-4555-8555-${String(index).padStart(12, '0')}`) };
    storage.setItem(pendingResultStorageKey(previous.playerId, previous.runId), JSON.stringify({ version: 2, legacy: false, item: previous }));
  }
  const previousRecords = new Map(storage.values);
  const queue = new PendingResultQueue(storage, async (item) => saved(item));
  assert.equal(queue.getSnapshot().items.length, 500);
  queue.enqueue(input);
  assert.equal(queue.getSnapshot().items.length, 501);
  const restored = new PendingResultQueue(storage, async (item) => saved(item));
  assert.equal(restored.getSnapshot().items.length, 501);
  assert.equal((await restored.retry(input, { playerId: owner, token })).status, 'saved');
  assert.equal(restored.getSnapshot().items.length, 500);
  assert.deepEqual(storage.values, previousRecords);
  assert.equal(new PendingResultQueue(storage, async (item) => saved(item)).getSnapshot().items.length, 500);
});
