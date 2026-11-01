import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReplayRecorder, type ReplayRecorderOptions } from '../src/pages/Training/game/recording/createReplayRecorder.ts';
import { PRACTICE_CONFIG } from '../src/pages/Training/functions/practiceConfig.ts';
import { decodeWorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';
import { parseRunId } from '../src/objects/training/RunId.ts';
import { verifyReplayEnvelope, replayContentHash } from '../src/objects/records/ReplayEnvelope.ts';
import { decodeReplayPayload } from '../src/objects/records/ReplayPayload.ts';
import type { ReplayFrameInput } from '../src/objects/records/ReplayFrame.ts';
import { decodeReplayDroneState } from '../src/objects/records/ReplayDroneState.ts';

const world = decodeWorldDefinition(JSON.parse(readFileSync(new URL('../../shared/worlds/forest-crossroads.json', import.meta.url), 'utf8')));
const base: ReplayRecorderOptions = { runId: parseRunId('d1111111-1111-4111-8111-111111111111'), config: PRACTICE_CONFIG, world,
  mapVersionId: 'e1111111-1111-4111-8111-111111111111', missionId: 'forest-beacon', assetVersion: 'garden-v1' };
function frame(x = 0, yaw = 0): ReplayFrameInput {
  return { player: { position: { x, y: 0, z: 4 }, yaw, animation: 'walk', animationTime: 0.5, aimWeight: 0.8, alive: true },
    drones: world.drones.map(drone => ({ id: drone.id, position: { x: drone.x, y: 2.2, z: drone.z }, yaw, hp: 3, state: 'scanning', flight: 'cruising' })),
    projectiles: [], tools: [], world: { openGateIds: [], beaconActivated: false, extracted: false },
    camera: { position: { x: 0, y: 5, z: 12 }, target: { x, y: 1, z: 4 }, fov: 50 } };
}
test('recording preserves real state, active score clock and visual tail independently', async () => {
  const recorder = createReplayRecorder(base), initial = frame();
  recorder.capture(initial, { force: true });
  recorder.advance(100, 100);
  recorder.event({ kind: 'shot', actorId: 'player', targetId: 'projectile-1', position: { x: 1, y: 1, z: 4 } });
  recorder.capture({ ...frame(1), projectiles: [{ id: 'projectile-1', position: { x: 1, y: 1, z: 3 }, direction: { x: 0, y: 0, z: -1 } }] });
  recorder.advance(100, 200);
  recorder.event({ kind: 'round-end', actorId: 'player', detail: 'defeat' });
  recorder.capture({ ...frame(2), player: { ...frame(2).player, alive: false } }, { force: true });
  recorder.advance(1200, 200);
  recorder.capture({ ...frame(2), player: { ...frame(2).player, alive: false } }, { force: true });
  const recorded = await recorder.finish({ resultAtMs: 200, outcome: 'defeat' });
  const payload = await verifyReplayEnvelope(recorded.replay);
  assert.equal(payload.manifest.coverage.toMs, 1400);
  assert.equal(payload.manifest.coverage.resultAtMs, 200);
  assert.equal(payload.frames.at(-1)?.scoreElapsedMs, 200);
  assert.equal(payload.frames[1].throughEventSeq, 0);
  assert.equal(payload.frames.at(-1)?.throughEventSeq, 1);
  assert.equal(payload.frames[0].player.position.x, 0);
  assert.equal(payload.frames[1].player.position.x, 1);
  assert.equal(recorded.summary.events[0].targetId, 'projectile-1');
  assert.equal(await recorder.finish({ resultAtMs: 200, outcome: 'defeat' }), recorded);
});

test('yaw stays continuous across the wrap and event-triggered samples retain intermediate states', async () => {
  const recorder = createReplayRecorder(base);
  recorder.capture(frame(0, 3.1), { force: true });
  recorder.advance(16, 16);
  recorder.event({ kind: 'drone-state', actorId: world.drones[0].id, targetId: 'player', detail: 'locked:saw-player' });
  recorder.capture(frame(1, -3.1));
  const recorded = await recorder.finish({ resultAtMs: 16, outcome: 'defeat' });
  const payload = await verifyReplayEnvelope(recorded.replay);
  assert.equal(payload.frames.length, 2);
  assert.ok(payload.frames[1].player.yaw > 3.1 && payload.frames[1].player.yaw < 3.3);
  assert.equal(payload.events[0].tMs, 16);
});

test('time budget produces an honest ending clip with complete live state at its first frame', async () => {
  const recorder = createReplayRecorder({ ...base, limits: { durationMs: 300, endingMs: 200 } });
  recorder.capture(frame(), { force: true });
  for (let t = 100; t <= 600; t += 100) {
    recorder.advance(100, t);
    recorder.capture({ ...frame(t / 100), projectiles: [{ id: 'projectile-7', position: { x: t / 100, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 } }] }, { force: true });
  }
  const payload = await verifyReplayEnvelope((await recorder.finish({ resultAtMs: 600, outcome: 'defeat' })).replay);
  assert.equal(payload.manifest.coverage.kind, 'ending-clip');
  assert.equal(payload.manifest.coverage.reason, 'duration-limit');
  assert.equal(payload.manifest.coverage.fromMs, 400);
  assert.equal(payload.manifest.coverage.runDurationMs, 600);
  assert.equal(payload.frames[0].projectiles[0].id, 'projectile-7');
  assert.equal(payload.frames[0].player.position.x, 4);
});

test('frame budget is bounded and malformed sequencing, references, and integrity are rejected', async () => {
  const recorder = createReplayRecorder({ ...base, limits: { maxFrames: 4, endingMs: 200 } });
  recorder.capture(frame(), { force: true });
  for (let i = 1; i <= 10; i++) { recorder.advance(100, i * 100); recorder.capture(frame(i), { force: true }); }
  const recorded = await recorder.finish({ resultAtMs: 1000, outcome: 'defeat' });
  const payload = await verifyReplayEnvelope(recorded.replay);
  assert.ok(payload.frames.length <= 4);
  assert.equal(payload.manifest.coverage.reason, 'frame-limit');
  const wrongTime = structuredClone(payload);
  (wrongTime.frames[1] as { tMs: number }).tMs = wrongTime.frames[0].tMs;
  assert.throws(() => decodeReplayPayload(wrongTime));
  const wrongId = structuredClone(payload);
  (wrongId.frames[0].drones[0] as { id: string }).id = 'nonexistent';
  assert.throws(() => decodeReplayPayload(wrongId));
  await assert.rejects(verifyReplayEnvelope({ ...recorded.replay, contentHash: '0'.repeat(64) }));
});

test('content hash authenticates exact UTF-8 JSON text, including whitespace and non-ASCII names', async () => {
  assert.equal(await replayContentHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.notEqual(await replayContentHash('{"title":"花谷"}'), await replayContentHash('{ "title":"花谷"}'));
});

test('actual UTF-8 byte budget crops to a truthful smaller ending instead of overflowing upload', async () => {
  const baseline = createReplayRecorder(base); baseline.capture(frame(), { force: true });
  const empty = await baseline.finish({ resultAtMs: 0, outcome: 'defeat' });
  const budget = new TextEncoder().encode(empty.replay.payloadJson).byteLength + 1700;
  const recorder = createReplayRecorder({ ...base, limits: { payloadBytes: budget, endingMs: 1000 } });
  recorder.capture(frame(), { force: true });
  for (let t = 100; t <= 2000; t += 100) { recorder.advance(100, t); recorder.capture(frame(t / 100), { force: true }); }
  const recorded = await recorder.finish({ resultAtMs: 2000, outcome: 'defeat' });
  const payload = await verifyReplayEnvelope(recorded.replay);
  assert.ok(new TextEncoder().encode(recorded.replay.payloadJson).byteLength <= budget);
  assert.equal(payload.manifest.coverage.kind, 'ending-clip');
  assert.equal(payload.manifest.coverage.reason, 'byte-limit');
  assert.ok(payload.manifest.coverage.fromMs > 0);
  assert.equal(payload.manifest.coverage.toMs, 2000);
  assert.equal(payload.frames[0].tMs, payload.manifest.coverage.fromMs);
});

test('event overflow stays bounded and declares truncation without changing retained sequence numbers', async () => {
  const recorder = createReplayRecorder({ ...base, limits: { maxEvents: 3 } });
  recorder.capture(frame(), { force: true });
  for (let i = 1; i <= 5; i++) { recorder.advance(100, i * 100); recorder.event({ kind: 'shot', actorId: 'player', targetId: `projectile-${i}` }); recorder.capture(frame(i), { force: true }); }
  const recorded = await recorder.finish({ resultAtMs: 500, outcome: 'defeat' });
  assert.equal(recorded.summary.truncated, true);
  assert.equal(recorded.summary.events.length, 3);
  assert.deepEqual(recorded.summary.events.map(event => event.seq), [3, 4, 5]);
  assert.equal((await verifyReplayEnvelope(recorded.replay)).manifest.coverage.kind, 'ending-clip');
});

test('pauses add no time and cannot silently invent a missing time-zero capture', () => {
  const recorder = createReplayRecorder(base);
  recorder.capture(frame(), { force: true });
  recorder.advance(0, 0); recorder.capture(frame());
  assert.equal(recorder.elapsedMs, 0); assert.equal(recorder.retainedFrameCount, 1);
  assert.throws(() => recorder.advance(-1, 0));
  const missingStart = createReplayRecorder(base);
  missingStart.advance(1, 1);
  assert.throws(() => missingStart.capture(frame(), { force: true }));
});

test('observed corners and landing keep their before/after frames below the base sample interval', async () => {
  const recorder = createReplayRecorder(base);
  const pose = (x: number, z: number, jumping = false): ReplayFrameInput => {
    const source = frame(x); return { ...source, player: { ...source.player, position: { x, y: jumping ? 1 : 0, z }, animation: jumping ? 'jump' : 'walk' } };
  };
  recorder.capture(pose(0, 0), { force: true });
  recorder.advance(16, 16); recorder.capture(pose(.1, 0));
  recorder.advance(16, 32); recorder.capture(pose(.2, 0));
  recorder.advance(16, 48); recorder.capture(pose(.2, .1));
  recorder.advance(16, 64); recorder.capture(pose(.2, .2, true));
  recorder.advance(16, 80); recorder.capture(pose(.2, .3, true));
  recorder.advance(16, 96); recorder.capture(pose(.2, .4));
  const payload = await verifyReplayEnvelope((await recorder.finish({ resultAtMs: 96, outcome: 'defeat' })).replay);
  assert.ok(payload.frames.some(value => value.tMs === 32 && value.player.position.x === .2 && value.player.position.z === 0));
  assert.ok(payload.frames.some(value => value.tMs === 48 && value.player.position.z === .1));
  assert.ok(payload.frames.some(value => value.tMs === 80 && value.player.animation === 'jump'));
  assert.ok(payload.frames.some(value => value.tMs === 96 && value.player.animation === 'walk'));
  assert.deepEqual(payload.frames.map(value => value.tMs), [...new Set(payload.frames.map(value => value.tMs))].sort((a, b) => a - b));
});

test('optional stun supports omitted and Scala-null legacy frames but rejects non-boolean values', () => {
  const drone = frame().drones[0];
  assert.equal(decodeReplayDroneState(drone).stunned, false);
  assert.equal(decodeReplayDroneState({ ...drone, stunned: null }).stunned, false);
  assert.equal(decodeReplayDroneState({ ...drone, stunned: true }).stunned, true);
  assert.throws(() => decodeReplayDroneState({ ...drone, stunned: 'true' }));
});
