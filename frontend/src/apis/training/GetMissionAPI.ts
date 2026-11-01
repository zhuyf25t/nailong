import { APIMessage } from '../../system/api/APIMessage.ts';
import { decodeMissionDefinition, type MissionDefinition } from '../../objects/training/MissionDefinition.ts';
import type { MissionId } from '../../objects/training/MissionId.ts';
export class GetMissionAPI extends APIMessage<MissionDefinition> {
 constructor(readonly missionId: MissionId) { super(); }
 override decodeResponse(value: unknown): MissionDefinition { return decodeMissionDefinition(value); }
 override toRequest(): Readonly<Record<string, unknown>> { return { missionId: this.missionId }; }
}
