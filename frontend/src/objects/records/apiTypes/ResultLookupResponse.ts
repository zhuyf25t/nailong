import { object, nullable } from '../../../system/api/decode.ts';
import { decodeTrainingResult, type TrainingResult } from '../TrainingResult.ts';
export interface ResultLookupResponse { readonly result: TrainingResult | null }
export function decodeResultLookupResponse(value: unknown, path = '$'): ResultLookupResponse {
  const v = object(value, path);
  return { result: nullable(v.result, decodeTrainingResult, `${path}.result`) };
}

