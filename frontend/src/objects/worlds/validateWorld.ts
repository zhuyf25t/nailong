import type { WorldDefinition } from './WorldDefinition';
import type { MapValidationIssue } from './MapValidationIssue';

export const WORLD_LIMITS = { objects: 48, drones: 8, patrol: 12, playerRadius: .55, droneRadius: .65 } as const;
type Point = { x: number; z: number };
type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
const finite = (...values: number[]) => values.every(Number.isFinite);
const inRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const inside = (p: Point, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const circleTouches = (p: Point, radius: number, r: Rect) => Math.hypot(p.x - Math.max(r.minX, Math.min(r.maxX, p.x)), p.z - Math.max(r.minZ, Math.min(r.maxZ, p.z))) < radius;

/** Closed segment/AABB intersection. Edges also count: a thin wall must not disappear between grid cells. */
export function segmentCrossesRectangle(a: Point, b: Point, r: Rect): boolean {
  let enter = 0, leave = 1;
  for (const [start, delta, low, high] of [[a.x, b.x - a.x, r.minX, r.maxX], [a.z, b.z - a.z, r.minZ, r.maxZ]]) {
    if (Math.abs(delta) < 1e-10) { if (start < low || start > high) return false; continue; }
    const near = (low - start) / delta, far = (high - start) / delta;
    enter = Math.max(enter, Math.min(near, far)); leave = Math.min(leave, Math.max(near, far));
    if (enter > leave) return false;
  }
  return true;
}

/** Editor diagnostics. The server independently validates the same geometry before saving. */
export function validateWorld(world: WorldDefinition): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  const add = (code: string, message: string, objectId: string | null = null) => issues.push({ code, message, objectId });
  if (world.schemaVersion !== 1) add('schema_invalid', '地图格式版本不受支持。');
  if (!world.title.trim() || world.title.length > 80) add('invalid_title', '地图名称需要 1–80 个字符。');
  const half = world.bounds.halfSize;
  if (!inRange(half, 12, 48)) add('bounds_invalid', '地图半径须为 12–48 米。');
  if (world.objects.length > 48) add('object_budget', '掩体最多 48 个。');
  if (world.drones.length < 1 || world.drones.length > 8) add('drone_budget', '需要 1–8 架无人机。');
  const t = world.terrain;
  if (!inRange(t.hillHeight, 0, 4) || !inRange(t.hillWidth, 2.5, 9) || !inRange(t.hillX, -8, 8) || !inRange(t.hillZ, -8, 8) || !inRange(t.ripple, 0, .8)) add('invalid_terrain', '地形参数超出可编辑范围。');
  const ids = new Set<string>();
  for (const entity of [...world.objects, ...world.drones, world.beacon, world.extraction]) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(entity.id)) add('invalid_id', '实体编号须为小写字母开头的稳定标识。', entity.id);
    if (entity.id === 'player' || entity.id.startsWith('projectile-') || entity.id.startsWith('tool-')) add('reserved_id', '这个编号保留给角色、弹丸或工具，请换一个实体编号。', entity.id);
    if (ids.has(entity.id)) add('duplicate_id', '这个实体编号已经被使用。', entity.id);
    ids.add(entity.id);
  }
  const bounds = (p: Point, radius: number) => finite(p.x, p.z) && Math.abs(p.x) + radius <= half && Math.abs(p.z) + radius <= half;
  const rects = world.objects.map(o => ({ id: o.id, kind: o.kind, minX: o.x - o.width / 2, maxX: o.x + o.width / 2, minZ: o.z - o.depth / 2, maxZ: o.z + o.depth / 2 }));
  world.objects.forEach((o, index) => {
    if (!['crate', 'barrel', 'wall', 'gate'].includes(o.kind) || !inRange(o.width, .5, 16) || !inRange(o.depth, .5, 16) || !inRange(o.height, .5, 8)) add('invalid_size', '掩体宽深须为 0.5–16 米，高须为 0.5–8 米。', o.id);
    if (!finite(o.x, o.z) || Math.abs(o.x) + o.width / 2 > half || Math.abs(o.z) + o.depth / 2 > half) add('out_of_bounds', '掩体超出了地图边界。', o.id);
    const r = rects[index];
    for (let j = 0; j < index; j++) { const other = rects[j]; if (r.minX < other.maxX && r.maxX > other.minX && r.minZ < other.maxZ && r.maxZ > other.minZ) add('entity_overlap', `掩体与 ${other.id} 重叠。`, o.id); }
  });
  const checkPoint = (p: Point, radius: number, id: string, label: string, code: string) => {
    if (!bounds(p, radius)) add('out_of_bounds', `${label}过于靠近边界或坐标无效。`, id);
    if (rects.some(r => circleTouches(p, radius, r))) add(code, `${label}与实体掩体重叠，请移到空地。`, id);
  };
  checkPoint(world.spawn, .55, 'spawn', '出生点', 'blocked_spawn');
  if (!inRange(world.spawn.yaw, -1e6, 1e6)) add('invalid_rotation', '出生点方向无效。', 'spawn');
  for (const drone of world.drones) {
    checkPoint(drone, .65, drone.id, '无人机', 'blocked_drone');
    if (!inRange(drone.yaw, -1e6, 1e6)) add('invalid_rotation', '无人机方向无效。', drone.id);
    if (drone.patrol.length > 12) add('patrol_budget', '每架无人机最多 12 个巡逻点。', drone.id);
    drone.patrol.forEach(p => checkPoint(p, .65, drone.id, '巡逻点', 'blocked_patrol'));
  }
  for (const marker of [world.beacon, world.extraction]) {
    if (!inRange(marker.radius, .6, 4)) add('invalid_size', '交互区域半径须为 0.6–4 米。', marker.id);
    checkPoint(marker, marker.radius, marker.id, marker === world.beacon ? '信标' : '撤离点', 'blocked_marker');
  }
  if (Math.hypot(world.spawn.x - world.beacon.x, world.spawn.z - world.beacon.z) < world.beacon.radius + .55) add('entity_overlap', '出生点不能与信标交互区域重叠。', 'spawn');
  if (Math.hypot(world.beacon.x - world.extraction.x, world.beacon.z - world.extraction.z) < world.beacon.radius + world.extraction.radius) add('entity_overlap', '信标与撤离区域不能重叠。', world.extraction.id);
  // Reject malformed values before allocating a grid. Geometry faults are enough to locate a repair.
  if (issues.length) return issues;
  const reachable = (from: Point, target: Point, gatesOpen: boolean): boolean => {
    const blockers: Rect[] = rects.filter(r => !gatesOpen || r.kind !== 'gate').map(r => ({ minX: r.minX - .55, maxX: r.maxX + .55, minZ: r.minZ - .55, maxZ: r.maxZ + .55 }));
    const min = Math.ceil(-half + .55), max = Math.floor(half - .55), size = max - min + 1;
    const key = (x: number, z: number) => (z - min) * size + x - min;
    const clear = (a: Point, b: Point) => !blockers.some(r => segmentCrossesRectangle(a, b, r));
    const anchors = (p: Point) => {
      const result: number[] = [];
      for (let z = Math.max(min, Math.ceil(p.z - 1.5)); z <= Math.min(max, Math.floor(p.z + 1.5)); z++) for (let x = Math.max(min, Math.ceil(p.x - 1.5)); x <= Math.min(max, Math.floor(p.x + 1.5)); x++) {
        const point = { x, z }; if (Math.hypot(x - p.x, z - p.z) <= 1.5 && !blockers.some(r => inside(point, r)) && clear(p, point)) result.push(key(x, z));
      }
      return result;
    };
    const visited = new Uint8Array(size * size), queue = anchors(from);
    for (const value of queue) visited[value] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const value = queue[cursor], x = value % size + min, z = Math.floor(value / size) + min;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < min || nx > max || nz < min || nz > max) continue;
        const next = key(nx, nz); if (visited[next]) continue;
        const point = { x: nx, z: nz }; if (blockers.some(r => inside(point, r)) || !clear({ x, z }, point)) continue;
        visited[next] = 1; queue.push(next);
      }
    }
    return anchors(target).some(v => visited[v]);
  };
  if (!reachable(world.spawn, world.beacon, false)) add('unreachable_beacon', '门关闭时，出生点到信标没有足够宽的通道。信标不能放在只能开门才能到达的区域。', world.beacon.id);
  if (!reachable(world.beacon, world.extraction, true)) add('unreachable_extraction', '激活信标、开门后仍无法到达撤离点。请检查围墙或狭窄入口。', world.extraction.id);
  return issues;
}
