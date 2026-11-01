import * as THREE from 'three';
import { createDroneBrain, updateDroneBrain, hitDrone, resetDroneBrain, canDroneDetect } from './droneBrain.ts';
import { createDroneVisuals, type DroneVisualItem } from './droneVisuals.ts';
import type { Target } from './scene';
import { OBSTACLES } from './obstacles.ts';
import { CRATE_HEIGHT, type Obstacle } from './movement.ts';
import { segmentBoxTime, segmentTerrainTime, type Point3, type ProjectileBox } from './shootingMath.ts';
import { advanceDroneMotion, createDroneMotion, resetDroneMotion, droneContactTime, droneTakeoffHeight, DRONE_TAKEOFF_SECONDS, pushDroneAway } from './droneMotion.ts';
import { createExplosions } from './explosion.ts';
import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';
import { createTacticalTools, PULSE_PUSH_DISTANCE } from './tacticalTools.ts';
import { createToolVisuals } from './toolVisuals.ts';
import type { WorldDefinition } from '../../../../objects/worlds/WorldDefinition.ts';
import type { ToolKind } from '../../../../objects/training/ToolKind.ts';
import type { RunEventInput } from '../../../../objects/records/RunEvent.ts';

export interface DroneEncounterOptions {
  /** Keep this array identity and splice removed gates, as movement does. */
  obstacles?: readonly Obstacle[];
  world?: WorldDefinition;
  seed?: number;
  onEvent?: (event: RunEventInput) => void;
  onToolEffect?: (kind: ToolKind, droneId: string) => void;
}

