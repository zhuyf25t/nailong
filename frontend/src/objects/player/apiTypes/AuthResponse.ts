import { decodePlayerProfile, type PlayerProfile } from '../PlayerProfile.ts';
import { parseSessionToken, type SessionToken } from '../../system/SessionToken.ts';
import { parseInstant, type Instant } from '../../system/Instant.ts';
import { object } from '../../../system/api/decode.ts';
export interface AuthResponse { readonly player: PlayerProfile; readonly userToken: SessionToken; readonly expiresAt: Instant }
export function decodeAuthResponse(value: unknown, path = '$'): AuthResponse {
  const v = object(value, path);
  return { player: decodePlayerProfile(v.player, `${path}.player`), userToken: parseSessionToken(v.userToken, `${path}.userToken`), expiresAt: parseInstant(v.expiresAt, `${path}.expiresAt`) };
}

