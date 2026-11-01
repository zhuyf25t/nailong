import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeLogoutResponse, type LogoutResponse } from '../../objects/player/apiTypes/LogoutResponse.ts';

export class LogoutPlayerAPI extends APIWithTokenMessage<LogoutResponse> {
  override decodeResponse(value: unknown): LogoutResponse { return decodeLogoutResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return {  }; }
}

