import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodeTrainingRun, type TrainingRun } from '../../objects/training/TrainingRun.ts';
import type { TrainingConfigId } from '../../objects/training/TrainingConfigId.ts';
import type { TerrainConfig } from '../../objects/training/TerrainConfig.ts';
import type { RunSelection } from '../../objects/training/RunSelection.ts';

export class StartTrainingRunAPI extends APIWithTokenMessage<TrainingRun> {
  readonly requestId: string;
  readonly configId: TrainingConfigId;
  readonly configVersion: string;
  readonly terrain: TerrainConfig;
  constructor(requestId: string, configId: TrainingConfigId, configVersion: string, terrain: TerrainConfig, readonly selection?: RunSelection) {
    super();
    this.requestId = requestId;
    this.configId = configId;
    this.configVersion = configVersion;
    this.terrain = terrain;
  }
  override decodeResponse(value: unknown): TrainingRun { return decodeTrainingRun(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { requestId: this.requestId, configId: this.configId, configVersion: this.configVersion, terrain: this.terrain,
    ...(this.selection === undefined ? {} : { selection: this.selection }) }; }
}
