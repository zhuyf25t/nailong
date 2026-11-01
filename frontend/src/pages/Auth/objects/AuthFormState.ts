import type { AuthErrors } from './AuthErrors.ts';

export type AuthFormState =
  | { readonly kind: 'editing' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'invalid'; readonly errors: AuthErrors }
  | { readonly kind: 'failed'; readonly message: string; readonly errors?: AuthErrors };
