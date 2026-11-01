import type { PlayerId } from '../../objects/player/PlayerId.ts';
import type { SessionToken } from '../../objects/system/SessionToken.ts';
import type { StoredReplay } from './StoredReplay.ts';

export interface ReplayOwnerSession { readonly ownerId: PlayerId; readonly token: SessionToken }
export interface ReplayQueueDependencies {
  readonly resultExists: (item: StoredReplay, session: ReplayOwnerSession, signal: AbortSignal) => Promise<boolean>;
  readonly saveEvents: (item: StoredReplay, session: ReplayOwnerSession, signal: AbortSignal) => Promise<void>;
  readonly saveReplay: (item: StoredReplay, session: ReplayOwnerSession, signal: AbortSignal) => Promise<void>;
  readonly onUnauthorized?: (token: SessionToken) => void;
  readonly onPersisted?: () => void;
}
