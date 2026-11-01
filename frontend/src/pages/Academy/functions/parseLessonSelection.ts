import { decodeToolKind } from '../../../objects/training/ToolKind';
import type { LessonSelection } from '../objects/LessonSelection';
export function parseLessonSelection(params: URLSearchParams): LessonSelection {
  if (params.getAll('lesson').length > 1 || params.getAll('tool').length > 1) throw new Error('课堂地址里有重复选项，请重新选择一节课。');
  const kind = params.get('lesson') ?? 'beacon';
  if (kind !== 'cover' && kind !== 'tool' && kind !== 'beacon') throw new Error('没有找到这节小课，请从课堂列表重新选择。');
  let tool: LessonSelection['tool'];
  try { tool = decodeToolKind(params.get('tool') ?? 'curtain'); }
  catch { throw new Error('没有这件工具，请选择干扰幕、诱饵信标或排斥脉冲。'); }
  if (kind === 'tool' && tool === 'none') throw new Error('工具课需要带一件工具，请选择干扰幕、诱饵信标或排斥脉冲。');
  return { kind, tool };
}
