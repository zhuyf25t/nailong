import type { MissionDefinition } from '../../../objects/training/MissionDefinition.ts';

export type MissionsState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'failed' }
  | { kind: 'ready'; missions: readonly MissionDefinition[] };
