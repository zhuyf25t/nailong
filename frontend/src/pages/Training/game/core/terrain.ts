import * as THREE from 'three';
import { MOUNTAIN_RISE_WIDTH, WORLD_TERRAIN_HALF_SIZE, mountainBoundaryRadius, mountainCrestHeight, valleyPathDistance } from './worldLayout.ts';
import type { TerrainConfig } from '../../../../objects/training/TerrainConfig';
export type { TerrainConfig } from '../../../../objects/training/TerrainConfig';

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = {
  hillHeight: 2.25,
  hillWidth: 5.4,
  hillX: 6,
  hillZ: -4,
  ripple: 0.28,
};

export const TERRAIN_HALF_SIZE = WORLD_TERRAIN_HALF_SIZE;
export const TERRAIN_SEGMENTS = 128;
const ROW = TERRAIN_SEGMENTS + 1;
const CORE_HALF_SIZE = 16;
const CORE_STEP = 0.5;
const OUTER_STEP = 2;
const OUTER_CELLS = (TERRAIN_HALF_SIZE - CORE_HALF_SIZE) / OUTER_STEP;
const CORE_CELLS = CORE_HALF_SIZE * 2 / CORE_STEP;

// Keep the established shooting area at 0.5 m resolution. Outside it, 2 m cells
// describe broad hills and mountain walls without multiplying the triangle budget.
function axisPosition(index: number) {
  if (index < OUTER_CELLS) return -TERRAIN_HALF_SIZE + index * OUTER_STEP;
  if (index <= OUTER_CELLS + CORE_CELLS) return -CORE_HALF_SIZE + (index - OUTER_CELLS) * CORE_STEP;
  return CORE_HALF_SIZE + (index - OUTER_CELLS - CORE_CELLS) * OUTER_STEP;
}

function axisCoordinate(value: number) {
  const coordinate = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, -TERRAIN_HALF_SIZE, TERRAIN_HALF_SIZE);
  if (coordinate < -CORE_HALF_SIZE) return (coordinate + TERRAIN_HALF_SIZE) / OUTER_STEP;
  if (coordinate <= CORE_HALF_SIZE) return OUTER_CELLS + (coordinate + CORE_HALF_SIZE) / CORE_STEP;
  return OUTER_CELLS + CORE_CELLS + (coordinate - CORE_HALF_SIZE) / OUTER_STEP;
}

function finiteClamp(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
}

function smoothstep(min: number, max: number, value: number) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

