import { APIWithTokenMessage } from '../../system/api/APIWithTokenMessage.ts';
import { decodePersonalBestResponse, type PersonalBestResponse } from '../../objects/records/apiTypes/PersonalBestResponse.ts';
import type { TrainingConfigId } from '../../objects/training/TrainingConfigId.ts';
import type { TerrainConfig } from '../../objects/training/TerrainConfig.ts';

export class GetMyBestAPI extends APIWithTokenMessage<PersonalBestResponse> {
  readonly configId: TrainingConfigId;
  readonly configVersion: string;
  readonly terrain: TerrainConfig;
  constructor(configId: TrainingConfigId, configVersion: string, terrain: TerrainConfig) {
    super();
    this.configId = configId;
    this.configVersion = configVersion;
    this.terrain = terrain;
  }
  override decodeResponse(value: unknown): PersonalBestResponse { return decodePersonalBestResponse(value); }
  override toRequest(): Readonly<Record<string, unknown>> { return { configId: this.configId, configVersion: this.configVersion, terrain: this.terrain }; }
}

