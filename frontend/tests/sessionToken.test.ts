import test from 'node:test';
import assert from 'node:assert/strict';
import { getSessionToken, setSessionToken, clearSessionToken, SESSION_TOKEN_KEY } from '../src/system/api/sessionToken.ts';
import { parseSessionToken } from '../src/objects/system/SessionToken.ts';
import type { TokenStorage } from '../src/system/api/TokenStorage.ts';

function memoryStorage(initial: string|null = null): TokenStorage {
  const values = new Map<string,string>();
  if (initial !== null) values.set(SESSION_TOKEN_KEY,initial);
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);}};
}
test('token helpers store one tab-scoped opaque token, not player identity', () => {
  const storage = memoryStorage();
  const token = parseSessionToken('A'.repeat(43));
  assert.equal(getSessionToken(storage),null);
  setSessionToken(token,storage);
  assert.equal(getSessionToken(storage),token);
  clearSessionToken(storage);
  assert.equal(getSessionToken(storage),null);
});
test('corrupt storage is rejected and removed', () => {
  for (const raw of ['{}','null','undefined','<script>','A'.repeat(42)]) {
    const storage = memoryStorage(raw);
    assert.equal(getSessionToken(storage),null);
    assert.equal(storage.getItem(SESSION_TOKEN_KEY),null);
  }
});
test('blocked storage is safe to read and clear, and cannot pretend to save', () => {
  const blocked: TokenStorage = {
    getItem:()=>{throw new Error('blocked');},
    setItem:()=>{throw new Error('blocked');},
    removeItem:()=>{throw new Error('blocked');},
  };
  assert.equal(getSessionToken(blocked),null);
  assert.doesNotThrow(()=>clearSessionToken(blocked));
  assert.throws(()=>setSessionToken(parseSessionToken('A'.repeat(43)),blocked));
});

