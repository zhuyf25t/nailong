import { object, nullable } from '../../../system/api/decode.ts';
import { decodeTrainingResult, type TrainingResult } from '../TrainingResult.ts';
export interface PersonalBestResponse { readonly best: TrainingResult | null }
export function decodePersonalBestResponse(value: unknown, path = '$'): PersonalBestResponse {
  const v = object(value, path);
  return { best: nullable(v.best, decodeTrainingResult, `${path}.best`) };
}

