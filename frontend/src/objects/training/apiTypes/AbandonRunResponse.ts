import { object } from '../../../system/api/decode.ts';
import { decodeTrainingRun, type TrainingRun } from '../TrainingRun.ts';
export interface AbandonRunResponse { readonly run: TrainingRun }
export function decodeAbandonRunResponse(value: unknown, path = '$'): AbandonRunResponse {
  const v = object(value, path);
  return { run: decodeTrainingRun(v.run, `${path}.run`) };
}

