import type { ServerErrorCode } from '../api/ServerErrorCode.ts';

export interface SaveFailure {
  readonly message: string;
  readonly kind: 'network' | 'http' | 'decode' | 'aborted' | 'auth' | 'local';
  readonly code: ServerErrorCode | null;
}
