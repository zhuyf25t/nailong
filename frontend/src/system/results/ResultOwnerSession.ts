import type { PlayerId } from '../../objects/player/PlayerId';
import type { SessionToken } from '../../objects/system/SessionToken';

/** Explicit credentials captured for this attempt, never a global token lookup. */
export interface ResultOwnerSession {
  readonly playerId: PlayerId;
  readonly token: SessionToken;
}
