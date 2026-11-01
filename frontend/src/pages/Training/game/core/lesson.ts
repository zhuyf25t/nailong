import type { RunSetup } from '../../../../objects/training/RunSetup';
import type { TrainingConfig } from '../../../../objects/training/TrainingConfig';

export type LessonKind = 'cover' | 'tool' | 'beacon';
export interface LessonOptions { kind: LessonKind; durationSeconds: number }
export interface LessonProgress {
  elapsedSeconds: number;
  status: 'ready' | 'active' | 'complete' | 'timeout' | 'defeat';
  beaconActivated: boolean;
  toolUsed: boolean;
  toolEffective: boolean;
  escapedDetection: boolean;
}

/** A local lesson never mutates the formal map or requests an account run. */
export function makeLessonSetup(setup: RunSetup, lesson: LessonOptions): RunSetup {
  const tool = setup.loadout.tool;
  const drone = lesson.kind === 'tool' && tool === 'decoy'
    ? { id: 'lesson-drone', x: 4, z: 0, yaw: Math.PI, patrol: [{ x: 4, z: 0 }, { x: 5, z: -2 }] }
    : { id: 'lesson-drone', x: 0, z: -2, yaw: 0, patrol: [{ x: 0, z: -2 }, { x: 1, z: -3 }] };
  return { ...setup, world: { ...setup.world, title: '花谷学院 · 机制练习',
    terrain: { hillHeight: 0, hillWidth: 5, hillX: 0, hillZ: 0, ripple: 0 },
    bounds: { halfSize: 22 }, spawn: { x: 0, z: 6, yaw: Math.PI },
    objects: [
      { id: 'lesson-cover-left', kind: 'wall', x: -3.5, z: 1, width: 2, depth: 1, height: 3 },
      { id: 'lesson-cover-right', kind: 'wall', x: 3.5, z: -2, width: 2, depth: 1, height: 3 },
    ],
    drones: [drone],
    beacon: { id: setup.world.beacon.id, x: 0, z: -5, radius: 2 },
    extraction: { id: setup.world.extraction.id, x: 0, z: 6, radius: 2.2 },
  } };
}

export function lessonConfig(config: TrainingConfig, setup: RunSetup): TrainingConfig {
  return { ...config, terrain: setup.world.terrain, drones: { ...config.drones,
    scanRange: 10, patrolSpeed: .45, chaseSpeed: 3.4, spawnGraceSeconds: 3,
    spawns: setup.world.drones.map(({ x, z, yaw }) => ({ x, z, yaw })),
  } };
}
