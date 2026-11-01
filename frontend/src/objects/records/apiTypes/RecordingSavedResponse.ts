import { literal, object, string, assert } from '../../../system/api/decode.ts';
import { parseRunId, type RunId } from '../../training/RunId.ts';
export interface RecordingSavedResponse {
    readonly status: 'saved';
    readonly runId: RunId;
    readonly contentHash: string;
}
export function decodeRecordingSavedResponse(value: unknown, path = '$'): RecordingSavedResponse { const v = object(value, path), hash = string(v.contentHash, path + '.contentHash', 64, 64); assert(/^[a-f0-9]{64}$/.test(hash), path, 'SHA-256 hash'); return { status: literal(v.status, ['saved'], path + '.status'), runId: parseRunId(v.runId, path + '.runId'), contentHash: hash }; }
