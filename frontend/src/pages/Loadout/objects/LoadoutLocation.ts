import type { MissionId } from '../../../objects/training/MissionId.ts';
import type { ToolKind } from '../../../objects/training/ToolKind.ts';
import type { MapVersionId } from '../../../objects/worlds/MapVersionId.ts';

export type LoadoutLocation =
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; missionId: MissionId; requestedTool: ToolKind | null; mapVersionId?: MapVersionId };
