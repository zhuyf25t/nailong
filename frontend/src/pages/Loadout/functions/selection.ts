import type { MissionDefinition } from '../../../objects/training/MissionDefinition.ts';
import { parseMissionId } from '../../../objects/training/MissionId.ts';
import { decodeToolKind, type ToolKind } from '../../../objects/training/ToolKind.ts';
import { parseMapVersionId } from '../../../objects/worlds/MapVersionId.ts';
import type { LoadoutLocation } from '../objects/LoadoutLocation.ts';

export function parseLoadoutLocation(rawMissionId: unknown, search: string): LoadoutLocation {
  const query = new URLSearchParams(search);
  if (query.getAll('tool').length > 1 || query.getAll('mapVersionId').length > 1) return { kind: 'invalid', message: '链接包含重复的工具或地图参数，请重新选择任务。' };
  let missionId;
  try { missionId = parseMissionId(rawMissionId); }
  catch { return { kind: 'invalid', message: '任务地址不完整，请从任务地图重新选择。' }; }
  let requestedTool: ToolKind | null = null;
  if (query.has('tool')) {
    try { requestedTool = decodeToolKind(query.get('tool')); }
    catch { return { kind: 'invalid', message: '链接里的工具不存在，请回到该任务重新选择装备。' }; }
  }
  if (query.has('mapVersionId')) {
    try { return { kind: 'valid', missionId, requestedTool, mapVersionId: parseMapVersionId(query.get('mapVersionId')) }; }
    catch { return { kind: 'invalid', message: '地图版本地址无效，请从工坊选择一个已保存的版本。' }; }
  }
  return { kind: 'valid', missionId, requestedTool };
}

export function defaultTool(mission: MissionDefinition): ToolKind {
  if (mission.objective.kind === 'activate_extract' && mission.allowedTools.includes('curtain')) return 'curtain';
  if (mission.allowedTools.includes('none')) return 'none';
  return mission.allowedTools[0] ?? 'none';
}

export function toolAllowed(mission: MissionDefinition, tool: ToolKind): boolean {
  return mission.allowedTools.includes(tool);
}

export function trainingPath(selection: Extract<LoadoutLocation, { kind: 'valid' }>, tool: ToolKind): string {
  const query = new URLSearchParams({ mission: selection.missionId, tool });
  if (selection.mapVersionId !== undefined) query.set('mapVersionId', selection.mapVersionId);
  return `/training?${query.toString()}`;
}

export function toolSelectionSearch(search: string, tool: ToolKind): string {
  const query = new URLSearchParams(search);
  query.set('tool', tool);
  return query.toString();
}
