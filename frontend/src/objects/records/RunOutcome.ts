import { literal } from '../../system/api/decode.ts';
export type RunOutcome = 'victory' | 'defeat';
export function decodeRunOutcome(value: unknown, path = '$'): RunOutcome {
  return literal(value, ['victory', 'defeat'], path);
}

