import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeResultListResponse, type ResultListResponse } from '../../objects/records/apiTypes/ResultListResponse.ts';

export class ListMyResultsAPI extends APIWithTokenMessage<ResultListResponse> {
  readonly offset: number;
  readonly limit: number;
  constructor(offset: number, limit: number) {
    super();
    this.offset = offset;
    this.limit = limit;
  }
  override decodeResponse(value: unknown): ResultListResponse { return decodeResultListResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { offset: this.offset, limit: this.limit }; }
}

