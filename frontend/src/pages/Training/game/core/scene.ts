import * as THREE from 'three';
import type { GameAssets } from './assets';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { createGroundTintTexture, createContactShadows } from './gardenDetails';
import { addMeadowBackdrop } from './meadowBackdrop';
import { addNatureEnvironment } from './natureEnvironment';
import { createTerrain, type TerrainConfig } from './terrain';
import { mountainBoundaryRadius } from './worldLayout';
import { CHARACTER_RADIUS, CRATE_HEIGHT } from './movement';
import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';
import type { WorldDefinition } from '../../../../objects/worlds/WorldDefinition';
import type { WorldMarker } from '../../../../objects/worlds/WorldMarker';
import { createWorldRuntime, type WorldObstacle } from './worldRuntime.ts';
export { OBSTACLES } from './obstacles.ts';

export type Target = { root: THREE.Group; center: THREE.Vector3; alive: boolean; cooldown: number; pulse: number; reactToHit?: () => void };

export function createGarden(assets: GameAssets, lowDetail = false, droneSpawns: DroneRules['spawns'] = DEFAULT_DRONE_RULES.spawns, world?: WorldDefinition) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c4dce1');
  scene.fog = new THREE.Fog('#c4dce1', 65, 195);
  const hemi = new THREE.HemisphereLight('#d8eaf4', '#566c52', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0e0', 2.15);
  sun.position.set(-18, 26, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowDetail?1024:2048, lowDetail?1024:2048);
  sun.shadow.camera.left = -19; sun.shadow.camera.right = 19;
  sun.shadow.camera.top = 19; sun.shadow.camera.bottom = -19;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 75;
  sun.shadow.normalBias = 0.045;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const skyFill = new THREE.DirectionalLight('#c6e4f6', 0.35);
  skyFill.position.set(9, 8, -12); scene.add(skyFill);
  const terrain = createTerrain();
  if (world) terrain.update(world.terrain);
  const worldRuntime = createWorldRuntime(world, terrain.sampleHeight);
  const obstacles = worldRuntime.obstacles;
  const worldSpawn = world ? { ...world.spawn } : { x: 0, z: 4, yaw: 0 };
  const grass = terrain.mesh;
  const groundPositions = grass.geometry.getAttribute('position');
  const groundUVs = new Float32Array(groundPositions.count * 2);
  for (let i = 0; i < groundPositions.count; i++) {
    groundUVs[i * 2] = groundPositions.getX(i) / 10;
    groundUVs[i * 2 + 1] = groundPositions.getZ(i) / 10;
  }
  grass.geometry.setAttribute('uv', new THREE.BufferAttribute(groundUVs, 2));
  grass.material.map = createGroundTintTexture();
  scene.add(grass);
  addMeadowBackdrop(scene);
  const contacts = createContactShadows(scene, terrain.sampleHeight);
  const groundedObjects: Array<{ root: THREE.Object3D; offset: number; footprint?: number }> = [];
  const sceneryRoots: THREE.Object3D[] = [];
  const gateRoots: THREE.Object3D[] = [];
  const structurePalette = createStructurePalette();

  function groundObject(root: THREE.Object3D, offset = 0, footprint?: number) {
    groundedObjects.push({ root, offset, footprint });
    root.position.y = terrain.sampleHeight(root.position.x, root.position.z) + offset;
  }

  worldRuntime.allObstacles.forEach(o => {
    const root = o.kind === 'wall' || o.kind === 'gate'
      ? createStructuralObstacle(o, structurePalette)
      : fitModel(assets.arenaProps.scene.getObjectByName(o.kind === 'barrel' ? 'Barrel' : 'SupplyCrate')!.clone(true), new THREE.Vector3(o.halfX * 2, o.height ?? CRATE_HEIGHT, o.halfZ * 2));
    root.name = `WorldObject:${o.id}`;
    root.userData.worldObjectId = o.id;
    root.userData.worldObjectKind = o.kind;
    root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    root.position.set(o.x, 0, o.z); scene.add(root); groundObject(root);
    // Moving gates stay out of static instance batches. Their complete visual and physical
    // entity disappears together, so an open shortcut never retains an invisible wall.
    if (o.kind === 'gate') gateRoots.push(root);
    else sceneryRoots.push(root);
    if (o.kind !== 'gate') contacts.add(o.x, o.z, o.halfX * 2.7, o.halfZ * 2.7, .23);
  });
  const beaconMarker = world ? createMissionMarker(scene, world.beacon, 'beacon', terrain.sampleHeight) : null;
  const extractionMarker = world ? createMissionMarker(scene, world.extraction, 'extraction', terrain.sampleHeight) : null;
  // The practice clearing opens directly into the valley; the mountain slopes form its boundary.
  const details = addNatureEnvironment(scene, assets.nature, terrain.sampleHeight, lowDetail);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#d4bd8b', roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.37, 0.035, 6), stoneMaterial);
    stone.position.set(-1.7 + Math.sin(i) * 0.23, 0.01, 8.7 - i * 1.15); stone.rotation.y = i * 0.6; stone.receiveShadow = true; scene.add(stone); groundObject(stone, 0.012);
  }
  const droneMixers: Array<{mixer:THREE.AnimationMixer;idle:THREE.AnimationAction;hit:THREE.AnimationAction|null;root:THREE.Group}> = [];
  const targets: Target[] = (world?.drones ?? droneSpawns).map(({x,z,yaw}) => {
    const model=cloneSkeleton(assets.drone.scene);
    const root=fitModel(model,new THREE.Vector3(1.45,1.55,1.45),true);
    root.position.set(x,0,z);root.rotation.y=yaw;scene.add(root);groundObject(root,.4);
    const mixer=new THREE.AnimationMixer(model);
    const idle=mixer.clipAction(THREE.AnimationClip.findByName(assets.drone.animations,'Idle')!).play();
    const hitClip=THREE.AnimationClip.findByName(assets.drone.animations,'Hit');
    const hit=hitClip?mixer.clipAction(hitClip).setLoop(THREE.LoopOnce,1):null;
    droneMixers.push({mixer,idle,hit,root});
    // Moving drones use the live shadow map, never a decal left at their spawn.
    return {root,center:new THREE.Vector3(x,1.25,z),alive:true,cooldown:0,pulse:0,reactToHit(){hit?.reset().setEffectiveWeight(1).play();}};
  });

  const debug = new THREE.Group(); debug.name = 'CollisionDebug'; debug.visible = false; scene.add(debug);
  const obstacleBoxes = worldRuntime.allObstacles.map(() => {
    const helper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ffb54d'));
    debug.add(helper); return helper;
  });
  const boundaryGeometry = new THREE.BufferGeometry();
  const boundary = new THREE.LineLoop(boundaryGeometry, new THREE.LineBasicMaterial({ color: '#49b4eb', depthTest: false }));
  boundary.renderOrder = 5; debug.add(boundary);
  const sceneryBatches = batchScenery(scene, sceneryRoots);

  function updateObstacleDebug() {
    worldRuntime.allObstacles.forEach((obstacle, i) => {
      const y = terrain.sampleHeight(obstacle.x, obstacle.z);
      obstacleBoxes[i].box.set(new THREE.Vector3(obstacle.x - obstacle.halfX, y, obstacle.z - obstacle.halfZ), new THREE.Vector3(obstacle.x + obstacle.halfX, y + (obstacle.height ?? CRATE_HEIGHT), obstacle.z + obstacle.halfZ));
      obstacleBoxes[i].visible = obstacle.kind !== 'gate' || !worldRuntime.gateOpen;
    });
  }

  function setGateOpen(value: boolean) {
    worldRuntime.setGateOpen(value);
    gateRoots.forEach(root => { root.visible = !value; });
    updateObstacleDebug();
  }

  function setBeaconActivated(value: boolean) {
    beaconMarker?.setActivated(value);
    extractionMarker?.setActivated(value);
  }

  function setTerrain(config: TerrainConfig) {
    terrain.update(config);
    for (const { root, offset, footprint } of groundedObjects) {
      const { x, z } = root.position;
      let height = terrain.sampleHeight(x, z);
      if (footprint) {
        const dx = Math.cos(root.rotation.y) * footprint;
        const dz = -Math.sin(root.rotation.y) * footprint;
        // Long wall sections penetrate the uphill side instead of hovering over a slope.
        height = Math.min(height, terrain.sampleHeight(x + dx, z + dz), terrain.sampleHeight(x - dx, z - dz));
      }
      root.position.y = height + offset;
    }
    targets.forEach(target => { target.center.set(target.root.position.x, target.root.position.y + .8, target.root.position.z); });
    details.updateGround();
    contacts.updateGround();
    sceneryBatches.update();
    worldRuntime.getProjectileBoxes();
    updateObstacleDebug();
    beaconMarker?.updateGround();
    extractionMarker?.updateGround();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 192; i++) {
      const angle = i / 192 * Math.PI * 2;
      const radius = world ? world.bounds.halfSize / Math.max(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle))) : mountainBoundaryRadius(angle);
      const x = Math.sin(angle)*radius, z = Math.cos(angle)*radius;
      points.push(new THREE.Vector3(x,terrain.sampleHeight(x,z)+.06,z));
    }
    boundaryGeometry.setFromPoints(points);
    boundaryGeometry.computeBoundingSphere();
  }

  function setDebug(value: boolean) { terrain.setWireframe(value); debug.visible = value; characterFootprint.visible = value; }
  setTerrain(terrain.config);
  const character = new THREE.Group();
  const dragon = cloneSkeleton(assets.nailong.scene); character.add(dragon);
  character.position.set(worldSpawn.x, terrain.sampleHeight(worldSpawn.x, worldSpawn.z), worldSpawn.z);
  character.rotation.y = worldSpawn.yaw; scene.add(character);
  // This ring visualizes the horizontal circle used by moveWithCollisions, not a capsule rigid body.
  const characterFootprint = new THREE.Group(); characterFootprint.name = 'CharacterPlanarCollisionRadius'; characterFootprint.visible = false;
  const footprintMaterial = new THREE.MeshBasicMaterial({ color: '#36ddeb', depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const footprint = new THREE.Mesh(new THREE.RingGeometry(CHARACTER_RADIUS - 0.018, CHARACTER_RADIUS + 0.018, 48), footprintMaterial);
  footprint.rotation.x = -Math.PI / 2; footprint.position.y = 0.025; footprint.renderOrder = 8; characterFootprint.add(footprint);
  const footprintWall = new THREE.Mesh(new THREE.CylinderGeometry(CHARACTER_RADIUS, CHARACTER_RADIUS, 0.16, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#36ddeb', transparent: true, opacity: 0.13, depthTest: false, side: THREE.DoubleSide }));
  footprintWall.position.y = 0.09; footprintWall.renderOrder = 7; characterFootprint.add(footprintWall);
  character.add(characterFootprint);
  const gun = assets['bubble-gun'].scene.clone(true);
  dragon.getObjectByName('weapon_socket')!.add(gun);
  const mixer = new THREE.AnimationMixer(dragon);
  const idle = mixer.clipAction(THREE.AnimationClip.findByName(assets.nailong.animations,'Idle')!);
  const walk = mixer.clipAction(THREE.AnimationClip.findByName(assets.nailong.animations,'Walk')!);
  idle.play(); walk.play().setEffectiveWeight(0);
  const sunOffset = new THREE.Vector3(-18,26,16);
  function updateEnvironment(dt:number,camera?:THREE.Camera,focus?:THREE.Vector3,force=false) {
    if (focus) {
      // One small shadow map follows exploration; resolution does not scale with world area.
      // Quantized movement limits shimmer while keeping the same sun direction.
      sun.target.position.set(Math.round(focus.x*4)/4,Math.round(focus.y*4)/4,Math.round(focus.z*4)/4);
      sun.position.copy(sun.target.position).add(sunOffset);
      sun.target.updateMatrixWorld();
    }
    details.update(dt,camera,focus,force);
    beaconMarker?.update(dt);
    extractionMarker?.update(dt);
    for(const drone of droneMixers) {
      const near=!focus || drone.root.position.distanceToSquared(focus)<40*40;
      if(near)drone.mixer.update(dt);
      drone.root.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=!focus||drone.root.position.distanceToSquared(focus)<18*18;});
    }
  }
  function dispose() {
    mixer.stopAllAction();
    mixer.uncacheRoot(dragon);
    for (const drone of droneMixers) {
      drone.mixer.stopAllAction();
      drone.mixer.uncacheRoot(drone.mixer.getRoot());
    }
  }
  function seekEnvironmentTime(seconds: number) {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    for (const drone of droneMixers) drone.mixer.setTime(time);
    beaconMarker?.seek(time); extractionMarker?.seek(time);
  }
  return { scene, character, dragon, gun, mixer, idle, walk, targets, ground: grass, terrain, setTerrain, setDebug, debug, updateEnvironment, natureCount: details.count, natureStats: details.stats, dispose,
    obstacles, getProjectileBoxes: worldRuntime.getProjectileBoxes, setGateOpen, setBeaconActivated, worldSpawn, seekEnvironmentTime };
}

/** Shared low-poly bevels catch the sun; five wall materials mean five instanced draws per garden. */
function createStructurePalette() {
  const vertices: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    vertices.push(new THREE.Vector3(x * .5, y * .445, z * .445), new THREE.Vector3(x * .445, y * .5, z * .445), new THREE.Vector3(x * .445, y * .445, z * .5));
  }
  return {
    block: new ConvexGeometry(vertices), backing: new THREE.BoxGeometry(1, 1, 1),
    mortar: new THREE.MeshStandardMaterial({ color: '#666c5d', roughness: 1 }),
    stones: ['#aaa68b', '#999c83', '#b8ad91'].map(color => new THREE.MeshStandardMaterial({ color, roughness: .95, flatShading: true })),
    coping: new THREE.MeshStandardMaterial({ color: '#c1b496', roughness: .92, flatShading: true }),
    gate: new THREE.MeshStandardMaterial({ color: '#3c4844', roughness: .65, metalness: .3 }),
    gateFrame: new THREE.MeshStandardMaterial({ color: '#737b69', roughness: .72, metalness: .22 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c49e60', emissive: '#775024', emissiveIntensity: .12, roughness: .58, metalness: .42 }),
  };
}

/** Every cap, pier and stone stays inside the same axis-aligned physical box. */
function createStructuralObstacle(obstacle: WorldObstacle, palette: ReturnType<typeof createStructurePalette>) {
  const root = new THREE.Group();
  const width = obstacle.halfX * 2, depth = obstacle.halfZ * 2, height = obstacle.height ?? CRATE_HEIGHT;
  const alongX = width >= depth, length = Math.max(width, depth), thickness = Math.min(width, depth);
  function part(length: number, height: number, thickness: number, along: number, y: number, material: THREE.Material, bevel = true) {
    const mesh = new THREE.Mesh(bevel ? palette.block : palette.backing, material);
    mesh.scale.set(alongX ? length : thickness, height, alongX ? thickness : length);
    mesh.position.set(alongX ? along : 0, y, alongX ? 0 : along); root.add(mesh);
  }

  if (obstacle.kind === 'gate') {
    // Recessed individual leaves and raised framing read as a solid metal shutter, not a flat cyan plane.
    const rail = Math.min(.18, height * .12), post = Math.min(.24, length * .1);
    part(length, height, thickness * .56, 0, height / 2, palette.gate);
    for (const y of [rail / 2, height - rail / 2]) part(length, rail, thickness, 0, y, palette.gateFrame);
    for (const sign of [-1, 1]) part(post, height - 2 * rail, thickness, sign * (length - post) / 2, height / 2, palette.gateFrame);
    const clear = length - 2 * post;
    const columns = Math.max(2, Math.min(8, Math.ceil(clear / .8)));
    for (let index = 0; index < columns; index++) {
      const x = -clear / 2 + (index + .5) * clear / columns;
      part(clear / columns - .035, height - 2 * rail - .04, thickness * .76, x, height / 2, palette.gate);
    }
    // Warm cross-members and the lock are readable details, not glowing hazard stripes.
    for (const y of [height * .27, height * .73]) part(clear, Math.min(.075, height * .05), thickness * .86, 0, y, palette.brass);
    part(Math.min(.26, clear * .24), Math.min(.38, height * .22), thickness * .94, 0, height * .5, palette.brass);
    instanceStructureParts(root);
    return root;
  }

  const capHeight = Math.min(.24, height * .12), footing = Math.min(.22, height * .12);
  const pierWidth = Math.min(.48, length * .13);
  const bodyHeight = height - capHeight - footing;
  const clearLength = length - 2 * pierWidth;
  // Dark, inset mortar remains solid behind seams; front stones supply the surface relief.
  part(length, height - capHeight, thickness * .76, 0, (height - capHeight) / 2, palette.mortar, false);
  part(length, footing, thickness * .96, 0, footing / 2, palette.stones[1]);
  const rows = Math.max(2, Math.min(4, Math.ceil(bodyHeight / .78)));
  const courses = Math.max(1, Math.min(8, Math.ceil(clearLength / 1.55)));
  const cell = clearLength / courses, rowHeight = bodyHeight / rows;
  const seed = [...obstacle.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  for (let row = 0; row < rows; row++) {
    // Alternating half-block starts create honest masonry joints with no texture or extra light pass.
    const shift = row % 2 ? cell / 2 : 0;
    for (let column = -1; column < courses; column++) {
      const left = Math.max(-clearLength / 2, -clearLength / 2 + column * cell + shift);
      const right = Math.min(clearLength / 2, -clearLength / 2 + (column + 1) * cell + shift);
      if (right - left < .06) continue;
      const shade = (row * 7 + column + 7 + seed) % palette.stones.length;
      part(right - left - .025, rowHeight - .035, thickness * (.88 + shade * .025), (left + right) / 2, footing + (row + .5) * rowHeight, palette.stones[shade]);
    }
    for (const sign of [-1, 1]) part(pierWidth, rowHeight - .018, thickness, sign * (length - pierWidth) / 2, footing + (row + .5) * rowHeight, palette.stones[(row + seed) % palette.stones.length]);
  }
  const caps = Math.max(1, Math.min(8, Math.ceil(length / 1.8)));
  for (let index = 0; index < caps; index++) {
    part(length / caps - .016, capHeight, thickness, -length / 2 + (index + .5) * length / caps, height - capHeight / 2, palette.coping);
  }
  return root;
}

/** Gates cannot join static garden batches; three local instances keep each whole gate to three draws. */
function instanceStructureParts(root: THREE.Group) {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...root.children]) {
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.updateMatrix();
    const bucket = buckets.get(mesh.material) ?? [];
    bucket.push(mesh); buckets.set(mesh.material, bucket); root.remove(mesh);
  }
  for (const [material, sources] of buckets) {
    const batch = new THREE.InstancedMesh(sources[0].geometry, material, sources.length);
    sources.forEach((source, index) => batch.setMatrixAt(index, source.matrix));
    batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); root.add(batch);
  }
}

