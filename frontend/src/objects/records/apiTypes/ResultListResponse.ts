import { object, array, integer, assert } from '../../../system/api/decode.ts';
import { decodeTrainingResult, type TrainingResult } from '../TrainingResult.ts';
export interface ResultListResponse { readonly items: readonly TrainingResult[]; readonly total: number; readonly offset: number; readonly limit: number }
export function decodeResultListResponse(value: unknown, path = '$'): ResultListResponse {
  const v = object(value, path);
  const items = array(v.items, decodeTrainingResult, `${path}.items`, 0, 50);
  const limit = integer(v.limit, `${path}.limit`, 1, 50);
  const total = integer(v.total, `${path}.total`);
  assert(items.length <= limit && items.length <= total, `${path}.items`, 'page length <= limit and total');
  return { items, total, offset: integer(v.offset, `${path}.offset`, 0, 10000), limit };
}

