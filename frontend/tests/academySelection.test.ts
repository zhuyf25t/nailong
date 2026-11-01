import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLessonSelection } from '../src/pages/Academy/functions/parseLessonSelection';
test('academy has safe explicit defaults and accepts each real tool', () => {
  assert.deepEqual(parseLessonSelection(new URLSearchParams()), { kind: 'beacon', tool: 'curtain' });
  for (const tool of ['curtain', 'decoy', 'pulse']) assert.equal(parseLessonSelection(new URLSearchParams({ lesson: 'tool', tool })).tool, tool);
});
test('academy rejects unknown lessons, unknown tools and empty equipment for tool class', () => {
  assert.throws(() => parseLessonSelection(new URLSearchParams({ lesson: 'free-win' })));
  assert.throws(() => parseLessonSelection(new URLSearchParams({ tool: 'unlimited' })), /没有这件工具/);
  assert.throws(() => parseLessonSelection(new URLSearchParams({ lesson: 'tool', tool: 'none' })));
});
test('academy rejects ambiguous duplicated lesson and tool selections', () => {
  assert.throws(() => parseLessonSelection(new URLSearchParams('lesson=cover&lesson=beacon')), /重复选项/);
  assert.throws(() => parseLessonSelection(new URLSearchParams('tool=pulse&tool=curtain')), /重复选项/);
});
