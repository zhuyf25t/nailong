import type { PlayerProfile } from '../../objects/player/PlayerProfile.ts';
import type { SessionToken } from '../../objects/system/SessionToken.ts';

export type PlayerSessionState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'signed-in'; readonly player: PlayerProfile; readonly token: SessionToken }
  | { readonly kind: 'unavailable'; readonly message: string };
