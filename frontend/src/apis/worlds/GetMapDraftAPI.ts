import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeMapDraft, type MapDraft } from '../../objects/worlds/MapDraft.ts';
import type { MapId } from '../../objects/worlds/MapId.ts';
export class GetMapDraftAPI extends APIWithTokenMessage<MapDraft> {
 constructor(readonly mapId: MapId) { super(); }
 override decodeResponse(value: unknown): MapDraft { return decodeMapDraft(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { mapId: this.mapId }; }
}
