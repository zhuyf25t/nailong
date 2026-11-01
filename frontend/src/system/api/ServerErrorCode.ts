import { literal } from './decode.ts';
export type ServerErrorCode = 'validation_error' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'internal_error';
export function decodeServerErrorCode(value: unknown, path = '$'): ServerErrorCode {
  return literal(value, ['validation_error', 'unauthorized', 'forbidden', 'not_found', 'conflict', 'internal_error'], path);
}
export const statusForCode: Readonly<Record<ServerErrorCode, number>> = {
  validation_error: 400, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409, internal_error: 500,
};

