/** Read-only glTF inventory for downloaded Quaternius Standard packs. */
import fs from 'node:fs/promises';
import path from 'node:path';

const cache = path.resolve('.asset-cache');
async function walk(directory) {
  const paths = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(file)); else paths.push(file);
  }
  return paths;
}
for (const pack of process.argv.slice(2).length ? process.argv.slice(2) : ['scifi-standard', 'fantasy-props-standard']) {
  const root = path.join(cache, pack);
  const files = await walk(root);
  const models = [];
  for (const file of files.filter(file => /\.gltf$/i.test(file))) {
    const gltf = JSON.parse(await fs.readFile(file, 'utf8'));
    for (const buffer of gltf.buffers ?? []) {
      if (!buffer.uri || buffer.uri.startsWith('data:')) throw new Error(`Unexpected buffer format: ${file}`);
      const bytes = (await fs.stat(path.resolve(path.dirname(file), decodeURIComponent(buffer.uri)))).size;
      if (bytes !== buffer.byteLength) throw new Error(`Truncated binary buffer: ${file}`);
    }
    let triangles = 0;
    let vertices = 0;
    let primitives = 0;
    for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4) throw new Error(`Non-triangle model: ${file}`);
      const positions = gltf.accessors[primitive.attributes.POSITION];
      triangles += (primitive.indices === undefined ? positions.count : gltf.accessors[primitive.indices].count) / 3;
      vertices += positions.count;
      primitives++;
    }
    const textures = [];
    for (const image of gltf.images ?? []) {
      const imageBytes = image.uri ? await fs.readFile(path.resolve(path.dirname(file), decodeURIComponent(image.uri))) : null;
      const png = imageBytes?.readUInt32BE(0) === 0x89504e47;
      textures.push({ uri: image.uri, bytes: imageBytes?.length ?? null,
        ...(png ? { width: imageBytes.readUInt32BE(16), height: imageBytes.readUInt32BE(20) } : {}),
      });
    }
    models.push({ file: path.relative(root, file).replaceAll('\\', '/'), name: path.basename(file, '.gltf'),
      triangles, vertices, primitives, materials: (gltf.materials ?? []).map(m => m.name),
      textures, skins: gltf.skins?.length ?? 0,
      animations: (gltf.animations ?? []).map(animation => ({ name: animation.name, channels: animation.channels.length })),
      nodes: gltf.nodes?.length ?? 0,
    });
  }
  const licenseFiles = files.filter(file => /license/i.test(path.basename(file)));
  const inventory = { pack, modelCount: models.length, licenseFiles: licenseFiles.map(file => path.relative(root, file).replaceAll('\\', '/')), models };
  await fs.writeFile(path.join(cache, `${pack}.inventory.json`), `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(pack, models.length, 'glTF models;', 'licenses:', inventory.licenseFiles);
  for (const model of models.filter(model => /robot|drone|crate|barrel|box|chest|target/i.test(model.name))) {
    console.log(JSON.stringify(model));
  }
}
