import rawPracticeConfig from '../data/practice-config.json';
import { decodeTrainingConfig } from '../../../objects/training/TrainingConfig';
/** A bundled, validated rules snapshot makes guest practice independent of the API. */
export const PRACTICE_CONFIG = decodeTrainingConfig(rawPracticeConfig);
