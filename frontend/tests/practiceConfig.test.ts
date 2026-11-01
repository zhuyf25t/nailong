import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRACTICE_CONFIG } from '../src/pages/Training/functions/practiceConfig';
import { decodeTrainingConfig } from '../src/objects/training/TrainingConfig';
test('offline guest rules match the versioned backend resource exactly', () => {
  const resource: unknown = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/game-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(PRACTICE_CONFIG, decodeTrainingConfig(resource));
});
