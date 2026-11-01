import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoundCompletion } from '../src/pages/Training/game/roundCompletion';
import { EXPLOSION_SECONDS } from '../src/pages/Training/game/core/explosion';
import type { ResultSubmission } from '../src/objects/records/ResultSubmission';

test('terminal submission is a frozen snapshot delivered once after the complete explosion', () => {
  const received: ResultSubmission[] = [];
  const completion = createRoundCompletion(EXPLOSION_SECONDS, value => received.push(value));
  const source = { outcome: 'victory' as const, shotsFired: 15, hits: 12, destroyed: 4, elapsedMs: 12000 };
  assert.equal(completion.finish(source), true);
  source.shotsFired = 100;
  completion.advance(EXPLOSION_SECONDS - .01);
  assert.equal(received.length, 0);
  completion.advance(.01);
  assert.equal(received.length, 1);
  assert.equal(received[0].shotsFired, 15);
  assert.ok(Object.isFrozen(received[0]));
  assert.equal(completion.finish(source), false);
  completion.advance(10);
  assert.equal(received.length, 1);
});

test('unmount cancels a pending result and rejects later terminal callbacks', () => {
  let calls = 0;
  const completion = createRoundCompletion(EXPLOSION_SECONDS, () => calls++);
  const result = { outcome: 'defeat' as const, shotsFired: 0, hits: 0, destroyed: 0, elapsedMs: 10000 };
  completion.finish(result); completion.advance(.5); completion.cancel(); completion.advance(10);
  assert.equal(calls, 0);
  assert.equal(completion.finish(result), false);
});

test('invalid frame durations do not deliver a pending result', () => {
  let calls = 0;
  const completion = createRoundCompletion(EXPLOSION_SECONDS, () => calls++);
  completion.finish({ outcome: 'defeat', shotsFired: 0, hits: 0, destroyed: 0, elapsedMs: 10000 });
  for (const elapsed of [NaN, Infinity, -1, 0]) completion.advance(elapsed);
  assert.equal(calls, 0);
  completion.advance(EXPLOSION_SECONDS);
  assert.equal(calls, 1);
});
