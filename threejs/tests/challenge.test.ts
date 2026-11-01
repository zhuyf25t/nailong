import assert from 'node:assert/strict';
import test from 'node:test';
import { createChallenge } from '../src/game/challenge.ts';

test('countdown overflow advances the 30-second round without frame-rate drift', () => {
  const game = createChallenge(); game.reset(true); game.advance(3.5);
  assert.equal(game.state.phase, 'playing'); assert.equal(game.state.remaining, 29.5);
  assert.equal(game.advance(29.5), true); assert.equal(game.state.phase, 'results');
  assert.equal(game.advance(100), false);
});
test('countdown and results reject scoring; reset clears state', () => {
  const game = createChallenge(); game.reset(true); game.shot(); game.hit();
  assert.equal(game.state.hits, 0); game.advance(3); game.shot(); game.hit();
  assert.deepEqual(game.result(), { hits: 1, shots: 1, accuracy: 100, score: 100 });
  game.advance(30); game.hit(); assert.equal(game.state.hits, 1);
  game.reset(); assert.equal(game.state.phase, 'practice'); assert.equal(game.state.hits, 0);
});
test('invalid deltas cannot change round timing', () => {
  const game = createChallenge(); game.reset(true);
  [NaN, Infinity, -1, 0].forEach(delta => game.advance(delta));
  assert.equal(game.state.countdown, 3);
});

test('elimination ends only after all four distinct drones are destroyed', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(true); game.advance(3);
  for (const id of [2, 0, 3]) {
    assert.equal(game.destroy(id), false);
    assert.equal(game.state.phase, 'playing');
  }
  assert.equal(game.state.destroyed, 3);
  assert.equal(game.destroy(1), true);
  assert.equal(game.state.destroyed, 4);
  assert.equal(game.state.phase, 'results');
  assert.equal(game.destroy(1), false);
  assert.equal(game.advance(100), false);
  assert.equal(game.state.elapsed, 0);
});

test('duplicate and invalid drone IDs never increase the elimination count', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(true); game.advance(3);
  game.destroy(2);
  for (const id of [2, 2, -1, 4, 1.5, NaN, Infinity]) assert.equal(game.destroy(id), false);
  assert.equal(game.state.destroyed, 1);
  assert.equal(game.state.phase, 'playing');
});

test('countdown rejects kills and only overflow after countdown counts as elapsed time', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(true);
  for (const id of [0, 1, 2, 3]) assert.equal(game.destroy(id), false);
  game.advance(2);
  assert.equal(game.state.destroyed, 0);
  assert.equal(game.state.elapsed, 0);
  assert.equal(game.state.countdown, 1);
  game.advance(1.25);
  assert.equal(game.state.phase, 'playing');
  assert.equal(game.state.elapsed, 0.25);
  game.destroy(0);
  assert.equal(game.state.destroyed, 1);
});

test('elimination has no timeout even after an hour of active play', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(true); game.advance(3);
  assert.equal(game.advance(3600), false);
  assert.equal(game.state.elapsed, 3600);
  assert.equal(game.state.remaining, Infinity);
  assert.equal(game.state.phase, 'playing');
  [NaN, Infinity, -1, 0].forEach(delta => game.advance(delta));
  assert.equal(game.state.elapsed, 3600);
});

test('the active clock advances only when the caller supplies unpaused time', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(true); game.advance(4);
  assert.equal(game.state.elapsed, 1);
  // Pause is owned by the app: scoring/query operations do not run a clock.
  game.shot(); game.hit(); game.destroy(0); game.result();
  assert.equal(game.state.elapsed, 1);
  game.advance(0.5);
  assert.equal(game.state.elapsed, 1.5);
});

test('reset clears elapsed time, scoring and destroyed IDs for another elimination round', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(true); game.advance(8); game.shot(); game.hit(); game.destroy(0);
  game.reset(true);
  assert.equal(game.state.phase, 'countdown');
  assert.equal(game.state.countdown, 3);
  assert.equal(game.state.elapsed, 0);
  assert.equal(game.state.destroyed, 0);
  assert.deepEqual(game.result(), { hits: 0, shots: 0, accuracy: 0, score: 0 });
  game.advance(3); game.destroy(0);
  assert.equal(game.state.destroyed, 1);
});

test('elimination practice also finishes when all drones are destroyed', () => {
  const game = createChallenge({ mode: 'elimination', targetCount: 4 });
  game.reset(false); game.advance(12);
  for (const id of [0, 1, 2]) assert.equal(game.destroy(id), false);
  assert.equal(game.destroy(3), true);
  assert.equal(game.state.phase, 'results');
  assert.equal(game.state.elapsed, 12);
  game.reset(false);
  assert.equal(game.state.phase, 'practice');
  assert.equal(game.state.destroyed, 0);
  assert.equal(game.state.elapsed, 0);
});

test('contact failure is terminal, preserves scoring, and cannot become a victory', () => {
  const game = createChallenge({ mode: 'elimination' });
  game.reset(true); assert.equal(game.fail(), false);
  game.advance(5); game.shot(); game.hit(); game.destroy(0);
  assert.equal(game.fail(), true);
  assert.equal(game.state.phase, 'results'); assert.equal(game.state.outcome, 'defeat');
  assert.equal(game.fail(), false);
  for (const id of [1, 2, 3]) assert.equal(game.destroy(id), false);
  game.advance(100); game.shot(); game.hit();
  assert.equal(game.state.elapsed, 2); assert.equal(game.state.destroyed, 1);
  assert.equal(game.state.hits, 1); assert.equal(game.state.shots, 1);
  game.reset(true); assert.equal(game.state.outcome, null); assert.equal(game.state.destroyed, 0);
});

test('victory and practice defeat have distinct outcomes and cannot overwrite one another', () => {
  const game = createChallenge({ mode: 'elimination' });
  [0, 1, 2, 3].forEach(id => game.destroy(id));
  assert.equal(game.state.outcome, 'victory'); assert.equal(game.fail(), false);
  game.reset(false); assert.equal(game.fail(), true); assert.equal(game.state.outcome, 'defeat');
});
