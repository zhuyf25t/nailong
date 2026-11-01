import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeAuthResponse } from '../src/objects/player/apiTypes/AuthResponse.ts';
import { decodePlayerProfile } from '../src/objects/player/PlayerProfile.ts';
import { decodeLogoutResponse } from '../src/objects/player/apiTypes/LogoutResponse.ts';
import { decodeTrainingConfig } from '../src/objects/training/TrainingConfig.ts';
import { decodeTrainingRun } from '../src/objects/training/TrainingRun.ts';
import { decodeTerrainConfig } from '../src/objects/training/TerrainConfig.ts';
import { decodeResultSubmission } from '../src/objects/records/ResultSubmission.ts';
import { decodeTrainingResult } from '../src/objects/records/TrainingResult.ts';
import { decodeResultLookupResponse } from '../src/objects/records/apiTypes/ResultLookupResponse.ts';
import { decodeResultListResponse } from '../src/objects/records/apiTypes/ResultListResponse.ts';
import { decodePersonalBestResponse } from '../src/objects/records/apiTypes/PersonalBestResponse.ts';
import { decodeAbandonRunResponse } from '../src/objects/training/apiTypes/AbandonRunResponse.ts';
import { parseInstant } from '../src/objects/system/Instant.ts';
import { parseRunId } from '../src/objects/training/RunId.ts';
import { parsePlayerId } from '../src/objects/player/PlayerId.ts';
import { parseSessionToken } from '../src/objects/system/SessionToken.ts';
import { DecodeError } from '../src/system/api/DecodeError.ts';
import { object } from '../src/system/api/decode.ts';

const fixture = object(JSON.parse(readFileSync(new URL('./fixtures/contract.json', import.meta.url), 'utf8')));
const config = decodeTrainingConfig(fixture.config);
const submission = decodeResultSubmission(fixture.submission);
const result = decodeTrainingResult(fixture.result);

test('shared backend fixture passes all DTO decoders including nullable wrappers', () => {
  assert.equal(decodeAuthResponse(fixture.auth).player.nickname, '奶糖');
  assert.equal(config.drones.spawns.length, 4);
  assert.equal(decodeTrainingRun(fixture.run).status, 'open');
  assert.equal(decodeAbandonRunResponse(fixture.abandoned).run.status, 'abandoned');
  assert.equal(decodeResultLookupResponse(fixture.lookup).result?.runId, result.runId);
  assert.equal(decodeResultListResponse(fixture.list).items.length, 1);
  assert.equal(decodePersonalBestResponse(fixture.best).best?.outcome, 'victory');
  assert.deepEqual(decodeResultLookupResponse({result:null}), {result:null});
  assert.deepEqual(decodePersonalBestResponse({best:null}), {best:null});
  assert.deepEqual(decodeLogoutResponse({loggedOut:true}), {loggedOut:true});
});

test('contract fixture uses the same current version and defaults as the Scala seed resource', () => {
  const backendConfig: unknown = JSON.parse(readFileSync(new URL('../../backend/src/main/resources/game-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(config, decodeTrainingConfig(backendConfig));
});

for (const [label, decode, value] of [
  ['malformed UUID', parseRunId, 'abc'],
  ['UUID with valid prefix and suffix', parsePlayerId, result.playerId + 'junk'],
  ['session token too short', parseSessionToken, 'A'.repeat(42)],
  ['session token control characters', parseSessionToken, 'A'.repeat(42) + '\n'],
  ['timezone omitted', parseInstant, '2026-11-01T12:00:00'],
  ['invalid calendar day', parseInstant, '2026-02-30T12:00:00Z'],
  ['invalid timezone offset', parseInstant, '2026-11-01T12:00:00+18:30'],
  ['missing nullable field', decodeResultLookupResponse, {}],
  ['nullable wrong type', decodePersonalBestResponse, {best: []}],
  ['logout false', decodeLogoutResponse, {loggedOut:false}],
  ['incomplete terrain', decodeTerrainConfig, {hillHeight:1}],
  ['NaN terrain', decodeTerrainConfig, {...config.terrain,hillHeight:NaN}],
  ['infinite terrain', decodeTerrainConfig, {...config.terrain,ripple:Infinity}],
  ['out of range terrain', decodeTerrainConfig, {...config.terrain,hillX:9}],
  ['negative result count', decodeResultSubmission, {...submission,hits:-1}],
  ['fractional result count', decodeResultSubmission, {...submission,hits:1.5}],
  ['unsafe integer', decodeResultSubmission, {...submission,shotsFired:Number.MAX_SAFE_INTEGER+1}],
  ['duration exceeds server maximum', decodeResultSubmission, {...submission,elapsedMs:86400001}],
  ['invalid outcome', decodeResultSubmission, {...submission,outcome:'win'}],
  ['too many hits', decodeResultSubmission, {...submission,hits:17}],
  ['too many destroyed', decodeResultSubmission, {...submission,destroyed:13}],
  ['accuracy is not finite', decodeTrainingResult, {...result,accuracy:NaN}],
  ['invalid run status', decodeTrainingRun, {...object(fixture.run),status:'victory'}],
  ['completed run without timestamp', decodeTrainingRun, {...object(fixture.run),status:'completed'}],
  ['result list exceeds limit', decodeResultListResponse, {items:[result,result],limit:1,total:2,offset:0}],
  ['zero weapon interval', decodeTrainingConfig, {...config,weapon:{...config.weapon,fireIntervalMs:0}}],
  ['empty spawn array', decodeTrainingConfig, {...config,drones:{...config.drones,spawns:[]}}],
] satisfies [string, (v:unknown)=>unknown, unknown][]) {
  test('rejects ' + label, () => assert.throws(() => decode(value), DecodeError));
}

test('timestamps accept real leap dates, explicit offset, and Scala nanoseconds', () => {
  assert.equal(parseInstant('2024-02-29T23:59:59.123456789Z'), '2024-02-29T23:59:59.123456789Z');
  assert.equal(parseInstant('2026-11-01T20:00:00+08:00'), '2026-11-01T20:00:00+08:00');
});

test('nickname length matches Scala Unicode code point validation', () => {
  const player = object(fixture.player);
  assert.equal(decodePlayerProfile({...player,nickname:'😀'.repeat(24)}).nickname, '😀'.repeat(24));
  assert.throws(() => decodePlayerProfile({...player,nickname:'😀'.repeat(25)}), DecodeError);
  assert.throws(() => decodePlayerProfile({...player,nickname:'名字\u0085'}), DecodeError);
});

test('resource-amplifying game configurations are rejected before engine construction', () => {
  for (const drones of [{...config.drones,maxHp:1000000}, {...config.drones,spawns:Array(33).fill(config.drones.spawns[0])}, {...config.drones,chaseSpeed:1000}]) {
    assert.throws(() => decodeTrainingConfig({...config,drones}), DecodeError);
  }
  assert.throws(() => decodeTrainingConfig({...config,weapon:{...config.weapon,projectileSpeed:0.000001}}), DecodeError);
});
