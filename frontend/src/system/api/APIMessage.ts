import { sendAPI } from './sendAPI.ts';
import type { SendOptions } from './SendOptions.ts';
export abstract class APIMessage<Response> {
  declare readonly responseType: Response;
  get needsUserToken(): boolean { return false; }
  abstract decodeResponse(value: unknown): Response;
  abstract toRequest(): Readonly<Record<string, unknown>>;
  send(options: SendOptions = {}): Promise<Response> { return sendAPI(this, options); }
}

