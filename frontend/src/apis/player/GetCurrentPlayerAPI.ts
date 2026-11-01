import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodePlayerProfile, type PlayerProfile } from '../../objects/player/PlayerProfile.ts';

export class GetCurrentPlayerAPI extends APIWithTokenMessage<PlayerProfile> {
  override decodeResponse(value: unknown): PlayerProfile { return decodePlayerProfile(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return {  }; }
}

