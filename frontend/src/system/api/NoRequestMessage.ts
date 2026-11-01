import { APIMessage } from './APIMessage.ts';
export abstract class NoRequestMessage<Response> extends APIMessage<Response> {
  override toRequest(): Readonly<Record<string, unknown>> { return {}; }
}

