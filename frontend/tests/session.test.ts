import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAuthResponse } from '../src/objects/player/apiTypes/AuthResponse.ts';
import type { SessionToken } from '../src/objects/system/SessionToken.ts';
import { SessionController } from '../src/system/session/SessionController.ts';
import type { SessionDependencies } from '../src/system/session/SessionDependencies.ts';
import { AuthRequest } from '../src/pages/Auth/functions/AuthRequest.ts';
import { normalizeUsername, validateAuthDraft } from '../src/pages/Auth/functions/validateAuthDraft.ts';

const authA = decodeAuthResponse({
  player: { id: 'a8137000-0000-4000-8000-000000000001', username: 'flower', nickname: '花花', createdAt: '2026-11-01T00:00:00Z' },
  userToken: 'A'.repeat(43), expiresAt: '2026-11-08T00:00:00Z',
});
const authB = decodeAuthResponse({
  player: { id: 'a8137000-0000-4000-8000-000000000002', username: 'meadow', nickname: '草草', createdAt: '2026-11-01T00:00:00Z' },
  userToken: 'B'.repeat(43), expiresAt: '2026-11-08T00:00:00Z',
});
const unauthorized = new Error('unauthorized');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function session(initialToken: SessionToken | null, overrides: Partial<SessionDependencies> = {}) {
  let token = initialToken;
  const controller = new SessionController({
    readToken: () => token,
    writeToken: next => { token = next; },
    clearToken: () => { token = null; },
    getCurrentPlayer: async () => authA.player,
    logout: async () => ({ loggedOut: true }),
    isUnauthorized: error => error === unauthorized,
    ...overrides,
  });
  return { controller, token: () => token };
}

test('no saved token becomes signed out without making an identity request', async () => {
  const { controller } = session(null, { getCurrentPlayer: async () => { assert.fail('must not request without a token'); } });
  await controller.refresh();
  assert.deepEqual(controller.getSnapshot(), { kind: 'signed-out' });
});

test('restore passes the captured token and publishes the decoded player', async () => {
  const { controller } = session(authA.userToken, { getCurrentPlayer: async token => { assert.equal(token, authA.userToken); return authA.player; } });
  await controller.refresh();
  assert.deepEqual(controller.getSnapshot(), { kind: 'signed-in', player: authA.player, token: authA.userToken });
});

test('network failure preserves token and retry can restore the session', async () => {
  let offline = true;
  const { controller, token } = session(authA.userToken, { getCurrentPlayer: async () => { if (offline) throw new Error('network'); return authA.player; } });
  await controller.refresh();
  assert.equal(controller.getSnapshot().kind, 'unavailable');
  assert.equal(token(), authA.userToken);
  offline = false;
  await controller.refresh();
  assert.equal(controller.getSnapshot().kind, 'signed-in');
});

test('an explicit unauthorized response clears only the current session', async () => {
  const { controller, token } = session(authA.userToken, { getCurrentPlayer: async () => { throw unauthorized; } });
  await controller.refresh();
  assert.equal(token(), null);
  assert.equal(controller.getSnapshot().kind, 'signed-out');
});

test('a stale restore failure cannot log out an account that signed in afterwards', async () => {
  const pending = deferred<typeof authA.player>();
  const { controller, token } = session(authA.userToken, { getCurrentPlayer: () => pending.promise });
  const restoring = controller.refresh();
  controller.acceptAuth(authB);
  pending.reject(unauthorized);
  await restoring;
  assert.equal(token(), authB.userToken);
  assert.deepEqual(controller.getSnapshot(), { kind: 'signed-in', player: authB.player, token: authB.userToken });
});

test('a stale successful restore cannot replace a new login', async () => {
  const pending = deferred<typeof authA.player>();
  const { controller } = session(authA.userToken, { getCurrentPlayer: () => pending.promise });
  const restoring = controller.refresh();
  controller.acceptAuth(authB);
  pending.resolve(authA.player);
  await restoring;
  assert.deepEqual(controller.getSnapshot(), { kind: 'signed-in', player: authB.player, token: authB.userToken });
});

test('logout waits for server revocation and uses the captured token', async () => {
  const pending = deferred<unknown>();
  const { controller, token } = session(authA.userToken, { logout: requestToken => { assert.equal(requestToken, authA.userToken); return pending.promise; } });
  controller.acceptAuth(authA);
  const loggingOut = controller.logout();
  assert.equal(token(), authA.userToken);
  pending.resolve({ loggedOut: true });
  await loggingOut;
  assert.equal(token(), null);
  assert.equal(controller.getSnapshot().kind, 'signed-out');
});

