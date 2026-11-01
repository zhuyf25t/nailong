import { APIMessage } from '../../system/api/APIMessage.ts';
import { decodeAuthResponse, type AuthResponse } from '../../objects/player/apiTypes/AuthResponse.ts';

export class RegisterPlayerAPI extends APIMessage<AuthResponse> {
  readonly username: string;
  readonly password: string;
  readonly nickname: string;
  constructor(username: string, password: string, nickname: string) {
    super();
    this.username = username;
    this.password = password;
    this.nickname = nickname;
  }
  override decodeResponse(value: unknown): AuthResponse { return decodeAuthResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { username: this.username, password: this.password, nickname: this.nickname }; }
}

