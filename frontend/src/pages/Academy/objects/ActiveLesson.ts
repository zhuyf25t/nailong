import type { RunSetup } from '../../../objects/training/RunSetup';
import type { LessonOptions } from '../../Training/game/core/lesson';
export interface ActiveLesson {
  readonly key: string;
  readonly setup: RunSetup;
  readonly options: LessonOptions;
}
