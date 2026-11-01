export interface AuthDraft {
  readonly mode: 'login' | 'register';
  readonly username: string;
  readonly password: string;
  readonly confirmPassword: string;
}