/** Objective rings follow the same sampled ground; no floating billboard or extra light pass. */
function createMissionMarker(scene: THREE.Scene, marker: WorldMarker, kind: 'beacon' | 'extraction', sampleHeight: (x: number, z: number) => number) {
  const root = new THREE.Group(); root.name = `WorldMarker:${marker.id}`; root.userData.worldMarkerId = marker.id;
  root.position.set(marker.x, sampleHeight(marker.x, marker.z), marker.z); scene.add(root);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: kind === 'beacon' ? '#efc97d' : '#8db3b0', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(.1, marker.radius - .065), marker.radius, 64), ringMaterial);
  ring.geometry.rotateX(-Math.PI / 2); ring.renderOrder = 2; root.add(ring);
  const ringPositions = ring.geometry.getAttribute('position');
  const signalMaterial = new THREE.MeshStandardMaterial({ color: '#e6c580', emissive: '#b78335', emissiveIntensity: .42, roughness: .38, metalness: .18 });
  let signal: THREE.Mesh | null = null;
  if (kind === 'beacon') {
    const metal = new THREE.MeshStandardMaterial({ color: '#455c60', roughness: .7, metalness: .3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.28, .42, .22, 8), metal); base.position.y = .11; root.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.1, .16, .64, 8), metal); stem.position.y = .52; root.add(stem);
    signal = new THREE.Mesh(new THREE.OctahedronGeometry(.28), signalMaterial); signal.position.y = 1.04; root.add(signal);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.055, .43, .055), metal);
      const angle = i * Math.PI * 2 / 3;
      arm.position.set(Math.cos(angle) * .28, .91, Math.sin(angle) * .28); root.add(arm);
    }
    base.castShadow = stem.castShadow = true;
  } else {
    // Four short corner indicators make the return zone readable even when viewed edge-on.
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(.12, .32, .12), signalMaterial);
      tick.position.set(Math.cos(angle) * marker.radius, .16, Math.sin(angle) * marker.radius); root.add(tick);
    }
  }
  let activated = false, time = 0;
  function updateGround() {
    const y = sampleHeight(marker.x, marker.z); root.position.y = y;
    for (let index = 0; index < ringPositions.count; index++) {
      const x = ringPositions.getX(index), z = ringPositions.getZ(index);
      ringPositions.setY(index, sampleHeight(marker.x + x, marker.z + z) - y + .045);
    }
    ringPositions.needsUpdate = true; ring.geometry.computeBoundingSphere();
    if (kind === 'extraction') root.children.forEach(child => {
      if (child !== ring) child.position.y = sampleHeight(marker.x + child.position.x, marker.z + child.position.z) - y + .16;
    });
  }
  function setActivated(value: boolean) {
    activated = value;
    ringMaterial.color.set(value ? '#94f0c5' : kind === 'beacon' ? '#efc97d' : '#8db3b0');
    signalMaterial.color.set(value ? '#b3f9d9' : '#e6c580');
    signalMaterial.emissive.set(value ? '#42b99b' : '#b78335');
    signalMaterial.emissiveIntensity = value ? .8 : .25;
  }
  function update(dt: number) {
    if (Number.isFinite(dt) && dt > 0) time += dt;
    if (signal) { signal.rotation.y = time * .6; signal.position.y = 1.04 + Math.sin(time * 1.8) * .035; }
    ringMaterial.opacity = activated ? .78 + Math.sin(time * 2) * .12 : kind === 'beacon' ? .74 : .4;
  }
  updateGround(); setActivated(false);
  return { root, setActivated, updateGround, update, seek(seconds: number) { time = seconds; update(0); } };
}

