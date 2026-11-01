import { object, string, nullable } from '../../system/api/decode.ts';
export interface MapValidationIssue { readonly code: string; readonly message: string; readonly objectId: string | null; }
export function decodeMapValidationIssue(value: unknown, path = '$'): MapValidationIssue {
 const v = object(value, path); return { code: string(v.code, path + '.code', 1, 80), message: string(v.message, path + '.message', 1, 2000), objectId: nullable(v.objectId, (x, p) => string(x, p, 1, 64), path + '.objectId') };
}
