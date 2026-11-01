#!/usr/bin/env node
/** Local HTTP contract QA. No database access, SQL, service control or deletions.
 * Default: plan only. --write-fixtures creates two fresh accounts and only their data.
 * Submitted results are synthetic API fixtures, never evidence of real gameplay.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const checks = [
  ['public', 'Public health, configuration and both built-in missions'],
  ['maps', 'Owned clone, revision conflict, immutable version and invalid world'],
  ['runs', 'Frozen mission setup, selection idempotency and ownership'],
  ['results', 'Legacy clearing and objective-aware extraction results'],
  ['isolation', 'Cross-account map/run/result denial and legacy best isolation'],
  ['events', 'Version-1 event summary, legacy missing state, references and immutable retry'],
  ['replay', 'Version-1 raw-UTF8 hash, coverage, future events, exact retrieval and owner checks'],
  ['browser', 'PENDING: real gameplay, visual occlusion, readonly playback and mobile controls'],
];
const args = process.argv.slice(2);
let execute = false;
let forcePlan = false;
let base = 'http://127.0.0.1:8080';
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--write-fixtures') execute = true;
  else if (args[index] === '--base' && args[index + 1]) base = args[++index];
  else if (args[index] === '--help' || args[index] === '--plan') forcePlan = true;
  else throw new Error('Supported options: --write-fixtures, --base <loopback-origin>, --plan');
}
const origin = new URL(base);
if (forcePlan) execute = false;
assert(['http:', 'https:'].includes(origin.protocol), 'HTTP(S) origin required');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Only loopback servers are allowed');
assert(!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash, 'Use an origin without credentials, path, query or fragment');

if (!execute) {
  console.log(JSON.stringify({ mode: 'PLAN_ONLY', networkRequests: 0, checks, execute: 'node scripts/verify-expansion.mjs --write-fixtures --base http://127.0.0.1:8080' }, null, 2));
  process.exit(0);
}

const outcomes = [];
const accounts = [];
const created = { players: [], maps: [], versions: [], runs: [] };
const clone = value => structuredClone(value);
const uuid = value => assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'Expected a canonical UUID');
const bodyError = reply => `HTTP ${reply.status}${typeof reply.body?.code === 'string' ? ` (${reply.body.code})` : ''}`;

async function call(name, payload = {}, account) {
  const reply = await fetch(new URL(`/api/${name.toLowerCase()}`, origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(account ? { ...payload, userToken: account.token } : payload),
    signal: AbortSignal.timeout(20_000),
  });
  let body;
  try { body = await reply.json(); } catch { throw new Error(`${name}: response was not JSON (HTTP ${reply.status})`); }
  return { status: reply.status, body };
}
async function ok(name, payload = {}, account) {
  const reply = await call(name, payload, account);
  assert.equal(reply.status, 200, `${name}: ${bodyError(reply)}`);
  return reply.body;
}
async function rejects(name, payload, account, statuses) {
  const reply = await call(name, payload, account);
  assert(statuses.includes(reply.status), `${name}: expected ${statuses.join('/')}, received ${bodyError(reply)}`);
  assert.deepEqual(Object.keys(reply.body).sort(), ['code', 'message']);
  assert(typeof reply.body.message === 'string' && reply.body.message.length > 0);
  const codes = { 400: 'validation_error', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict' };
  assert.equal(reply.body.code, codes[reply.status]);
}
async function check(name, task) {
  try {
    const value = await task();
    outcomes.push({ name, status: 'PASS' });
    return value;
  } catch (error) {
    // Do not print server DTOs or tokens through assertion actual/expected fields.
    outcomes.push({ name, status: 'FAIL', message: String(error.message).split('\n')[0] });
    throw error;
  }
}
async function register(label) {
  const username = `qa_${randomBytes(8).toString('hex')}`;
  const auth = await ok('RegisterPlayerAPI', { username, nickname: `扩展验收${label}`, password: `QA_${randomBytes(20).toString('hex')}!` });
  uuid(auth.player?.id);
  assert(typeof auth.userToken === 'string' && auth.userToken.length === 43);
  const account = { id: auth.player.id, token: auth.userToken };
  accounts.push(account);
  created.players.push(account.id);
  return account;
}
async function start(account, config, terrain, selection) {
  const payload = { requestId: randomUUID(), configId: config.id, configVersion: config.version, terrain, ...(selection ? { selection } : {}) };
  const run = await ok('StartTrainingRunAPI', payload, account);
  uuid(run.id);
  created.runs.push(run.id);
  return { run, payload };
}
const save = (account, run, submission) => ok('SaveTrainingResultAPI', { runId: run.id, submission }, account);

/** A deliberately synthetic protocol fixture; never presented as recorded gameplay. */
function recordingFixture(run) {
  const world = run.setup.world;
  const gates = world.objects.filter(item => item.kind === 'gate').map(item => item.id);
  const point = item => ({ x: item.x, y: 0, z: item.z });
  const events = [];
  const emit = (kind, tMs, targetId, position, detail = null) => events.push({ seq: events.length, tMs, kind, actorId: 'player', targetId, position, value: null, detail });
  emit('beacon', 5000, world.beacon.id, point(world.beacon));
  for (const id of gates) emit('gate', 5000, id, null);
  emit('extract', 10000, world.extraction.id, point(world.extraction));
  emit('round-end', 10000, null, point(world.extraction), 'victory');
  const summary = { formatVersion: 1, runDurationMs: 10000, resultAtMs: 10000, truncated: false, events };
  const frames = Array.from({ length: 101 }, (_, index) => {
    const tMs = index * 100;
    const from = tMs <= 5000 ? world.spawn : world.beacon;
    const to = tMs <= 5000 ? world.beacon : world.extraction;
    const fraction = (tMs <= 5000 ? tMs : tMs - 5000) / 5000;
    const position = { x: from.x + (to.x - from.x) * fraction, y: 0, z: from.z + (to.z - from.z) * fraction };
    return {
      tMs, scoreElapsedMs: tMs, throughEventSeq: events.filter(event => event.tMs <= tMs).at(-1)?.seq ?? -1,
      player: { position, yaw: 0, animation: tMs === 10000 ? 'idle' : 'walk', animationTime: tMs / 1000, aimWeight: 0, alive: true },
      drones: world.drones.map(drone => ({ id: drone.id, position: { x: drone.x, y: 2.2, z: drone.z }, yaw: drone.yaw, hp: run.config.drones.maxHp, state: 'scanning', flight: 'cruising' })),
      projectiles: [], tools: [], world: { openGateIds: tMs >= 5000 ? gates : [], beaconActivated: tMs >= 5000, extracted: tMs === 10000 },
      camera: { position: { x: position.x, y: 8, z: position.z + 10 }, target: position, fov: 55 },
    };
  });
  const payload = {
    manifest: { formatVersion: 1, runId: run.id, config: run.config, world, mapVersionId: run.setup.mapVersionId, missionId: run.setup.mission.id, assetVersion: 'garden-v1', sampleHz: 10,
      coverage: { kind: 'complete', reason: null, fromMs: 0, toMs: 10000, runDurationMs: 10000, resultAtMs: 10000 } },
    frames, events,
  };
  return { summary, payload };
}
function envelope(payload, pretty = false) {
  const payloadJson = JSON.stringify(payload, null, pretty ? 1 : undefined);
  return { payloadJson, contentHash: createHash('sha256').update(payloadJson, 'utf8').digest('hex') };
}

