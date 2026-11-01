import type { AuthResponse } from '../../objects/player/apiTypes/AuthResponse.ts';
import type { SessionToken } from '../../objects/system/SessionToken.ts';
import type { PlayerSessionState } from './PlayerSessionState.ts';

export interface SessionContextValue {
  readonly state: PlayerSessionState;
  readonly refresh: () => Promise<void>;
  readonly acceptAuth: (auth: AuthResponse) => void;
  readonly logout: () => Promise<void>;
  readonly invalidate: (requestToken: SessionToken) => void;
}
