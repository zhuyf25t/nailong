import type { Obstacle } from './movement.ts';

/** Shared physical layout; kept independent of renderer/asset loading. */
export const OBSTACLES: Array<Obstacle & { model?: 'crate' | 'barrel' }> = [
  { x: -4, z: -3, halfX: 0.72, halfZ: 0.72 },
  { x: 4.5, z: 0.5, halfX: 0.72, halfZ: 0.72 },
  { x: 6.5, z: -6, halfX: 0.72, halfZ: 0.72 },
  { x: -3, z: -29, halfX: 0.72, halfZ: 0.72 },
  { x: -1.1, z: -29.5, halfX: 0.46, halfZ: 0.46, height: 1.15, model: 'barrel' },
  { x: -26, z: 18, halfX: 0.72, halfZ: 0.72 },
  { x: -24.2, z: 18.2, halfX: 0.46, halfZ: 0.46, height: 1.15, model: 'barrel' },
  { x: 28, z: 17, halfX: 0.72, halfZ: 0.72 },
  { x: 29.8, z: 17, halfX: 0.46, halfZ: 0.46, height: 1.15, model: 'barrel' },
];
