import * as THREE from 'three';
import { createDroneBrain, updateDroneBrain, hitDrone, resetDroneBrain, canDroneDetect } from './droneBrain.ts';
import { createDroneVisuals, type DroneVisualItem } from './droneVisuals.ts';
import type { Target } from './scene';
import { OBSTACLES } from './obstacles.ts';
import { CRATE_HEIGHT } from './movement.ts';
import { segmentBoxTime, segmentTerrainTime, type Point3, type ProjectileBox } from './shootingMath.ts';
import { advanceDroneMotion, createDroneMotion, resetDroneMotion, droneContactTime, droneTakeoffHeight, DRONE_TAKEOFF_SECONDS } from './droneMotion.ts';
import { createExplosions } from './explosion.ts';
import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';

/** Gameplay owns detection and health; scan meshes only display the same state. */
export function createDroneEncounter(scene: THREE.Scene, targets: Target[], sampleHeight: (x: number, z: number) => number, rules: DroneRules = DEFAULT_DRONE_RULES) {
  if (targets.length !== rules.spawns.length) throw new RangeError('Drone targets must match configured spawns');
  const initialYaws = rules.spawns.map(spawn => spawn.yaw);
  const brains = targets.map((_, i) => createDroneBrain({ yaw: initialYaws[i], rules }));
  const motions = targets.map((target, id) => createDroneMotion(target.root.position, id, rules));
  const visuals = createDroneVisuals(scene, sampleHeight, rules);
  const explosions = createExplosions(scene, sampleHeight);
  const boxes: ProjectileBox[] = OBSTACLES.map(o => ({ min: { x:o.x-o.halfX,y:0,z:o.z-o.halfZ }, max:{x:o.x+o.halfX,y:0,z:o.z+o.halfZ} }));
  const playerChest = new THREE.Vector3();
  const previousPlayer = new THREE.Vector3();
  const previousDrone = new THREE.Vector3();
  const contactStart = new THREE.Vector3();
  const playerContactStart = new THREE.Vector3();
  const contactPlayer = new THREE.Vector3();
  const contactDrone = new THREE.Vector3();
  const takeoffDuration = Math.min(DRONE_TAKEOFF_SECONDS, rules.spawnGraceSeconds);
  let takeoffElapsed = 0;
  let hasPreviousPlayer = false;
  let enabled = false;
  let graceRemaining = rules.spawnGraceSeconds;
  let defeated = false;
  function refreshBoxes() {
    OBSTACLES.forEach((o, i) => {
      boxes[i].min.y = sampleHeight(o.x, o.z);
      boxes[i].max.y = boxes[i].min.y + (o.height ?? CRATE_HEIGHT);
    });
  }
  function hasLineOfSight(from: Point3, to: Point3) {
    for (const box of boxes) if (segmentBoxTime(from, to, box) !== null) return false;
    return segmentTerrainTime(from, to, sampleHeight) === null;
  }
  const items: DroneVisualItem[] = targets.map((target, id) => ({
    id, position: target.center, yaw: brains[id].yaw, hp: rules.maxHp, maxHp: rules.maxHp,
    mode: 'scanning', range: rules.scanRange, fovDegrees: rules.scanFovDegrees,
    hasLineOfSight: point => hasLineOfSight(target.center, point),
  }));
  function reset() {
    defeated = false; graceRemaining = rules.spawnGraceSeconds; takeoffElapsed = 0; hasPreviousPlayer = false; explosions.reset();
    targets.forEach((target, id) => {
      resetDroneBrain(brains[id], initialYaws[id]); resetDroneMotion(motions[id]);
      target.alive = true; target.root.visible = true; target.root.scale.setScalar(1);
      const { x, z } = motions[id].spawn;
      target.center.set(x, droneTakeoffHeight(0, takeoffDuration, sampleHeight(x, z)), z);
      target.root.position.set(x, target.center.y - .8, z);
      target.cooldown = 0; target.pulse = 0;
      target.root.rotation.set(0, brains[id].yaw, 0);
    });
    refreshBoxes();
    visuals.invalidateTerrain();
  }
  function update(dt: number, player: THREE.Vector3, camera: THREE.Camera, active: boolean) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    refreshBoxes();
    playerChest.copy(player); playerChest.y += 1.05;
    if (!hasPreviousPlayer) { previousPlayer.copy(player); hasPreviousPlayer = true; }
    let locked = 0, alerted = 0;
    let contact: number | null = null;
    const graceBefore = graceRemaining;
    const takeoffStep = Math.min(dt, Math.max(0, takeoffDuration - takeoffElapsed));
    if (enabled && active && !defeated) {
      graceRemaining = Math.max(0, graceRemaining - dt);
      takeoffElapsed = Math.min(takeoffDuration, takeoffElapsed + dt);
    }
    targets.forEach((target, id) => {
      const brain = brains[id];
      if (enabled && active && !defeated && brain.state !== 'destroyed') {
        previousDrone.copy(target.center);
        if (takeoffStep > 0) target.center.y = droneTakeoffHeight(takeoffElapsed, takeoffDuration, sampleHeight(target.center.x, target.center.z));
        // Position and chest point are fixed during the brain's substeps: trace once.
        let visible: boolean | undefined;
        const brainDt = Math.max(0, dt - graceBefore);
        if (brainDt > 0) updateDroneBrain(brain, brainDt, { position: target.center, player: playerChest,
          hasLineOfSight: (from,to) => visible ??= hasLineOfSight(from,to) });
        const moved = advanceDroneMotion(motions[id], target.center, brain, dt - takeoffStep, OBSTACLES, sampleHeight);
        target.center.set(moved.x, moved.y, moved.z);
        target.root.position.set(moved.x, moved.y - .8, moved.z);
        if (graceRemaining === 0 && dt > 0) {
          const protectedFraction = Math.min(1, graceBefore / dt);
          contactStart.copy(previousDrone).lerp(target.center, protectedFraction);
          playerContactStart.copy(previousPlayer).lerp(player, protectedFraction);
          const impactTime = droneContactTime(contactStart, target.center, playerContactStart, player, rules.contactRadius);
          if (impactTime !== null) {
            contactDrone.copy(contactStart).lerp(target.center, impactTime);
            contactPlayer.copy(playerContactStart).lerp(player, impactTime); contactPlayer.y += 1.05;
            if (hasLineOfSight(contactDrone, contactPlayer)) {
              // Contact is a failure, never a player kill. Stop the rest of this frame.
              defeated = true; contact = id; brain.state = 'destroyed'; brain.hp = 0;
              target.center.copy(contactDrone); target.root.position.copy(contactDrone); target.root.position.y -= .8;
              explosions.emit(contactDrone, 'contact'); explosions.emit(contactPlayer, 'contact');
            }
          }
        }
      }
      target.alive = brain.hp > 0;
      if (target.alive) {
        target.root.rotation.y = brain.yaw;
        if (enabled && active) {
          const progress = takeoffDuration > 0 ? takeoffElapsed / takeoffDuration : 1;
          const liftBank = Math.sin(Math.min(1, progress) * Math.PI);
          target.root.rotation.x = takeoffElapsed < takeoffDuration ? -.12 * liftBank : THREE.MathUtils.damp(target.root.rotation.x, brain.state === 'locked' ? -.14 : 0, 6, dt);
          target.root.rotation.z = .09 * liftBank * (id % 2 ? -1 : 1);
        }
        target.root.visible = true;
      } else target.root.visible = false;
      if (brain.state === 'locked') locked++;
      if (brain.state === 'alert') alerted++;
      Object.assign(items[id], { yaw: brain.yaw, hp: brain.hp, maxHp: brain.maxHp, mode: brain.state, range: takeoffElapsed < takeoffDuration ? 0 : rules.scanRange });
    });
    previousPlayer.copy(player);
    visuals.update(enabled ? items : [], camera, active ? dt : 0);
    return { locked, alerted, contact, graceRemaining, destroyed: brains.filter(b => b.hp <= 0).length };
  }
  reset();
  return {
    brains, update, reset,
    updateEffects(dt: number) { explosions.update(dt); },
    effectCount: explosions.activeCount,
    invalidateTerrain() { refreshBoxes(); visuals.invalidateTerrain(); },
    setEnabled(value: boolean) { enabled = value; },
    hit(target: Target) {
      const id = targets.indexOf(target);
      if (id < 0) return { id, hit: false, destroyed: false, hp: 0 };
      const bearing = Math.atan2(playerChest.x - target.center.x, playerChest.z - target.center.z);
      const visibleTarget = brains[id].state === 'locked' && canDroneDetect(target.center, bearing, playerChest, hasLineOfSight, rules);
      const result = hitDrone(brains[id], visibleTarget);
      target.alive = !result.destroyed;
      if (result.hit && result.destroyed) { explosions.emit(target.center, 'destroyed'); target.root.visible = false; }
      return { id, ...result };
    },
    snapshot() { return brains.map((b,id) => ({ id, hp:b.hp, state:b.state, flight: takeoffElapsed < takeoffDuration ? 'taking-off' : b.state === 'locked' ? 'diving' : 'cruising', yaw: Number(b.yaw.toFixed(3)), x:targets[id].center.x, y:targets[id].center.y, z:targets[id].center.z })); },
    dispose() { visuals.dispose(); explosions.dispose(); },
  };
}
