import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinMaps } from '../src/objects/training/builtinCatalog.ts';
import type { WorldDefinition } from '../src/objects/worlds/WorldDefinition.ts';
import { validateWorld, segmentCrossesRectangle } from '../src/objects/worlds/validateWorld.ts';
import { placeEntity, removeEntity, selectionForIssue, snapPoint, updateEntity } from '../src/pages/MapEditor/functions/editWorld.ts';
import { editorHistoryReducer, EMPTY_HISTORY } from '../src/pages/MapEditor/functions/editorHistory.ts';

function field(): WorldDefinition { return { schemaVersion: 1, title: '可走通的花谷', terrain: { hillHeight: 0, hillWidth: 5, hillX: 0, hillZ: 0, ripple: 0 }, bounds: { halfSize: 12 }, spawn: { x: -6, z: 0, yaw: 0 }, objects: [], drones: [{ id: 'drone-a', x: -7, z: -6, yaw: 0, patrol: [] }], beacon: { id: 'beacon-a', x: 6, z: 0, radius: 1 }, extraction: { id: 'exit-a', x: -6, z: 8, radius: 1 } }; }
const divider = [{ id: 'wall-a', kind: 'wall' as const, x: 0, z: -7, width: .7, depth: 10, height: 2 }, { id: 'wall-b', kind: 'wall' as const, x: 0, z: 7, width: .7, depth: 10, height: 2 }, { id: 'gate-a', kind: 'gate' as const, x: 0, z: 0, width: .7, depth: 4, height: 2 }];

