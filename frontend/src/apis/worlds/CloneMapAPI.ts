import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeMapDraft, type MapDraft } from '../../objects/worlds/MapDraft.ts';
import type { MapVersionId } from '../../objects/worlds/MapVersionId.ts';
export class CloneMapAPI extends APIWithTokenMessage<MapDraft> {
 constructor(readonly mapVersionId: MapVersionId) { super(); }
 override decodeResponse(value: unknown): MapDraft { return decodeMapDraft(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { mapVersionId: this.mapVersionId }; }
}
