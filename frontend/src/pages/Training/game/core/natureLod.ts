import * as THREE from 'three';
import source from '../../../../../public/assets/nature/megakit-lod.json?raw';

type LodPrimitive = { vertices: number; sourceTriangles: number; levels: Array<{ triangles: number; error: number; indices: string }> };
const data = JSON.parse(source) as { primitives: Record<string, LodPrimitive> };
const decoded = new Map<string, Uint16Array[]>();

/** The offline index buffers retain the author's original vertices, normals and alpha-mask UVs. */
export function natureLodIndices(key: string, geometry: THREE.BufferGeometry): Uint16Array[] | undefined {
  if (decoded.has(key)) return decoded.get(key);
  const primitive = data.primitives[key];
  if (!primitive || primitive.vertices !== geometry.getAttribute('position').count || primitive.sourceTriangles * 3 !== geometry.index?.count) return;
  const levels = primitive.levels.map(level => {
    const binary = atob(level.indices);
    const values = new Uint16Array(binary.length / 2);
    for (let index = 0; index < values.length; index++) values[index] = binary.charCodeAt(index * 2) | binary.charCodeAt(index * 2 + 1) << 8;
    return values;
  });
  decoded.set(key, levels);
  return levels;
}
