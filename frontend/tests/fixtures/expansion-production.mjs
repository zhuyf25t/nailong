/** Synthetic protocol fixtures for emitted API classes, not recorded gameplay. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

export async function productionCases(root) {
  const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
  const old = await json(path.join(root, 'tests/fixtures/contract.json'));
  const templates = await json(path.join(root, '../shared/worlds/templates.json'));
  const missions = await Promise.all(['clear-drones', 'forest-beacon'].map(id => json(path.join(root, '../shared/missions', id + '.json'))));
  const mission = missions.find(item => item.id === 'forest-beacon');
  const mapVersion = templates.find(item => item.id === mission.mapVersionId);
  const world = mapVersion.world, config = old.config;
  const selection = { missionId: mission.id, mapVersionId: mapVersion.id, loadout: { tool: 'curtain' } };
  const setup = { mission, world, mapVersionId: mapVersion.id, loadout: selection.loadout, seed: 20261101, assetVersion: 'garden-v1' };
  const frozenConfig = { ...config, terrain: world.terrain, drones: { ...config.drones, spawns: world.drones.map(drone => ({ x: drone.x, z: drone.z, yaw: drone.yaw })) } };
  const run = { ...old.run, config: frozenConfig, terrain: world.terrain, setup };
  const submission = { outcome: 'victory', shotsFired: 0, hits: 0, destroyed: 0, elapsedMs: 10000, objectiveProgress: { beaconActivated: true, extracted: true } };
  const result = { ...old.result, ...submission, terrain: world.terrain, accuracy: 0, setup };
  const draft = { mapId: '44444444-4444-4444-8444-444444444444', title: world.title, revision: 1, world, updatedAt: '2026-11-01T00:00:00.000Z' };
  const privateVersion = { ...mapVersion, id: '55555555-5555-4555-8555-555555555555', mapId: draft.mapId, builtIn: false };
  const mapList = { maps: [{ mapId: draft.mapId, title: draft.title, revision: 1, latestVersionId: privateVersion.id, updatedAt: draft.updatedAt, builtIn: false }], total: 1, templates };
  const gateIds = world.objects.filter(item => item.kind === 'gate').map(item => item.id);
  const events = [];
  const emit = (kind, tMs, targetId, detail = null) => events.push({ seq: events.length, tMs, kind, actorId: 'player', targetId, position: null, value: null, detail });
  emit('beacon', 5000, world.beacon.id);
  for (const id of gateIds) emit('gate', 5000, id);
  const middleSeq = events.at(-1).seq;
  emit('extract', 10000, world.extraction.id);
  emit('round-end', 10000, null, 'victory');
  const summary = { formatVersion: 1, runDurationMs: 10000, resultAtMs: 10000, truncated: false, events };
  const player = { position: { x: world.spawn.x, y: 0, z: world.spawn.z }, yaw: world.spawn.yaw, animation: 'idle', animationTime: 0, aimWeight: 0, alive: true };
  const drones = world.drones.map(drone => ({ id: drone.id, position: { x: drone.x, y: 2.2, z: drone.z }, yaw: drone.yaw, hp: config.drones.maxHp, state: 'scanning', flight: 'cruising' }));
  const frame = { player, drones, projectiles: [], tools: [], world: { openGateIds: [], beaconActivated: false, extracted: false }, camera: { position: { x: 0, y: 8, z: 20 }, target: player.position, fov: 55 } };
  const payload = {
    manifest: { formatVersion: 1, runId: run.id, config: frozenConfig, world, mapVersionId: mapVersion.id, missionId: mission.id, assetVersion: 'garden-v1', sampleHz: 10, coverage: { kind: 'complete', reason: null, fromMs: 0, toMs: 10000, runDurationMs: 10000, resultAtMs: 10000 } },
    frames: [{ ...frame, tMs: 0, scoreElapsedMs: 0, throughEventSeq: -1 },
      { ...frame, tMs: 5000, scoreElapsedMs: 5000, throughEventSeq: middleSeq, player: { ...player, position: { x: world.beacon.x, y: 0, z: world.beacon.z } }, world: { openGateIds: gateIds, beaconActivated: true, extracted: false } },
      { ...frame, tMs: 10000, scoreElapsedMs: 10000, throughEventSeq: events.at(-1).seq, player: { ...player, position: { x: world.extraction.x, y: 0, z: world.extraction.z } }, world: { openGateIds: gateIds, beaconActivated: true, extracted: true } }], events,
  };
  const payloadJson = JSON.stringify(payload), replay = { payloadJson, contentHash: createHash('sha256').update(payloadJson, 'utf8').digest('hex') };
  const saved = { status: 'saved', runId: run.id, contentHash: replay.contentHash };
  const eventsSaved = { status: 'saved', runId: run.id, contentHash: createHash('sha256').update(JSON.stringify(summary), 'utf8').digest('hex') };
  const specs = [];
  function add(name, args, request, response, needsToken = true, label) { specs.push({ name, args, request, response, needsToken, label }); }
  add('RegisterPlayerAPI', ['demo_player', 'password123', '奶糖'], { username: 'demo_player', password: 'password123', nickname: '奶糖' }, old.auth, false);
  add('LoginPlayerAPI', ['demo_player', 'password123'], { username: 'demo_player', password: 'password123' }, old.auth, false);
  add('GetCurrentPlayerAPI', [], {}, old.player);
  add('LogoutPlayerAPI', [], {}, { loggedOut: true });
  add('GetTrainingConfigAPI', [], {}, config, false);
  add('StartTrainingRunAPI', [old.run.requestId, config.id, config.version, config.terrain], { requestId: old.run.requestId, configId: config.id, configVersion: config.version, terrain: config.terrain }, old.run, true, 'legacy start');
  add('GetTrainingRunAPI', [old.run.id], { runId: old.run.id }, old.run);
  add('AbandonTrainingRunAPI', [old.run.id], { runId: old.run.id }, old.abandoned);
  add('SaveTrainingResultAPI', [old.run.id, old.submission], { runId: old.run.id, submission: old.submission }, old.result);
  add('GetTrainingResultAPI', [old.run.id], { runId: old.run.id }, old.lookup);
  add('ListMyResultsAPI', [0, 10], { offset: 0, limit: 10 }, old.list);
  add('GetMyBestAPI', [config.id, config.version, config.terrain], { configId: config.id, configVersion: config.version, terrain: config.terrain }, old.best);
  add('ListMissionsAPI', [], {}, { missions }, false);
  add('GetMissionAPI', [mission.id], { missionId: mission.id }, mission, false);
  add('ListMyMapsAPI', [{ offset: 0, limit: 30 }], { offset: 0, limit: 30 }, mapList);
  add('GetMapDraftAPI', [draft.mapId], { mapId: draft.mapId }, draft);
  add('GetMapVersionAPI', [mapVersion.id], { mapVersionId: mapVersion.id }, mapVersion);
  const edit = { mapId: draft.mapId, expectedRevision: 1, title: draft.title, world };
  add('SaveMapDraftAPI', [edit], edit, { ...draft, revision: 2 });
  add('CloneMapAPI', [mapVersion.id], { mapVersionId: mapVersion.id }, draft);
  add('CreateMapVersionAPI', [draft.mapId, 1], { mapId: draft.mapId, expectedRevision: 1 }, privateVersion);
  add('SaveRunEventsAPI', [run.id, summary], { runId: run.id, summary }, eventsSaved);
  add('GetRunEventsAPI', [run.id], { runId: run.id }, { status: 'available', summary });
  add('SaveRunReplayAPI', [run.id, replay], { runId: run.id, replay }, saved);
  add('GetRunReplayAPI', [run.id], { runId: run.id }, { status: 'available', replay });
  add('StartTrainingRunAPI', [run.requestId, config.id, config.version, world.terrain, selection], { requestId: run.requestId, configId: config.id, configVersion: config.version, terrain: world.terrain, selection }, run, true, 'selected mission start');
  add('GetTrainingRunAPI', [run.id], { runId: run.id }, run, true, 'expanded frozen run');
  add('SaveTrainingResultAPI', [run.id, submission], { runId: run.id, submission }, result, true, 'extraction result');
  add('GetTrainingResultAPI', [run.id], { runId: run.id }, { result }, true, 'expanded result');
  add('GetRunEventsAPI', [run.id], { runId: run.id }, { status: 'missing_legacy' });
  add('GetRunReplayAPI', [run.id], { runId: run.id }, { status: 'missing_legacy' });
  add('GetRunReplayAPI', [run.id], { runId: run.id }, { status: 'unsupported_version', formatVersion: 2 });
  return specs;
}
