import type { TrainingResult } from '../../../objects/records/TrainingResult.ts';
import { array, uuid } from '../../../system/api/decode.ts';

/** A comparison is meaningful only when goals, map, rules and equipment match. */
export function comparisonKey(result: TrainingResult): string {
  const setup = result.setup;
  return JSON.stringify([
    result.configId, result.configVersion,
    result.terrain.hillHeight, result.terrain.hillWidth, result.terrain.hillX, result.terrain.hillZ, result.terrain.ripple,
    setup?.mapVersionId ?? 'legacy', setup?.mission.id ?? 'legacy', setup?.mission.version ?? '',
    setup?.mission.objective ?? null, setup?.loadout.tool ?? 'none',
  ]);
}

export function canCompare(a: TrainingResult, b: TrainingResult): boolean {
  return a.runId !== b.runId && comparisonKey(a) === comparisonKey(b);
}

export function decodeFavorites(value: unknown): readonly string[] {
  return [...new Set(array(value, uuid, '$', 0, 2000))];
}

export function missionTitle(result: TrainingResult): string {
  return result.setup?.mission.title ?? '标准花谷 · 四机清场';
}
