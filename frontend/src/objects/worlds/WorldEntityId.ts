import { string, assert } from '../../system/api/decode.ts';
/** Stable within a world; shared by collisions, events and replay references. */
export type WorldEntityId = string;
export function decodeWorldEntityId(value: unknown, path = '$'): WorldEntityId {
 const id = string(value, path, 1, 64); assert(/^[a-z][a-z0-9-]{0,63}$/.test(id), path, 'lowercase stable entity id');
 assert(id !== 'player' && !id.startsWith('projectile-') && !id.startsWith('tool-'), path, 'entity id outside reserved runtime namespaces');
 return id;
}
