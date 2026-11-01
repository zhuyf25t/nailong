import { parseSessionToken, type SessionToken } from '../../objects/system/SessionToken.ts';
import type { TokenStorage } from './TokenStorage.ts';
export const SESSION_TOKEN_KEY = 'nailong.session-token.v1';
function tabStorage(): TokenStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; }
}
export function getSessionToken(storage: TokenStorage | undefined = tabStorage()): SessionToken | null {
  if (!storage) return null;
  try {
    const value: unknown = storage.getItem(SESSION_TOKEN_KEY);
    if (value === null) return null;
    return parseSessionToken(value);
  } catch {
    try { storage.removeItem(SESSION_TOKEN_KEY); } catch { /* Storage may be disabled; never trust its contents. */ }
    return null;
  }
}
export function setSessionToken(token: SessionToken, storage: TokenStorage | undefined = tabStorage()): void {
  if (!storage) throw new Error('当前浏览器无法保存会话，请允许此站点使用存储。');
  storage.setItem(SESSION_TOKEN_KEY, parseSessionToken(token));
}
export function clearSessionToken(storage: TokenStorage | undefined = tabStorage()): void {
  if (!storage) return;
  try { storage.removeItem(SESSION_TOKEN_KEY); } catch { /* A revoked token cannot regain server access. */ }
}

