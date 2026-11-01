import type { TrainingConfig } from '../../../objects/training/TrainingConfig';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
export type Preparation =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly config: TrainingConfig; readonly terrain: TerrainConfig };
