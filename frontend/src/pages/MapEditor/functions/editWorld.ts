import type { WorldDefinition } from '../../../objects/worlds/WorldDefinition';
import type { WorldObject } from '../../../objects/worlds/WorldObject';
import type { WorldSpawn } from '../../../objects/worlds/WorldSpawn';
import type { WorldMarker } from '../../../objects/worlds/WorldMarker';
import type { WorldDrone } from '../../../objects/worlds/WorldDrone';

export type EditorTool = 'select' | 'crate' | 'barrel' | 'wall' | 'gate' | 'drone' | 'spawn' | 'beacon' | 'extraction' | 'patrol';
export type EditorPoint = { x: number; z: number };
export const OBJECT_NAMES = { crate: '木箱', barrel: '木桶', wall: '围墙', gate: '捷径门' } as const;
export const TOOL_NAMES: Record<EditorTool, string> = { select: '选择 / 移动', ...OBJECT_NAMES, drone: '无人机', spawn: '出生点', beacon: '信标', extraction: '撤离区', patrol: '巡逻点' };
export function snapPoint(point: EditorPoint, half: number): EditorPoint {
  const snap = (value: number) => Math.max(-half, Math.min(half, Math.round(value * 2) / 2));
  return { x: snap(point.x), z: snap(point.z) };
}
export type EditorSelection = { kind: 'spawn'; name: string; value: WorldSpawn } | { kind: 'beacon' | 'extraction'; name: string; value: WorldMarker } | { kind: 'object'; name: string; value: WorldObject } | { kind: 'drone'; name: string; value: WorldDrone } | { kind: 'patrol'; name: string; value: EditorPoint };
export function findSelection(world: WorldDefinition, selection: string | null): EditorSelection | null {
  if (!selection) return null;
  const [kind, id, index] = selection.split(':');
  if (kind === 'spawn') return { kind, name: '出生点', value: world.spawn };
  if (kind === 'beacon' || kind === 'extraction') return { kind, name: kind === 'beacon' ? '信标' : '撤离区', value: world[kind] };
  if (kind === 'object') { const value = world.objects.find(o => o.id === id); return value ? { kind, name: OBJECT_NAMES[value.kind], value } : null; }
  if (kind === 'drone') { const value = world.drones.find(o => o.id === id); return value ? { kind, name: '无人机', value } : null; }
  if (kind === 'patrol') { const value = world.drones.find(o => o.id === id)?.patrol[Number(index)]; return value ? { kind, name: `巡逻点 ${Number(index) + 1}`, value } : null; }
  return null;
}
export function selectionForIssue(world: WorldDefinition, objectId: string | null): string | null {
  if (!objectId) return null;
  if (objectId === 'spawn') return 'spawn';
  if (world.beacon.id === objectId) return 'beacon';
  if (world.extraction.id === objectId) return 'extraction';
  if (world.objects.some(o => o.id === objectId)) return `object:${objectId}`;
  if (world.drones.some(o => o.id === objectId)) return `drone:${objectId}`;
  return null;
}
export function updateEntity(world: WorldDefinition, selection: string, patch: Readonly<Record<string, number>>): WorldDefinition {
  const [kind, id, index] = selection.split(':');
  const pick = (...keys: string[]) => Object.fromEntries(keys.filter(key => Number.isFinite(patch[key])).map(key => [key, patch[key]]));
  if (kind === 'spawn') return { ...world, spawn: { ...world.spawn, ...pick('x', 'z', 'yaw') } };
  if (kind === 'beacon' || kind === 'extraction') return { ...world, [kind]: { ...world[kind], ...pick('x', 'z', 'radius') } };
  if (kind === 'object') return { ...world, objects: world.objects.map(o => o.id === id ? { ...o, ...pick('x', 'z', 'width', 'depth', 'height') } : o) };
  if (kind === 'drone') return { ...world, drones: world.drones.map(o => o.id === id ? { ...o, ...pick('x', 'z', 'yaw') } : o) };
  if (kind === 'patrol') return { ...world, drones: world.drones.map(o => o.id === id ? { ...o, patrol: o.patrol.map((p, i) => i === Number(index) ? { ...p, ...pick('x', 'z') } : p) } : o) };
  return world;
}
export function removeEntity(world: WorldDefinition, selection: string): WorldDefinition {
  const [kind, id, index] = selection.split(':');
  if (kind === 'object') return { ...world, objects: world.objects.filter(o => o.id !== id) };
  if (kind === 'drone') return { ...world, drones: world.drones.filter(o => o.id !== id) };
  if (kind === 'patrol') return { ...world, drones: world.drones.map(o => o.id === id ? { ...o, patrol: o.patrol.filter((_, i) => i !== Number(index)) } : o) };
  return world;
}
export function placeEntity(world: WorldDefinition, tool: EditorTool, point: EditorPoint, id: string, selection: string | null): { world: WorldDefinition; selection: string | null } {
  if (tool === 'spawn' || tool === 'beacon' || tool === 'extraction') return { world: updateEntity(world, tool, point), selection: tool };
  if (tool === 'drone') return { world: { ...world, drones: [...world.drones, { id, ...point, yaw: 0, patrol: [] }] }, selection: `drone:${id}` };
  if (tool === 'patrol') {
    const [kind, droneId] = (selection ?? '').split(':');
    const drone = (kind === 'drone' || kind === 'patrol') && world.drones.find(d => d.id === droneId);
    if (!drone) return { world, selection };
    return { world: { ...world, drones: world.drones.map(d => d.id === droneId ? { ...d, patrol: [...d.patrol, point] } : d) }, selection: `patrol:${droneId}:${drone.patrol.length}` };
  }
  if (tool === 'select') return { world, selection: null };
  const sizes: Record<WorldObject['kind'], [number, number, number]> = { crate: [1.8, 1.8, 1.5], barrel: [1.2, 1.2, 1.4], wall: [6, .7, 2.4], gate: [3.2, .7, 2.4] };
  const [width, depth, height] = sizes[tool];
  return { world: { ...world, objects: [...world.objects, { id, kind: tool, ...point, width, depth, height }] }, selection: `object:${id}` };
}
