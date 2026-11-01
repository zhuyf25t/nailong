import type { SessionToken } from '../../objects/system/SessionToken.ts';
export interface SendOptions {
  /** Omit to read the current tab token; explicitly supply the run's token to freeze identity. */
  readonly token?: SessionToken | null;
  readonly signal?: AbortSignal;
}

