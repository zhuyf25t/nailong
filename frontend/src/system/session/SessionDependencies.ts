import type { PlayerProfile } from '../../objects/player/PlayerProfile.ts';
import type { SessionToken } from '../../objects/system/SessionToken.ts';

export interface SessionDependencies {
  readonly readToken: () => SessionToken | null;
  readonly writeToken: (token: SessionToken) => void;
  readonly clearToken: () => void;
  readonly getCurrentPlayer: (token: SessionToken) => Promise<PlayerProfile>;
  readonly logout: (token: SessionToken) => Promise<unknown>;
  readonly isUnauthorized: (error: unknown) => boolean;
}
