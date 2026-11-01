import type { ServerErrorCode } from './ServerErrorCode.ts';
export type ApiFailure =
  | { readonly kind: 'network'; readonly message: string }
  | { readonly kind: 'aborted'; readonly message: string }
  | { readonly kind: 'auth'; readonly message: string }
  | { readonly kind: 'decode'; readonly message: string; readonly status?: number }
  | { readonly kind: 'http'; readonly message: string; readonly status: number; readonly code: ServerErrorCode };

