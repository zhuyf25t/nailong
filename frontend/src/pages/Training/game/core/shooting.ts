import * as THREE from 'three';
import type { Target } from './scene';
import { OBSTACLES } from './obstacles.ts';
import { CRATE_HEIGHT } from './movement.ts';
import { WORLD_TERRAIN_HALF_SIZE } from './worldLayout.ts';
import { firstProjectileImpact, type ProjectileBox, type ProjectileTarget } from './shootingMath.ts';
import { DEFAULT_WEAPON_CONFIG, type WeaponConfig } from './defaultRules.ts';

const FLASH_SECONDS = 0.055;

export function createShooting(scene: THREE.Scene, targets: Target[], onHit: (target: Target) => void, terrain?: { sampleHeight(x: number, z: number): number }, config: WeaponConfig = DEFAULT_WEAPON_CONFIG) {
  const fireInterval = config.fireIntervalMs / 1000;
  // Capacity follows projectile lifetime and cadence rather than imposing a hidden rate limit.
  const bulletCapacity = Math.max(2, Math.ceil(config.projectileRange / config.projectileSpeed / fireInterval) + 2);
  // Opaque, unlit geometry stays legible without transparent shells or a bloom pass.
  const coreGeometry = new THREE.SphereGeometry(0.065, 10, 6);
  const trailGeometry = new THREE.CylinderGeometry(0.045, 0, 0.42, 6, 1);
  trailGeometry.rotateX(Math.PI / 2);
  const sparkGeometry = new THREE.OctahedronGeometry(0.033, 0);
  const flashGeometry = new THREE.OctahedronGeometry(0.09, 0);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff2d2', toneMapped: false });
  const trailMaterial = new THREE.MeshBasicMaterial({ color: '#ffc879', toneMapped: false });
  const effects = new THREE.Group();
  effects.name = 'PulseEffects';
  scene.add(effects);

  // Fixed pools avoid allocations and unbounded effect growth while holding fire.
  const bullets = Array.from({ length: bulletCapacity }, () => {
    const root = new THREE.Group();
    root.visible = false;
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.scale.z = 1.65;
    const trail = new THREE.Mesh(trailGeometry, trailMaterial);
    trail.position.z = -0.27;
    root.add(core, trail);
    effects.add(root);
    return { root, velocity: new THREE.Vector3(), active: false, distance: 0, radius: 0.13, targetRadius: 0.68 };
  });
  const particles = Array.from({ length: 48 }, () => {
    const mesh = new THREE.Mesh(sparkGeometry, trailMaterial);
    mesh.visible = false;
    effects.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), life: 0, duration: 0.22 };
  });
  const flashes = Array.from({ length: Math.max(2, Math.ceil(FLASH_SECONDS / fireInterval) + 1) }, () => {
    const mesh = new THREE.Mesh(flashGeometry, coreMaterial);
    mesh.visible = false;
    effects.add(mesh);
    return { mesh, life: 0 };
  });
  const collisionTargets: ProjectileTarget[] = targets.map(target => ({ center: target.center, active: true }));
  const collisionBoxes: ProjectileBox[] = OBSTACLES.map(o => ({ min: { x: o.x - o.halfX, y: 0, z: o.z - o.halfZ }, max: { x: o.x + o.halfX, y: CRATE_HEIGHT, z: o.z + o.halfZ } }));
  const sampleHeight = (x: number, z: number) => terrain?.sampleHeight(x, z) ?? 0;
  const forward = new THREE.Vector3(0, 0, 1);
  const shotDirection = new THREE.Vector3();
  const before = new THREE.Vector3();
  const impactPoint = new THREE.Vector3();
  let bubbleBoost = false;
  let cooldown = 0;
  let particleCursor = 0;
  let flashCursor = 0;

  function fire(origin: THREE.Vector3, direction: THREE.Vector3) {
    if (cooldown > 0 || direction.lengthSq() < 1e-12) return false;
    const bullet = bullets.find(entry => !entry.active);
    if (!bullet) return false;
    cooldown = fireInterval;
    shotDirection.copy(direction).normalize();
    bullet.active = true;
    bullet.distance = 0;
    bullet.radius = bubbleBoost ? 0.24 : 0.13;
    bullet.targetRadius = bubbleBoost ? 0.78 : 0.68;
    bullet.velocity.copy(shotDirection).multiplyScalar(config.projectileSpeed);
    bullet.root.position.copy(origin);
    bullet.root.quaternion.setFromUnitVectors(forward, shotDirection);
    bullet.root.scale.setScalar(bullet.radius / 0.13);
    bullet.root.visible = true;

    const flash = flashes[flashCursor++ % flashes.length];
    flash.life = FLASH_SECONDS;
    flash.mesh.visible = true;
    flash.mesh.position.copy(origin).addScaledVector(shotDirection, 0.065);
    flash.mesh.quaternion.copy(bullet.root.quaternion);
    flash.mesh.scale.set(0.8, 0.8, 1.55);
    return true;
  }

  function emitImpact(position: THREE.Vector3, hitTarget: boolean) {
    const count = hitTarget ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const particle = particles[particleCursor++ % particles.length];
      const angle = i * Math.PI * 2 / count;
      particle.duration = hitTarget ? 0.22 : 0.16;
      particle.life = particle.duration;
      particle.mesh.visible = true;
      particle.mesh.position.copy(position);
      particle.mesh.scale.setScalar(1);
      particle.velocity.set(Math.cos(angle) * 1.25, 0.6 + (i % 3) * 0.35, Math.sin(angle) * 1.25);
    }
  }

  function update(dt: number) {
    cooldown = Math.max(0, cooldown - dt);
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      target.cooldown = Math.max(0, target.cooldown - dt);
      target.pulse = Math.max(0, target.pulse - dt * 3.5);
      collisionTargets[i].active = target.alive && target.cooldown <= 0;
    }
    for (let i = 0; i < OBSTACLES.length; i++) {
      const obstacle = OBSTACLES[i];
      const bottom = sampleHeight(obstacle.x, obstacle.z);
      collisionBoxes[i].min.y = bottom;
      collisionBoxes[i].max.y = bottom + (obstacle.height ?? CRATE_HEIGHT);
    }
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      before.copy(bullet.root.position);
      // Clip at the configured range; fast projectiles still sweep every frame.
      const travel = Math.min(config.projectileRange - bullet.distance, config.projectileSpeed * dt);
      bullet.root.position.addScaledVector(bullet.velocity, travel / config.projectileSpeed);
      bullet.distance += travel;
      const impact = firstProjectileImpact(before, bullet.root.position, collisionTargets, bullet.targetRadius, collisionBoxes, bullet.radius, sampleHeight);
      if (impact) {
        impactPoint.copy(before).lerp(bullet.root.position, impact.time);
        emitImpact(impactPoint, impact.kind === 'target');
        if (impact.kind === 'target') {
          const target = targets[impact.index];
          target.cooldown = 0;
          target.pulse = 1;
          target.reactToHit?.();
          onHit(target);
          collisionTargets[impact.index].active = target.alive;
        }
      }
      const pos = bullet.root.position;
      if (impact || bullet.distance >= config.projectileRange || Math.abs(pos.x) > WORLD_TERRAIN_HALF_SIZE || Math.abs(pos.z) > WORLD_TERRAIN_HALF_SIZE) {
        bullet.active = false;
        bullet.root.visible = false;
      }
    }
    for (const particle of particles) {
      if (particle.life <= 0) continue;
      particle.life = Math.max(0, particle.life - dt);
      particle.velocity.y -= 2.7 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.setScalar(particle.life / particle.duration);
      particle.mesh.visible = particle.life > 0;
    }
    for (const flash of flashes) {
      if (flash.life <= 0) continue;
      flash.life = Math.max(0, flash.life - dt);
      const scale = flash.life / FLASH_SECONDS;
      flash.mesh.scale.set(0.8 * scale, 0.8 * scale, 1.55 * scale);
      flash.mesh.visible = flash.life > 0;
    }
  }

  function reset() {
    for (const bullet of bullets) { bullet.active = false; bullet.root.visible = false; }
    for (const particle of particles) { particle.life = 0; particle.mesh.visible = false; }
    for (const flash of flashes) { flash.life = 0; flash.mesh.visible = false; }
    cooldown = 0;
    bubbleBoost = false;
    particleCursor = flashCursor = 0;
    targets.forEach(target => { target.alive = true; target.cooldown = 0; target.pulse = 0; target.root.visible = true; target.root.scale.setScalar(1); });
  }
  return {
    fire, update, reset,
    setBubbleBoost(active: boolean) { bubbleBoost = active; },
    dispose() {
      reset();
      scene.remove(effects);
      coreGeometry.dispose(); trailGeometry.dispose(); sparkGeometry.dispose(); flashGeometry.dispose();
      coreMaterial.dispose(); trailMaterial.dispose();
    },
  };
}
