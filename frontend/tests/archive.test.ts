import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { object } from '../src/system/api/decode.ts';
import { decodeTrainingResult } from '../src/objects/records/TrainingResult.ts';
import { parseRunId } from '../src/objects/training/RunId.ts';
import { parseMapVersionId } from '../src/objects/worlds/MapVersionId.ts';
import { getBuiltinSetup } from '../src/objects/training/builtinCatalog.ts';
import { canCompare, decodeFavorites } from '../src/pages/History/functions/archive.ts';
import { trainingRequest } from '../src/pages/Training/functions/trainingRequest.ts';

const fixture = object(JSON.parse(readFileSync(new URL('./fixtures/contract.json', import.meta.url), 'utf8')));
const baseline = decodeTrainingResult(fixture.result);
const first = { ...baseline, setup: getBuiltinSetup('forest-beacon', 'curtain') };
const second = { ...first, runId: parseRunId('aaaaaaaa-1111-4111-8111-111111111111') };

test('comparison does not mix map, objective, terrain, equipment or rule versions', () => {
  assert.equal(canCompare(first, second), true);
  assert.equal(canCompare(first, first), false);
  assert.equal(canCompare(first, { ...second, setup: getBuiltinSetup('clear-drones', 'curtain') }), false);
  assert.equal(canCompare(first, { ...second, setup: { ...second.setup, loadout: { tool: 'none' } } }), false);
  assert.equal(canCompare(first, { ...second, setup: { ...second.setup, mapVersionId: parseMapVersionId('aaaaaaaa-2222-4222-8222-222222222222') } }), false);
  assert.equal(canCompare(first, { ...second, terrain: { ...second.terrain, hillWidth: second.terrain.hillWidth + 1 } }), false);
  assert.equal(canCompare(first, { ...second, configVersion: 'future-rules' }), false);
  assert.equal(canCompare(first, { ...second, setup: undefined }), false);
});

test('bookmarks decode untrusted storage, deduplicate and reject malformed IDs', () => {
  assert.deepEqual(decodeFavorites([first.runId, first.runId, second.runId]), [first.runId, second.runId]);
  assert.throws(() => decodeFavorites(['not-a-run']));
  assert.throws(() => decodeFavorites({ ids: [] }));
});

test('new training links default to beacon, preserve explicit choices and reject corrupt parameters', () => {
  assert.equal(trainingRequest('').missionId, 'forest-beacon');
  assert.equal(trainingRequest('?mission=clear-drones&tool=none').tool, 'none');
  assert.equal(trainingRequest(`?retryRunId=${first.runId}`).retryRunId, first.runId);
  assert.throws(() => trainingRequest('?mission=<script>'));
  assert.throws(() => trainingRequest('?tool=unlimited-ammo'));
  assert.throws(() => trainingRequest('?mapVersionId=wrong'));
  assert.throws(() => trainingRequest('?mission=clear-drones&mission=forest-beacon'));
  assert.throws(() => trainingRequest(`?retryRunId=${first.runId}&tool=pulse`));
});
