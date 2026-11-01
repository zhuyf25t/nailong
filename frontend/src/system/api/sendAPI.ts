import type { APIMessage } from './APIMessage.ts';
import type { SendOptions } from './SendOptions.ts';
import { ApiError } from './ApiError.ts';
import { apiNameOf } from './apiNameOf.ts';
import { apiRequest } from './apiRequest.ts';
import { getSessionToken } from './sessionToken.ts';
import { parseSessionToken } from '../../objects/system/SessionToken.ts';

export async function sendAPI<Response>(message: APIMessage<Response>, options: SendOptions = {}): Promise<Response> {
  const request = message.toRequest();
  let body = request;
  if (message.needsUserToken) {
    // Resolve before the asynchronous boundary. An old run must never silently borrow a new login.
    const token = Object.hasOwn(options, 'token') ? options.token : getSessionToken();
    if (!token) throw new ApiError({ kind: 'auth', message: '请先登录，再继续这次操作。' });
    let validatedToken;
    try { validatedToken = parseSessionToken(token); } catch {
      throw new ApiError({ kind: 'auth', message: '登录信息已损坏，请重新登录。' });
    }
    body = { ...request, userToken: validatedToken };
  }
  return apiRequest(`/api/${apiNameOf(message)}`, body, value => message.decodeResponse(value), options.signal);
}

