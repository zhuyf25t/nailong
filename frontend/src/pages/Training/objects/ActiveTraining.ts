import type { TrainingConfig } from '../../../objects/training/TrainingConfig';
import type { TrainingRun } from '../../../objects/training/TrainingRun';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import type { SessionToken } from '../../../objects/system/SessionToken';
import type { RunSetup } from '../../../objects/training/RunSetup';
export interface ActiveTraining {
  readonly config: TrainingConfig;
  readonly terrain: TerrainConfig;
  readonly run: TrainingRun | null;
  readonly token: SessionToken | null;
  readonly key: string;
  readonly setup?: RunSetup;
}
