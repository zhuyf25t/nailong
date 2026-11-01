import { ApiError } from './ApiError.ts';
import { object, string } from './decode.ts';
import { decodeServerErrorCode, statusForCode } from './ServerErrorCode.ts';

/** JSON is unknown until the particular API's decoder validates it. */
export async function apiRequest<Response>(
  path: string,
  body: Readonly<Record<string, unknown>>,
  decodeResponse: (value: unknown) => Response,
  signal?: AbortSignal,
): Promise<Response> {
  let response: globalThis.Response;
  try {
    response = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body), signal, credentials: 'omit', cache: 'no-store',
    });
  } catch {
    if (signal?.aborted) throw new ApiError({ kind: 'aborted', message: '请求已取消。' });
    throw new ApiError({ kind: 'network', message: '暂时无法连接服务器，请检查网络后重试。' });
  }
  let raw: unknown;
  try { raw = await response.json(); } catch {
    if (signal?.aborted) throw new ApiError({ kind: 'aborted', message: '请求已取消。' });
    throw new ApiError({ kind: 'decode', message: '服务器返回了无法读取的数据。', status: response.status });
  }
  if (!response.ok) {
    try {
      const error = object(raw);
      const code = decodeServerErrorCode(error.code, '$.code');
      const message = string(error.message, '$.message', 1, 2000);
      if (statusForCode[code] !== response.status) throw new Error('Error code and HTTP status disagree.');
      throw new ApiError({ kind: 'http', code, message, status: response.status });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError({ kind: 'decode', message: '服务器返回的错误信息不符合约定，请稍后重试。', status: response.status });
    }
  }
  try { return decodeResponse(raw); } catch {
    throw new ApiError({ kind: 'decode', message: '服务器数据不符合当前版本，请刷新后重试。', status: response.status });
  }
}

