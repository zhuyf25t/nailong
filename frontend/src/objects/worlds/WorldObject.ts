import { object, literal, number } from '../../system/api/decode.ts';
import { decodeWorldPoint, type WorldPoint } from './WorldPoint.ts';
import { decodeWorldEntityId } from './WorldEntityId.ts';
export interface WorldObject extends WorldPoint {
 readonly id: string; readonly kind: 'crate' | 'barrel' | 'wall' | 'gate';
 readonly width: number; readonly depth: number; readonly height: number;
}
export function decodeWorldObject(value: unknown, path = '$'): WorldObject {
 const v = object(value, path); return { ...decodeWorldPoint(v, path), id: decodeWorldEntityId(v.id, path + '.id'),
 kind: literal(v.kind, ['crate', 'barrel', 'wall', 'gate'], path + '.kind'),
 width: number(v.width, path + '.width', 0.5, 16), depth: number(v.depth, path + '.depth', 0.5, 16), height: number(v.height, path + '.height', 0.5, 8) };
}
