import { object, assert } from '../../../system/api/decode.ts';
export interface LogoutResponse { readonly loggedOut: true }
export function decodeLogoutResponse(value: unknown, path = '$'): LogoutResponse {
  const v = object(value, path);
  assert(v.loggedOut === true, `${path}.loggedOut`, 'true');
  return { loggedOut: true };
}

