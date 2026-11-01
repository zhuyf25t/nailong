import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeMapVersion, type MapVersion } from '../../objects/worlds/MapVersion.ts';
import type { MapVersionId } from '../../objects/worlds/MapVersionId.ts';
export class GetMapVersionAPI extends APIWithTokenMessage<MapVersion> {
 constructor(readonly mapVersionId: MapVersionId) { super(); }
 override decodeResponse(value: unknown): MapVersion { return decodeMapVersion(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { mapVersionId: this.mapVersionId }; }
}
