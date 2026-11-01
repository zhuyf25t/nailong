import { NoRequestMessage } from '../../system/api/NoRequestMessage.ts';
import { decodeTrainingConfig, type TrainingConfig } from '../../objects/training/TrainingConfig.ts';

export class GetTrainingConfigAPI extends NoRequestMessage<TrainingConfig> {
  override decodeResponse(value: unknown): TrainingConfig { return decodeTrainingConfig(value); }
}

