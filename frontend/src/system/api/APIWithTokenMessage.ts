import { APIMessage } from './APIMessage.ts';
export abstract class APIWithTokenMessage<Response> extends APIMessage<Response> {
  override get needsUserToken(): boolean { return true; }
}