test('all actual shared map templates pass editor geometry and reachability', () => {
  assert.ok(builtinMaps.length >= 2);
  for (const template of builtinMaps) assert.deepEqual(validateWorld(template.world), [], template.title);
});
test('a gate cannot be the only way to reach the beacon that opens it', () => {
  assert.ok(validateWorld({ ...field(), objects: divider }).some(issue => issue.code === 'unreachable_beacon' && issue.objectId === 'beacon-a'));
});
test('after activating the accessible beacon, an openable gate provides an extraction corridor', () => {
  const open = { ...field(), beacon: { ...field().beacon, x: -6, z: 4 }, extraction: { ...field().extraction, x: 6, z: 0 }, objects: divider };
  assert.deepEqual(validateWorld(open), []);
  const closed = { ...open, objects: divider.map(item => ({ ...item, kind: 'wall' as const })) };
  assert.ok(validateWorld(closed).some(issue => issue.code === 'unreachable_extraction' && issue.objectId === 'exit-a'));
});
test('reachability also protects extraction, not only the first objective', () => {
  const world = { ...field(), beacon: { ...field().beacon, x: -6, z: 4 }, extraction: { ...field().extraction, x: 6, z: 0 }, objects: divider.map(item => ({ ...item, kind: 'wall' as const })) };
  const issues = validateWorld(world);
  assert.ok(issues.some(issue => issue.code === 'unreachable_extraction'));
  assert.ok(!issues.some(issue => issue.code === 'unreachable_beacon'));
});
test('segment intersection catches a blocker between otherwise clear cell endpoints and grazing edges', () => {
  const rectangle = { minX: .4, maxX: .6, minZ: -.2, maxZ: .2 };
  assert.equal(segmentCrossesRectangle({ x: 0, z: 0 }, { x: 1, z: 0 }, rectangle), true);
  assert.equal(segmentCrossesRectangle({ x: 0, z: .2 }, { x: 1, z: .2 }, rectangle), true);
  assert.equal(segmentCrossesRectangle({ x: 0, z: .3 }, { x: 1, z: .3 }, rectangle), false);
});
test('spawn cannot overlap an obstacle or beacon, but can begin inside the extraction area', () => {
  const base = field();
  assert.deepEqual(validateWorld({ ...base, extraction: { ...base.extraction, x: base.spawn.x, z: base.spawn.z } }), []);
  assert.ok(validateWorld({ ...base, beacon: { ...base.beacon, x: base.spawn.x, z: base.spawn.z } }).some(issue => issue.code === 'entity_overlap'));
  assert.ok(validateWorld({ ...base, objects: [{ id: 'crate-a', kind: 'crate', x: -6, z: 0, width: 1, depth: 1, height: 1 }] }).some(issue => issue.code === 'blocked_spawn'));
});
test('diagnostics locate overlaps, invalid patrol points, duplicate IDs and boundary footprints', () => {
  const base = field();
  const overlapping = { ...base, objects: [{ id: 'crate-a', kind: 'crate' as const, x: 0, z: 0, width: 2, depth: 2, height: 1 }, { id: 'crate-b', kind: 'crate' as const, x: 1, z: 0, width: 2, depth: 2, height: 1 }], drones: [{ ...base.drones[0], patrol: [{ x: 0, z: 0 }] }] };
  assert.ok(validateWorld(overlapping).some(issue => issue.code === 'entity_overlap' && issue.objectId === 'crate-b'));
  assert.ok(validateWorld(overlapping).some(issue => issue.code === 'blocked_patrol' && issue.objectId === 'drone-a'));
  assert.ok(validateWorld({ ...base, extraction: { ...base.extraction, id: base.beacon.id } }).some(issue => issue.code === 'duplicate_id'));
  for (const id of ['player', 'projectile-one', 'tool-decoy']) assert.ok(validateWorld({ ...base, drones: [{ ...base.drones[0], id }] }).some(issue => issue.code === 'reserved_id'));
  assert.ok(validateWorld({ ...base, objects: [{ id: 'wall-edge', kind: 'wall', x: 11, z: 0, width: 4, depth: 1, height: 2 }] }).some(issue => issue.code === 'out_of_bounds'));
});
test('invalid dimensions and unbounded values return issues instead of allocating an invalid grid', () => {
  assert.ok(validateWorld({ ...field(), bounds: { halfSize: Infinity } }).some(issue => issue.code === 'bounds_invalid'));
  assert.ok(validateWorld({ ...field(), spawn: { x: NaN, z: 0, yaw: 0 } }).some(issue => issue.code === 'out_of_bounds'));
  assert.ok(validateWorld({ ...field(), drones: [] }).some(issue => issue.code === 'drone_budget'));
  assert.ok(validateWorld({ ...field(), title: ' ' + 'a'.repeat(80) }).some(issue => issue.code === 'invalid_title'));
  assert.ok(validateWorld({ ...field(), spawn: { ...field().spawn, yaw: 1e100 } }).some(issue => issue.code === 'invalid_rotation'));
});
test('editing creates immutable layout snapshots and retains stable IDs', () => {
  const original = field();
  const placed = placeEntity(original, 'wall', { x: 2, z: 4 }, 'wall-new', null);
  assert.equal(original.objects.length, 0);
  assert.equal(placed.selection, 'object:wall-new');
  const moved = updateEntity(placed.world, placed.selection!, { x: 5, z: 2, yaw: 17 });
  assert.equal(placed.world.objects[0].x, 2);
  assert.equal(moved.objects[0].id, 'wall-new');
  assert.equal(moved.objects[0].x, 5);
  assert.equal('yaw' in moved.objects[0], false, 'axis-aligned objects do not silently gain rotation');
  assert.equal(removeEntity(moved, placed.selection!).objects.length, 0);
});
test('patrol placement, selection and deletion preserve the owning drone', () => {
  const first = placeEntity(field(), 'patrol', { x: 1, z: 2 }, 'unused', 'drone:drone-a');
  const second = placeEntity(first.world, 'patrol', { x: 3, z: 4 }, 'unused', first.selection);
  assert.equal(second.world.drones[0].patrol.length, 2);
  assert.equal(second.selection, 'patrol:drone-a:1');
  const moved = updateEntity(second.world, second.selection!, { x: 4 });
  assert.equal(moved.drones[0].patrol[1].x, 4);
  assert.equal(removeEntity(moved, second.selection!).drones[0].patrol.length, 1);
  assert.equal(selectionForIssue(field(), 'drone-a'), 'drone:drone-a');
});
test('point placement snaps to half meters and limits the intended center to the editing surface', () => {
  assert.deepEqual(snapPoint({ x: 1.24, z: -2.26 }, 12), { x: 1, z: -2.5 });
  assert.deepEqual(snapPoint({ x: 50, z: -30 }, 12), { x: 12, z: -12 });
});
test('undo/redo preserve independent edits and a late drag resolves against current state', () => {
  let state = editorHistoryReducer(EMPTY_HISTORY, { type: 'load', world: field() });
  state = editorHistoryReducer(state, { type: 'edit', edit: current => ({ ...current, title: '先修改的名称' }) });
  state = editorHistoryReducer(state, { type: 'edit', edit: current => updateEntity(current, 'spawn', { x: -5 }) });
  assert.equal(state.present!.title, '先修改的名称');
  assert.equal(state.present!.spawn.x, -5);
  state = editorHistoryReducer(state, { type: 'undo' });
  assert.equal(state.present!.spawn.x, -6);
  assert.equal(state.present!.title, '先修改的名称');
  state = editorHistoryReducer(state, { type: 'undo' });
  assert.equal(state.present!.title, field().title);
  state = editorHistoryReducer(state, { type: 'redo' });
  state = editorHistoryReducer(state, { type: 'redo' });
  assert.equal(state.present!.title, '先修改的名称');
  assert.equal(state.present!.spawn.x, -5);
});
test('a new edit after undo clears redo, no-op does not create history, and reloading starts a clean history', () => {
  let state = editorHistoryReducer(EMPTY_HISTORY, { type: 'load', world: field() });
  state = editorHistoryReducer(state, { type: 'edit', edit: current => ({ ...current, title: '版本一' }) });
  state = editorHistoryReducer(state, { type: 'undo' });
  assert.equal(state.future.length, 1);
  const noop = editorHistoryReducer(state, { type: 'edit', edit: current => current });
  assert.equal(noop, state);
  state = editorHistoryReducer(state, { type: 'edit', edit: current => ({ ...current, title: '另一方向' }) });
  assert.equal(state.future.length, 0);
  state = editorHistoryReducer(state, { type: 'load', world: field() });
  assert.equal(state.future.length, 0); assert.equal(state.past.length, 0);
});
