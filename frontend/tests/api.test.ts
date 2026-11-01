import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APIMessage } from '../src/system/api/APIMessage.ts';
import { apiNameOf } from '../src/system/api/apiNameOf.ts';
import { ApiError } from '../src/system/api/ApiError.ts';
import { object } from '../src/system/api/decode.ts';
import { parseSessionToken } from '../src/objects/system/SessionToken.ts';
import { decodeTrainingRun } from '../src/objects/training/TrainingRun.ts';
import { decodeResultSubmission } from '../src/objects/records/ResultSubmission.ts';
import { RegisterPlayerAPI } from '../src/apis/player/RegisterPlayerAPI.ts';
import { LoginPlayerAPI } from '../src/apis/player/LoginPlayerAPI.ts';
import { GetCurrentPlayerAPI } from '../src/apis/player/GetCurrentPlayerAPI.ts';
import { LogoutPlayerAPI } from '../src/apis/player/LogoutPlayerAPI.ts';
import { GetTrainingConfigAPI } from '../src/apis/training/GetTrainingConfigAPI.ts';
import { StartTrainingRunAPI } from '../src/apis/training/StartTrainingRunAPI.ts';
import { GetTrainingRunAPI } from '../src/apis/training/GetTrainingRunAPI.ts';
import { AbandonTrainingRunAPI } from '../src/apis/training/AbandonTrainingRunAPI.ts';
import { SaveTrainingResultAPI } from '../src/apis/records/SaveTrainingResultAPI.ts';
import { GetTrainingResultAPI } from '../src/apis/records/GetTrainingResultAPI.ts';
import { ListMyResultsAPI } from '../src/apis/records/ListMyResultsAPI.ts';
import { GetMyBestAPI } from '../src/apis/records/GetMyBestAPI.ts';
import { SESSION_TOKEN_KEY } from '../src/system/api/sessionToken.ts';

const fixture = object(JSON.parse(readFileSync(new URL('./fixtures/contract.json', import.meta.url), 'utf8')));
const run = decodeTrainingRun(fixture.run);
const submission = decodeResultSubmission(fixture.submission);
const tokenA = parseSessionToken('A'.repeat(43));
const tokenB = parseSessionToken('B'.repeat(43));
const apis: readonly [APIMessage<unknown>, string][] = [
  [new RegisterPlayerAPI('demo', 'password', '奶糖'), 'registerplayerapi'],
  [new LoginPlayerAPI('demo', 'password'), 'loginplayerapi'],
  [new GetCurrentPlayerAPI(), 'getcurrentplayerapi'], [new LogoutPlayerAPI(), 'logoutplayerapi'],
  [new GetTrainingConfigAPI(), 'gettrainingconfigapi'],
  [new StartTrainingRunAPI(run.requestId, run.config.id, run.config.version, run.terrain), 'starttrainingrunapi'],
  [new GetTrainingRunAPI(run.id), 'gettrainingrunapi'], [new AbandonTrainingRunAPI(run.id), 'abandontrainingrunapi'],
  [new SaveTrainingResultAPI(run.id,submission), 'savetrainingresultapi'], [new GetTrainingResultAPI(run.id), 'gettrainingresultapi'],
  [new ListMyResultsAPI(0,10), 'listmyresultsapi'], [new GetMyBestAPI(run.config.id,run.config.version,run.terrain), 'getmybestapi'],
];
test('all 12 API names are uniformly derived and requests contain only inputs', () => {
  assert.equal(new Set(apis.map(([api]) => apiNameOf(api))).size,12);
  for (const [api,name] of apis) {
    assert.equal(apiNameOf(api), name);
    assert.equal('decodeResponse' in api.toRequest(),false);
    assert.equal('responseType' in api.toRequest(),false);
    assert.equal('userToken' in api.toRequest(),false);
  }
  assert.deepEqual(new GetTrainingConfigAPI().toRequest(),{});
});

async function withFetch<T>(fake: typeof fetch, action: ()=>Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await action(); } finally { globalThis.fetch = original; }
}
function failure(kind: ApiError['kind'], code?: string) {
  return (error: unknown) => error instanceof ApiError && error.kind === kind && (code === undefined || error.code === code);
}