function fitModel(model:THREE.Object3D,size:THREE.Vector3,uniform=false) {
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model);
  const sourceSize=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());
  const scale=uniform?new THREE.Vector3().setScalar(size.y/sourceSize.y):size.clone().divide(sourceSize);
  const normalizer=new THREE.Group();normalizer.scale.copy(scale);normalizer.position.set(-center.x*scale.x,-box.min.y*scale.y,-center.z*scale.z);normalizer.add(model);
  const root=new THREE.Group();root.add(normalizer);return root;
}

/** All matching static GLB meshes share instanced draws; root transforms remain editable. */
function batchScenery(scene: THREE.Scene, roots: THREE.Object3D[]) {
  const buckets = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; sources: THREE.Mesh[]; castShadow: boolean; receiveShadow: boolean }>();
  roots.forEach(root => {
    root.updateMatrixWorld(true);
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materialKey = (Array.isArray(object.material) ? object.material : [object.material]).map(material => material.uuid).join(',');
      const key = `${object.geometry.uuid}:${materialKey}:${object.castShadow}`;
      if (!buckets.has(key)) buckets.set(key, { geometry: object.geometry, material: object.material, sources: [], castShadow: object.castShadow, receiveShadow: object.receiveShadow });
      buckets.get(key)!.sources.push(object);
      object.visible = false;
    });
  });
  const batches = [...buckets.values()].map(bucket => {
    const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.sources.length);
    mesh.name = 'InstancedGardenScenery'; mesh.castShadow = bucket.castShadow; mesh.receiveShadow = bucket.receiveShadow;
    scene.add(mesh);
    return { mesh, sources: bucket.sources };
  });
  function update() {
    roots.forEach(root => root.updateMatrixWorld(true));
    for (const { mesh, sources } of batches) {
      sources.forEach((source, i) => mesh.setMatrixAt(i, source.matrixWorld));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
  }
  update();
  return { update };
}
