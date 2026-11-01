import { APIMessage } from '../../system/api/APIMessage.ts';
import { decodeAuthResponse, type AuthResponse } from '../../objects/player/apiTypes/AuthResponse.ts';

export class LoginPlayerAPI extends APIMessage<AuthResponse> {
  readonly username: string;
  readonly password: string;
  constructor(username: string, password: string) {
    super();
    this.username = username;
    this.password = password;
  }
  override decodeResponse(value: unknown): AuthResponse { return decodeAuthResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { username: this.username, password: this.password }; }
}

