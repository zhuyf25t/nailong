import type { MissionDefinition } from '../../../objects/training/MissionDefinition.ts';
import type { MapVersion } from '../../../objects/worlds/MapVersion.ts';

export type LoadoutState =
  | { kind: 'loading' }
  | { kind: 'auth-required' }
  | { kind: 'not-found'; message: string }
  | { kind: 'failed' }
  | { kind: 'ready'; mission: MissionDefinition; map: MapVersion };
