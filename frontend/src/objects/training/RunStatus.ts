import { literal } from '../../system/api/decode.ts';
export type RunStatus = 'open' | 'completed' | 'abandoned';
export function decodeRunStatus(value: unknown, path = '$'): RunStatus {
  return literal(value, ['open', 'completed', 'abandoned'], path);
}

