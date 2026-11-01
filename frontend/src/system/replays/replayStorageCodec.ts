import { parsePlayerId } from '../../objects/player/PlayerId.ts';
import { decodeRecordedRun } from '../../objects/records/RecordedRun.ts';
import { parseRunId } from '../../objects/training/RunId.ts';
import * as decode from '../api/decode.ts';
import { ReplayContentConflict } from './ReplayStorage.ts';
import type { StoredReplay } from './StoredReplay.ts';
import type { ReplayUploadState } from './ReplayUploadState.ts';

export function replayStorageKey(ownerId: string, runId: string): string { return `${ownerId}:${runId}`; }

function decodeUploadState(value: unknown, path: string): ReplayUploadState {
  const v = decode.object(value, path);
  const status = decode.literal(v.status, ['pending', 'uploading', 'saved', 'blocked'], `${path}.status`);
  return { status: status === 'uploading' ? 'pending' : status, message: decode.nullable(v.message, (text, p) => decode.string(text, p, 0, 1000), `${path}.message`) };
}

export function decodeStoredReplay(value: unknown): StoredReplay {
  const v = decode.object(value);
  decode.assert(v.version === 1, '$.version', 'replay storage version 1');
  const ownerId = parsePlayerId(v.ownerId);
  const runId = parseRunId(v.runId);
  const key = replayStorageKey(ownerId, runId);
  decode.assert(v.key === key, '$.key', 'matching owner and run');
  const recorded = decodeRecordedRun(v.recorded);
  const payload: unknown = JSON.parse(recorded.replay.payloadJson);
  decode.assert(decode.object(decode.object(payload).manifest).runId === runId, '$.recorded.replay', 'matching runId');
  decode.assert(typeof v.createdAt === 'number' && Number.isSafeInteger(v.createdAt) && v.createdAt >= 0, '$.createdAt', 'non-negative timestamp');
  return { version: 1, key, ownerId, runId, recorded, createdAt: v.createdAt as number,
    events: decodeUploadState(v.events, '$.events'), replay: decodeUploadState(v.replay, '$.replay') };
}

export function sameRecorded(left: StoredReplay['recorded'], right: StoredReplay['recorded']): boolean {
  return left.replay.contentHash === right.replay.contentHash && left.replay.payloadJson === right.replay.payloadJson
    && JSON.stringify(left.summary) === JSON.stringify(right.summary);
}

export function mergeStoredReplay(existing: StoredReplay | undefined, incoming: StoredReplay): StoredReplay {
  if (!existing) return incoming;
  if (!sameRecorded(existing.recorded, incoming.recorded)) throw new ReplayContentConflict();
  return { ...incoming, createdAt: existing.createdAt,
    events: existing.events.status === 'saved' || existing.events.status === 'blocked' ? existing.events : incoming.events,
    replay: existing.replay.status === 'saved' || existing.replay.status === 'blocked' ? existing.replay : incoming.replay };
}
