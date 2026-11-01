import { string } from '../../system/api/decode.ts';
import { DecodeError } from '../../system/api/DecodeError.ts';
declare const sessionTokenBrand: unique symbol;
export type SessionToken = string & { readonly [sessionTokenBrand]: 'SessionToken' };
export function parseSessionToken(value: unknown, path = '$'): SessionToken {
  const token = string(value, path, 43, 43);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) throw new DecodeError(path, 'opaque base64url session token');
  return token as SessionToken;
}
