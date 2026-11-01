import * as THREE from 'three';

const TAU = Math.PI * 2;

function smoothstep(a: number, b: number, value: number) {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

/** Coherent noise keeps ridgelines irregular without the silhouette of stacked spheres. */
function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const tx = smoothstep(0, 1, x - ix), tz = smoothstep(0, 1, z - iz);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), tx),
    THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), tx),
    tz,
  );
}

function terrainNoise(x: number, z: number) {
  return noise(x, z) * 0.58 + noise(x * 2.03 + 13, z * 2.03 - 8) * 0.28
    + noise(x * 4.11 - 3, z * 4.11 + 11) * 0.14;
}

function angleDistance(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

interface RidgeSettings {
  name: string;
  inner: number;
  outer: number;
  height: number;
  seed: number;
  light: string;
  shade: string;
  haze: string;
}

function createRidge(settings: RidgeSettings) {
  // Walkable foothills and the enclosing mountains now belong to the shared
  // terrain mesh. Only two permanently distant silhouettes remain decorative.
  const angularSegments = settings.inner < 120 ? 80 : 64;
  const radialSegments = settings.inner < 120 ? 12 : 10;
  const rowSize = angularSegments + 1;
  const positions = new Float32Array(rowSize * (radialSegments + 1) * 3);
  const colors = new Float32Array(positions.length);
  const indices: number[] = [];

  for (let row = 0; row <= radialSegments; row++) {
    const t = row / radialSegments;
    for (let col = 0; col <= angularSegments; col++) {
      const angle = col / angularSegments * TAU;
      const sine = Math.sin(angle), cosine = Math.cos(angle);
      const radius = THREE.MathUtils.lerp(settings.inner, settings.outer, t);
      const x = sine * radius, z = cosine * radius;
      const n = terrainNoise(x * 0.034 + settings.seed, z * 0.034 - settings.seed);
      const ridgePosition = 0.47 + Math.sin(angle * 3 + settings.seed) * 0.11
        + Math.sin(angle * 7 - settings.seed) * 0.045;
      const ridgeWidth = 0.2 + 0.045 * Math.sin(angle * 5 + settings.seed);
      const crest = Math.exp(-(((t - ridgePosition) / ridgeWidth) ** 2));
      const ridged = 0.68 + 0.25 * Math.sin(angle * 3.0 + settings.seed)
        + 0.13 * Math.sin(angle * 7.0 - settings.seed * 0.6)
        + 0.06 * Math.sin(angle * 13.0 + settings.seed);
      // The initial -Z view opens down a valley; flanking peaks frame it, rather than wall it off.
      const front = Math.exp(-((angleDistance(angle, Math.PI + 0.04) / 0.38) ** 2));
      const valley = 1 - front * 0.3;
      const edge = smoothstep(0, 0.16, t) * (1 - smoothstep(0.82, 1, t));
      let y = -2.2 + settings.height * crest * (0.38 + n * 0.82) * ridged * valley;
      y += (n - 0.4) * settings.height * 0.13 * edge;

      const index = (row * rowSize + col) * 3;
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
    }
  }

  for (let row = 0; row < radialSegments; row++) {
    for (let col = 0; col < angularSegments; col++) {
      const a = row * rowSize + col, b = a + rowSize;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const sunny = new THREE.Color(settings.light);
  const shady = new THREE.Color(settings.shade);
  const haze = new THREE.Color(settings.haze);
  const lightDirection = new THREE.Vector3(-0.5, 0.82, 0.3).normalize();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < normals.count; i++) {
    const x = positions[i * 3], z = positions[i * 3 + 2];
    normal.fromBufferAttribute(normals, i);
    const lighting = THREE.MathUtils.clamp(normal.dot(lightDirection) * 0.65 + 0.28, 0, 1);
    const meadowPatch = terrainNoise(x * 0.055 + 3, z * 0.055) * 0.1;
    color.copy(shady).lerp(sunny, Math.min(1, lighting + meadowPatch));
    const distance = Math.hypot(x, z);
    color.lerp(haze, smoothstep(settings.inner, settings.outer, distance) * 0.2);
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }

  // Baked broad lighting keeps distant land readable under changes to the close-up game lights.
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const ridge = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  ridge.name = settings.name;
  return ridge;
}

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      zenith: { value: new THREE.Color('#77b9dc') },
      horizon: { value: new THREE.Color('#d4e4dd') },
      lowSky: { value: new THREE.Color('#c1d6cb') },
      cloudLight: { value: new THREE.Color('#fffdf2') },
      cloudShade: { value: new THREE.Color('#c5dbe3') },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 lowSky;
      uniform vec3 cloudLight;
      uniform vec3 cloudShade;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
                   mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), f.x), f.y);
      }
      float cloudNoise(vec2 p) {
        float n = noise(p) * .55;
        p = mat2(1.62, 1.18, -1.18, 1.62) * p + 3.7;
        n += noise(p) * .26;
        p = mat2(1.62, 1.18, -1.18, 1.62) * p + 3.7;
        n += noise(p) * .13;
        n += noise(p * 2.03 + 8.2) * .06;
        return n;
      }
      void main() {
        vec3 direction = normalize(vDirection);
        float elevation = direction.y;
        vec3 sky = mix(horizon, zenith, pow(max(elevation, 0.0), .52));
        sky = mix(lowSky, sky, smoothstep(-.16, .035, elevation));

        // Project a continuous cloud sheet over the hemisphere: no billboards or sphere clouds.
        vec2 cloudUV = direction.xz / max(elevation + .23, .08) * 1.7 + vec2(3.2, 8.4);
        float density = cloudNoise(cloudUV);
        float coverage = smoothstep(.52, .71, density);
        coverage *= smoothstep(.025, .10, elevation) * (1.0 - smoothstep(.64, .94, elevation));
        float lightEdge = smoothstep(.53, .78, cloudNoise(cloudUV + vec2(-.12, .09)));
        vec3 cloud = mix(cloudShade, cloudLight, .45 + lightEdge * .55);
        sky = mix(sky, cloud, coverage * .92);

        vec3 sunDirection = normalize(vec3(-.45, .7, .35));
        float glow = pow(max(dot(direction, sunDirection), 0.0), 24.0) * .08;
        sky = mix(sky, cloudLight, glow);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(235, 32, 20), material);
  sky.name = 'MeadowGradientSky';
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  // Follow translation only, so the sky remains infinite and clouds stay fixed in world headings.
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    camera.getWorldPosition(sky.position);
    sky.updateMatrixWorld();
  };
  return sky;
}

/** Low-density far silhouettes; the visible enclosing boundary is the collidable terrain. */
export function addMeadowBackdrop(scene: THREE.Scene): void {
  if (scene.getObjectByName('MeadowBackdrop')) return;
  const root = new THREE.Group();
  root.name = 'MeadowBackdrop';
  root.add(createSky());
  root.add(createRidge({
    name: 'MeadowMiddleRidges', inner: 78, outer: 172, height: 94, seed: 6.4,
    light: '#839c98', shade: '#5e7b83', haze: '#bad2ca',
  }));
  root.add(createRidge({
    name: 'MeadowDistantMountains', inner: 138, outer: 228, height: 118, seed: 11.2,
    light: '#a3b7bd', shade: '#8ba5b5', haze: '#c3d9de',
  }));
  scene.add(root);
}
