import type { MapId } from '../src/objects/worlds/MapId.ts';
import type { MapVersionId } from '../src/objects/worlds/MapVersionId.ts';
import type { MissionId } from '../src/objects/training/MissionId.ts';
import { GetMapDraftAPI } from '../src/apis/worlds/GetMapDraftAPI.ts';
import { GetMapVersionAPI } from '../src/apis/worlds/GetMapVersionAPI.ts';
import { GetMissionAPI } from '../src/apis/training/GetMissionAPI.ts';

export function worldIdentityEvidence(map: MapId, version: MapVersionId, mission: MissionId) {
  new GetMapDraftAPI(map); new GetMapVersionAPI(version); new GetMissionAPI(mission);
  // @ts-expect-error Mutable draft identity is distinct from frozen version identity.
  new GetMapVersionAPI(map);
  // @ts-expect-error A version cannot be used to save/read a mutable draft.
  new GetMapDraftAPI(version);
  // @ts-expect-error Unknown URL parameters must be parsed first.
  new GetMissionAPI('forest-beacon');
}
