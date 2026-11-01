import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeGameSettings } from '../src/system/settings/GameSettings';
test('local settings reject non-finite and out-of-range input', () => {
  assert.throws(() => decodeGameSettings({ quality: 'high', volume: Infinity, cameraSensitivity: 1 }));
  assert.throws(() => decodeGameSettings({ quality: 'ultra', volume: .5, cameraSensitivity: 1 }));
  assert.throws(() => decodeGameSettings({ quality: 'low', volume: .5, cameraSensitivity: .1 }));
  assert.deepEqual(decodeGameSettings({ quality: 'low', volume: 0, cameraSensitivity: 2 }), { quality: 'low', volume: 0, cameraSensitivity: 2 });
});
