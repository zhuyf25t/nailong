import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { clampReplayTime, eventJumpTime, replayScanRange, sampleReplay } from '../src/pages/Replay/player.ts';
import type { ReplayPayload } from '../src/objects/records/ReplayPayload.ts';
import type { ReplayFrame } from '../src/objects/records/ReplayFrame.ts';
import type { RunEvent } from '../src/objects/records/RunEvent.ts';
import { decodeTrainingConfig } from '../src/objects/training/TrainingConfig.ts';
import { decodeWorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';
import rawConfig from '../src/pages/Training/data/practice-config.json';
import rawWorld from '../../shared/worlds/garden-courtyard.json';

const config = decodeTrainingConfig(rawConfig), world = decodeWorldDefinition(rawWorld);
const event = (seq: number, tMs: number, fields: Partial<RunEvent>): RunEvent => ({ seq, tMs, kind: 'hit', actorId: null, targetId: null, position: null, value: null, detail: null, ...fields });
function frame(tMs: number, throughEventSeq = -1): ReplayFrame {
  return { tMs, scoreElapsedMs: tMs, throughEventSeq,
    player: { position: { x: tMs / 100, y: 0, z: 0 }, yaw: 3.1 + tMs / 5000, animation: 'idle', animationTime: tMs / 1000, aimWeight: .8, alive: true },
    drones: world.drones.map(drone => ({ id: drone.id, position: { x: drone.x, y: 2.2, z: drone.z }, yaw: 0, hp: 3, state: 'scanning', flight: 'cruising' })),
    projectiles: [], tools: [], world: { openGateIds: [], beaconActivated: false, extracted: false },
    camera: { position: { x: 0, y: 10, z: 12 }, target: { x: 0, y: 0, z: 0 }, fov: 52 } };
}
function fixture(events: RunEvent[] = []): ReplayPayload {
  return { manifest: { formatVersion: 1, runId: null, config, world, mapVersionId: null, missionId: 'clear-drones', assetVersion: 'garden-v1', sampleHz: 10,
    coverage: { kind: 'complete', reason: null, fromMs: 0, toMs: 1000, resultAtMs: 1000, runDurationMs: 1000 } }, frames: [frame(0), frame(1000, events.at(-1)?.seq ?? -1)], events };
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}

test('seeking is repeatable, preserves the frozen recording, and interpolates cumulative yaw through pi', () => {
  const replay = deepFreeze(fixture()); const before = JSON.stringify(replay);
  const midpoint = sampleReplay(replay, 500)!;
  assert.equal(midpoint.player.position.x, 5); assert.ok(Math.abs(midpoint.player.yaw - 3.2) < 1e-12);
  for (const time of [900, 0, 1000, 250, 500, 1000, 0, 500]) sampleReplay(replay, time);
  assert.deepEqual(sampleReplay(replay, 500), midpoint); assert.equal(JSON.stringify(replay), before);
  (midpoint.player.position as { x: number }).x = 999;
  assert.equal(sampleReplay(replay, 500)!.player.position.x, 5);
});

test('health and detection change at the exact ordered event time, never by interpolation', () => {
  const id = world.drones[0].id;
  const replay = fixture([event(0, 450, { targetId: id, value: 2 }), event(1, 450, { kind: 'drone-state', actorId: id, detail: 'locked:saw-player' })]);
  assert.equal(sampleReplay(replay, 449)!.drones[0].hp, 3);
  assert.equal(sampleReplay(replay, 449)!.drones[0].state, 'scanning');
  assert.equal(sampleReplay(replay, 450)!.drones[0].hp, 2);
  assert.equal(sampleReplay(replay, 450)!.drones[0].state, 'locked');
  assert.equal(sampleReplay(replay, 450)!.throughEventSeq, 1);
});

test('head event anchor prevents duplicate application and a clip starts from its complete recorded state', () => {
  const replay = fixture([event(42, 500, { targetId: world.drones[0].id, value: 1 }), event(43, 600, { kind: 'contact', actorId: world.drones[0].id })]);
  const head = { ...frame(500, 42), drones: frame(500).drones.map(drone => ({ ...drone, hp: 2 })) };
  const clipped: ReplayPayload = { ...replay, manifest: { ...replay.manifest, coverage: { ...replay.manifest.coverage, kind: 'ending-clip', reason: 'byte-limit', fromMs: 500 } }, frames: [head, frame(1000, 43)] };
  assert.equal(sampleReplay(clipped, 500)!.drones[0].hp, 2);
  assert.equal(sampleReplay(clipped, 599)!.player.alive, true);
  assert.equal(sampleReplay(clipped, 600)!.player.alive, false);
  assert.equal(sampleReplay(clipped, 600)!.drones[0].state, 'destroyed');
  assert.equal(clampReplayTime(clipped, -10), 500); assert.equal(clampReplayTime(clipped, Infinity), 500);
  assert.equal(clampReplayTime(clipped, 100000), 1000); assert.equal(eventJumpTime(clipped, replay.events[1]), 500);
});

test('world state changes only on recorded events and reverses correctly when seeking backwards', () => {
  const gate = world.objects.find(object => object.kind === 'gate')!;
  const replay = fixture([event(0, 300, { kind: 'gate', targetId: gate.id }), event(1, 400, { kind: 'beacon', targetId: world.beacon.id }), event(2, 800, { kind: 'extract', targetId: world.extraction.id })]);
  assert.deepEqual(sampleReplay(replay, 299)!.world.openGateIds, []);
  assert.deepEqual(sampleReplay(replay, 350)!.world.openGateIds, [gate.id]);
  assert.equal(sampleReplay(replay, 399)!.world.beaconActivated, false);
  assert.equal(sampleReplay(replay, 400)!.world.beaconActivated, true);
  assert.equal(sampleReplay(replay, 800)!.world.extracted, true);
  assert.equal(sampleReplay(replay, 200)!.world.extracted, false);
});

test('a newly visible projectile is bounded by recorded shot position and hit removes it precisely', () => {
  const projectile = { id: 'pulse-1', position: { x: 10, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 } };
  const replay = fixture([event(0, 200, { kind: 'shot', actorId: 'player', targetId: projectile.id, position: { x: 2, y: 1, z: 0 } }), event(1, 700, { kind: 'hit', actorId: projectile.id, targetId: world.drones[0].id, value: 2 })]);
  const recording = { ...replay, frames: [replay.frames[0], { ...replay.frames[1], projectiles: [projectile] }] };
  assert.equal(sampleReplay(recording, 199)!.projectiles.length, 0);
  assert.equal(sampleReplay(recording, 200)!.projectiles[0].position.x, 2);
  assert.equal(sampleReplay(recording, 600)!.projectiles[0].position.x, 6);
  assert.equal(sampleReplay(recording, 700)!.projectiles.length, 0);
});

test('empty defensive input and one-frame clip never extrapolate or crash', () => {
  const replay = fixture(); assert.equal(sampleReplay({ ...replay, frames: [] }, 0), null);
  assert.deepEqual(sampleReplay({ ...replay, frames: [frame(0)] }, 900)?.player.position, { x: 0, y: 0, z: 0 });
});

test('a tool appears at its event and seeks backwards without retaining its visibility', () => {
  const replay = fixture([event(0, 200, { kind: 'tool', actorId: 'player', targetId: 'tool-1', detail: 'curtain', value: 3, position: { x: 2, y: 0, z: 1 } })]);
  assert.equal(sampleReplay(replay, 199)!.tools.length, 0);
  const tool = sampleReplay(replay, 400)!.tools[0];
  assert.equal(tool.kind, 'curtain'); assert.equal(tool.radius, 3); assert.equal(tool.remainingMs, 3800);
  assert.equal(sampleReplay(replay, 0)!.tools.length, 0);
});

test('recorded stun disables scans at its forced frame, resumes discretely, and survives reverse seeking', () => {
  const replay = fixture();
  const stunnedFrame = { ...frame(400), drones: frame(400).drones.map(drone => ({ ...drone, stunned: true })) };
  const recording = { ...replay, frames: [frame(0), stunnedFrame, frame(800), frame(1000)] };
  for (const [time, expectedRange] of [[399, 12], [400, 0], [799, 0], [800, 12], [500, 0], [200, 12]]) {
    const drone = sampleReplay(recording, time)!.drones[0];
    assert.equal(replayScanRange(drone, 12, true), expectedRange, `time ${time}`);
  }
  assert.equal(replayScanRange({ ...frame(0).drones[0], flight: 'taking-off' }, 12, true), 0);
  assert.equal(replayScanRange(frame(0).drones[0], 12, false), 0);
});

test('a recorded pulse push cannot leak backwards across its event time or affect an unstunned drone', () => {
  const replay = fixture([event(0, 75, { kind: 'tool', actorId: 'player', targetId: 'tool-1', detail: 'pulse', value: .1, position: { x: 100, y: 0, z: 100 } })]);
  const head = { ...frame(0), drones: frame(0).drones.map((drone, index) => ({ ...drone, position: { x: index * 10, y: 2.2, z: 0 }, stunned: false })) };
  const after = { ...frame(100, 0), drones: head.drones.map((drone, index) => ({ ...drone, position: { ...drone.position, x: drone.position.x + (index === 0 ? 4 : 2) }, stunned: index === 0 })) };
  const recording = { ...replay, frames: [head, after, frame(1000, 0)] };
  for (const [time, expectedX, expectedStun] of [[0, 0, false], [50, 0, false], [74, 0, false], [75, 4, true], [90, 4, true], [100, 4, true], [50, 0, false]] as const) {
    const drone = sampleReplay(recording, time)!.drones[0];
    assert.equal(drone.position.x, expectedX, `position at ${time}`);
    assert.equal(Boolean(drone.stunned), expectedStun, `stun at ${time}`);
  }
  // Recorded absence of stun preserves ordinary movement, regardless of event radius.
  assert.equal(sampleReplay(recording, 50)!.drones[1].position.x, 11);
  assert.equal(sampleReplay(recording, 75)!.drones[1].position.x, 11.5);
});

test('replay playback has no dependency on live AI, shooting, challenge creation, or result mutation', () => {
  const directory = fileURLToPath(new URL('../src/pages/Replay', import.meta.url));
  const source = readdirSync(directory).filter(file => /\.tsx?$/.test(file)).map(file => readFileSync(resolve(directory, file), 'utf8')).join('\n');
  for (const forbidden of ['createChallenge', 'createDroneEncounter', 'createDroneBrain', 'createShooting', 'StartTrainingRunAPI', 'SaveTrainingResultAPI', 'SaveRunReplayAPI', 'SaveRunEventsAPI', 'AbandonTrainingRunAPI']) assert.equal(source.includes(forbidden), false, forbidden);
  assert.ok(source.includes('GetRunReplayAPI')); assert.ok(source.includes('GetRunEventsAPI'));
});