/** Gameplay owns detection and health; scan meshes only display the same state. */
export function createDroneEncounter(scene: THREE.Scene, targets: Target[], sampleHeight: (x: number, z: number) => number,
  rules: DroneRules = DEFAULT_DRONE_RULES, options: DroneEncounterOptions = {}) {
  const spawns = options.world?.drones ?? rules.spawns;
  if (targets.length !== spawns.length) throw new RangeError('Drone targets must match configured spawns');
  const obstacles = options.obstacles ?? OBSTACLES;
  const stableIds = targets.map((_, id) => options.world?.drones[id].id ?? `drone-${id}`);
  const initialYaws = spawns.map(spawn => spawn.yaw);
  const brains = targets.map((_, i) => createDroneBrain({ yaw: initialYaws[i], rules, seed: options.seed, stream: stableIds[i] }));
  const motions = targets.map((_, id) => createDroneMotion(spawns[id], id, rules,
    { patrol: options.world?.drones[id].patrol, halfSize: options.world?.bounds.halfSize }));
  const visuals = createDroneVisuals(scene, sampleHeight, { ...rules, spawns });
  const explosions = createExplosions(scene, sampleHeight);
  const boxes: ProjectileBox[] = [];
  const tools = createTacticalTools(sampleHeight, obstacles, options.world?.bounds.halfSize);
  const toolVisuals = createToolVisuals(scene);
  const effectiveTools = new Set<string>();
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
  let acceptingInput = false;
  let graceRemaining = rules.spawnGraceSeconds;
  let defeated = false;
  let obstacleSignature = '';
  function refreshBoxes() {
    boxes.length = obstacles.length;
    obstacles.forEach((o, i) => {
      const box = boxes[i] ??= { min: { x:0,y:0,z:0 }, max: { x:0,y:0,z:0 } };
      Object.assign(box.min, { x:o.x-o.halfX, y:sampleHeight(o.x, o.z), z:o.z-o.halfZ });
      Object.assign(box.max, { x:o.x+o.halfX, y:box.min.y + (o.height ?? CRATE_HEIGHT), z:o.z+o.halfZ });
    });
    const signature = boxes.map(box => `${box.min.x},${box.min.y},${box.min.z},${box.max.x},${box.max.y},${box.max.z}`).join(';');
    if (signature !== obstacleSignature) { obstacleSignature = signature; visuals.invalidateTerrain(); }
  }
  function physicalLineOfSight(from: Point3, to: Point3) {
    for (const box of boxes) if (segmentBoxTime(from, to, box) !== null) return false;
    return segmentTerrainTime(from, to, sampleHeight) === null;
  }
  function hasLineOfSight(from: Point3, to: Point3) { return physicalLineOfSight(from, to) && !tools.blocksSight(from, to); }
  function reportToolEffect(kind: ToolKind, id: number) {
    const key = `${kind}:${stableIds[id]}`;
    if (effectiveTools.has(key)) return;
    effectiveTools.add(key); options.onToolEffect?.(kind, stableIds[id]);
  }
  function reportState(id: number, before: typeof brains[number]['state'], reason?: string) {
    const brain = brains[id];
    if (before === brain.state || brain.state === 'destroyed') return;
    options.onEvent?.({ kind: 'drone-state', actorId: stableIds[id], targetId: brain.state === 'locked' ? 'player' : null,
      position: { x: targets[id].center.x, y: targets[id].center.y, z: targets[id].center.z },
      detail: brain.state === 'locked' ? 'locked:saw-player' : brain.state === 'alert' ? `alert:${reason ?? 'lost-sight'}` : 'scanning:search-ended' });
  }
  const items: DroneVisualItem[] = targets.map((target, id) => ({
    id, position: target.center, yaw: brains[id].yaw, hp: rules.maxHp, maxHp: rules.maxHp,
    mode: 'scanning', range: rules.scanRange, fovDegrees: rules.scanFovDegrees,
    hasLineOfSight: point => hasLineOfSight(target.center, point),
  }));
  function reset() {
    defeated = false; acceptingInput = false; graceRemaining = rules.spawnGraceSeconds; takeoffElapsed = 0; hasPreviousPlayer = false; explosions.reset(); tools.reset(); effectiveTools.clear();
    toolVisuals.update([]);
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
    acceptingInput = enabled && active && !defeated;
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
        const before = brain.state;
        const stun = tools.stunRemaining(stableIds[id]);
        previousDrone.copy(target.center);
        if (takeoffStep > 0) target.center.y = droneTakeoffHeight(takeoffElapsed, takeoffDuration, sampleHeight(target.center.x, target.center.z));
        // Position and chest point are fixed during the brain's substeps: trace once.
        let visible: boolean | undefined;
        const brainDt = Math.max(0, dt - Math.max(graceBefore, stun));
        const playerBearing = Math.atan2(playerChest.x-target.center.x, playerChest.z-target.center.z);
        if (brain.state === 'locked' && tools.blocksSight(target.center, playerChest) &&
          canDroneDetect(target.center, playerBearing, playerChest, physicalLineOfSight, rules)) reportToolEffect('curtain', id);
        if (brainDt > 0) updateDroneBrain(brain, brainDt, { position: target.center, player: playerChest,
          hasLineOfSight: (from,to) => visible ??= hasLineOfSight(from,to), decoy: tools.decoyAt(target.center, physicalLineOfSight) });
        if (brain.investigate) reportToolEffect('decoy', id);
        reportState(id, before);
        const moved = advanceDroneMotion(motions[id], target.center, brain, Math.max(0, dt - Math.max(takeoffStep, stun)), obstacles, sampleHeight);
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
            if (physicalLineOfSight(contactDrone, contactPlayer)) {
              // Contact is a failure, never a player kill. Stop the rest of this frame.
              defeated = true; contact = id; brain.state = 'destroyed'; brain.hp = 0;
              target.center.copy(contactDrone); target.root.position.copy(contactDrone); target.root.position.y -= .8;
              explosions.emit(contactDrone, 'contact'); explosions.emit(contactPlayer, 'contact');
              options.onEvent?.({ kind: 'contact', actorId: stableIds[id], targetId: 'player', position: { x:contactDrone.x, y:contactDrone.y, z:contactDrone.z } });
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
      Object.assign(items[id], { yaw: brain.yaw, hp: brain.hp, maxHp: brain.maxHp, mode: brain.state, range: takeoffElapsed < takeoffDuration || tools.stunRemaining(stableIds[id]) > 0 ? 0 : rules.scanRange });
    });
    if (enabled && active && !defeated) {
      const activeCount = tools.snapshot().active.length;
      tools.advance(dt);
      if (activeCount !== tools.snapshot().active.length) visuals.invalidateTerrain();
    }
    previousPlayer.copy(player);
    visuals.update(enabled ? items : [], camera, active ? dt : 0);
    toolVisuals.update(enabled ? tools.snapshot().active : [], active ? dt : 0);
    return { locked, alerted, contact, graceRemaining, destroyed: brains.filter(b => b.hp <= 0).length };
  }
  reset();
  return {
    brains, update, reset,
    updateEffects(dt: number) { explosions.update(dt); },
    effectCount: explosions.activeCount,
    invalidateTerrain() { refreshBoxes(); visuals.invalidateTerrain(); },
    setEnabled(value: boolean) { enabled = value; if (!value) acceptingInput = false; },
    useTool(kind: ToolKind, player: Point3, facing: number) {
      if (!enabled || !acceptingInput || defeated) return false;
      refreshBoxes();
      const effect = tools.use(kind, player, facing);
      if (!effect) return false;
      toolVisuals.update(tools.snapshot().active);
      visuals.invalidateTerrain();
      options.onEvent?.({ kind: 'tool', actorId: 'player', targetId: effect.id, detail: kind, position: { ...effect.position }, value: effect.radius });
      if (kind === 'pulse') targets.forEach((target, id) => {
        if (brains[id].state === 'destroyed' || Math.hypot(target.center.x-player.x, target.center.z-player.z) > effect.radius ||
          !physicalLineOfSight({ x:player.x,y:player.y+1.05,z:player.z }, target.center)) return;
        const pushed = pushDroneAway(target.center, player, PULSE_PUSH_DISTANCE, obstacles, sampleHeight, rules.contactRadius, options.world?.bounds.halfSize);
        target.center.set(pushed.x, pushed.y, pushed.z); target.root.position.set(pushed.x, pushed.y - .8, pushed.z);
        tools.stun(stableIds[id]); reportToolEffect('pulse', id);
      });
      return true;
    },
    toolSnapshot: tools.snapshot,
    hit(target: Target) {
      const id = targets.indexOf(target);
      if (id < 0) return { id, hit: false, destroyed: false, hp: 0 };
      const bearing = Math.atan2(playerChest.x - target.center.x, playerChest.z - target.center.z);
      const visibleTarget = brains[id].state === 'locked' && canDroneDetect(target.center, bearing, playerChest, hasLineOfSight, rules);
      const before = brains[id].state;
      const result = hitDrone(brains[id], visibleTarget);
      reportState(id, before, 'hit-unaware');
      target.alive = !result.destroyed;
      if (result.hit && result.destroyed) { explosions.emit(target.center, 'destroyed'); target.root.visible = false;
        options.onEvent?.({ kind:'destroyed', actorId:'player', targetId:stableIds[id], position:{ x:target.center.x,y:target.center.y,z:target.center.z } }); }
      return { id, ...result };
    },
    snapshot() { return brains.map((b,id) => ({ id, stableId:stableIds[id], hp:b.hp, state:b.state, flight: takeoffElapsed < takeoffDuration ? 'taking-off' as const : b.state === 'locked' ? 'diving' as const : 'cruising' as const, yaw: Number(b.yaw.toFixed(3)), x:targets[id].center.x, y:targets[id].center.y, z:targets[id].center.z, lastSeen:b.lastSeen ? {...b.lastSeen} : null, stunned:tools.stunRemaining(stableIds[id]) > 0 })); },
    dispose() { visuals.dispose(); explosions.dispose(); toolVisuals.dispose(); },
  };
}
