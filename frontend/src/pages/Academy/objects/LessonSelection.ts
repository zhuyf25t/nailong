import type { ToolKind } from '../../../objects/training/ToolKind';
import type { LessonKind } from '../../Training/game/core/lesson';
export interface LessonSelection {
  readonly kind: LessonKind;
  readonly tool: ToolKind;
}
