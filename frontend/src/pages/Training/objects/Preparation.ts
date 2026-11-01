import type { TrainingConfig } from '../../../objects/training/TrainingConfig';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import type { RunSetup } from '../../../objects/training/RunSetup';
import type { RunSelection } from '../../../objects/training/RunSelection';
export type Preparation =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly config: TrainingConfig; readonly terrain: TerrainConfig; readonly setup?: RunSetup; readonly selection?: RunSelection };