/** One sampled height field supplies both the visible triangles and collision queries. */
export function createTerrain() {
  const config = { ...DEFAULT_TERRAIN_CONFIG };
  const positions = new Float32Array(ROW * ROW * 3);
  const colors = new Float32Array(ROW * ROW * 3);
  const heights = new Float32Array(ROW * ROW);
  const indices: number[] = [];
  for (let row = 0; row < TERRAIN_SEGMENTS; row++) {
    for (let col = 0; col < TERRAIN_SEGMENTS; col++) {
      const a = row * ROW + col;
      // The cell diagonal is b--c. Query interpolation below uses exactly these triangles.
      indices.push(a, a + ROW, a + 1, a + 1, a + ROW, a + ROW + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'SharedHeightfieldTerrain';
  mesh.receiveShadow = true;

  function heightFunction(x: number, z: number) {
    const distanceToSpawn = Math.hypot(x, z - 4);
    const keepSpawnFlat = smoothstep(2.1, 4.7, distanceToSpawn);
    const hillDistance = ((x - config.hillX) ** 2 + (z - config.hillZ) ** 2) / config.hillWidth ** 2;
    const hill = config.hillHeight * Math.exp(-hillDistance);
    const ripple = config.ripple * (Math.sin(x * 0.37) * Math.cos(z * 0.28) + 0.2);
    const radius = Math.hypot(x, z);
    // Low rolling hills leave long sight lines and a gentle route into the valley.
    const explorationBlend = smoothstep(14, 23, radius);
    const rolling = 1.5 + 1.2 * Math.sin(x * 0.085 + 0.3) * Math.cos(z * 0.1)
      + 2.3 * Math.exp(-(((x + 25) / 12) ** 2 + ((z + 10) / 18) ** 2))
      + 1.9 * Math.exp(-(((x - 27) / 13) ** 2 + ((z - 18) / 11) ** 2));
    const angle = Math.atan2(x, z);
    const foot = mountainBoundaryRadius(angle);
    const ascent = smoothstep(foot, foot + MOUNTAIN_RISE_WIDTH, radius);
    // This is part of the collision mesh, not decorative scenery. Even the lowest
    // pass is a tall, steep wall; beyond the crest the mesh continues under the backdrop.
    const mountain = mountainCrestHeight(angle) * ascent
      * (1 - 0.2 * smoothstep(foot + MOUNTAIN_RISE_WIDTH + 3, foot + MOUNTAIN_RISE_WIDTH + 26, radius));
    return (hill + ripple) * keepSpawnFlat + rolling * explorationBlend + mountain;
  }

  const lightGrass = new THREE.Color('#86aa69');
  const darkGrass = new THREE.Color('#63814e');
  const pathColor = new THREE.Color('#c8bd91');
  const rockColor = new THREE.Color('#95988b');
  const crestColor = new THREE.Color('#b9bbb0');
  const color = new THREE.Color();
  function update(next: TerrainConfig) {
    Object.assign(config, {
      hillHeight: finiteClamp(next.hillHeight, DEFAULT_TERRAIN_CONFIG.hillHeight, 0, 4),
      hillWidth: finiteClamp(next.hillWidth, DEFAULT_TERRAIN_CONFIG.hillWidth, 2.5, 9),
      hillX: finiteClamp(next.hillX, DEFAULT_TERRAIN_CONFIG.hillX, -8, 8),
      hillZ: finiteClamp(next.hillZ, DEFAULT_TERRAIN_CONFIG.hillZ, -8, 8),
      ripple: finiteClamp(next.ripple, DEFAULT_TERRAIN_CONFIG.ripple, 0, 0.8),
    });
    for (let row = 0; row < ROW; row++) {
      for (let col = 0; col < ROW; col++) {
        const i = row * ROW + col;
        const x = axisPosition(col);
        const z = axisPosition(row);
        heights[i] = heightFunction(x, z);
        positions[i * 3] = x;
        positions[i * 3 + 1] = heights[i];
        positions[i * 3 + 2] = z;
        const patch = (Math.sin(x * 0.42 + Math.cos(z * 0.38)) * Math.cos(z * 0.31) + 1) / 2;
        color.copy(lightGrass).lerp(darkGrass, patch * 0.45);
        const outerPath = smoothstep(12, 24, Math.abs(z));
        const path = Math.exp(-((valleyPathDistance(x, z) / (0.9 + outerPath * 0.65)) ** 2))
          * (1 - smoothstep(39, 45, Math.hypot(x, z)));
        color.lerp(pathColor, path * 0.72);
        const mountainHeight = smoothstep(5, 18, heights[i]);
        color.lerp(rockColor, mountainHeight * (0.72 + patch * 0.16));
        color.lerp(crestColor, smoothstep(29, 43, heights[i]) * 0.62);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const rockySlope = 1 - smoothstep(0.52, 0.87, normals.getY(i));
      color.fromArray(colors, i * 3).lerp(rockColor, rockySlope * 0.65);
      color.toArray(colors, i * 3);
    }
    geometry.attributes.color.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  function cellAt(x: number, z: number) {
    const gx = axisCoordinate(x);
    const gz = axisCoordinate(z);
    const col = Math.min(TERRAIN_SEGMENTS - 1, Math.floor(gx));
    const row = Math.min(TERRAIN_SEGMENTS - 1, Math.floor(gz));
    const index = row * ROW + col;
    return {
      a: heights[index], b: heights[index + 1], c: heights[index + ROW], d: heights[index + ROW + 1],
      u: gx - col, v: gz - row,
      width: axisPosition(col + 1) - axisPosition(col), depth: axisPosition(row + 1) - axisPosition(row),
    };
  }

  function sampleHeight(x: number, z: number) {
    const { a, b, c, d, u, v } = cellAt(x, z);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  function normalAt(x: number, z: number) {
    const { a, b, c, d, u, v, width, depth } = cellAt(x, z);
    return u + v <= 1
      ? new THREE.Vector3(-(b - a) / width, 1, -(c - a) / depth).normalize()
      : new THREE.Vector3(-(d - c) / width, 1, -(d - b) / depth).normalize();
  }

  update(config);
  return { mesh, config, update, sampleHeight, normalAt, setWireframe: (value: boolean) => { material.wireframe = value; } };
}

export type Terrain = ReturnType<typeof createTerrain>;
