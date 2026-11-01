import * as THREE from 'three';
import type { GameAssets } from './assets';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createGroundTintTexture, createContactShadows } from './gardenDetails';
import { addMeadowBackdrop } from './meadowBackdrop';
import { addNatureEnvironment } from './natureEnvironment';
import { createTerrain, type TerrainConfig } from './terrain';
import { mountainBoundaryRadius } from './worldLayout';
import { CHARACTER_RADIUS, CRATE_HEIGHT } from './movement';
import { DEFAULT_DRONE_RULES, type DroneRules } from './defaultRules.ts';
import { OBSTACLES } from './obstacles.ts';
export { OBSTACLES } from './obstacles.ts';

export type Target = { root: THREE.Group; center: THREE.Vector3; alive: boolean; cooldown: number; pulse: number; reactToHit?: () => void };

export function createGarden(assets: GameAssets, lowDetail = false, droneSpawns: DroneRules['spawns'] = DEFAULT_DRONE_RULES.spawns) {
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

  function groundObject(root: THREE.Object3D, offset = 0, footprint?: number) {
    groundedObjects.push({ root, offset, footprint });
    root.position.y = terrain.sampleHeight(root.position.x, root.position.z) + offset;
  }

  OBSTACLES.forEach(o => {
    const source=assets.arenaProps.scene.getObjectByName(o.model==='barrel'?'Barrel':'SupplyCrate')!;
    const root=fitModel(source.clone(true),new THREE.Vector3(o.halfX*2,o.height??CRATE_HEIGHT,o.halfZ*2));
    root.position.set(o.x,0,o.z);scene.add(root);groundObject(root);sceneryRoots.push(root);
    contacts.add(o.x,o.z,o.halfX*2.7,o.halfZ*2.7,.23);
  });
  // The practice clearing opens directly into the valley; the mountain slopes form its boundary.
  const details = addNatureEnvironment(scene, assets.nature, terrain.sampleHeight, lowDetail);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#d4bd8b', roughness: 1 });
  for (let i = 0; i < 6; i++) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.37, 0.035, 6), stoneMaterial);
    stone.position.set(-1.7 + Math.sin(i) * 0.23, 0.01, 8.7 - i * 1.15); stone.rotation.y = i * 0.6; stone.receiveShadow = true; scene.add(stone); groundObject(stone, 0.012);
  }
  const droneMixers: Array<{mixer:THREE.AnimationMixer;idle:THREE.AnimationAction;hit:THREE.AnimationAction|null;root:THREE.Group}> = [];
  const targets: Target[] = droneSpawns.map(({x,z,yaw}) => {
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
  const obstacleBoxes = OBSTACLES.map(() => {
    const helper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ffb54d'));
    debug.add(helper); return helper;
  });
  const boundaryGeometry = new THREE.BufferGeometry();
  const boundary = new THREE.LineLoop(boundaryGeometry, new THREE.LineBasicMaterial({ color: '#49b4eb', depthTest: false }));
  boundary.renderOrder = 5; debug.add(boundary);
  const sceneryBatches = batchScenery(scene, sceneryRoots);

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
    OBSTACLES.forEach((obstacle, i) => {
      const y = terrain.sampleHeight(obstacle.x, obstacle.z);
      obstacleBoxes[i].box.set(new THREE.Vector3(obstacle.x - obstacle.halfX, y, obstacle.z - obstacle.halfZ), new THREE.Vector3(obstacle.x + obstacle.halfX, y + (obstacle.height??CRATE_HEIGHT), obstacle.z + obstacle.halfZ));
    });
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 192; i++) {
      const angle = i / 192 * Math.PI * 2;
      const radius = mountainBoundaryRadius(angle);
      const x = Math.sin(angle)*radius, z = Math.cos(angle)*radius;
      points.push(new THREE.Vector3(x,terrain.sampleHeight(x,z)+.06,z));
    }
    boundaryGeometry.setFromPoints(points);
    boundaryGeometry.computeBoundingSphere();
  }

  function setDebug(value: boolean) { terrain.setWireframe(value); debug.visible = value; characterFootprint.visible = value; }
  setTerrain(terrain.config);
  const character = new THREE.Group();
  const dragon = cloneSkeleton(assets.nailong.scene); character.add(dragon); character.position.set(0,0,4); scene.add(character);
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
  return { scene, character, dragon, gun, mixer, idle, walk, targets, ground: grass, terrain, setTerrain, setDebug, debug, updateEnvironment, natureCount: details.count, natureStats: details.stats, dispose };
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
