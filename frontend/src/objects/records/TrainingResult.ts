import { object, number, string, nullable } from '../../system/api/decode.ts';
import { parseRunId, type RunId } from '../training/RunId.ts';
import { parsePlayerId, type PlayerId } from '../player/PlayerId.ts';
import { parseTrainingConfigId, type TrainingConfigId } from '../training/TrainingConfigId.ts';
import { parseInstant, type Instant } from '../system/Instant.ts';
import { decodeTerrainConfig, type TerrainConfig } from '../training/TerrainConfig.ts';
import { decodeResultSubmission, type ResultSubmission } from './ResultSubmission.ts';
import { decodeRunSetup, type RunSetup } from '../training/RunSetup.ts';
export interface TrainingResult extends ResultSubmission {
  readonly runId: RunId; readonly playerId: PlayerId; readonly configId: TrainingConfigId; readonly configVersion: string;
  readonly terrain: TerrainConfig; readonly accuracy: number; readonly submittedAt: Instant;
  readonly setup?: RunSetup | null;
}
export function decodeTrainingResult(value: unknown, path = '$'): TrainingResult {
  const v = object(value, path);
  return { ...decodeResultSubmission(v, path), runId: parseRunId(v.runId, `${path}.runId`), playerId: parsePlayerId(v.playerId, `${path}.playerId`),
    configId: parseTrainingConfigId(v.configId, `${path}.configId`), configVersion: string(v.configVersion, `${path}.configVersion`, 1, 1000),
    terrain: decodeTerrainConfig(v.terrain, `${path}.terrain`), accuracy: number(v.accuracy, `${path}.accuracy`, 0, 1),
    submittedAt: parseInstant(v.submittedAt, `${path}.submittedAt`),
    ...(v.setup === undefined ? {} : { setup: nullable(v.setup, decodeRunSetup, `${path}.setup`) }) };
}
