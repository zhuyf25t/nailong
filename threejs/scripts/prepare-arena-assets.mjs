/** Pack selected author glTF files without rebuilding geometry or executing author code.
 * Run from threejs: node scripts/prepare-arena-assets.mjs
 * Requires the two Standard archives extracted by download-asset-packs.mjs.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const cache = path.resolve('.asset-cache');
const output = path.resolve('public/assets/arena');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const packs = {
  fantasy: { name: 'Fantasy Props MegaKit Standard', root: path.join(cache, 'fantasy-props-standard'),
    source: 'https://quaternius.itch.io/fantasy-props-megakit', licenseFile: 'License_Fantasy_Standard.txt' },
  scifi: { name: 'Sci-Fi Essentials Kit Standard', root: path.join(cache, 'scifi-standard'),
    source: 'https://quaternius.itch.io/sci-fi-essentials-kit', licenseFile: 'License_SciFi_Standard.txt' },
};

function makeBundle(name) {
  const gltf = { asset: { version: '2.0', generator: 'Arena Standard asset packer', copyright: 'Quaternius — CC0 1.0' },
    scene: 0, scenes: [{ name, nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [],
    materials: [], textures: [], images: [], samplers: [], skins: [], animations: [], buffers: [] };
  const chunks = [];
  let byteLength = 0;
  const imageCache = new Map(), materialCache = new Map(), textureCache = new Map(), samplerCache = new Map();
  const sources = [], images = [];
  function append(bytes) {
    const offset = byteLength;
    chunks.push(bytes); byteLength += bytes.length;
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
    return offset;
  }
  function intern(value, cache, list) {
    const key = JSON.stringify(value);
    if (!cache.has(key)) { cache.set(key, list.length); list.push(value); }
    return cache.get(key);
  }
  async function addSource(pack, relativeFile, rootName, preserveScene = false) {
    const file = path.join(pack.root, relativeFile);
    const sourceBytes = await fs.readFile(file);
    const source = JSON.parse(sourceBytes);
    const folder = path.dirname(file);
    if (source.extensionsRequired?.length || source.extensionsUsed?.length) throw new Error(`Unsupported extension in ${relativeFile}`);
    const buffers = [];
    const binaryFiles = [];
    for (const buffer of source.buffers ?? []) {
      if (!buffer.uri || buffer.uri.startsWith('data:')) throw new Error('Expected local external source buffer');
      const bytes = await fs.readFile(path.resolve(folder, decodeURIComponent(buffer.uri)));
      if (bytes.length !== buffer.byteLength) throw new Error(`Truncated source binary: ${relativeFile}`);
      buffers.push(append(bytes));
      binaryFiles.push({ file: buffer.uri, bytes: bytes.length, sha256: sha256(bytes) });
    }
    const viewOffset = gltf.bufferViews.length;
    for (const view of source.bufferViews ?? []) gltf.bufferViews.push({ ...view, buffer: 0, byteOffset: buffers[view.buffer] + (view.byteOffset ?? 0) });
    const accessorOffset = gltf.accessors.length;
    for (const accessor of source.accessors ?? []) {
      if (accessor.sparse || accessor.bufferView === undefined) throw new Error('Sparse/accessor without a bufferView is unsupported');
      gltf.accessors.push({ ...accessor, bufferView: accessor.bufferView + viewOffset });
    }
    const imageIds = [];
    for (const sourceImage of source.images ?? []) {
      if (!sourceImage.uri) throw new Error('Expected an external source image');
      const bytes = await fs.readFile(path.resolve(folder, decodeURIComponent(sourceImage.uri)));
      const hash = sha256(bytes);
      if (!imageCache.has(hash)) {
        const view = gltf.bufferViews.length;
        gltf.bufferViews.push({ buffer: 0, byteOffset: append(bytes), byteLength: bytes.length });
        imageCache.set(hash, gltf.images.length);
        gltf.images.push({ name: sourceImage.name ?? path.basename(sourceImage.uri), mimeType: sourceImage.mimeType ?? 'image/png', bufferView: view });
        const png = bytes.readUInt32BE(0) === 0x89504e47;
        images.push({ file: sourceImage.uri, bytes: bytes.length, sha256: hash,
          ...(png ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {}) });
      }
      imageIds.push(imageCache.get(hash));
    }
    const samplerIds = (source.samplers ?? []).map(sampler => intern(sampler, samplerCache, gltf.samplers));
    const textureIds = (source.textures ?? []).map(texture => intern({ ...texture, source: imageIds[texture.source],
      ...(texture.sampler === undefined ? {} : { sampler: samplerIds[texture.sampler] }) }, textureCache, gltf.textures));
    function remapMaterialTextures(value) {
      for (const [key, item] of Object.entries(value)) {
        if (!item || typeof item !== 'object') continue;
        if (key.endsWith('Texture') && 'index' in item) item.index = textureIds[item.index];
        else remapMaterialTextures(item);
      }
    }
    const materialIds = (source.materials ?? []).map(material => {
      remapMaterialTextures(material); return intern(material, materialCache, gltf.materials);
    });
    const meshOffset = gltf.meshes.length;
    let triangles = 0;
    for (const mesh of source.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        if ((primitive.mode ?? 4) !== 4 || primitive.targets) throw new Error('Expected triangle mesh without morph targets');
        triangles += source.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
        primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([key, index]) => [key, index + accessorOffset]));
        if (primitive.indices !== undefined) primitive.indices += accessorOffset;
        if (primitive.material !== undefined) primitive.material = materialIds[primitive.material];
      }
      gltf.meshes.push(mesh);
    }
    const nodeOffset = gltf.nodes.length;
    const skinOffset = gltf.skins.length;
    for (const node of source.nodes ?? []) {
      if (node.mesh !== undefined) node.mesh += meshOffset;
      if (node.skin !== undefined) node.skin += skinOffset;
      if (node.children) node.children = node.children.map(index => index + nodeOffset);
      gltf.nodes.push(node);
    }
    for (const skin of source.skins ?? []) {
      gltf.skins.push({ ...skin, joints: skin.joints.map(index => index + nodeOffset),
        ...(skin.skeleton === undefined ? {} : { skeleton: skin.skeleton + nodeOffset }),
        ...(skin.inverseBindMatrices === undefined ? {} : { inverseBindMatrices: skin.inverseBindMatrices + accessorOffset }) });
    }
    for (const animation of source.animations ?? []) {
      gltf.animations.push({ ...animation,
        channels: animation.channels.map(channel => ({ ...channel, target: { ...channel.target, node: channel.target.node + nodeOffset } })),
        samplers: animation.samplers.map(sampler => ({ ...sampler, input: sampler.input + accessorOffset, output: sampler.output + accessorOffset })) });
    }
    if (preserveScene) {
      if (nodeOffset !== 0) throw new Error('Preserving scenes requires an otherwise empty bundle');
      gltf.scene = source.scene ?? 0;
      gltf.scenes = structuredClone(source.scenes);
    } else {
      const wrapper = gltf.nodes.length;
      gltf.nodes.push({ name: rootName, children: source.scenes[source.scene ?? 0].nodes.map(index => index + nodeOffset) });
      gltf.scenes[0].nodes.push(wrapper);
    }
    sources.push({ name: rootName, pack: pack.name, file: relativeFile.replaceAll('\\', '/'), source: pack.source,
      sha256: sha256(sourceBytes), buffers: binaryFiles, triangles, meshes: source.meshes.length,
      skins: source.skins?.length ?? 0, animations: (source.animations ?? []).map(animation => animation.name) });
  }
  async function save(file) {
    const binary = Buffer.concat(chunks);
    gltf.buffers = [{ byteLength: binary.length }];
    for (const key of ['skins', 'animations', 'samplers']) if (!gltf[key].length) delete gltf[key];
    validate(gltf, binary);
    const jsonBytes = Buffer.from(JSON.stringify(gltf));
    const json = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + json.length + binary.length, 8);
    header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
    const bytes = Buffer.concat([header, json, binHeader, binary]);
    await fs.writeFile(path.join(output, file), bytes);
    const readback = await fs.readFile(path.join(output, file));
    if (readback.readUInt32LE(8) !== readback.length || sha256(readback) !== sha256(bytes)) throw new Error('GLB readback mismatch');
    const readbackJsonLength = readback.readUInt32LE(12);
    validate(JSON.parse(readback.subarray(20, 20 + readbackJsonLength)), readback.subarray(28 + readbackJsonLength));
    return { file, bytes: bytes.length, sha256: sha256(bytes), meshes: gltf.meshes.length, materials: gltf.materials.length,
      textures: gltf.images.length, skins: gltf.skins?.length ?? 0, animations: (gltf.animations ?? []).map(animation => animation.name),
      roots: gltf.scenes[gltf.scene].nodes.map(index => gltf.nodes[index].name), sources, images,
      validation: 'GLB readback; no external URI; all views/accessors/mesh indices/skin and animation references checked' };
  }
  return { addSource, save };
}

function validate(gltf, binary) {
  const indexOf = (array, index, label) => {
    if (!Number.isInteger(index) || index < 0 || index >= (array?.length ?? 0)) throw new Error(`Invalid ${label} index: ${index}`);
    return array[index];
  };
  function noUri(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) { if (key === 'uri') throw new Error('External URI remained'); noUri(item); }
  }
  noUri(gltf);
  if (gltf.buffers.length !== 1 || gltf.buffers[0].byteLength !== binary.length) throw new Error('Invalid binary buffer');
  for (const view of gltf.bufferViews) {
    if (view.buffer !== 0 || (view.byteOffset ?? 0) < 0 || (view.byteOffset ?? 0) + view.byteLength > binary.length) throw new Error('Buffer view out of bounds');
  }
  const bytesPerComponent = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  for (const accessor of gltf.accessors) {
    const view = indexOf(gltf.bufferViews, accessor.bufferView, 'accessor view');
    const elementBytes = bytesPerComponent[accessor.componentType] * components[accessor.type];
    const stride = view.byteStride ?? elementBytes;
    if (!elementBytes || stride < elementBytes || (accessor.byteOffset ?? 0) + Math.max(0, accessor.count - 1) * stride + elementBytes > view.byteLength) throw new Error('Accessor out of bounds');
  }
  for (const scene of gltf.scenes) for (const node of scene.nodes ?? []) indexOf(gltf.nodes, node, 'scene node');
  indexOf(gltf.scenes, gltf.scene, 'default scene');
  for (const node of gltf.nodes) {
    for (const child of node.children ?? []) indexOf(gltf.nodes, child, 'child node');
    if (node.mesh !== undefined) indexOf(gltf.meshes, node.mesh, 'node mesh');
    if (node.skin !== undefined) indexOf(gltf.skins, node.skin, 'node skin');
  }
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    const positions = indexOf(gltf.accessors, primitive.attributes.POSITION, 'positions');
    for (const accessor of Object.values(primitive.attributes)) if (indexOf(gltf.accessors, accessor, 'attribute').count !== positions.count) throw new Error('Attribute vertex count mismatch');
    if (primitive.material !== undefined) indexOf(gltf.materials, primitive.material, 'mesh material');
    if (primitive.indices !== undefined) {
      const accessor = indexOf(gltf.accessors, primitive.indices, 'indices');
      const view = gltf.bufferViews[accessor.bufferView];
      const read = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE' }[accessor.componentType];
      if (!read) throw new Error('Unsupported index component');
      for (let index = 0; index < accessor.count; index++) {
        const value = binary[read]((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * (view.byteStride ?? bytesPerComponent[accessor.componentType]));
        if (value >= positions.count) throw new Error('Mesh vertex index out of bounds');
      }
    }
  }
  for (const image of gltf.images) indexOf(gltf.bufferViews, image.bufferView, 'image view');
  for (const texture of gltf.textures) {
    indexOf(gltf.images, texture.source, 'texture image');
    if (texture.sampler !== undefined) indexOf(gltf.samplers, texture.sampler, 'texture sampler');
  }
  function materialTextures(value) {
    for (const [key, item] of Object.entries(value)) {
      if (!item || typeof item !== 'object') continue;
      if (key.endsWith('Texture') && 'index' in item) indexOf(gltf.textures, item.index, 'material texture'); else materialTextures(item);
    }
  }
  for (const material of gltf.materials) materialTextures(material);
  for (const skin of gltf.skins ?? []) {
    for (const joint of skin.joints) indexOf(gltf.nodes, joint, 'skin joint');
    if (skin.skeleton !== undefined) indexOf(gltf.nodes, skin.skeleton, 'skin skeleton');
    if (skin.inverseBindMatrices !== undefined) {
      const accessor = indexOf(gltf.accessors, skin.inverseBindMatrices, 'inverse bind matrix');
      if (accessor.type !== 'MAT4' || accessor.count < skin.joints.length) throw new Error('Invalid inverse bind matrices');
    }
  }
  for (const animation of gltf.animations ?? []) {
    for (const sampler of animation.samplers) {
      const input = indexOf(gltf.accessors, sampler.input, 'animation input');
      const output = indexOf(gltf.accessors, sampler.output, 'animation output');
      if (input.type !== 'SCALAR' || output.count !== input.count * (sampler.interpolation === 'CUBICSPLINE' ? 3 : 1)) throw new Error('Invalid animation sample counts');
    }
    for (const channel of animation.channels) {
      indexOf(animation.samplers, channel.sampler, 'animation sampler');
      indexOf(gltf.nodes, channel.target.node, 'animation target');
      if (!['translation', 'rotation', 'scale'].includes(channel.target.path)) throw new Error('Unexpected animation channel');
    }
  }
}

await fs.mkdir(output, { recursive: true });
const props = makeBundle('ArenaProps');
await props.addSource(packs.fantasy, 'Exports/glTF/Crate_Wooden.gltf', 'SupplyCrate');
await props.addSource(packs.fantasy, 'Exports/glTF/Barrel.gltf', 'Barrel');
const drone = makeBundle('EyeDrone');
await drone.addSource(packs.scifi, 'glTF/Enemy_EyeDrone.gltf', 'Enemy_EyeDrone', true);
const outputs = [await props.save('props.glb'), await drone.save('eye-drone.glb')];
const manifest = { author: 'Quaternius', license: 'CC0-1.0', preparedAt: new Date().toISOString(),
  sourceGeometryAndPbrTexturesPreserved: true, outputs, licenses: [] };
for (const pack of Object.values(packs)) {
  const bytes = await fs.readFile(path.join(pack.root, 'License_Standard.txt'));
  await fs.writeFile(path.join(output, pack.licenseFile), bytes);
  manifest.licenses.push({ pack: pack.name, source: pack.source, file: pack.licenseFile, sha256: sha256(bytes) });
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(outputs.map(({ file, bytes, sha256, meshes, materials, textures, skins, animations, roots }) =>
  ({ file, bytes, sha256, meshes, materials, textures, skins, animations, roots })), null, 2));