test('authenticated request freezes explicit token and validates concrete response', async () => {
  let captured: unknown;
  await withFetch(async (path, options) => {
    assert.equal(path,'/api/getcurrentplayerapi');
    captured = JSON.parse(String(options?.body));
    assert.equal(options?.credentials,'omit');
    return Response.json(fixture.player);
  }, async () => {
    const response = await new GetCurrentPlayerAPI().send({token:tokenA});
    assert.equal(response.id,run.playerId);
  });
  assert.deepEqual(captured,{userToken:tokenA});
  // A separate explicit token gets its own body; no globally cached identity.
  await withFetch(async (_, options) => {
    assert.equal(object(JSON.parse(String(options?.body))).userToken,tokenB);
    return Response.json(fixture.player);
  }, () => new GetCurrentPlayerAPI().send({token:tokenB}));
});
test('explicit null token never sends a request', async () => {
  await withFetch(async () => { throw new Error('must not fetch'); }, () =>
    assert.rejects(new GetCurrentPlayerAPI().send({token:null}),failure('auth')));
});
test('automatic token reads the tab store, while explicit tokens remain frozen across account changes', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis,'window');
  let stored: string | null = tokenA;
  const storage = {getItem: (key:string) => key === SESSION_TOKEN_KEY ? stored : null, setItem: (_:string,value:string) => {stored=value;}, removeItem: () => {stored=null;}};
  Object.defineProperty(globalThis,'window',{value:{sessionStorage:storage},configurable:true});
  try {
    await withFetch(async (_,options) => {
      assert.equal(object(JSON.parse(String(options?.body))).userToken,tokenA);
      return Response.json(fixture.player);
    }, () => new GetCurrentPlayerAPI().send());
    stored = tokenB;
    await withFetch(async (_,options) => {
      assert.equal(object(JSON.parse(String(options?.body))).userToken,tokenA);
      return Response.json(fixture.player);
    }, () => new GetCurrentPlayerAPI().send({token:tokenA}));
    await withFetch(async () => { throw new Error('must not fetch'); }, () =>
      assert.rejects(new GetCurrentPlayerAPI().send({token:null}),failure('auth')));
    stored = '{}';
    await assert.rejects(new GetCurrentPlayerAPI().send(),failure('auth'));
    assert.equal(stored,null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis,'window',originalWindow);
    else Reflect.deleteProperty(globalThis,'window');
  }
});
test('public API omits token even when option is supplied', async () => {
  await withFetch(async (_,options) => {
    assert.deepEqual(JSON.parse(String(options?.body)),{});
    return Response.json(fixture.config);
  }, () => new GetTrainingConfigAPI().send({token:tokenA}));
});
test('network error is a distinct typed failure', async () => {
  await withFetch(async () => { throw new TypeError('offline'); }, () =>
    assert.rejects(new GetTrainingConfigAPI().send(),failure('network')));
});
test('aborted request is distinguished from an offline request', async () => {
  const controller = new AbortController(); controller.abort();
  await withFetch(async () => { throw new DOMException('abort','AbortError'); }, () =>
    assert.rejects(new GetTrainingConfigAPI().send({signal:controller.signal}),failure('aborted')));
});
test('bad JSON success cannot be cast into DTO', async () => {
  await withFetch(async () => new Response('<html>broken</html>'), () =>
    assert.rejects(new GetTrainingConfigAPI().send(),failure('decode')));
});
test('malformed 200 response is rejected', async () => {
  await withFetch(async () => Response.json({...object(fixture.config), id:'bad'}), () =>
    assert.rejects(new GetTrainingConfigAPI().send(),failure('decode')));
});
test('known HTTP error is decoded with matching status', async () => {
  await withFetch(async () => Response.json({code:'conflict',message:'规则已更新'},{status:409}), () =>
    assert.rejects(new GetTrainingConfigAPI().send(),failure('http','conflict')));
});
test('unknown error code is rejected instead of being trusted', async () => {
  await withFetch(async () => Response.json({code:'anything',message:'bad'},{status:400}), () =>
    assert.rejects(new GetTrainingConfigAPI().send(),failure('decode')));
});
test('HTTP status and error code must agree', async () => {
  await withFetch(async () => Response.json({code:'unauthorized',message:'bad'},{status:500}), () =>
    assert.rejects(new GetTrainingConfigAPI().send(),failure('decode')));
});
