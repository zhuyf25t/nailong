import { assert, object, string } from '../../system/api/decode.ts';
import { decodeReplayPayload, type ReplayPayload } from './ReplayPayload.ts';
import { MAX_REPLAY_BYTES, utf8Bytes } from './replayDecode.ts';
export interface ReplayEnvelope {
    readonly contentHash: string;
    readonly payloadJson: string;
}
export function decodeReplayEnvelope(value: unknown, path = '$'): ReplayEnvelope { const v = object(value, path), contentHash = string(v.contentHash, path + '.contentHash', 64, 64), payloadJson = string(v.payloadJson, path + '.payloadJson', 2, MAX_REPLAY_BYTES); assert(/^[a-f0-9]{64}$/.test(contentHash), path + '.contentHash', 'SHA-256 lowercase hex'); assert(utf8Bytes(payloadJson) <= MAX_REPLAY_BYTES, path + '.payloadJson', 'bounded UTF-8 recording'); decodeReplayPayload(JSON.parse(payloadJson) as unknown, path + '.payloadJson'); return { contentHash, payloadJson }; }
export async function replayContentHash(payloadJson: string): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payloadJson)); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join(''); }
export async function verifyReplayEnvelope(envelope: ReplayEnvelope): Promise<ReplayPayload> { assert(await replayContentHash(envelope.payloadJson) === envelope.contentHash, '$.contentHash', 'recording integrity'); return decodeReplayPayload(JSON.parse(envelope.payloadJson) as unknown); }
