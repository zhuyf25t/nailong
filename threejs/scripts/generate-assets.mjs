/**
 * Original procedural assets for the front-end rendering study.
 * Run `npm run assets` to rebuild all binary glTF files. No textures or downloads.
 * Y is up; the character, weapon, and target face +Z. Units are metres.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPulseBlaster } from './create-pulse-blaster.mjs';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// GLTFExporter uses the browser FileReader API to encode its Blob buffers.
globalThis.FileReader ??= class FileReader {
  result = null;
  error = null;
  onloadend = null;
  onerror = null;
  async readAsArrayBuffer(blob) {
    try { this.result = await blob.arrayBuffer(); this.onloadend?.({ target: this }); }
    catch (error) { this.error = error; this.onerror?.({ target: this }); }
  }
  async readAsDataURL(blob) {
    try {
      const bytes = Buffer.from(await blob.arrayBuffer());
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
      this.onloadend?.({ target: this });
    } catch (error) { this.error = error; this.onerror?.({ target: this }); }
  }
};

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(project, 'public/assets/models');
let unique = 0;
const materials = new Map();
const geometries = new Map();

function cachedGeometry(key, make) {
  if (!geometries.has(key)) geometries.set(key, make());
  return geometries.get(key);
}

function material(name, color, options = {}) {
  if (!materials.has(name)) {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...options });
    value.name = name;
    materials.set(name, value);
  }
  return materials.get(name);
}

const paint = {
  yellow: material('Dragon_MangoYellow', '#ffcc42', { roughness: 0.64 }),
  golden: material('Dragon_GoldenCheeks', '#f7bb24'),
  cream: material('Dragon_CreamBelly', '#ffe2a0', { roughness: 0.84 }),
  belly: material('Dragon_SoftCreamBelly', '#ffffff', { vertexColors: true, roughness: 0.84 }),
  orange: material('Dragon_WarmDorsalFins', '#efa13c', { roughness: 0.72 }),
  claw: material('Dragon_SoftBrownClaws', '#d99b51', { roughness: 0.86 }),
  black: material('Dragon_EspressoEyes', '#19191d', { roughness: 0.18 }),
  eyeWhite: material('Dragon_WarmEyeWhite', '#fff6df', { roughness: 0.32 }),
  irisBorder: material('Dragon_DeepGreenIrisBorder', '#28402b', { roughness: 0.28 }),
  iris: material('Dragon_GreenIris', '#66874a', { roughness: 0.25 }),
  highlight: material('Dragon_EyeHighlights', '#fffef6', { roughness: 0.15 }),
  blush: material('Dragon_SoftBlush', '#ffffff', { vertexColors: true, roughness: 0.84 }),
  mouth: material('Dragon_Mouth', '#774322', { roughness: 0.9 }),
  tongue: material('Dragon_Tongue', '#ee8b73', { roughness: 0.8 }),
  blue: material('Scarf_OceanBlue', '#246e72', { roughness: 0.88 }),
  blueLight: material('Scarf_SkyBlue', '#539795', { roughness: 0.88 }),
  gunBlue: material('Gun_Blue', '#258bd9', { roughness: 0.4 }),
  gunLight: material('Gun_Cyan', '#64d8ed', { roughness: 0.36 }),
  gunWhite: material('Gun_Ivory', '#e4f8f5', { roughness: 0.4 }),
  gunDark: material('Gun_DeepBlue', '#185d91'),
  gunLime: material('Gun_Lime', '#d6ec61'),
  wood: material('Crate_HoneyWood', '#a66a32', { roughness: 0.88 }),
  woodLight: material('Crate_LightWood', '#b77a3d', { roughness: 0.88 }),
  woodDark: material('Crate_ShadowWood', '#744920', { roughness: 0.88 }),
  woodEdge: material('Crate_EdgeWood', '#9b632f', { roughness: 0.88 }),
  brass: material('Crate_WoodenPins', '#b17b43', { roughness: 0.92 }),
  targetRed: material('Target_Coral', '#ef6c4e'),
  targetWhite: material('Target_Cream', '#fff4d7'),
  stone: material('Wall_WarmStone', '#dfcea3'),
  stoneSide: material('Wall_StoneJoint', '#c9b98f'),
  stoneCap: material('Wall_SunlitCap', '#eddcb5'),
  leaf: material('Garden_JadeLeaves', '#31875a', { flatShading: true }),
  leafLight: material('Garden_LimeLeaves', '#66ad4f', { flatShading: true }),
  leafDark: material('Garden_DeepLeaves', '#236d53', { flatShading: true }),
  trunk: material('Garden_TreeTrunk', '#97714b'),
  flower: material('Garden_FlowerPetals', '#fff2bc'),
  flowerCenter: material('Garden_FlowerCenter', '#f4c24f'),
  rock: material('Garden_Stone', '#b2b4a6', { flatShading: true }),
};

function group(name, parent, position = [0, 0, 0]) {
  const value = new THREE.Group();
  value.name = name;
  value.position.set(...position);
  parent?.add(value);
  return value;
}

function mesh(name, geometry, surface, parent, position = [0, 0, 0]) {
  const value = new THREE.Mesh(geometry, surface);
  value.name = `${name}_${++unique}`;
  value.position.set(...position);
  value.castShadow = true;
  value.receiveShadow = true;
  parent.add(value);
  return value;
}

function oval(name, parent, surface, position, scale, segments = 24) {
  const value = mesh(name, cachedGeometry(`sphere:${segments}`, () => new THREE.SphereGeometry(1, segments, Math.max(12, segments / 2))), surface, parent, position);
  value.scale.set(...scale);
  return value;
}

function box(name, parent, surface, position, size, radius = 0.035) {
  const bevel = Math.min(radius, ...size.map(v => v / 3));
  return mesh(name, cachedGeometry(`box:${size.join(',')}:${bevel}`, () => new RoundedBoxGeometry(...size, 1, bevel)), surface, parent, position);
}

function cylinder(name, parent, surface, position, radius, length, axis = 'y', radiusBottom = radius, segments = 24) {
  const value = mesh(name, cachedGeometry(`cylinder:${radius}:${radiusBottom}:${length}:${segments}`, () => new THREE.CylinderGeometry(radius, radiusBottom, length, segments)), surface, parent, position);
  if (axis === 'z') value.rotation.x = Math.PI / 2;
  if (axis === 'x') value.rotation.z = Math.PI / 2;
  return value;
}

function leafBall(name, parent, surface, position, scale, detail = 1) {
  const value = mesh(name, cachedGeometry(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail)), surface, parent, position);
  value.scale.set(...scale);
  return value;
}

function quaternionTrack(name, times, eulers) {
  const values = eulers.flatMap(euler => new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler)).toArray());
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}

function positionTrack(name, times, points) {
  return new THREE.VectorKeyframeTrack(`${name}.position`, times, points.flat());
}

// A gently squared superellipsoid gives the dragon a continuous soft silhouette.
function plushGeometry(radii, exponent = 2.3, lowerWidth = 0) {
  const geometry = new THREE.SphereGeometry(1, 48, 32);
  const positions = geometry.attributes.position;
  const power = 2 / exponent;
  const signedPower = value => Math.sign(value) * Math.pow(Math.abs(value), power);
  for (let i = 0; i < positions.count; i++) {
    const x = signedPower(positions.getX(i));
    const y = signedPower(positions.getY(i));
    const z = signedPower(positions.getZ(i));
    positions.setXYZ(i, x * radii[0] * (1 - y * lowerWidth), y * radii[1], z * radii[2]);
  }
  const normals = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const factor = 1 - y / radii[1] * lowerWidth;
    const nx = exponent * Math.sign(x) * Math.pow(Math.abs(x), exponent - 1) / Math.pow(radii[0] * factor, exponent);
    const ny = exponent * Math.sign(y) * Math.pow(Math.abs(y), exponent - 1) / Math.pow(radii[1], exponent)
      + exponent * Math.pow(Math.abs(x / radii[0]), exponent) * lowerWidth / radii[1] / Math.pow(factor, exponent + 1);
    const nz = exponent * Math.sign(z) * Math.pow(Math.abs(z), exponent - 1) / Math.pow(radii[2], exponent);
    normals.push(...new THREE.Vector3(nx, ny, nz).normalize().toArray());
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function plushFront(x, y, radii, exponent = 2.3, lowerWidth = 0) {
  const width = radii[0] * (1 - y / radii[1] * lowerWidth);
  return radii[2] * Math.pow(Math.max(0.001, 1 - Math.pow(Math.abs(x / width), exponent) - Math.pow(Math.abs(y / radii[1]), exponent)), 1 / exponent);
}

function surfaceNormals(geometry, front) {
  const positions = geometry.attributes.position, normals = [], h = 0.0001;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i);
    const dx = (front(x + h, y) - front(x - h, y)) / (2 * h);
    const dy = (front(x, y + h) - front(x, y - h)) / (2 * h);
    normals.push(...new THREE.Vector3(-dx, -dy, 1).normalize().toArray());
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
}

function subdividePlanarTriangles(source, maxEdge = 0.018) {
  const positions = source.attributes.position;
  const vertices = Array.from({ length: positions.count }, (_, i) => [positions.getX(i), positions.getY(i), 0]);
  const sourceIndices = source.index ? Array.from(source.index.array) : vertices.map((_, i) => i);
  let triangles = [];
  for (let i = 0; i < sourceIndices.length; i += 3) triangles.push(sourceIndices.slice(i, i + 3));
  const midpointCache = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!midpointCache.has(key)) {
      midpointCache.set(key, vertices.length);
      vertices.push([(vertices[a][0] + vertices[b][0]) / 2, (vertices[a][1] + vertices[b][1]) / 2, 0]);
    }
    return midpointCache.get(key);
  };
  const tooLong = (a, b) => Math.hypot(vertices[a][0] - vertices[b][0], vertices[a][1] - vertices[b][1]) > maxEdge;
  // Split every long shared edge consistently. Interior vertices then follow the
  // same curved face as the contour, rather than cutting straight through it.
  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    const refined = [];
    for (const [a, b, c] of triangles) {
      const ab = tooLong(a, b), bc = tooLong(b, c), ca = tooLong(c, a);
      const mask = Number(ab) + Number(bc) * 2 + Number(ca) * 4;
      if (!mask) { refined.push([a, b, c]); continue; }
      changed = true;
      const m = ab ? midpoint(a, b) : -1;
      const n = bc ? midpoint(b, c) : -1;
      const p = ca ? midpoint(c, a) : -1;
      switch (mask) {
        case 1: refined.push([a, m, c], [m, b, c]); break;
        case 2: refined.push([b, n, a], [n, c, a]); break;
        case 4: refined.push([c, p, b], [p, a, b]); break;
        case 3: refined.push([m, b, n], [a, m, c], [m, n, c]); break;
        case 5: refined.push([p, a, m], [c, p, b], [p, m, b]); break;
        case 6: refined.push([n, c, p], [b, n, a], [n, p, a]); break;
        case 7: refined.push([a, m, p], [m, b, n], [p, n, c], [m, n, p]); break;
      }
    }
    triangles = refined;
    if (!changed) break;
    if (pass === 15) throw new Error('Curved facial surface subdivision did not converge');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(triangles.flat());
  return geometry;
}

function curvedShape(name, parent, surface, shape, front, offset = 0.006) {
  const geometry = subdividePlanarTriangles(new THREE.ShapeGeometry(shape, 28));
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, front(positions.getX(i), positions.getY(i)) + offset);
  surfaceNormals(geometry, front);
  return mesh(name, geometry, surface, parent);
}

function curvedEllipse(name, parent, surface, center, radii, front, offset = 0.006, fadeColors = null, fadePower = 0.66) {
  const points = [], colors = [], indices = [];
  const rings = 10, slices = 48;
  for (let ring = 0; ring <= rings; ring++) {
    const radius = ring / rings;
    for (let i = 0; i <= slices; i++) {
      const angle = i / slices * Math.PI * 2;
      const x = center[0] + Math.cos(angle) * radii[0] * radius;
      const y = center[1] + Math.sin(angle) * radii[1] * radius;
      points.push(x, y, front(x, y) + offset);
      if (fadeColors) {
        const color = new THREE.Color(fadeColors[0]).lerp(new THREE.Color(fadeColors[1]), Math.pow(radius, fadePower));
        colors.push(color.r, color.g, color.b);
      }
      if (ring < rings && i < slices) {
        const a = ring * (slices + 1) + i, b = a + slices + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  if (fadeColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  surfaceNormals(geometry, front);
  return mesh(name, geometry, surface, parent);
}

function roundedFin(name, parent, position, scale = 1) {
  const outline = new THREE.Shape();
  outline.moveTo(-0.025, -0.14);
  outline.quadraticCurveTo(0.09, -0.13, 0.195, -0.035);
  outline.quadraticCurveTo(0.265, 0.025, 0.195, 0.085);
  outline.quadraticCurveTo(0.10, 0.15, -0.025, 0.14);
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.10, steps: 1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 12 });
  geometry.translate(0, 0, -0.05);
  const fin = mesh(name, geometry, paint.orange, parent, position);
  fin.rotation.y = Math.PI / 2;
  fin.scale.setScalar(scale);
  return fin;
}

function softArm(name, parent, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return mesh(name, new THREE.TubeGeometry(curve, 16, radius, 14, false), paint.yellow, parent);
}

// One continuous pear profile, from the seat to the crown. The neck never
// narrows into a seam between two spheres; cheeks are part of this same skin.
const dragonProfile = [
  [-0.72, 0, 0], [-0.66, 0.32, 0.24], [-0.50, 0.55, 0.41],
  [-0.25, 0.68, 0.50], [0.02, 0.72, 0.55], [0.28, 0.705, 0.555],
  [0.50, 0.67, 0.54], [0.72, 0.675, 0.545], [0.94, 0.64, 0.52],
  [1.12, 0.52, 0.44], [1.26, 0.32, 0.28], [1.33, 0, 0],
];
const dragonHeadHeight = 0.74;

function dragonSection(y) {
  const points = dragonProfile;
  let i = 0;
  while (i < points.length - 2 && y > points[i + 1][0]) i++;
  const a = points[i], b = points[i + 1], span = b[0] - a[0];
  const t = THREE.MathUtils.clamp((y - a[0]) / span, 0, 1);
  const slope = (index, axis) => {
    if (index === 0) return (points[1][axis] - points[0][axis]) / (points[1][0] - points[0][0]);
    if (index === points.length - 1) return (points[index][axis] - points[index - 1][axis]) / (points[index][0] - points[index - 1][0]);
    const left = (points[index][axis] - points[index - 1][axis]) / (points[index][0] - points[index - 1][0]);
    const right = (points[index + 1][axis] - points[index][axis]) / (points[index + 1][0] - points[index][0]);
    return left * right <= 0 ? 0 : 2 * left * right / (left + right);
  };
  return [1, 2].map(axis => Math.max(0,
    (2 * t ** 3 - 3 * t ** 2 + 1) * a[axis]
    + (t ** 3 - 2 * t ** 2 + t) * span * slope(i, axis)
    + (-2 * t ** 3 + 3 * t ** 2) * b[axis]
    + (t ** 3 - t ** 2) * span * slope(i + 1, axis)));
}

function dragonFront(x, y) {
  const [width, depth] = dragonSection(y);
  const facing = Math.sqrt(Math.max(0, 1 - (x / Math.max(width, 0.0001)) ** 2));
  const faceY = y - dragonHeadHeight;
  const gaussian = (cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - ((faceY - cy) / sy) ** 2);
  const cheeks = 0.085 * gaussian(0, -0.16, 0.43, 0.21)
    + 0.042 * gaussian(-0.34, -0.13, 0.18, 0.19)
    + 0.042 * gaussian(0.34, -0.13, 0.18, 0.19);
  return depth * facing + cheeks * facing ** 4;
}

function dragonSkinAttributes(geometry) {
  const position = geometry.attributes.position, indices = [], weights = [];
  for (let i = 0; i < position.count; i++) {
    const headWeight = THREE.MathUtils.smoothstep(position.getY(i), 0.20, 0.67);
    indices.push(0, 1, 0, 0);
    weights.push(1 - headWeight, headWeight, 0, 0);
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  return geometry;
}

function continuousDragonGeometry() {
  const positions = [], indices = [], rings = 64, slices = 64;
  for (let j = 0; j <= rings; j++) {
    const y = THREE.MathUtils.lerp(-0.72, 1.33, j / rings);
    const [width, depth] = dragonSection(y);
    for (let i = 0; i <= slices; i++) {
      const angle = i / slices * Math.PI * 2;
      const x = Math.sin(angle) * width;
      const front = Math.cos(angle);
      const z = front > 0 ? dragonFront(x, y) : front * depth;
      positions.push(x, y, z);
      if (i < slices && j < rings) {
        const a = j * (slices + 1) + i, b = a + slices + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The duplicated meridian must have the same normals, without a back seam.
  const normals = geometry.attributes.normal;
  for (let j = 0; j <= rings; j++) {
    const first = j * (slices + 1), last = first + slices;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    if (j === 0 || j === rings) normal.set(0, j === 0 ? -1 : 1, 0);
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
    if (j === 0 || j === rings) {
      for (let i = first; i <= last; i++) normals.setXYZ(i, 0, j === 0 ? -1 : 1, 0);
    }
  }
  return dragonSkinAttributes(geometry);
}

function dorsalRidgeGeometry() {
  const positions = [], indices = [], rings = 72, slices = 12;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings, y = THREE.MathUtils.lerp(-0.24, 1.10, t);
    const [, depth] = dragonSection(y);
    const tipFade = Math.sin(t * Math.PI) ** 0.45;
    const lobe = Math.sin(t * Math.PI * 4) ** 2;
    for (let i = 0; i <= slices; i++) {
      const angle = i / slices * Math.PI * 2;
      // A small continuous scalloped ridge, softly rounded across its width.
      positions.push(Math.cos(angle) * 0.072 * tipFade, y,
        -depth + 0.022 - Math.sin(angle) * (0.03 + lobe * 0.135) * tipFade);
      if (j < rings && i < slices) {
        const a = j * (slices + 1) + i, b = a + slices + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let j = 0; j <= rings; j++) {
    const first = j * (slices + 1), last = first + slices;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
    if (j === 0 || j === rings) {
      for (let i = first; i <= last; i++) normals.setXYZ(i, 0, j === 0 ? -1 : 1, 0);
    }
  }
  return dragonSkinAttributes(geometry);
}

function makeDragon() {
  const root = group('DragonRig');
  root.userData = {
    forward: '+Z', up: '+Y', approximateColliderRadius: 0.5,
    attachment: 'weapon_socket', animationNames: ['Idle', 'Walk', 'Aim', 'Shoot'],
    reference: 'https://www.nailoong.com/',
    provenance: 'Locally modelled study after the official Nailoong character image; not an official downloaded model',
  };
  const torso = group('DragonTorso', root, [0, 0.83, 0]);
  const skinRoot = new THREE.Bone();
  skinRoot.name = 'DragonSkinRoot';
  torso.add(skinRoot);
  const head = new THREE.Bone();
  head.name = 'DragonHead';
  head.position.set(0, dragonHeadHeight, 0);
  skinRoot.add(head);
  const skeleton = new THREE.Skeleton([skinRoot, head]);
  const body = new THREE.SkinnedMesh(continuousDragonGeometry(), paint.yellow);
  body.name = 'ContinuousPearSilhouette';
  body.castShadow = true;
  body.receiveShadow = true;
  torso.add(body);
  const ridge = new THREE.SkinnedMesh(dorsalRidgeGeometry(), paint.orange);
  ridge.name = 'SoftContinuousDorsalRidge';
  ridge.castShadow = true;
  ridge.receiveShadow = true;
  torso.add(ridge);
  root.updateMatrixWorld(true);
  body.bind(skeleton);
  ridge.bind(skeleton);
  const belly = curvedEllipse('SoftCreamBelly', torso, paint.belly, [0, -0.075], [0.405, 0.48], dragonFront, 0.004,
    ['#fff0c5', '#ffcc42'], 8);
  belly.castShadow = false;
  const headFront = (x, y) => dragonFront(x, y + dragonHeadHeight);
  for (const side of [-1, 1]) {
    const eyeX = side * 0.242, eyeY = 0.105;
    const eye = group(side < 0 ? 'LeftEyeMount' : 'RightEyeMount', head,
      [eyeX, eyeY, headFront(eyeX, eyeY) + 0.012]);
    eye.rotation.y = side * 0.25;
    eye.rotation.z = side * -0.065;
    oval('FriendlyWhiteEye', eye, paint.eyeWhite, [0, 0, 0], [0.115, 0.143, 0.035], 32);
    oval('GreenIrisOutline', eye, paint.irisBorder, [side * -0.002, -0.001, 0.032], [0.105, 0.133, 0.014], 32);
    oval('BrightGreenIris', eye, paint.iris, [side * -0.003, -0.003, 0.043], [0.097, 0.124, 0.009], 32);
    oval('RoundBlackPupil', eye, paint.black, [side * -0.004, 0.006, 0.051], [0.087, 0.111, 0.009], 28);
    oval('EyeMainGlint', eye, paint.highlight, [-0.027, 0.052, 0.060], [0.031, 0.034, 0.005], 16);
    oval('EyeTinyGlint', eye, paint.highlight, [0.028, -0.036, 0.060], [0.009, 0.011, 0.004], 12);
    const lidPoints = [];
    for (let i=0;i<=20;i++) {
      const angle = i / 20 * Math.PI;
      lidPoints.push(new THREE.Vector3(Math.cos(angle)*0.116, Math.sin(angle)*0.142, 0.007));
    }
    mesh('SoftUpperEyelid', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lidPoints), 20, 0.009, 8, false), paint.yellow, eye);
    const blush = curvedEllipse('WarmCheekTint', head, paint.blush, [side * 0.39, -0.12], [0.13, 0.095], headFront, 0.004,
      ['#f2b453', '#ffcc42'], 0.8);
    blush.castShadow = false;
  }
  // A small relaxed grin: the broad cheek geometry carries the expression,
  // rather than an oversized open mouth or a separate protruding muzzle.
  const smile = new THREE.Shape();
  smile.moveTo(-0.106, -0.184);
  smile.bezierCurveTo(-0.047, -0.205, 0.041, -0.205, 0.108, -0.180);
  smile.bezierCurveTo(0.098, -0.224, 0.060, -0.258, 0.006, -0.258);
  smile.bezierCurveTo(-0.047, -0.258, -0.089, -0.231, -0.106, -0.184);
  curvedShape('SmallGentleSmile', head, paint.mouth, smile, headFront, 0.007);
  const tongue = new THREE.Shape();
  tongue.moveTo(-0.049, -0.248);
  tongue.quadraticCurveTo(0.011, -0.225, 0.063, -0.246);
  tongue.quadraticCurveTo(0.008, -0.261, -0.049, -0.248);
  curvedShape('LittleSoftTongue', head, paint.tongue, tongue, headFront, 0.010);
  const tooth = new THREE.Shape();
  tooth.moveTo(0.055, -0.197); tooth.lineTo(0.086, -0.188);
  tooth.lineTo(0.082, -0.211); tooth.quadraticCurveTo(0.064, -0.216, 0.057, -0.207);
  tooth.closePath();
  curvedShape('TinyMilkTooth', head, paint.highlight, tooth, headFront, 0.011);

  const tail = group('DragonTail', root, [0, 0.37, -0.32]);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.035, -0.065, -0.20),
    new THREE.Vector3(-0.19, -0.035, -0.38), new THREE.Vector3(-0.36, 0.09, -0.44),
    new THREE.Vector3(-0.40, 0.235, -0.385),
  ]);
  const tailGeometry = new THREE.TubeGeometry(curve, 24, 0.205, 16, false);
  const tailPositions = tailGeometry.attributes.position;
  for (let i = 0; i <= 24; i++) {
    const center = curve.getPointAt(i / 24), taper = 1 - Math.pow(i / 24, 1.4) * 0.78;
    for (let j = 0; j <= 16; j++) {
      const index = i * 17 + j;
      const point = new THREE.Vector3().fromBufferAttribute(tailPositions, index).sub(center).multiplyScalar(taper).add(center);
      tailPositions.setXYZ(index, point.x, point.y, point.z);
    }
  }
  tailGeometry.computeVertexNormals();
  mesh('ShortPlumpCurledTail', tailGeometry, paint.yellow, tail);
  oval('SoftTailTip', tail, paint.yellow, [-0.40, 0.235, -0.385], [0.048, 0.055, 0.048], 16);
  oval('SoftTailRootFin', tail, paint.orange, [-0.025, 0.13, -0.12], [0.07, 0.09, 0.11], 20);
  oval('SoftTailTipFin', tail, paint.orange, [-0.17, 0.11, -0.34], [0.055, 0.065, 0.085], 20);

  for (const side of [-1, 1]) {
    const leg = group(side < 0 ? 'DragonLeftLeg' : 'DragonRightLeg', root, [side * 0.29, 0.21, 0.035]);
    oval('VeryShortLeg', leg, paint.yellow, [0, 0.018, -0.025], [0.21, 0.185, 0.22], 28);
    oval('SoftRoundFoot', leg, paint.yellow, [0, -0.075, 0.13], [0.235, 0.135, 0.275], 28);
    for (const toe of [-1, 0, 1]) oval('SmallWarmToe', leg, paint.claw, [toe * 0.083, -0.128, 0.372 - Math.abs(toe)*0.015], [0.025, 0.019, 0.028], 16);
  }

  const leftArm = group('DragonLeftArm', torso, [-0.48, 0.31, 0.02]);
  const rightArm = group('DragonRightArm', torso, [0.49, 0.35, 0.02]);
  softArm('RightBentArm', rightArm, [[-0.035, 0, -0.045], [0.05, -0.06, 0.14], [0.055, -0.01, 0.35]], 0.125);
  oval('RightHoldingHand', rightArm, paint.yellow, [0.055, 0.005, 0.38], [0.145, 0.135, 0.15], 28);
  // The free hand cups the firing wrist, instead of reaching along a long barrel.
  softArm('LeftSupportingArm', leftArm, [[0, 0, 0], [0.10, -0.18, 0.34], [0.45, -0.11, 0.61], [0.91, 0.02, 0.47]], 0.12);
  oval('LeftSupportingHand', leftArm, paint.yellow, [0.91, 0.02, 0.47], [0.145, 0.13, 0.14], 28);
  group('weapon_socket', rightArm, [0.055, 0.025, 0.41]);

  // A little front kerchief leaves the continuous back silhouette unobstructed.
  // The old thick belt around the neck made the body read as two stacked pills.
  const scarfShape = new THREE.Shape();
  scarfShape.moveTo(-0.275, 0.43);
  scarfShape.quadraticCurveTo(0, 0.345, 0.275, 0.43);
  scarfShape.lineTo(0.025, 0.17);
  scarfShape.quadraticCurveTo(-0.015, 0.15, -0.055, 0.20);
  scarfShape.closePath();
  curvedShape('ClearBlueTriangleScarf', torso, paint.blue, scarfShape, dragonFront, 0.009);
  const knot = oval('ScarfKnot', torso, paint.blueLight, [-0.49, 0.40, 0.37], [0.075, 0.065, 0.065]);
  knot.rotation.z = -0.35;
  const flap = oval('ScarfSideTail', torso, paint.blue, [-0.56, 0.30, 0.32], [0.065, 0.13, 0.028]);
  flap.rotation.z = -0.55;

  const idleTimes = [0, 1.2, 2.4];
  const walkTimes = [0, 0.16, 0.32, 0.48, 0.64];
  const idle = new THREE.AnimationClip('Idle', 2.4, [
    positionTrack('DragonTorso', idleTimes, [[0, 0.83, 0], [0, 0.849, 0], [0, 0.83, 0]]),
    quaternionTrack('DragonHead', idleTimes, [[0, 0, -0.012], [0.010, 0, 0.012], [0, 0, -0.012]]),
    quaternionTrack('DragonTail', idleTimes, [[0, -0.035, 0], [0, 0.065, 0], [0, -0.035, 0]]),
    quaternionTrack('DragonLeftLeg', idleTimes, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    quaternionTrack('DragonRightLeg', idleTimes, [[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    quaternionTrack('DragonLeftArm', idleTimes, [[0.15, 0, 0.015], [0.137, 0, 0.005], [0.15, 0, 0.015]]),
    quaternionTrack('DragonRightArm', idleTimes, [[0.24, -0.025, -0.015], [0.225, -0.025, -0.005], [0.24, -0.025, -0.015]]),
  ]);
  const walk = new THREE.AnimationClip('Walk', 0.64, [
    positionTrack('DragonTorso', walkTimes, [[0, 0.84, 0], [0, 0.878, 0], [0, 0.84, 0], [0, 0.878, 0], [0, 0.84, 0]]),
    quaternionTrack('DragonHead', walkTimes, [[0.015, 0, -0.02], [0, 0, 0], [0.015, 0, 0.02], [0, 0, 0], [0.015, 0, -0.02]]),
    quaternionTrack('DragonTail', walkTimes, [[0, -0.12, 0], [0, 0, 0], [0, 0.12, 0], [0, 0, 0], [0, -0.12, 0]]),
    quaternionTrack('DragonLeftLeg', walkTimes, [[0.29, 0, 0], [0, 0, 0], [-0.29, 0, 0], [0, 0, 0], [0.29, 0, 0]]),
    quaternionTrack('DragonRightLeg', walkTimes, [[-0.29, 0, 0], [0, 0, 0], [0.29, 0, 0], [0, 0, 0], [-0.29, 0, 0]]),
    quaternionTrack('DragonLeftArm', walkTimes, [[0.125, 0, 0.01], [0.15, 0, 0.015], [0.175, 0, 0.02], [0.15, 0, 0.015], [0.125, 0, 0.01]]),
    quaternionTrack('DragonRightArm', walkTimes, [[0.265, -0.025, -0.01], [0.24, -0.025, -0.015], [0.215, -0.025, -0.02], [0.24, -0.025, -0.015], [0.265, -0.025, -0.01]]),
  ]);
  const aim = new THREE.AnimationClip('Aim', 0.30, [
    quaternionTrack('DragonRightArm', [0, 0.15, 0.30], [[0.24, -0.025, -0.015], [0.05, -0.025, -0.018], [-0.10, -0.025, -0.02]]),
    quaternionTrack('DragonLeftArm', [0, 0.15, 0.30], [[0.15, 0, 0.015], [0.035, 0, 0.01], [-0.08, 0, 0.005]]),
  ]);
  const shoot = new THREE.AnimationClip('Shoot', 0.22, [
    quaternionTrack('DragonRightArm', [0, 0.04, 0.10, 0.22], [[-0.10, -0.025, -0.02], [-0.30, -0.025, -0.02], [-0.17, -0.025, -0.02], [-0.10, -0.025, -0.02]]),
    quaternionTrack('DragonLeftArm', [0, 0.04, 0.10, 0.22], [[-0.08, 0, 0.005], [-0.18, 0, 0.005], [-0.12, 0, 0.005], [-0.08, 0, 0.005]]),
    positionTrack('weapon_socket', [0, 0.04, 0.10, 0.22], [[0.055, 0.025, 0.41], [0.055, 0.025, 0.365], [0.055, 0.025, 0.39], [0.055, 0.025, 0.41]]),
  ]);
  return { root, animations: [idle, walk, aim, shoot] };
}

function makeGun() {
  return { root: createPulseBlaster() };
}

function makeTarget() {
  const root = group('GardenTarget');
  root.userData = { faceNormal: '+Z', bullseye: [0, 1.25, 0.118], hitRadius: 0.56 };
  box('TargetUpright', root, paint.woodEdge, [0, 0.63, -0.06], [0.13, 1.26, 0.15]);
  for (const side of [-1, 1]) {
    const leg = box('TargetFrontLeg', root, paint.woodDark, [side * 0.23, 0.23, 0.015], [0.12, 0.52, 0.16]);
    leg.rotation.z = side * -0.40;
  }
  const rearLeg = box('TargetRearLeg', root, paint.woodDark, [0, 0.31, -0.28], [0.12, 0.69, 0.13]);
  rearLeg.rotation.x = -0.53;
  cylinder('TargetThickDisk', root, paint.woodLight, [0, 1.25, 0], 0.575, 0.14, 'z', 0.575, 48);
  cylinder('TargetFaceCoral', root, paint.targetRed, [0, 1.25, 0.076], 0.55, 0.012, 'z', 0.55, 48);
  cylinder('OuterCreamCircle', root, paint.targetWhite, [0, 1.25, 0.085], 0.425, 0.012, 'z', 0.425, 48);
  cylinder('MiddleCoralCircle', root, paint.targetRed, [0, 1.25, 0.094], 0.295, 0.012, 'z', 0.295, 48);
  cylinder('InnerCreamCircle', root, paint.targetWhite, [0, 1.25, 0.103], 0.17, 0.012, 'z', 0.17, 40);
  cylinder('CoralBullseye', root, paint.targetRed, [0, 1.25, 0.112], 0.065, 0.012, 'z', 0.065, 32);
  return { root };
}

function makeCrate() {
  const root = group('GardenCrate');
  root.userData = { bounds: [1.3, 1.3, 1.3] };
  box('CrateCore', root, paint.woodDark, [0, 0.65, 0], [1.21, 1.21, 1.21], 0.025);
  for (let side = 0; side < 4; side++) {
    const face = group(`CrateFace${side}`, root, [0, 0.65, 0]);
    face.rotation.y = side * Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      box('VerticalWoodPlank', face, i % 2 ? paint.wood : paint.woodLight, [(i - 2) * 0.234, 0, 0.608], [0.224, 1.14, 0.04], 0.005);
    }
    for (const sign of [-1, 1]) {
      box('HorizontalFrameBeam', face, paint.woodEdge, [0, sign * 0.565, 0.626], [1.3, 0.17, 0.048], 0.008);
      box('VerticalFrameBeam', face, paint.woodEdge, [sign * 0.565, 0, 0.626], [0.17, 1.13, 0.048], 0.008);
      const brace = box('DiagonalBrace', face, paint.wood, [0, 0, 0.635], [0.115, 1.42, 0.03], 0.008);
      brace.rotation.z = sign * Math.PI / 4;
      for (const end of [-1, 1]) oval('SmallWoodenPeg', face, paint.brass, [end * 0.555, sign * 0.565, 0.651], [0.012, 0.012, 0.006], 12);
    }
  }
  for (let i = 0; i < 5; i++) box('TopWoodPlank', root, i % 2 ? paint.woodLight : paint.wood, [(i - 2) * 0.23, 1.235, 0], [0.222, 0.030, 1.12], 0.004);
  for (const sign of [-1, 1]) {
    box('TopFrameLongEdge', root, paint.woodEdge, [sign * 0.565, 1.275, 0], [0.17, 0.05, 1.30], 0.008);
    box('TopFrameShortEdge', root, paint.woodEdge, [0, 1.275, sign * 0.565], [1.13, 0.05, 0.17], 0.008);
    const brace = box('TopDiagonalBrace', root, paint.wood, [0, 1.273, 0], [0.11, 0.038, 1.40], 0.008);
    brace.rotation.y = sign * Math.PI / 4;
    for (const end of [-1, 1]) oval('TopSmallWoodenPeg', root, paint.brass, [sign * 0.565, 1.303, end * 0.565], [0.012, 0.006, 0.012], 12);
  }
  return { root };
}

function makeWall() {
  const root = group('GardenWall');
  root.userData = { width: 4.02, height: 1.24, depth: 0.46 };
  box('BroadCreamWall', root, paint.stone, [0, 0.56, 0], [4.0, 1.12, 0.40], 0.025);
  box('SimpleWarmWallCap', root, paint.stoneCap, [0, 1.17, 0], [4.02, 0.14, 0.46], 0.024);
  // Broad quiet plaster-like faces, with only two narrow vertical joins.
  for (const sign of [-1, 1]) {
    for (const face of [-1, 1]) box('FineVerticalWallJoin', root, paint.stoneSide, [sign * 0.67, 0.55, face * 0.201], [0.012, 1.06, 0.004], 0.001);
  }
  return { root };
}

function flower(parent, position, size = 0.16, rotation = 0) {
  const bloom = group(`Flower${++unique}`, parent, position);
  bloom.rotation.x = -0.35;
  bloom.rotation.z = rotation;
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const petal = oval('FlowerPetal', bloom, paint.flower, [Math.sin(angle) * size * 0.63, Math.cos(angle) * size * 0.63, 0], [size * 0.38, size * 0.55, size * 0.16], 12);
    petal.rotation.z = -angle;
  }
  oval('FlowerCenter', bloom, paint.flowerCenter, [0, 0, size * 0.12], [size * 0.32, size * 0.32, size * 0.18], 16);
}

function makeTree() {
  const root = group('GardenTree');
  cylinder('TreeTrunk', root, paint.trunk, [0, 0.85, 0], 0.13, 1.7, 'y', 0.22, 10);
  const branch = cylinder('TreeBranch', root, paint.trunk, [0.25, 1.40, 0.04], 0.065, 0.8, 'y', 0.10, 8);
  branch.rotation.z = -0.55;
  leafBall('MainCanopy', root, paint.leaf, [0, 2.15, 0], [1.04, 1.18, 0.95], 2);
  leafBall('SunlitCanopy', root, paint.leafLight, [0.57, 2.26, -0.11], [0.65, 0.79, 0.70], 1);
  leafBall('ShadowCanopy', root, paint.leafDark, [-0.60, 1.97, -0.09], [0.67, 0.74, 0.68], 1);
  leafBall('FrontCanopy', root, paint.leaf, [0.15, 1.82, 0.51], [0.75, 0.67, 0.67], 1);
  flower(root, [-0.33, 2.35, 0.91], 0.18, 0.22);
  flower(root, [0.68, 1.99, 0.69], 0.12, -0.2);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const leaf = oval('TrunkBaseLeaf', root, paint.leafLight, [Math.sin(angle) * 0.25, 0.15, Math.cos(angle) * 0.25], [0.10, 0.27, 0.055], 12);
    leaf.rotation.z = Math.sin(angle) * -0.45;
    leaf.rotation.x = Math.cos(angle) * 0.45;
  }
  return { root };
}

function makeBush() {
  const root = group('GardenBush');
  leafBall('BushMain', root, paint.leaf, [0, 0.49, 0], [0.71, 0.55, 0.58], 2);
  leafBall('BushLeft', root, paint.leafLight, [-0.48, 0.35, 0.04], [0.43, 0.39, 0.40], 1);
  leafBall('BushRight', root, paint.leafDark, [0.47, 0.39, -0.05], [0.45, 0.43, 0.40], 1);
  flower(root, [-0.22, 0.64, 0.51], 0.15, -0.15);
  flower(root, [0.42, 0.48, 0.39], 0.11, 0.3);
  return { root };
}

function makeRock() {
  const root = group('GardenRock');
  const rock = leafBall('RoundedStone', root, paint.rock, [0, 0.32, 0], [0.66, 0.39, 0.49], 1);
  rock.rotation.set(0.05, 0.24, -0.12);
  leafBall('SmallSideStone', root, paint.rock, [0.45, 0.12, 0.17], [0.24, 0.19, 0.23], 0);
  const bounds = new THREE.Box3().setFromObject(root, true);
  root.children.forEach(child => { child.position.y -= bounds.min.y; });
  return { root };
}

async function exportAsset(name, asset) {
  const { root, animations = [] } = asset;
  // Bake only non-animated assets by material; named mounting nodes stay intact.
  // Each crate or wall then costs a handful of draws rather than dozens.
  if (animations.length === 0) {
    root.updateMatrixWorld(true);
    const batches = new Map();
    const originalMeshes = [];
    root.traverse(object => {
      if (!object.isMesh) return;
      originalMeshes.push(object);
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      const key = object.material.uuid;
      if (!batches.has(key)) batches.set(key, { material: object.material, geometries: [] });
      batches.get(key).geometries.push(geometry);
    });
    originalMeshes.forEach(object => object.removeFromParent());
    for (const batch of batches.values()) {
      const combined = mergeGeometries(batch.geometries, false);
      if (!combined) throw new Error(`Could not batch geometry for ${name}`);
      mesh(`Batched_${batch.material.name}`, mergeVertices(combined, 1e-5), batch.material, root);
    }
  }
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(root, { binary: true, animations, trs: true, onlyVisible: false });
  if (!(buffer instanceof ArrayBuffer)) throw new Error(`Expected binary GLB for ${name}`);
  const path = resolve(output, name);
  await writeFile(path, Buffer.from(buffer));
  const bytes = await readFile(path);
  if (bytes.toString('utf8', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB header: ${name}`);
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`Missing JSON chunk: ${name}`);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  if (json.buffers?.some(buffer => buffer.uri)) throw new Error(`${name} contains an external buffer`);
  if (json.images?.length) throw new Error(`${name} unexpectedly requires image assets`);
  const nodeNames = json.nodes.map(node => node.name).filter(Boolean);
  if (new Set(nodeNames).size !== nodeNames.length) throw new Error(`Duplicate node names in ${name}`);
  for (const animation of json.animations ?? []) {
    for (const channel of animation.channels) {
      if (!json.nodes[channel.target.node]) throw new Error(`Missing animation node in ${name}`);
    }
  }
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  if (!loaded.scene || loaded.animations.length !== animations.length) throw new Error(`GLTFLoader round-trip failed: ${name}`);
  if (name === 'nailong.glb') {
    if (!loaded.scene.getObjectByName('weapon_socket')) throw new Error('Missing weapon_socket');
    const mixer = new THREE.AnimationMixer(loaded.scene);
    for (const clip of loaded.animations) {
      mixer.stopAllAction();
      mixer.clipAction(clip).play();
      mixer.update(0.21);
      const bounds = new THREE.Box3().setFromObject(loaded.scene);
      if (![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) throw new Error(`Invalid animated bounds for ${clip.name}`);
    }
  }
  if (name === 'bubble-gun.glb' && !loaded.scene.getObjectByName('muzzle')) throw new Error('Missing muzzle node');
  console.log(`${name}: ${(bytes.length / 1024).toFixed(1)} KiB; ${json.meshes.length} meshes; size ${size.toArray().map(v => v.toFixed(2)).join(' × ')}; animations ${(json.animations ?? []).map(a => a.name).join(', ') || 'none'}`);
  return { name, bytes: bytes.length, meshes: json.meshes.length, size: size.toArray().map(v => Number(v.toFixed(3))), animations: (json.animations ?? []).map(a => a.name), nodes: nodeNames.length };
}

await mkdir(output, { recursive: true });
const manifest = [];
for (const [name, factory] of [
  ['nailong.glb', makeDragon], ['bubble-gun.glb', makeGun], ['target.glb', makeTarget],
  ['crate.glb', makeCrate], ['wall-segment.glb', makeWall], ['tree.glb', makeTree],
  ['bush.glb', makeBush], ['rock.glb', makeRock],
]) manifest.push(await exportAsset(name, factory()));
await writeFile(resolve(output, 'asset-info.json'), `${JSON.stringify({ generator: 'scripts/generate-assets.mjs', units: 'metres', up: '+Y', assets: manifest }, null, 2)}\n`);
