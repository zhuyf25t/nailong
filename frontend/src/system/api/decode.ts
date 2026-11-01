import { DecodeError } from './DecodeError.ts';

export function object(value: unknown, path = '$'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new DecodeError(path, 'object');
  return value as Record<string, unknown>;
}
export function string(value: unknown, path: string, min = 0, max = 10000): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new DecodeError(path, `string of length ${min}–${max}`);
  return value;
}
export function number(value: unknown, path: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new DecodeError(path, `finite number in [${min}, ${max}]`);
  return value;
}
export function integer(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, path, min, max);
  if (!Number.isSafeInteger(result)) throw new DecodeError(path, 'safe integer');
  return result;
}
export function literal<const T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  for (const candidate of allowed) if (value === candidate) return candidate;
  throw new DecodeError(path, allowed.join(' | '));
}
export function nullable<T>(value: unknown, decode: (input: unknown, path: string) => T, path: string): T | null {
  return value === null ? null : decode(value, path);
}
export function array<T>(value: unknown, decode: (input: unknown, path: string) => T, path: string, min = 0, max = 10000): T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new DecodeError(path, `array of length ${min}–${max}`);
  return value.map((item: unknown, index) => decode(item, `${path}[${index}]`));
}
export function uuid(value: unknown, path: string): string {
  const result = string(value, path, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new DecodeError(path, 'canonical UUID');
  return result.toLowerCase();
}
export function assert(condition: boolean, path: string, expected: string): asserts condition {
  if (!condition) throw new DecodeError(path, expected);
}

