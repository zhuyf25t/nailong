import { integer, literal, nullable, object, string, uuid } from '../../system/api/decode.ts';
import { decodeTrainingConfig, type TrainingConfig } from '../training/TrainingConfig.ts';
import { parseRunId, type RunId } from '../training/RunId.ts';
import { decodeWorldDefinition, type WorldDefinition } from '../worlds/WorldDefinition.ts';
import { decodeReplayCoverage, type ReplayCoverage } from './ReplayCoverage.ts';
export interface ReplayManifest {
    readonly formatVersion: 1;
    readonly runId: RunId | null;
    readonly config: TrainingConfig;
    readonly world: WorldDefinition;
    readonly mapVersionId: string | null;
    readonly missionId: string;
    readonly assetVersion: 'garden-v1';
    readonly sampleHz: 10;
    readonly coverage: ReplayCoverage;
}
export function decodeReplayManifest(value: unknown, path = '$'): ReplayManifest { const v = object(value, path); integer(v.formatVersion, path + '.formatVersion', 1, 1); integer(v.sampleHz, path + '.sampleHz', 10, 10); return { formatVersion: 1, runId: nullable(v.runId, parseRunId, path + '.runId'), config: decodeTrainingConfig(v.config, path + '.config'), world: decodeWorldDefinition(v.world, path + '.world'), mapVersionId: nullable(v.mapVersionId, uuid, path + '.mapVersionId'), missionId: string(v.missionId, path + '.missionId', 1, 80), assetVersion: literal(v.assetVersion, ['garden-v1'], path + '.assetVersion'), sampleHz: 10, coverage: decodeReplayCoverage(v.coverage, path + '.coverage') }; }
