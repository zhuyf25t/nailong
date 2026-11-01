import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeMapListResponse, type MapListResponse } from '../../objects/worlds/MapListResponse.ts';
export class ListMyMapsAPI extends APIWithTokenMessage<MapListResponse> {
 readonly offset: number; readonly limit: number;
 constructor(options: { readonly offset?: number; readonly limit?: number } = {}) { super(); this.offset = options.offset ?? 0; this.limit = options.limit ?? 30; }
 override decodeResponse(value: unknown): MapListResponse { return decodeMapListResponse(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { offset: this.offset, limit: this.limit }; }
}
