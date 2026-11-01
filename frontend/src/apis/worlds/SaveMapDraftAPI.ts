import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeMapDraft, type MapDraft } from '../../objects/worlds/MapDraft.ts';
import type { MapId } from '../../objects/worlds/MapId.ts';
import type { WorldDefinition } from '../../objects/worlds/WorldDefinition.ts';
export class SaveMapDraftAPI extends APIWithTokenMessage<MapDraft> {
 constructor(readonly input: { readonly mapId: MapId; readonly expectedRevision: number; readonly title: string; readonly world: WorldDefinition }) { super(); }
 override decodeResponse(value: unknown): MapDraft { return decodeMapDraft(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { mapId: this.input.mapId, expectedRevision: this.input.expectedRevision, title: this.input.title, world: this.input.world }; }
}
