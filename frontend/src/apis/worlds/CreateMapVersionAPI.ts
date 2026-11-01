import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeMapVersion, type MapVersion } from '../../objects/worlds/MapVersion.ts';
import type { MapId } from '../../objects/worlds/MapId.ts';
export class CreateMapVersionAPI extends APIWithTokenMessage<MapVersion> {
 constructor(readonly mapId: MapId, readonly expectedRevision: number) { super(); }
 override decodeResponse(value: unknown): MapVersion { return decodeMapVersion(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { mapId: this.mapId, expectedRevision: this.expectedRevision }; }
}
