import { NoRequestMessage } from '../../system/api/NoRequestMessage.ts';
import { decodeMissionListResponse, type MissionListResponse } from '../../objects/training/MissionListResponse.ts';
export class ListMissionsAPI extends NoRequestMessage<MissionListResponse> {
 override decodeResponse(value: unknown): MissionListResponse { return decodeMissionListResponse(value); }
}
