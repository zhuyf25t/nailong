import * as THREE from 'three';

type HeightSampler = (x: number, z: number) => number;

/** Hand-painted-style clusters of color, generated as a tileable texture in code. */
export function createGroundTintTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number, period: number) => {
    const n = Math.sin(((x % period + period) % period) * 127.1 + ((y % period + period) % period) * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x: number, y: number, frequency: number) => {
    const px = x / size * frequency, py = y / size * frequency;
    const ix = Math.floor(px), iy = Math.floor(py);
    let tx = px - ix, ty = py - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy, frequency), hash(ix + 1, iy, frequency), tx), THREE.MathUtils.lerp(hash(ix, iy + 1, frequency), hash(ix + 1, iy + 1, frequency), tx), ty);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mottling = noise(x, y, 3) * 0.65 + noise(x, y, 11) * 0.3 + noise(x, y, 31) * 0.05;
      const patch = THREE.MathUtils.smoothstep(mottling, 0.25, 0.78);
      const i = (y * size + x) * 4;
      data[i] = 235 + patch * 12; data[i + 1] = 244 + patch * 7; data[i + 2] = 217 + patch * 12; data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/** Soft object-to-ground contact. The subdivided decal follows the editable height field. */
export function createContactShadows(scene: THREE.Scene, sampleHeight: HeightSampler) {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const alpha = (1 - THREE.MathUtils.smoothstep(distance, 0.05, 1)) ** 1.5;
    const i = (y * size + x) * 4;
    pixels[i] = 50; pixels[i + 1] = 77; pixels[i + 2] = 40; pixels[i + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(pixels, size, size); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  const decals: Array<{ mesh: THREE.Mesh; x: number; z: number; width: number; depth: number; rotation: number }> = [];
  function add(x: number, z: number, width: number, depth: number, opacity = 0.24, rotation = 0) {
    const geometry = new THREE.PlaneGeometry(width, depth, 8, 8); geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'SoftGroundContact'; mesh.renderOrder = 1; scene.add(mesh);
    decals.push({ mesh, x, z, width, depth, rotation });
  }
  function updateGround() {
    for (const { mesh, x, z, width, depth, rotation } of decals) {
      const position = mesh.geometry.getAttribute('position');
      for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
        const lx = (col / 8 - 0.5) * width, lz = (row / 8 - 0.5) * depth;
        const px = x + lx * Math.cos(rotation) + lz * Math.sin(rotation);
        const pz = z - lx * Math.sin(rotation) + lz * Math.cos(rotation);
        position.setXYZ(row * 9 + col, px, sampleHeight(px, pz) + 0.018, pz);
      }
      position.needsUpdate = true; mesh.geometry.computeBoundingSphere();
    }
  }
  return { add, updateGround };
}

