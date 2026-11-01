import { string } from '../../system/api/decode.ts';
import { DecodeError } from '../../system/api/DecodeError.ts';

declare const instantBrand: unique symbol;
export type Instant = string & { readonly [instantBrand]: 'Instant' };
/** Require a real calendar date, time and explicit zone. Accept Scala's nanosecond precision. */
export function parseInstant(value: unknown, path = '$'): Instant {
  const text = string(value, path, 20, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (!match) throw new DecodeError(path, 'ISO 8601 timestamp with timezone');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 18 || offsetMinute > 59 || (offsetHour === 18 && offsetMinute !== 0) || !Number.isFinite(Date.parse(text))) {
    throw new DecodeError(path, 'valid calendar timestamp and timezone');
  }
  return text as Instant;
}

