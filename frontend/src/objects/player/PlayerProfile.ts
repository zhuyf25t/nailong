import { parsePlayerId, type PlayerId } from './PlayerId.ts';
import { parseInstant, type Instant } from '../system/Instant.ts';
import { object, string, assert } from '../../system/api/decode.ts';
export interface PlayerProfile {
  readonly id: PlayerId;
  readonly username: string;
  readonly nickname: string;
  readonly createdAt: Instant;
}
export function decodePlayerProfile(value: unknown, path = '$'): PlayerProfile {
  const v = object(value, path);
  const username = string(v.username, `${path}.username`, 3, 24);
  assert(/^[a-z0-9_]+$/.test(username), `${path}.username`, 'normalized username');
  const nickname = string(v.nickname, `${path}.nickname`, 1, 48);
  assert([...nickname].length <= 24 && !/[\u0000-\u001f\u007f-\u009f]/u.test(nickname), `${path}.nickname`, '1–24 Unicode code points without control characters');
  return { id: parsePlayerId(v.id, `${path}.id`), username,
    nickname, createdAt: parseInstant(v.createdAt, `${path}.createdAt`) };
}
