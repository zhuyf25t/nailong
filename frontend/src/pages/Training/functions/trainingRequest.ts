import { parseMissionId } from '../../../objects/training/MissionId.ts';
import type { ToolKind } from '../../../objects/training/ToolKind.ts';
import { parseMapVersionId } from '../../../objects/worlds/MapVersionId.ts';
import { parseRunId } from '../../../objects/training/RunId.ts';

/** URL parameters are untrusted; reject a broken deep link instead of silently changing its mission. */
export function trainingRequest(search: string) {
  const params = new URLSearchParams(search);
  for (const key of ['mission', 'tool', 'mapVersionId', 'retryRunId', 'practice']) {
    if (params.getAll(key).length > 1) throw new Error('行动地址包含重复参数，请从整备页重新出发。');
  }
  if (params.has('retryRunId') && ['mission', 'tool', 'mapVersionId'].some(key => params.has(key))) throw new Error('同配置重试不能同时指定另一套装备或地图，请重新打开本局报告。');
  const rawTool = params.get('tool') ?? 'curtain';
  if (!['none', 'curtain', 'decoy', 'pulse'].includes(rawTool)) throw new Error('工具参数无效，请回整备页重新选择。');
  const tool: ToolKind = rawTool === 'none' ? 'none' : rawTool === 'decoy' ? 'decoy' : rawTool === 'pulse' ? 'pulse' : 'curtain';
  return {
    missionId: parseMissionId(params.get('mission') ?? 'forest-beacon'),
    tool,
    mapVersionId: params.has('mapVersionId') ? parseMapVersionId(params.get('mapVersionId')) : undefined,
    retryRunId: params.has('retryRunId') ? parseRunId(params.get('retryRunId')) : undefined,
  };
}