// Still internally valid, but disagrees with the original recording on common seqs.
function shiftedActivation(recording) {
  const shifted = clone(recording);
  shifted.summary.events.filter(event => event.tMs === 5000).forEach(event => { event.tMs = 5100; });
  shifted.payload.events = clone(shifted.summary.events);
  for (const frame of shifted.payload.frames) {
    frame.throughEventSeq = shifted.payload.events.filter(event => event.tMs <= frame.tMs).at(-1)?.seq ?? -1;
    if (frame.tMs >= 5000 && frame.tMs < 5100) {
      frame.world.beaconActivated = false;
      frame.world.openGateIds = [];
    }
  }
  return shifted;
}

try {
  const config = await check('public health and configuration', async () => {
    const response = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    return ok('GetTrainingConfigAPI');
  });
  const missions = await check('public missions and lookup', async () => {
    const listed = await ok('ListMissionsAPI');
    assert(Array.isArray(listed.missions));
    for (const id of ['clear-drones', 'forest-beacon']) {
      const mission = listed.missions.find(item => item.id === id);
      assert(mission, `Missing built-in mission: ${id}`);
      uuid(mission.mapVersionId);
      assert.equal(mission.configVersion, config.version);
      assert.deepEqual(await ok('GetMissionAPI', { missionId: id }), mission);
    }
    return listed.missions;
  });
  const owner = await check('create fresh owner QA account', () => register('甲'));
  const stranger = await check('create fresh isolation QA account', () => register('乙'));
  const forest = missions.find(mission => mission.id === 'forest-beacon');
  const clearing = missions.find(mission => mission.id === 'clear-drones');
  assert(forest.allowedTools.includes('curtain'), 'Forest mission must offer curtain for the first implementation');
  await check('private map endpoints require authentication', () => rejects('ListMyMapsAPI', { offset: 0, limit: 30 }, undefined, [401]));

  const template = await check('built-in template and empty personal maps', async () => {
    const listing = await ok('ListMyMapsAPI', { offset: 0, limit: 30 }, owner);
    assert.equal(listing.total, 0);
    assert.deepEqual(listing.maps, []);
    assert(Array.isArray(listing.templates) && listing.templates.length >= 2);
    const value = await ok('GetMapVersionAPI', { mapVersionId: forest.mapVersionId }, owner);
    assert.equal(value.builtIn, true);
    return value;
  });
  const draft = await check('clone template into owned draft', async () => {
    const value = await ok('CloneMapAPI', { mapVersionId: template.id }, owner);
    uuid(value.mapId);
    assert(Number.isInteger(value.revision));
    assert.deepEqual(value.world, template.world);
    created.maps.push(value.mapId);
    assert.deepEqual(await ok('GetMapDraftAPI', { mapId: value.mapId }, owner), value);
    return value;
  });
  await check('private draft denied to other account', () => rejects('GetMapDraftAPI', { mapId: draft.mapId }, stranger, [403, 404]));
  await check('invalid out-of-bounds world does not consume revision', async () => {
    const invalid = clone(draft.world);
    invalid.spawn.x = invalid.bounds.halfSize + 10;
    await rejects('SaveMapDraftAPI', { mapId: draft.mapId, expectedRevision: draft.revision, title: draft.title, world: invalid }, owner, [400]);
    assert.equal((await ok('GetMapDraftAPI', { mapId: draft.mapId }, owner)).revision, draft.revision);
  });
  const version1 = await check('freeze revision idempotently', async () => {
    const payload = { mapId: draft.mapId, expectedRevision: draft.revision };
    const first = await ok('CreateMapVersionAPI', payload, owner);
    uuid(first.id);
    assert.equal(first.builtIn, false);
    assert.deepEqual(first.world, draft.world);
    assert.deepEqual(await ok('CreateMapVersionAPI', payload, owner), first);
    created.versions.push(first.id);
    return first;
  });
  await check('private frozen version denied to other account', () => rejects('GetMapVersionAPI', { mapVersionId: version1.id }, stranger, [403, 404]));
  const selection = { missionId: forest.id, mapVersionId: version1.id, loadout: { tool: 'curtain' } };
  const { run, payload } = await check('start and freeze selected world', async () => {
    const value = await start(owner, config, version1.world.terrain, selection);
    assert.equal(value.run.setup.mapVersionId, version1.id);
    assert.deepEqual(value.run.setup.world, version1.world);
    assert.equal(value.run.setup.mission.id, forest.id);
    assert.deepEqual(value.run.setup.loadout, selection.loadout);
    assert(Number.isSafeInteger(value.run.setup.seed));
    assert.equal(value.run.setup.mission.objective.beaconId, version1.world.beacon.id);
    assert.equal(value.run.setup.mission.objective.extractionId, version1.world.extraction.id);
    return value;
  });
  await check('same start selection returns same run', async () => assert.deepEqual(await ok('StartTrainingRunAPI', payload, owner), run));
  await check('changed selection cannot reuse request ID', () => rejects('StartTrainingRunAPI', { ...payload, selection: { ...selection, missionId: clearing.id } }, owner, [409]));
  await check('private map cannot be used to start another account run', () => rejects('StartTrainingRunAPI', { ...payload, requestId: randomUUID() }, stranger, [403, 404]));
  await check('private run denied to other account', () => rejects('GetTrainingRunAPI', { runId: run.id }, stranger, [403, 404]));

  await check('revision conflict and new version preserve frozen run', async () => {
    const world = clone(draft.world);
    const title = 'QA 冻结后修订';
    world.title = title;
    const edit = { mapId: draft.mapId, expectedRevision: draft.revision, title, world };
    const updated = await ok('SaveMapDraftAPI', edit, owner);
    assert(updated.revision > draft.revision);
    await rejects('SaveMapDraftAPI', edit, owner, [409]);
    const second = await ok('CreateMapVersionAPI', { mapId: draft.mapId, expectedRevision: updated.revision }, owner);
    assert.notEqual(second.id, version1.id);
    assert.equal(second.world.title, title);
    created.versions.push(second.id);
    assert.deepEqual(await ok('GetMapVersionAPI', { mapVersionId: version1.id }, owner), version1);
    assert.deepEqual((await ok('GetTrainingRunAPI', { runId: run.id }, owner)).setup, run.setup);
  });

  const legacy = await check('legacy start and five-field clearing result', async () => {
    const { run: oldStyle } = await start(owner, config, version1.world.terrain);
    assert(oldStyle.setup === undefined || oldStyle.setup === null);
    const destroyed = config.drones.spawns.length;
    const hits = destroyed * config.drones.maxHp;
    const submission = { outcome: 'victory', shotsFired: hits, hits, destroyed, elapsedMs: Math.max(20_000, hits * config.weapon.fireIntervalMs) };
    const result = await save(owner, oldStyle, submission);
    assert.equal(result.runId, oldStyle.id);
    assert.deepEqual(await save(owner, oldStyle, submission), result);
    return { run: oldStyle, result };
  });
  const extraction = { outcome: 'victory', shotsFired: 0, hits: 0, destroyed: 0, elapsedMs: 10_000, objectiveProgress: { beaconActivated: true, extracted: true } };
  await check('extraction requires activated beacon', () => rejects('SaveTrainingResultAPI', { runId: run.id, submission: { ...extraction, objectiveProgress: { beaconActivated: false, extracted: true } } }, owner, [400]));
  await check('defeat cannot declare extraction', () => rejects('SaveTrainingResultAPI', { runId: run.id, submission: { ...extraction, outcome: 'defeat' } }, owner, [400]));
  await check('extraction victory without kills is saved idempotently', async () => {
    const result = await save(owner, run, extraction);
    assert.equal(result.destroyed, 0);
    assert.deepEqual(result.objectiveProgress, extraction.objectiveProgress);
    assert.deepEqual(await save(owner, run, extraction), result);
    await rejects('SaveTrainingResultAPI', { runId: run.id, submission: { ...extraction, elapsedMs: 10_001 } }, owner, [409]);
    const lookup = await ok('GetTrainingResultAPI', { runId: run.id }, owner);
    assert.equal(lookup.result.runId, run.id);
  });
  await check('private saved result denied to other account', () => rejects('GetTrainingResultAPI', { runId: run.id }, stranger, [403, 404]));
  const recording = recordingFixture(run);
  await check('legacy records honestly report missing recordings', async () => {
    assert.equal((await ok('GetRunEventsAPI', { runId: legacy.run.id }, owner)).status, 'missing_legacy');
    assert.equal((await ok('GetRunReplayAPI', { runId: legacy.run.id }, owner)).status, 'missing_legacy');
  });
  await check('recording endpoints require authentication and owner', async () => {
    for (const name of ['GetRunEventsAPI', 'GetRunReplayAPI']) {
      await rejects(name, { runId: run.id }, undefined, [401]);
      await rejects(name, { runId: run.id }, stranger, [403, 404]);
    }
    await rejects('SaveRunEventsAPI', { runId: run.id, summary: recording.summary }, stranger, [403, 404]);
    await rejects('SaveRunReplayAPI', { runId: run.id, replay: envelope(recording.payload) }, stranger, [403, 404]);
  });
  await check('events reject unordered timestamps and invented entity references', async () => {
    const reversed = clone(recording.summary);
    reversed.events.at(-1).tMs = 1;
    await rejects('SaveRunEventsAPI', { runId: run.id, summary: reversed }, owner, [400]);
    const invented = clone(recording.summary);
    invented.events.unshift({ seq: 0, tMs: 0, kind: 'drone-state', actorId: 'qa-invented-drone', targetId: null, position: null, value: null, detail: 'locked:saw-player' });
    invented.events.forEach((event, index) => { event.seq = index; });
    await rejects('SaveRunEventsAPI', { runId: run.id, summary: invented }, owner, [400]);
  });
  await check('event summary saves, retries and returns exact semantic content', async () => {
    const input = { runId: run.id, summary: recording.summary };
    const first = await ok('SaveRunEventsAPI', input, owner);
    assert.equal(first.status, 'saved');
    assert.equal(first.runId, run.id);
    assert.match(first.contentHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(await ok('SaveRunEventsAPI', input, owner), first);
    const read = await ok('GetRunEventsAPI', { runId: run.id }, owner);
    assert.equal(read.status, 'available');
    assert.deepEqual(read.summary, recording.summary);
    const changed = clone(recording.summary);
    changed.events.filter(event => event.tMs === 5000).forEach(event => { event.tMs = 5100; });
    await rejects('SaveRunEventsAPI', { runId: run.id, summary: changed }, owner, [409]);
  });
  await check('replay rejects bad hash and frames claiming future events', async () => {
    const wrongHash = envelope(recording.payload);
    wrongHash.contentHash = '0'.repeat(64);
    await rejects('SaveRunReplayAPI', { runId: run.id, replay: wrongHash }, owner, [400]);
    const future = clone(recording.payload);
    future.frames[0].throughEventSeq = future.events.at(-1).seq;
    await rejects('SaveRunReplayAPI', { runId: run.id, replay: envelope(future) }, owner, [400]);
    const wrongCoverage = clone(recording.payload);
    wrongCoverage.manifest.coverage.toMs--;
    await rejects('SaveRunReplayAPI', { runId: run.id, replay: envelope(wrongCoverage) }, owner, [400]);
  });
  await check('summary-first rejects contradictory replay without changing either record', async () => {
    await rejects('SaveRunReplayAPI', { runId: run.id, replay: envelope(shiftedActivation(recording).payload) }, owner, [409]);
    assert.equal((await ok('GetRunReplayAPI', { runId: run.id }, owner)).status, 'missing_legacy');
    assert.deepEqual((await ok('GetRunEventsAPI', { runId: run.id }, owner)).summary, recording.summary);
  });
  await check('replay above ordinary body budget saves original UTF8 bytes immutably', async () => {
    const replay = envelope(recording.payload);
    assert(Buffer.byteLength(JSON.stringify({ runId: run.id, replay }), 'utf8') > 16384, 'Fixture must exercise dedicated recording body budget');
    const input = { runId: run.id, replay };
    const saved = await ok('SaveRunReplayAPI', input, owner);
    assert.deepEqual(saved, { status: 'saved', runId: run.id, contentHash: replay.contentHash });
    assert.deepEqual(await ok('SaveRunReplayAPI', input, owner), saved);
    const read = await ok('GetRunReplayAPI', { runId: run.id }, owner);
    assert.equal(read.status, 'available');
    assert.deepEqual(read.replay, replay);
    // Equivalent JSON with different original bytes has a different immutable content hash.
    await rejects('SaveRunReplayAPI', { runId: run.id, replay: envelope(recording.payload, true) }, owner, [409]);
  });
  await check('replay-first rejects contradictory summary and accepts matching later upload', async () => {
    const { run: replayFirst } = await start(owner, config, version1.world.terrain, selection);
    await save(owner, replayFirst, extraction);
    const fixture = recordingFixture(replayFirst);
    const replay = envelope(fixture.payload);
    await ok('SaveRunReplayAPI', { runId: replayFirst.id, replay }, owner);
    await rejects('SaveRunEventsAPI', { runId: replayFirst.id, summary: shiftedActivation(fixture).summary }, owner, [409]);
    assert.equal((await ok('GetRunEventsAPI', { runId: replayFirst.id }, owner)).status, 'missing_legacy');
    assert.deepEqual((await ok('GetRunReplayAPI', { runId: replayFirst.id }, owner)).replay, replay);
    assert.equal((await ok('GetTrainingResultAPI', { runId: replayFirst.id }, owner)).result.runId, replayFirst.id);
    await ok('SaveRunEventsAPI', { runId: replayFirst.id, summary: fixture.summary }, owner);
    assert.deepEqual((await ok('GetRunEventsAPI', { runId: replayFirst.id }, owner)).summary, fixture.summary);
  });
  await check('ordinary API body limit remains bounded', () => rejects('GetTrainingConfigAPI', { padding: 'a'.repeat(17000) }, undefined, [400]));
  await check('faster extraction cannot replace legacy clearing best', async () => {
    const value = await ok('GetMyBestAPI', { configId: config.id, configVersion: config.version, terrain: version1.world.terrain }, owner);
    assert.equal(value.best?.runId, legacy.run.id);
  });
  await check('new clear mission still requires all drones', async () => {
    const clearMap = await ok('GetMapVersionAPI', { mapVersionId: clearing.mapVersionId }, owner);
    const { run: clearRun } = await start(owner, config, clearMap.world.terrain, { missionId: clearing.id, mapVersionId: clearing.mapVersionId, loadout: { tool: 'none' } });
    await rejects('SaveTrainingResultAPI', { runId: clearRun.id, submission: { outcome: 'victory', shotsFired: 0, hits: 0, destroyed: 0, elapsedMs: 10_000 } }, owner, [400]);
    await ok('AbandonTrainingRunAPI', { runId: clearRun.id }, owner);
  });
  await check('other account history remains empty', async () => {
    const value = await ok('ListMyResultsAPI', { offset: 0, limit: 30 }, stranger);
    assert.equal(value.total, 0);
  });
} catch (error) {
  if (!outcomes.some(item => item.status === 'FAIL')) {
    outcomes.push({ name: 'fixture setup outside a named check', status: 'FAIL', message: String(error.message).split('\n')[0] });
  }
  process.exitCode = 1;
} finally {
  for (const account of accounts) {
    try { await ok('LogoutPlayerAPI', {}, account); }
    catch { outcomes.push({ name: 'revoke generated QA session', status: 'FAIL', message: 'Could not revoke a generated QA session; no credential is printed.' }); process.exitCode = 1; }
  }
  for (const [name, detail] of checks.filter(([id]) => id === 'browser')) outcomes.push({ name, status: 'PENDING', detail });
  if (!process.exitCode && outcomes.some(item => item.status === 'PENDING')) process.exitCode = 2;
  console.log(JSON.stringify({ mode: 'HTTP_FIXTURES', base: origin.origin, executedAt: new Date().toISOString(), exitCode: process.exitCode ?? 0, actualGameplayVerified: false, stoppedOnFailure: outcomes.some(item => item.status === 'FAIL'), outcomes, created, notes: ['Only new QA-owned data was written; no data was deleted.', 'Checks after the first failure are not attempted, not counted as passed.', 'Event/replay payloads are explicitly synthetic protocol fixtures, not a recorded game.', 'Real browser gameplay, interrupted upload recovery and boundary budgets still require separate verification.'] }, null, 2));
}
