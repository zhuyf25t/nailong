import { object, uuid, nullable, assert } from '../../system/api/decode.ts';
import { parseRunId, type RunId } from './RunId.ts';
import { parsePlayerId, type PlayerId } from '../player/PlayerId.ts';
import { parseInstant, type Instant } from '../system/Instant.ts';
import { decodeTrainingConfig, type TrainingConfig } from './TrainingConfig.ts';
import { decodeTerrainConfig, type TerrainConfig } from './TerrainConfig.ts';
import { decodeRunStatus, type RunStatus } from './RunStatus.ts';
import { decodeRunSetup, type RunSetup } from './RunSetup.ts';
export interface TrainingRun {
  readonly id: RunId; readonly playerId: PlayerId; readonly requestId: string;
  readonly config: TrainingConfig; readonly terrain: TerrainConfig; readonly status: RunStatus;
  readonly startedAt: Instant; readonly completedAt: Instant | null;
  readonly setup?: RunSetup | null;
}
export function decodeTrainingRun(value: unknown, path = '$'): TrainingRun {
  const v = object(value, path);
  const status = decodeRunStatus(v.status, `${path}.status`);
  const completedAt = nullable(v.completedAt, parseInstant, `${path}.completedAt`);
  assert(status !== 'completed' || completedAt !== null, `${path}.completedAt`, 'timestamp for a completed run');
  return { id: parseRunId(v.id, `${path}.id`), playerId: parsePlayerId(v.playerId, `${path}.playerId`), requestId: uuid(v.requestId, `${path}.requestId`),
    config: decodeTrainingConfig(v.config, `${path}.config`), terrain: decodeTerrainConfig(v.terrain, `${path}.terrain`), status,
    startedAt: parseInstant(v.startedAt, `${path}.startedAt`), completedAt,
    ...(v.setup === undefined ? {} : { setup: nullable(v.setup, decodeRunSetup, `${path}.setup`) }) };
}
