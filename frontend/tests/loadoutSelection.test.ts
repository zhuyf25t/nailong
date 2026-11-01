import assert from 'node:assert/strict';
import test from 'node:test';
import { builtinMissions } from '../src/objects/training/builtinCatalog.ts';
import type { MissionDefinition } from '../src/objects/training/MissionDefinition.ts';
import { defaultTool, parseLoadoutLocation, toolAllowed, toolSelectionSearch, trainingPath } from '../src/pages/Loadout/functions/selection.ts';

const beacon = builtinMissions.find(mission => mission.id === 'forest-beacon');
const clear = builtinMissions.find(mission => mission.id === 'clear-drones');
assert.ok(beacon);
assert.ok(clear);

test('loadout rejects malformed mission URLs instead of silently changing mission', () => {
  for (const mission of [undefined, '', '../forest-beacon', 'FOREST-BEACON', '<script>']) {
    assert.equal(parseLoadoutLocation(mission, '').kind, 'invalid');
  }
});

test('loadout rejects unknown and ambiguous tools', () => {
  for (const search of ['?tool=laser', '?tool=', '?tool=curtain&tool=pulse']) {
    assert.equal(parseLoadoutLocation('forest-beacon', search).kind, 'invalid');
  }
});

test('custom version UUID is validated and duplicate map parameters fail', () => {
  assert.equal(parseLoadoutLocation('forest-beacon', '?mapVersionId=bad').kind, 'invalid');
  assert.equal(parseLoadoutLocation('forest-beacon', `?mapVersionId=${beacon.mapVersionId}&mapVersionId=${clear.mapVersionId}`).kind, 'invalid');
});

test('formal entry preserves the exact selected mission, tool and custom version', () => {
  const selection = parseLoadoutLocation('forest-beacon', `?tool=pulse&mapVersionId=${clear.mapVersionId}`);
  assert.equal(selection.kind, 'valid');
  if (selection.kind !== 'valid') throw new Error('expected valid location');
  const path = trainingPath(selection, 'pulse');
  const query = new URL(path, 'https://game.example').searchParams;
  assert.equal(query.get('mission'), 'forest-beacon');
  assert.equal(query.get('tool'), 'pulse');
  assert.equal(query.get('mapVersionId'), clear.mapVersionId);
  assert.equal(query.has('practice'), false);
});

test('default mission map stays implicit; no fabricated map ID is added', () => {
  const selection = parseLoadoutLocation('clear-drones', '');
  if (selection.kind !== 'valid') throw new Error('expected valid location');
  assert.equal(selection.requestedTool, null);
  assert.equal(trainingPath(selection, 'none'), '/training?mission=clear-drones&tool=none');
});

test('mission allowlist controls selection, including a URL that requests forbidden equipment', () => {
  const restricted: MissionDefinition = { ...beacon, allowedTools: ['none'] };
  const requested = parseLoadoutLocation('forest-beacon', '?tool=curtain');
  assert.equal(requested.kind, 'valid');
  assert.equal(toolAllowed(restricted, 'curtain'), false);
  assert.equal(toolAllowed(restricted, 'none'), true);
  assert.equal(defaultTool(restricted), 'none');
});

test('beacon recommends curtain, clearing defaults to light loadout', () => {
  assert.equal(defaultTool(beacon), 'curtain');
  assert.equal(defaultTool(clear), 'none');
});

test('changing a tool preserves the requested custom map and replaces the prior choice', () => {
  const updated = toolSelectionSearch(`?mapVersionId=${clear.mapVersionId}&tool=curtain`, 'decoy');
  const query = new URLSearchParams(updated);
  assert.equal(query.get('mapVersionId'), clear.mapVersionId);
  assert.deepEqual(query.getAll('tool'), ['decoy']);
});
