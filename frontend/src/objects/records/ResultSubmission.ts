import { object, integer, assert, nullable } from '../../system/api/decode.ts';
import { decodeRunOutcome, type RunOutcome } from './RunOutcome.ts';
import { decodeObjectiveProgress, type ObjectiveProgress } from './ObjectiveProgress.ts';
export interface ResultSubmission {
  readonly outcome: RunOutcome; readonly shotsFired: number; readonly hits: number;
  readonly destroyed: number; readonly elapsedMs: number;
  readonly objectiveProgress?: ObjectiveProgress | null;
}
export function decodeResultSubmission(value: unknown, path = '$'): ResultSubmission {
  const v = object(value, path);
  const shotsFired = integer(v.shotsFired, `${path}.shotsFired`, 0, 1000000);
  const hits = integer(v.hits, `${path}.hits`, 0, 1000000);
  const destroyed = integer(v.destroyed, `${path}.destroyed`, 0, 1000000);
  assert(hits <= shotsFired, `${path}.hits`, 'hits <= shotsFired');
  assert(destroyed <= hits, `${path}.destroyed`, 'destroyed <= hits');
  const outcome = decodeRunOutcome(v.outcome, `${path}.outcome`);
  const objectiveProgress = v.objectiveProgress === undefined ? undefined : nullable(v.objectiveProgress, decodeObjectiveProgress, `${path}.objectiveProgress`);
  assert(outcome !== 'defeat' || !objectiveProgress?.extracted, `${path}.objectiveProgress`, 'defeat cannot be extracted');
  return { outcome, shotsFired, hits, destroyed,
    elapsedMs: integer(v.elapsedMs, `${path}.elapsedMs`, 0, 86400000),
    ...(objectiveProgress === undefined ? {} : { objectiveProgress }) };
}
