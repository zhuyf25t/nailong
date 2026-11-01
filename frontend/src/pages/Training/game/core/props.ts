import * as THREE from 'three';

export type PropKind = 'bubble' | 'spring' | 'bloom';
type Terrain = { sampleHeight(x: number, z: number): number };
type Pickup = {
  kind: PropKind;
  root: THREE.Group;
  model: THREE.Group;
  halo: THREE.Mesh;
  x: number;
  z: number;
  cooldown: number;
  burst: number;
};

const RESPAWN_SECONDS = 12;
const BLOOM_SECONDS = 6;
const FLOWERS = 12;
const BURST_PARTICLES = 8;

/** Collectibles own their visual effects; gameplay buffs are applied by onCollect. */
export function createProps(scene: THREE.Scene, terrain: Terrain, onCollect: (kind: PropKind) => void) {
  const root = new THREE.Group();
  root.name = 'GardenPickups';
  scene.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
  const mat = (color: string, emissive?: string) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: emissive ?? '#000000', emissiveIntensity: 0.25 });
    materials.add(value);
    return value;
  };
  const sphere = geo(new THREE.SphereGeometry(1, 12, 8));
  const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  const torus = geo(new THREE.TorusGeometry(0.51, 0.025, 6, 36));
  const blue = mat('#31c7ed', '#0872b5');
  const darkBlue = mat('#087eaa');
  const cream = mat('#fff4ce');
  const yellow = mat('#ffd258', '#b56c0a');
  const pink = mat('#f38bae', '#c52d67');
  const green = mat('#5b9f48');
  const mint = mat('#c0f4dc');
  const palette: Record<PropKind, THREE.MeshStandardMaterial> = { bubble: blue, spring: yellow, bloom: pink };
  const white = mat('#ffffff');

  function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
    position: [number, number, number], scale: [number, number, number]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // A rounded refill bottle, including a small bubble emblem and screw cap.
  function makeBubble(model: THREE.Group) {
    const profile = [
      [0, -0.34], [0.21, -0.34], [0.27, -0.26], [0.27, 0.1],
      [0.21, 0.22], [0.12, 0.28], [0.12, 0.4], [0, 0.4],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    addMesh(model, geo(new THREE.LatheGeometry(profile, 20)), blue, [0, 0, 0], [1, 1, 1]);
    addMesh(model, cylinder, darkBlue, [0, 0.37, 0], [0.15, 0.12, 0.15]);
    addMesh(model, sphere, cream, [0, -0.02, 0.259], [0.19, 0.2, 0.026]);
    addMesh(model, sphere, darkBlue, [-0.035, 0.01, 0.285], [0.065, 0.065, 0.02]);
    addMesh(model, sphere, blue, [0.067, -0.08, 0.287], [0.035, 0.035, 0.02]);
    addMesh(model, sphere, white, [-0.12, 0.15, 0.237], [0.028, 0.075, 0.014]);
    addMesh(model, sphere, mint, [0.2, 0.58, 0.02], [0.065, 0.065, 0.065]);
    addMesh(model, sphere, blue, [-0.15, 0.69, -0.03], [0.043, 0.043, 0.043]);
  }

  // Coiled stem plus a domed mushroom cap gives the jump buff a clear silhouette.
  function makeSpring(model: THREE.Group) {
    const helix: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i++) {
      const t = i / 72;
      helix.push(new THREE.Vector3(Math.cos(t * Math.PI * 6) * 0.135, -0.31 + t * 0.43, Math.sin(t * Math.PI * 6) * 0.135));
    }
    addMesh(model, geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 72, 0.045, 6, false)), cream, [0, 0, 0], [1, 1, 1]);
    addMesh(model, cylinder, yellow, [0, -0.34, 0], [0.24, 0.075, 0.24]);
    const cap = geo(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    addMesh(model, cap, yellow, [0, 0.11, 0], [0.4, 0.26, 0.4]);
    addMesh(model, cylinder, cream, [0, 0.11, 0], [0.39, 0.025, 0.39]);
    for (const [x, y, z, size] of [[-0.16, 0.31, 0.08, 0.065], [0.16, 0.28, 0.15, 0.07], [0, 0.35, -0.13, 0.06]]) {
      addMesh(model, sphere, cream, [x, y, z], [size, 0.025, size]);
    }
  }

  // A plump pink seed with a tiny sprout and a front-facing flower seal.
  function makeBloom(model: THREE.Group) {
    addMesh(model, sphere, pink, [0, -0.05, 0], [0.27, 0.34, 0.22]);
    addMesh(model, cylinder, green, [0, 0.32, 0], [0.025, 0.18, 0.025]);
    const leafA = addMesh(model, sphere, green, [-0.1, 0.38, 0], [0.15, 0.05, 0.075]); leafA.rotation.z = -0.4;
    const leafB = addMesh(model, sphere, mint, [0.11, 0.42, 0], [0.15, 0.05, 0.07]); leafB.rotation.z = 0.35;
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      addMesh(model, sphere, cream, [Math.sin(angle) * 0.075, -0.02 + Math.cos(angle) * 0.075, 0.215], [0.055, 0.055, 0.022]);
    }
    addMesh(model, sphere, yellow, [0, -0.02, 0.24], [0.044, 0.044, 0.02]);
  }

  const pickups: Pickup[] = ([
    ['bubble', -3, 3], ['spring', 3, 2], ['bloom', 1, -3],
  ] as const).map(([kind, x, z]) => {
    const holder = new THREE.Group(); holder.name = `Pickup_${kind}`; root.add(holder);
    const model = new THREE.Group(); holder.add(model);
    ({ bubble: makeBubble, spring: makeSpring, bloom: makeBloom })[kind](model);
    const halo = addMesh(holder, torus, palette[kind], [0, 0.06, 0], [1, 1, 1]);
    halo.rotation.x = Math.PI / 2; halo.castShadow = false;
    return { kind, root: holder, model, halo, x, z, cooldown: 0, burst: 0 };
  });

  const makeInstances = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // These tiny, bounded effects move when terrain is edited; avoid stale bounds.
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  };
  const petals = makeInstances(sphere, pink, FLOWERS * 5, 'BloomPetals');
  const centers = makeInstances(sphere, yellow, FLOWERS, 'BloomCenters');
  const stems = makeInstances(cylinder, green, FLOWERS, 'BloomStems');
  const leaves = makeInstances(sphere, green, FLOWERS * 2, 'BloomLeaves');
  const flowerMeshes = [petals, centers, stems, leaves];
  const sparkles = makeInstances(sphere, white, pickups.length * BURST_PARTICLES, 'PickupSparkles');
  pickups.forEach((pickup, p) => {
    for (let i = 0; i < BURST_PARTICLES; i++) sparkles.setColorAt(p * BURST_PARTICLES + i, palette[pickup.kind].color);
  });
  const dummy = new THREE.Object3D();
  const bloomOrigin = pickups.find(p => p.kind === 'bloom')!;
  const flowerGround = new Float32Array(FLOWERS);
  let elapsed = 0;
  let bloomTime = -1;
  let enabled = true;
  let disposed = false;
  const smooth = (n: number) => { const t = THREE.MathUtils.clamp(n, 0, 1); return t * t * (3 - 2 * t); };

  function placeInstance(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, rotation = 0) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, rotation, 0);
    dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
  }

  function updateFlowers() {
    flowerMeshes.forEach(mesh => { mesh.visible = bloomTime >= 0 && bloomTime < BLOOM_SECONDS; });
    if (bloomTime < 0 || bloomTime >= BLOOM_SECONDS) return;
    for (let i = 0; i < FLOWERS; i++) {
      const a = i * Math.PI * 2 / FLOWERS;
      const radius = 1.35 + 0.22 * Math.sin(i * 2.4);
      const x = bloomOrigin.x + Math.cos(a) * radius;
      const z = bloomOrigin.z + Math.sin(a) * radius;
      const growth = smooth((bloomTime - i * 0.035) / 0.55) * smooth((BLOOM_SECONDS - bloomTime) / 0.6);
      const h = (0.33 + 0.14 * (0.5 + 0.5 * Math.sin(i * 4))) * growth;
      const y = flowerGround[i];
      const sway = Math.sin(elapsed * 2 + i) * 0.035 * growth;
      placeInstance(stems, i, x, y + h / 2, z, 0.018 * growth, h, 0.018 * growth);
      placeInstance(centers, i, x + sway, y + h + 0.02 * growth, z, 0.075 * growth, 0.05 * growth, 0.075 * growth);
      for (let p = 0; p < 5; p++) {
        const angle = p * Math.PI * 2 / 5 + a;
        placeInstance(petals, i * 5 + p, x + sway + Math.cos(angle) * 0.107 * growth,
          y + h, z + Math.sin(angle) * 0.107 * growth, 0.105 * growth, 0.04 * growth, 0.063 * growth, -angle);
      }
      for (let p = 0; p < 2; p++) {
        const sign = p === 0 ? -1 : 1;
        placeInstance(leaves, i * 2 + p, x + sign * 0.06 * growth, y + h * (0.4 + p * 0.2), z,
          0.085 * growth, 0.02 * growth, 0.035 * growth, sign * 0.4);
      }
    }
    flowerMeshes.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
  }

  function updateSparkles() {
    let visible = false;
    pickups.forEach((pickup, p) => {
      const progress = pickup.burst > 0 ? 1 - pickup.burst / 0.7 : 1;
      const scale = Math.max(0, 1 - progress) * 0.06;
      visible ||= pickup.burst > 0;
      for (let i = 0; i < BURST_PARTICLES; i++) {
        const angle = i * Math.PI * 2 / BURST_PARTICLES;
        const distance = 0.2 + progress * 0.75;
        placeInstance(sparkles, p * BURST_PARTICLES + i,
          pickup.x + Math.cos(angle) * distance,
          pickup.root.position.y + 0.7 + Math.sin(progress * Math.PI) * (0.35 + (i % 3) * 0.15),
          pickup.z + Math.sin(angle) * distance, scale, scale, scale);
      }
    });
    sparkles.visible = visible;
    sparkles.instanceMatrix.needsUpdate = true;
  }

  function reposition() {
    pickups.forEach(pickup => { pickup.root.position.set(pickup.x, terrain.sampleHeight(pickup.x, pickup.z), pickup.z); });
    for (let i = 0; i < FLOWERS; i++) {
      const a = i * Math.PI * 2 / FLOWERS;
      const radius = 1.35 + 0.22 * Math.sin(i * 2.4);
      flowerGround[i] = terrain.sampleHeight(bloomOrigin.x + Math.cos(a) * radius, bloomOrigin.z + Math.sin(a) * radius) + 0.015;
    }
    updateFlowers();
    updateSparkles();
  }

  function reset() {
    elapsed = 0; bloomTime = -1;
    pickups.forEach((pickup, i) => {
      pickup.cooldown = 0; pickup.burst = 0;
      pickup.model.visible = true; pickup.model.scale.setScalar(1);
      pickup.model.position.y = 0.9;
      pickup.model.rotation.set(0, i * 0.7, 0);
      pickup.halo.scale.setScalar(1);
    });
    reposition();
  }

  function update(dt: number, player: THREE.Vector3) {
    if (!enabled || disposed || dt <= 0 || !Number.isFinite(dt)) return;
    elapsed += dt;
    if (bloomTime >= 0) { bloomTime += dt; if (bloomTime >= BLOOM_SECONDS) bloomTime = -1; }
    pickups.forEach((pickup, i) => {
      pickup.burst = Math.max(0, pickup.burst - dt);
      pickup.cooldown = Math.max(0, pickup.cooldown - dt);
      pickup.model.visible = pickup.cooldown === 0;
      pickup.halo.scale.setScalar(pickup.cooldown > 0 ? 0.22 : 1 + Math.sin(elapsed * 2.5 + i) * 0.07);
      if (pickup.cooldown > 0) return;
      pickup.model.position.y = 0.9 + Math.sin(elapsed * 2.2 + i * 1.5) * 0.1;
      pickup.model.rotation.y = Math.sin(elapsed * 0.7 + i) * 0.3;
      pickup.model.rotation.z = Math.sin(elapsed * 1.6 + i) * 0.04;
      const horizontalDistance = Math.hypot(player.x - pickup.x, player.z - pickup.z);
      const feetAboveGround = player.y - pickup.root.position.y;
      if (horizontalDistance < 0.9 && feetAboveGround >= -0.35 && feetAboveGround < 1.35) {
        pickup.cooldown = RESPAWN_SECONDS;
        pickup.burst = 0.7;
        pickup.model.visible = false;
        if (pickup.kind === 'bloom') bloomTime = 0;
        onCollect(pickup.kind);
      }
    });
    updateFlowers();
    updateSparkles();
  }

  reset();
  return {
    update, reset, reposition,
    setEnabled(value: boolean) { enabled = value; root.visible = value; },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      [...flowerMeshes, sparkles].forEach(mesh => mesh.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