test('failed logout is not reported as successful and keeps the token for retry', async () => {
  const failure = new Error('offline');
  const { controller, token } = session(authA.userToken, { logout: async () => { throw failure; } });
  controller.acceptAuth(authA);
  await assert.rejects(controller.logout(), failure);
  assert.equal(token(), authA.userToken);
  assert.equal(controller.getSnapshot().kind, 'unavailable');
});

test('late logout response does not erase another account', async () => {
  const pending = deferred<unknown>();
  const { controller, token } = session(authA.userToken, { logout: () => pending.promise });
  const loggingOut = controller.logout();
  controller.acceptAuth(authB);
  pending.resolve({ loggedOut: true });
  await loggingOut;
  assert.equal(token(), authB.userToken);
  assert.equal(controller.getSnapshot().kind, 'signed-in');
  controller.invalidate(authA.userToken);
  assert.equal(token(), authB.userToken);
  controller.invalidate(authB.userToken);
  assert.equal(token(), null);
  assert.equal(controller.getSnapshot().kind, 'signed-out');
});

test('confirmed logout wins over a concurrent restore of the revoked token', async () => {
  const revocation = deferred<unknown>();
  const restoration = deferred<typeof authA.player>();
  const { controller, token } = session(authA.userToken, { logout: () => revocation.promise, getCurrentPlayer: () => restoration.promise });
  const loggingOut = controller.logout();
  const refreshing = controller.refresh();
  revocation.resolve({ loggedOut: true });
  await loggingOut;
  restoration.resolve(authA.player);
  await refreshing;
  assert.equal(token(), null);
  assert.equal(controller.getSnapshot().kind, 'signed-out');
});

test('failure to store a new login does not strand an existing identity check', async () => {
  const restoration = deferred<typeof authA.player>();
  const { controller } = session(authA.userToken, {
    getCurrentPlayer: () => restoration.promise,
    writeToken: () => { throw new Error('storage disabled'); },
  });
  const refreshing = controller.refresh();
  assert.throws(() => controller.acceptAuth(authB), /storage disabled/);
  restoration.resolve(authA.player);
  await refreshing;
  assert.deepEqual(controller.getSnapshot(), { kind: 'signed-in', player: authA.player, token: authA.userToken });
});

test('closing authentication aborts the request and ignores even a successful late response', async () => {
  const request = new AuthRequest();
  const pending = deferred<typeof authA>();
  let signal: AbortSignal | undefined;
  let accepted = 0;
  const result = request.run(requestSignal => { signal = requestSignal; return pending.promise; }, () => { accepted++; });
  request.cancel();
  assert.equal(signal?.aborted, true);
  pending.resolve(authA);
  assert.equal(await result, 'cancelled');
  assert.equal(accepted, 0, 'neither session acceptance nor navigation may run');
});

test('a reopened dialog only accepts its newest authentication attempt', async () => {
  const request = new AuthRequest();
  const first = deferred<typeof authA>();
  const second = deferred<typeof authA>();
  const accepted: SessionToken[] = [];
  const older = request.run(() => first.promise, response => accepted.push(response.userToken));
  const newer = request.run(() => second.promise, response => accepted.push(response.userToken));
  second.resolve(authB);
  first.resolve(authA);
  assert.equal(await newer, 'accepted');
  assert.equal(await older, 'cancelled');
  assert.deepEqual(accepted, [authB.userToken]);
});

test('a rejected cancelled authentication does not surface an obsolete service error', async () => {
  const request = new AuthRequest();
  const pending = deferred<typeof authA>();
  const result = request.run(() => pending.promise, () => { assert.fail('cancelled request accepted'); });
  request.cancel();
  pending.reject(new Error('aborted'));
  assert.equal(await result, 'cancelled');
});

test('account validation normalizes ASCII usernames and checks confirmation only for registration', () => {
  assert.equal(normalizeUsername('  Flower_1  '), 'flower_1');
  assert.deepEqual(validateAuthDraft({ mode: 'login', username: ' Flower_1 ', password: 'password123', confirmPassword: '' }), {});
  assert.equal(typeof validateAuthDraft({ mode: 'register', username: 'flower', password: 'password123', confirmPassword: 'password124' }).confirmPassword, 'string');
  assert.equal(typeof validateAuthDraft({ mode: 'login', username: '花谷账号', password: 'password123', confirmPassword: '' }).username, 'string');
});

test('password validation matches server Unicode code points and the 128 byte ceiling', () => {
  const check = (password: string) => validateAuthDraft({ mode: 'register', username: 'flower', password, confirmPassword: password }).password;
  assert.equal(typeof check('🌷'.repeat(7)), 'string');
  assert.equal(check('🌷'.repeat(8)), undefined);
  assert.equal(check('🌷'.repeat(32)), undefined);
  assert.equal(typeof check('🌷'.repeat(33)), 'string');
});
