import type { WorldDefinition } from '../../../../objects/worlds/WorldDefinition';
import type { WorldObject } from '../../../../objects/worlds/WorldObject';
import { CRATE_HEIGHT, type Obstacle } from './movement.ts';
import { OBSTACLES } from './obstacles.ts';
import type { ProjectileBox } from './shootingMath.ts';

export type WorldObstacle = Obstacle & { id: string; kind: WorldObject['kind'] };
export type WorldProjectileBox = ProjectileBox & { id: string; kind: WorldObject['kind'] };

/** One physical layout feeds movement, bullets and sight. Arrays keep their identity when gates open. */
export function createWorldRuntime(world: WorldDefinition | undefined, sampleHeight: (x: number, z: number) => number) {
  const allObstacles: WorldObstacle[] = world
    ? world.objects.map(object => ({ id: object.id, kind: object.kind, x: object.x, z: object.z, halfX: object.width / 2, halfZ: object.depth / 2, height: object.height }))
    : OBSTACLES.map((object, index) => ({ id: `legacy-obstacle-${index}`, kind: object.model ?? 'crate', x: object.x, z: object.z, halfX: object.halfX, halfZ: object.halfZ, height: object.height ?? CRATE_HEIGHT }));
  const obstacles = [...allObstacles];
  const boxes: WorldProjectileBox[] = [];
  const boxById = new Map<string, WorldProjectileBox>();
  let gateOpen = false;

  function getProjectileBoxes(): WorldProjectileBox[] {
    boxes.length = obstacles.length;
    obstacles.forEach((obstacle, index) => {
      let box = boxById.get(obstacle.id);
      if (!box) {
        box = { id: obstacle.id, kind: obstacle.kind, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        boxById.set(obstacle.id, box);
      }
      const y = sampleHeight(obstacle.x, obstacle.z);
      Object.assign(box.min, { x: obstacle.x - obstacle.halfX, y, z: obstacle.z - obstacle.halfZ });
      Object.assign(box.max, { x: obstacle.x + obstacle.halfX, y: y + (obstacle.height ?? CRATE_HEIGHT), z: obstacle.z + obstacle.halfZ });
      boxes[index] = box;
    });
    return boxes;
  }

  function setGateOpen(open: boolean) {
    if (gateOpen === open) return;
    gateOpen = open;
    obstacles.splice(0, obstacles.length, ...allObstacles.filter(obstacle => !open || obstacle.kind !== 'gate'));
    getProjectileBoxes();
  }

  getProjectileBoxes();
  return { allObstacles, obstacles, getProjectileBoxes, setGateOpen, get gateOpen() { return gateOpen; } };
}
