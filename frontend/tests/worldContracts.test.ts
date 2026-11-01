import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinMaps, builtinMissions, getBuiltinSetup } from '../src/objects/training/builtinCatalog.ts';
import { decodeWorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';
import { decodeMapVersion } from '../src/objects/worlds/MapVersion.ts';
import { decodeMapListResponse } from '../src/objects/worlds/MapListResponse.ts';
import { decodeRunSetup } from '../src/objects/training/RunSetup.ts';
import { decodeRunSelection } from '../src/objects/training/RunSelection.ts';
import { decodeTrainingRun } from '../src/objects/training/TrainingRun.ts';
import { decodeTrainingResult } from '../src/objects/records/TrainingResult.ts';
import { decodeResultSubmission } from '../src/objects/records/ResultSubmission.ts';
import { StartTrainingRunAPI } from '../src/apis/training/StartTrainingRunAPI.ts';
import { GetMissionAPI } from '../src/apis/training/GetMissionAPI.ts';
import { ListMissionsAPI } from '../src/apis/training/ListMissionsAPI.ts';
import { GetMapVersionAPI } from '../src/apis/worlds/GetMapVersionAPI.ts';
import { SaveMapDraftAPI } from '../src/apis/worlds/SaveMapDraftAPI.ts';
import { ListMyMapsAPI } from '../src/apis/worlds/ListMyMapsAPI.ts';
import { DecodeError } from '../src/system/api/DecodeError.ts';
import { object } from '../src/system/api/decode.ts';
import { validateWorld, segmentCrossesRectangle } from '../src/objects/worlds/validateWorld.ts';

const fixture = object(JSON.parse(readFileSync(new URL('./fixtures/contract.json', import.meta.url), 'utf8')));
const oldRun = decodeTrainingRun(fixture.run);
const world = builtinMaps[0].world;

test('shared world resources and full template snapshots stay identical', () => {
  const paths = ['garden-courtyard', 'forest-crossroads'];
  assert.equal(builtinMaps.length, 2);
  for (const [index, name] of paths.entries()) {
    const data: unknown = JSON.parse(readFileSync(new URL(`../../shared/worlds/${name}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(decodeWorldDefinition(data), builtinMaps[index].world);
    assert.equal(builtinMaps[index].world.drones.length, 4);
    assert.equal(builtinMaps[index].world.objects.filter((item) => item.kind === 'gate').length, 1);
    const ids = [...builtinMaps[index].world.objects, ...builtinMaps[index].world.drones, builtinMaps[index].world.beacon, builtinMaps[index].world.extraction].map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(builtinMaps[index].world.spawn.yaw, Math.PI);
  }
});

test('both templates are geometrically valid, reachable with the shortcut shut, and shield initial enemies from spawn', () => {
  for (const template of builtinMaps) {
    assert.deepEqual(validateWorld(template.world), [], template.title);
    const shut = decodeWorldDefinition({ ...template.world,
      objects: template.world.objects.map((item) => item.kind === 'gate' ? { ...item, kind: 'wall' } : item) });
    assert.deepEqual(validateWorld(shut), [], 'The beacon must remain reachable before it unlocks the shortcut.');
    for (const drone of shut.drones) {
      assert.equal(shut.objects.some((item) => (item.kind === 'wall' || item.kind === 'gate') &&
        segmentCrossesRectangle(shut.spawn, drone, { minX: item.x - item.width / 2, maxX: item.x + item.width / 2, minZ: item.z - item.depth / 2, maxZ: item.z + item.depth / 2 })), true,
      `Spawn should not have an open firing line to ${drone.id}`);
    }
  }
});

test('offline setups resolve real mission/world snapshots and remap a selected template', () => {
  assert.deepEqual(new ListMissionsAPI().decodeResponse({ missions: builtinMissions }).missions, builtinMissions);
  for (const mission of builtinMissions) {
    assert.deepEqual(new GetMissionAPI(mission.id).decodeResponse(mission), mission);
    for (const tool of mission.allowedTools) {
      const setup = getBuiltinSetup(mission.id, tool);
      assert.equal(setup.mission.id, mission.id);
      assert.equal(setup.loadout.tool, tool);
      assert.equal(setup.mapVersionId, mission.mapVersionId);
    }
  }
  const remapped = getBuiltinSetup('forest-beacon', 'curtain', builtinMaps[1].id);
  assert.equal(remapped.mission.mapVersionId, builtinMaps[1].id);
  assert.deepEqual(remapped.world, builtinMaps[1].world);
  assert.throws(() => getBuiltinSetup('unknown'), /Unknown/);
});

test('world boundary rejects malformed schema, unbounded dimensions and unsafe entity fields', () => {
  const invalid: unknown[] = [
    { ...world, schemaVersion: 2 }, { ...world, title: '   ' }, { ...world, bounds: { halfSize: 100 } },
    { ...world, spawn: { ...world.spawn, yaw: NaN } }, { ...world, drones: [] },
    { ...world, objects: [...world.objects, { ...world.objects[0], id: 'BAD ID' }] },
    ...['player', 'projectile-1', 'tool-curtain'].map((id) => ({ ...world, objects: [{ ...world.objects[0], id }] })),
    { ...world, objects: [{ ...world.objects[0], width: 17 }] },
    { ...world, objects: Array.from({ length: 49 }, () => world.objects[0]) },
    { ...world, drones: [{ ...world.drones[0], patrol: Array.from({ length: 13 }, () => ({ x: 1, z: 1 })) }] },
    { ...world, beacon: { ...world.beacon, radius: '2' } },
  ];
  for (const value of invalid) assert.throws(() => decodeWorldDefinition(value), DecodeError);
  assert.throws(() => decodeMapVersion({ ...builtinMaps[0], builtIn: 'true' }), DecodeError);
  assert.throws(() => decodeMapListResponse({ maps: [], total: -1, templates: builtinMaps }), DecodeError);
});

test('frozen setup rejects a mixed map, objective, forbidden tool and invalid seed', () => {
  const setup = getBuiltinSetup('forest-beacon');
  for (const invalid of [
    { ...setup, mapVersionId: builtinMaps[1].id },
    { ...setup, mission: { ...setup.mission, objective: { kind: 'activate_extract', beaconId: 'wrong', extractionId: world.extraction.id } } },
    { ...setup, mission: { ...setup.mission, allowedTools: ['none'] }, loadout: { tool: 'curtain' } },
    { ...setup, seed: -1 }, { ...setup, seed: 2147483648 }, { ...setup, seed: 1.5 },
  ]) assert.throws(() => decodeRunSetup(invalid), DecodeError);
});

test('old run/result DTOs retain their exact fields; new snapshots cross runtime decoding', () => {
  assert.deepEqual(decodeTrainingRun(fixture.run), oldRun);
  const legacyRun = { ...object(fixture.run) }; delete legacyRun.setup;
  assert.equal(Object.hasOwn(decodeTrainingRun(legacyRun), 'setup'), false);
  const setup = getBuiltinSetup('forest-beacon', 'curtain');
  assert.deepEqual(decodeTrainingRun({ ...oldRun, setup }).setup, setup);
  assert.equal(decodeTrainingRun({ ...oldRun, setup: null }).setup, null);
  const result = decodeTrainingResult(fixture.result);
  assert.equal(result.objectiveProgress, null);
  const legacyResult = { ...object(fixture.result) }; delete legacyResult.setup; delete legacyResult.objectiveProgress;
  assert.equal(Object.hasOwn(decodeTrainingResult(legacyResult), 'objectiveProgress'), false);
  assert.equal(Object.hasOwn(decodeTrainingResult(legacyResult), 'setup'), false);
  const objectiveProgress = { beaconActivated: true, extracted: true };
  assert.deepEqual(decodeTrainingResult({ ...result, setup, objectiveProgress }).setup, setup);
  assert.deepEqual(decodeResultSubmission({ ...result, objectiveProgress }).objectiveProgress, objectiveProgress);
  assert.equal(decodeResultSubmission({ outcome: 'victory', shotsFired: 0, hits: 0, destroyed: 0, elapsedMs: 45000, objectiveProgress }).destroyed, 0);
  assert.throws(() => decodeResultSubmission({ ...result, objectiveProgress: { beaconActivated: false, extracted: true } }), DecodeError);
  assert.throws(() => decodeResultSubmission({ ...result, outcome: 'defeat', objectiveProgress }), DecodeError);
});

test('new request serialization includes selection while old requests and owner boundaries remain unchanged', () => {
  const oldAPI = new StartTrainingRunAPI(oldRun.requestId, oldRun.config.id, oldRun.config.version, oldRun.terrain);
  assert.equal(Object.hasOwn(oldAPI.toRequest(), 'selection'), false);
  const selection = decodeRunSelection({ missionId: 'forest-beacon', mapVersionId: builtinMaps[0].id, loadout: { tool: 'curtain' } });
  const api = new StartTrainingRunAPI(oldRun.requestId, oldRun.config.id, oldRun.config.version, world.terrain, selection);
  assert.deepEqual(api.toRequest().selection, selection);
  assert.equal(new GetMapVersionAPI(builtinMaps[0].id).needsUserToken, true);
  assert.equal(new GetMissionAPI(selection.missionId).needsUserToken, false);
  assert.deepEqual(new ListMyMapsAPI().toRequest(), { offset: 0, limit: 30 });
  const save = new SaveMapDraftAPI({ mapId: builtinMaps[0].mapId, expectedRevision: 2, title: world.title, world });
  assert.equal(save.toRequest().expectedRevision, 2);
  assert.equal(Object.hasOwn(save.toRequest(), 'playerId'), false);
});
