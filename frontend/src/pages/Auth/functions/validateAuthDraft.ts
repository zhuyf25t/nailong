import type { AuthDraft } from '../objects/AuthDraft.ts';
import type { AuthErrors } from '../objects/AuthErrors.ts';

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateAuthDraft(draft: AuthDraft): AuthErrors {
  const errors: { username?: string; password?: string; confirmPassword?: string } = {};
  if (!/^[a-z0-9_]{3,24}$/.test(normalizeUsername(draft.username))) {
    errors.username = '使用 3–24 位英文字母、数字或下划线。';
  }
  if ([...draft.password].length < 8) {
    errors.password = '密码至少需要 8 个字符。';
  } else if (new TextEncoder().encode(draft.password).length > 128) {
    errors.password = '密码过长，请缩短后再试。';
  }
  if (draft.mode === 'register' && draft.password !== draft.confirmPassword) {
    errors.confirmPassword = '两次密码不一致，请再检查一下。';
  }
  return errors;
}
