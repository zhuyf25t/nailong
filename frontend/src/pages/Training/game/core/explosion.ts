import * as THREE from 'three';

export type ExplosionKind = 'destroyed' | 'contact';
const POOL_SIZE = 5;
const FRAGMENTS = 24;
export const EXPLOSION_SECONDS = 1.2;

/** Five reusable bursts: no textures, postprocessing or per-explosion allocations.
 * This clock runs through a result transition, independently of frozen gameplay. */
export function createExplosions(scene: THREE.Scene, sampleHeight: (x: number, z: number) => number) {
  const root = new THREE.Group(); root.name = 'DroneExplosionEffects'; scene.add(root);
  const coreGeometry = new THREE.IcosahedronGeometry(1, 1);
  const ringGeometry = new THREE.TorusGeometry(1, .035, 4, 48);
  const fragmentGeometry = new THREE.OctahedronGeometry(.09, 0);
  const fragmentMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const dummy = new THREE.Object3D();
  const colors = ['#fff5c5', '#ffc25a', '#ff7047', '#55747a'].map(color => new THREE.Color(color));
  const slots = Array.from({ length: POOL_SIZE }, () => {
    const group = new THREE.Group(); group.visible = false; root.add(group);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: '#fff2bd', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffb960', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#8f7f70', transparent: true, opacity: .22, depthWrite: false });
    const core = new THREE.Mesh(coreGeometry, glowMaterial); group.add(core);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.rotation.x = Math.PI / 2; group.add(ring);
    const halo = new THREE.Mesh(ringGeometry, ringMaterial); halo.rotation.x = .5; group.add(halo);
    const smoke = new THREE.Mesh(coreGeometry, smokeMaterial); group.add(smoke);
    const fragments = new THREE.InstancedMesh(fragmentGeometry, fragmentMaterial, FRAGMENTS);
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fragments.frustumCulled = false; group.add(fragments);
    for (let i = 0; i < FRAGMENTS; i++) fragments.setColorAt(i, colors[i % colors.length]);
    return { group, core, ring, halo, smoke, fragments, glowMaterial, ringMaterial, smokeMaterial, age: EXPLOSION_SECONDS, strength: 1 };
  });
  let cursor = 0;
  function emit(position: THREE.Vector3, kind: ExplosionKind) {
    const slot = slots[cursor++ % POOL_SIZE];
    slot.group.position.copy(position); slot.group.visible = true; slot.age = 0;
    slot.strength = kind === 'contact' ? 1.35 : 1;
    slot.ringMaterial.color.set(kind === 'contact' ? '#ff8b57' : '#9ce9dd');
    slot.glowMaterial.color.set(kind === 'contact' ? '#fff0bc' : '#d8fff0');
    renderSlot(slot);
  }
  function renderSlot(slot: typeof slots[number]) {
    const t = slot.age, life = Math.max(0, 1 - t / EXPLOSION_SECONDS);
    const strength = slot.strength;
    slot.core.visible = t < .22;
    slot.core.scale.setScalar((.12 + Math.sin(Math.min(1, t / .22) * Math.PI) * .95) * strength);
    slot.glowMaterial.opacity = Math.max(0, 1 - t / .22);
    slot.ring.scale.setScalar((.2 + t * 4.8) * strength);
    slot.halo.scale.setScalar((.15 + t * 3.4) * strength);
    slot.halo.rotation.z = t * 1.3;
    slot.ringMaterial.opacity = Math.max(0, 1 - t / .65) ** 2;
    slot.smoke.scale.set(1.2 + t * 1.7, .7 + t * 1.1, 1.2 + t * 1.7).multiplyScalar(strength);
    slot.smoke.position.y = t * .65;
    slot.smokeMaterial.opacity = Math.sin(Math.min(1, t / .9) * Math.PI) * .18;
    for (let i = 0; i < FRAGMENTS; i++) {
      const angle = i * 2.399963;
      const speed = (1.3 + (i % 5) * .38) * strength;
      const x = Math.sin(angle) * speed * t, z = Math.cos(angle) * speed * t;
      const y = (1 + (i % 7) * .23) * t - 3.6 * t * t;
      const floor = sampleHeight(slot.group.position.x + x, slot.group.position.z + z) - slot.group.position.y + .06;
      dummy.position.set(x, Math.max(y, floor), z);
      dummy.rotation.set(t * (i % 3 + 2), angle + t * 3, t * 4);
      dummy.scale.setScalar(Math.sqrt(life) * (i % 4 === 0 ? 1.5 : .8));
      dummy.updateMatrix(); slot.fragments.setMatrixAt(i, dummy.matrix);
    }
    slot.fragments.instanceMatrix.needsUpdate = true;
  }
  function update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const slot of slots) {
      if (!slot.group.visible) continue;
      slot.age += dt;
      slot.group.visible = slot.age < EXPLOSION_SECONDS;
      if (slot.group.visible) renderSlot(slot);
    }
  }
  function reset() { cursor = 0; for (const slot of slots) { slot.age = EXPLOSION_SECONDS; slot.group.visible = false; } }
  return {
    emit, update, reset,
    activeCount: () => slots.filter(slot => slot.group.visible).length,
    dispose() {
      reset(); scene.remove(root);
      coreGeometry.dispose(); ringGeometry.dispose(); fragmentGeometry.dispose(); fragmentMaterial.dispose();
      for (const slot of slots) { slot.glowMaterial.dispose(); slot.ringMaterial.dispose(); slot.smokeMaterial.dispose(); slot.fragments.dispose(); }
    },
  };
}
