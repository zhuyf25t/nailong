import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

// Offline only: index-only simplification preserves the MegaKit position/normal/UV buffers.
const bytes = await fs.readFile('public/assets/nature/megakit.glb');
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binary = bytes.subarray(28 + jsonLength);
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(id) {
  const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
  const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
  if (!Type || a.sparse) throw Error(`Unsupported accessor ${id}`);
  const width = widths[a.type], result = new Type(a.count * width);
  const stride = view.byteStride ?? width * Type.BYTES_PER_ELEMENT;
  for (let vertex = 0; vertex < a.count; vertex++) {
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + vertex * stride;
    for (let k = 0; k < width; k++) {
      const at = offset + k * Type.BYTES_PER_ELEMENT;
      result[vertex * width + k] = Type === Float32Array ? binary.readFloatLE(at) : Type === Uint32Array ? binary.readUInt32LE(at) : binary.readUInt16LE(at);
    }
  }
  return result;
}
await MeshoptSimplifier.ready;
const output = { sourceSha256: createHash('sha256').update(bytes).digest('hex'), generatedBy: 'meshoptimizer 1.1.1 — index-only, normal/UV-aware simplification', primitives: {} };
const report = [];
for (const [meshId, mesh] of gltf.meshes.entries()) for (const [primitiveId, primitive] of mesh.primitives.entries()) {
  const indices = new Uint32Array(accessor(primitive.indices));
  const positions = accessor(primitive.attributes.POSITION);
  const normals = accessor(primitive.attributes.NORMAL), uv = accessor(primitive.attributes.TEXCOORD_0);
  const attributes = new Float32Array(positions.length / 3 * 5);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    attributes.set(normals.subarray(vertex * 3, vertex * 3 + 3), vertex * 5);
    attributes.set(uv.subarray(vertex * 2, vertex * 2 + 2), vertex * 5 + 3);
  }
  // Blender's primitive export repeats some identical vertices; canonicalize complete attributes.
  const unique = new Map(), remap = new Uint32Array(positions.length / 3);
  for (let vertex = 0; vertex < remap.length; vertex++) {
    const key = [...positions.subarray(vertex * 3, vertex * 3 + 3), ...attributes.subarray(vertex * 5, vertex * 5 + 5)].join(',');
    if (!unique.has(key)) unique.set(key, vertex);
    remap[vertex] = unique.get(key);
  }
  for (let i = 0; i < indices.length; i++) indices[i] = remap[indices[i]];
  const levels = [];
  // Alpha-cut foliage uses high UV weights: silhouettes may simplify, leaf-mask UV seams may not slide.
  for (const [ratio, error] of [[0.5, 0.015], [0.23, 0.04]]) {
    const [result, measuredError] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, 5, [0.1, 0.1, 0.1, 1, 1], null, Math.floor(indices.length * ratio / 3) * 3, error, ['Permissive']);
    if (result.some(index => index >= positions.length / 3)) throw Error(`Invalid LOD index for ${meshId}:${primitiveId}`);
    const packed = new Uint16Array(result);
    if (positions.length / 3 > 65535) throw Error('LOD encoding expects 16-bit template indices');
    levels.push({ triangles: result.length / 3, error: measuredError, indices: Buffer.from(packed.buffer).toString('base64') });
  }
  output.primitives[`${meshId}:${primitiveId}`] = { vertices: positions.length / 3, sourceTriangles: indices.length / 3, levels };
  report.push({ key: `${meshId}:${primitiveId}`, material: gltf.materials[primitive.material].name, original: indices.length / 3, medium: levels[0].triangles, far: levels[1].triangles });
}
await fs.writeFile('public/assets/nature/megakit-lod.json', JSON.stringify(output) + '\n');
console.table(report);
