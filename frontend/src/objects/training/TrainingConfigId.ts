import { uuid } from '../../system/api/decode.ts';
declare const trainingConfigIdBrand: unique symbol;
export type TrainingConfigId = string & { readonly [trainingConfigIdBrand]: 'TrainingConfigId' };
export function parseTrainingConfigId(value: unknown, path = '$'): TrainingConfigId {
  return uuid(value, path) as TrainingConfigId;
}

