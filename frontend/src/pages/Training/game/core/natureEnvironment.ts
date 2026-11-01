import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { natureLodIndices } from './natureLod';
import { mountainBoundaryRadius, valleyPathDistance } from './worldLayout';

type Placement = { x: number; z: number; height: number; yaw: number; tint: number; y: number; matrix: THREE.Matrix4; lod: number; fadeFrom: number; fadeTo: number; fadeStart: number; endDistance: number; occluded: boolean };
type Species = 'TreeA' | 'TreeB' | 'TreeC' | 'Pine' | 'Bush' | 'Fern' | 'Grass' | 'FlowerA' | 'FlowerB' | 'RockA' | 'RockB';
export type NatureTreeBounds = { x: number; z: number; y: number; height: number; radius: number };

/** Quaternius models are baked to one-metre templates, then instanced in a composed meadow. */
export function addNatureEnvironment(scene: THREE.Scene, library: GLTF, sampleHeight: (x: number, z: number) => number, lowDetail = false) {
  const root = new THREE.Group(); root.name = 'QuaterniusMegaKitEnvironment'; scene.add(root);
  const placements = new Map<Species, Placement[]>();
  let seed = 241018;
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function place(name: Species, x: number, z: number, height: number) {
    const list = placements.get(name) ?? [];
    list.push({ x, z, height, yaw: random() * Math.PI * 2, tint: 0.9 + random() * 0.1, y: 0, matrix: new THREE.Matrix4(), lod: -1, fadeFrom: 1, fadeTo: 1, fadeStart: 0, endDistance: 1, occluded: false });
    placements.set(name, list);
  }

  // Frame clearings and walking routes rather than enclosing the old practice square.
  const trees: Array<[Species, number, number, number]> = [
    ['TreeA',-18,-6,9], ['TreeB',-21,3,10], ['TreeA',-18,13,9],
    ['TreeB',20,-4,10], ['TreeC',21,8,9], ['TreeA',17,18,10],
    ['TreeC',-19,-18,10], ['TreeA',-12,-24,9], ['TreeB',14,-24,10],
    ['TreeC',22,-16,12], ['Pine',-24,-10,12], ['Pine',25,1,13],
    ['TreeB',-24,18,10], ['TreeC',24,22,10], ['TreeA',-5,25,10], ['TreeB',8,26,12],
  ];
  trees.forEach(([name,x,z,height]) => place(name,x,z,height));
  for (let i=0;i<(lowDetail?26:44);i++) {
    const angle = random()*Math.PI*2;
    const radius = 25+random()*(mountainBoundaryRadius(angle)-29);
    const x = Math.sin(angle)*radius, z = Math.cos(angle)*radius;
    if (z < -18 && Math.abs(x)<10) continue;
    place(i%3===0?'Pine':i%2===0?'TreeB':'TreeC',x,z,5.5+random()*3.5);
  }
  // Small pockets around the rim, leaving the firing lanes and spawning area legible.
  const beds = [[-9,-7],[-9,1],[-8,8],[9,5],[9,-8],[5,-10],[-5,-11],[-17,-11],[19,-12],[-18,15],[18,17],[-27,-20],[25,-25],[3,-31],[-26,26],[27,24],[5,34]];
  beds.forEach(([cx,cz], bed) => {
    place(bed%2?'RockA':'RockB',cx+0.9,cz-0.5,0.65+random()*0.9);
    place('Bush',cx-0.65,cz-0.4,1+random()*0.5);
    for (let i=0;i<7;i++) {
      const a=random()*Math.PI*2,r=random()*2;
      place('Fern',cx+Math.sin(a)*r,cz+Math.cos(a)*r,0.35+random()*0.45);
    }
    for (let i=0;i<24;i++) {
      const a=random()*Math.PI*2,r=0.4+random()*2.4;
      place(bed%3===0?'FlowerB':'FlowerA',cx+Math.sin(a)*r,cz+Math.cos(a)*r,0.18+random()*0.26);
    }
  });
  // Stable world placements are cheap CPU data; only a small camera neighbourhood reaches the GPU.
  for (let i=0;i<(lowDetail?4200:11000);i++) {
    const x=(random()-0.5)*94, z=(random()-0.5)*94;
    if (Math.hypot(x,z)>mountainBoundaryRadius(Math.atan2(x,z))-2) continue;
    const distance=Math.hypot(x,z-4);
    if (distance<2 || valleyPathDistance(x,z)<1.1) continue;
    if (Math.abs(x)<7 && Math.abs(z)<9 && random()<0.63) continue;
    place('Grass',x,z,0.21+random()*0.28);
  }

  const wind = { value: 0 };
  const viewXZ = { value: new THREE.Vector2(0, 13) };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  type Batch = { mesh: THREE.InstancedMesh; fade: THREE.InstancedBufferAttribute; level: number };
  type Family = { name: Species; list: Placement[]; batches: Batch[]; radius: number; small: boolean; tree: boolean; limits: [number, number, number] };
  const families: Family[] = [];
  const treeBounds: NatureTreeBounds[] = [];
  const stats = { visibleInstances: 0, nearInstances: 0, mediumInstances: 0, farInstances: 0, occludedTrees: 0, renderedTriangles: 0 };
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const cameraPosition = new THREE.Vector3();
  const focusPosition = new THREE.Vector3();
  let lastCamera: THREE.Camera | undefined;
  let lastFocus: THREE.Vector3 | undefined;
  let regroupTime = 1;
  function addWind(material: THREE.Material, amount: number, softNormals = false, fade = true, groundCover = false) {
    material.onBeforeCompile = shader => {
      shader.uniforms.uMeadowWind = wind;
      shader.uniforms.uMeadowViewXZ = viewXZ;
      shader.vertexShader = 'uniform float uMeadowWind;\n' + shader.vertexShader;
      if (fade) {
        shader.vertexShader = 'attribute vec4 instanceMeadowFade;\nvarying float vMeadowAlpha;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          vMeadowAlpha = mix(instanceMeadowFade.x, instanceMeadowFade.y, clamp((uMeadowWind - instanceMeadowFade.z) / .24, 0., 1.));
          #include <begin_vertex>
        `);
        shader.fragmentShader = 'varying float vMeadowAlpha;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
          #include <alphatest_fragment>
          float meadowDither = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715))));
          if (vMeadowAlpha <= meadowDither) discard;
        `);
      }
      if(softNormals)shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
          objectNormal = normalize(mix(objectNormal, vec3(0., 1., 0.), .32));
      `);
      if (groundCover) {
        shader.vertexShader = 'uniform vec2 uMeadowViewXZ;\n' + shader.vertexShader;
        // Retreat into the ground, without removing random screen pixels. Each instance
        // has a different end distance; the transition is evaluated smoothly every frame.
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
          float meadowDistance = length(instanceMatrix[3].xz - uMeadowViewXZ);
          float meadowHeight = 1. - smoothstep(instanceMeadowFade.w * .48, instanceMeadowFade.w, meadowDistance);
          transformed.y *= meadowHeight;
          transformed.xz *= mix(.45, 1., meadowHeight);
          #include <project_vertex>
        `);
      }
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          float phase = uMeadowWind * 1.5 + instanceMatrix[3].x * .53 + instanceMatrix[3].z * .31;
          float tip = pow(clamp(position.y, 0., 1.), 1.6);
          transformed.x += (sin(phase) + .35 * sin(phase * 2.3 + position.x * 9.)) * tip * ${amount.toFixed(4)};
          transformed.z += cos(phase * .73) * tip * ${(amount*0.55).toFixed(4)};
        #endif
      `);
    };
    material.customProgramCacheKey=()=>`megakit-wind-lod-v2-${amount}-${softNormals}-${fade}-${groundCover}`;
  }
  for (const [name,list] of placements) {
    const source = library.scene.getObjectByName(name);
    if (!source) throw new Error(`MegaKit 缺少环境模型：${name}`);
    // Read the library without attaching it: keeping original mesh objects retains GLTF associations.
    const template = source;
    template.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(template);
    const size=box.getSize(new THREE.Vector3());
    const center=box.getCenter(new THREE.Vector3());
    const normalization=new THREE.Matrix4().makeScale(1/size.y,1/size.y,1/size.y)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x,-box.min.y,-center.z));
    const isRock=name.startsWith('Rock');
    const smallPlant=['Grass','Fern','FlowerA','FlowerB'].includes(name);
    const isTree = name.startsWith('Tree') || name === 'Pine';
    const limits: [number, number, number] = isTree ? (lowDetail ? [10,22,120] : [13,28,120]) : name === 'Grass' ? (lowDetail ? [3,8,29] : [4,10,40]) : smallPlant ? (lowDetail ? [5,12,37] : [7,16,48]) : [11,25,120];
    const family: Family = { name, list, batches: [], radius: Math.max(size.x, size.z) / size.y * .5, small: smallPlant, tree: isTree, limits };
    families.push(family);
    if (isTree) list.forEach(p => treeBounds.push({ x: p.x, z: p.z, y: 0, height: p.height, radius: family.radius * p.height }));
    template.traverse(object=>{
      if (!(object instanceof THREE.Mesh)) return;
      const geometry=object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalization,object.matrixWorld));
      const association = library.parser.associations.get(object);
      const indices = association?.meshes !== undefined && association.primitives !== undefined ? natureLodIndices(`${association.meshes}:${association.primitives}`, geometry) : undefined;
      const sourceMaterials=Array.isArray(object.material)?object.material:[object.material];
      const mapped=sourceMaterials.map(original=>{
        const key=`${original.uuid}:${smallPlant}`;
        if(materials.has(key))return materials.get(key)!;
        const mat=(original as THREE.MeshStandardMaterial).clone();
        mat.roughness=0.95;mat.metalness=0;
        // Alpha-cut leaves render in the opaque pass, avoiding transparent tree sorting artefacts.
        const foliage=Boolean(mat.map && !/bark/i.test(mat.name) && (mat.transparent||mat.alphaTest>0||smallPlant||/leaf|leaves|foliage/i.test(mat.name)));
        if(foliage){mat.alphaTest=0.3;mat.alphaToCoverage=true;mat.transparent=false;mat.side=THREE.DoubleSide;mat.emissive.set('#78985e');mat.emissiveIntensity=0.07;mat.emissiveMap=mat.map;}
        if(/Leaves_NormalTree/.test(mat.name))mat.color.set('#83a963');
        if(/Leaves_TwistedTree/.test(mat.name))mat.color.set('#789d58');
        if(/Leaves_Pine/.test(mat.name))mat.color.set('#638e70');
        if(mat.map){mat.map.anisotropy=4;}
        addWind(mat,isRock?0:smallPlant?0.12:0.018,foliage,true,smallPlant);
        materials.set(key,mat);return mat;
      });
      for (let level = 0; level < 3; level++) {
        // Share vertex buffers across LODs; only their triangle index buffers change.
        const lodGeometry = new THREE.BufferGeometry();
        for (const key of Object.keys(geometry.attributes)) lodGeometry.setAttribute(key, geometry.getAttribute(key));
        lodGeometry.setIndex(level === 0 || !indices ? geometry.index : new THREE.BufferAttribute(indices[level - 1], 1));
        lodGeometry.boundingBox = geometry.boundingBox?.clone() ?? null;
        lodGeometry.boundingSphere = geometry.boundingSphere?.clone() ?? null;
        const fade = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
        lodGeometry.setAttribute('instanceMeadowFade', fade);
        const mesh=new THREE.InstancedMesh(lodGeometry,Array.isArray(object.material)?mapped:mapped[0],list.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.name=`MegaKit_${name}_${object.name}_LOD${level}`;
        mesh.castShadow=!smallPlant && level === 0;mesh.receiveShadow=true;
        mesh.count = 0;
        if(!isRock&&mapped.length===1 && mesh.castShadow){
          const mat=mapped[0];
          const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:mat.map,alphaTest:mat.alphaTest,side:mat.side});
          // Occlusion removes the tree from the camera view, not its natural ground shadow.
          addWind(depth,smallPlant?0.12:0.018,false,false);mesh.customDepthMaterial=depth;
        }
        root.add(mesh);family.batches.push({mesh,fade,level});
      }
    });
  }
  function updateGround() {
    for(const {list} of families){
      list.forEach(p=>{
        p.y = sampleHeight(p.x,p.z)-0.018;
        dummy.position.set(p.x,p.y,p.z);
        dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.height);dummy.updateMatrix();
        p.matrix.copy(dummy.matrix);
      });
    }
    treeBounds.forEach(tree => { tree.y = sampleHeight(tree.x,tree.z); });
    regroupTime = 1;
    regroup();
  }
  function blocksView(p: Placement, radius: number) {
    // Expand the crown ellipsoid by a readable corridor around the avatar and crosshair.
    const rx = radius * p.height + .8, ry = p.height * .39 + .8;
    const ax = (cameraPosition.x - p.x) / rx, ay = (cameraPosition.y - p.y - p.height * .61) / ry, az = (cameraPosition.z - p.z) / rx;
    const dx = (focusPosition.x - cameraPosition.x) / rx, dy = (focusPosition.y - cameraPosition.y) / ry, dz = (focusPosition.z - cameraPosition.z) / rx;
    const t = THREE.MathUtils.clamp(-(ax * dx + ay * dy + az * dz) / Math.max(.0001, dx * dx + dy * dy + dz * dz), 0, 1);
    const distanceSquared = (ax + dx * t) ** 2 + (ay + dy * t) ** 2 + (az + dz * t) ** 2;
    return distanceSquared < (p.occluded ? 1.18 : 1);
  }
  function regroup() {
    if (lastCamera) {
      lastCamera.updateMatrixWorld();
      cameraPosition.setFromMatrixPosition(lastCamera.matrixWorld);
      projection.multiplyMatrices(lastCamera.projectionMatrix, lastCamera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      focusPosition.copy(lastFocus ?? cameraPosition); focusPosition.y += 1.2;
    } else cameraPosition.set(0,5,13);
    stats.visibleInstances = stats.nearInstances = stats.mediumInstances = stats.farInstances = stats.occludedTrees = stats.renderedTriangles = 0;
    for (const family of families) {
      const buckets: Placement[][] = [[],[],[]];
      for (const p of family.list) {
        const distance = Math.hypot(p.x-cameraPosition.x,p.z-cameraPosition.z);
        const [near, middle, far] = family.limits;
        // Stable jitter prevents a single circular grass boundary from following the camera.
        const endDistance = family.small ? far * (.86 + (p.tint - .9) * 2.8) : far;
        if (distance > endDistance) continue;
        sphere.center.set(p.x,p.y+p.height*.5,p.z);
        sphere.radius = p.height * Math.hypot(family.radius,.5) + .15;
        // Keep close shadow casters even off-camera so their shadows do not disappear.
        if (lastCamera && !frustum.intersectsSphere(sphere) && (family.small || distance > near + 1)) continue;
        const hysteresis = family.small ? .6 : 1.4;
        let level = distance < near ? 0 : distance < middle ? 1 : 2;
        if (p.lod >= 0 && p.lod !== level) {
          const boundary = Math.min(p.lod,level) === 0 ? near : middle;
          if (Math.abs(distance-boundary)<hysteresis) level = p.lod;
        }
        p.lod = level;
        p.endDistance = endDistance;
        const occluded = Boolean(family.tree && lastCamera && lastFocus && blocksView(p,family.radius));
        if (occluded) stats.occludedTrees++;
        // Fully clear the silhouette after the short transition; leaving 12% stipple
        // across a close canopy produces a distracting screen-sized dotted veil.
        const targetAlpha = occluded ? 0 : 1;
        if (targetAlpha !== p.fadeTo) {
          p.fadeFrom = THREE.MathUtils.lerp(p.fadeFrom,p.fadeTo,THREE.MathUtils.clamp((wind.value-p.fadeStart)/.24,0,1));
          p.fadeTo = targetAlpha;p.fadeStart = wind.value;
        }
        p.occluded = occluded;
        buckets[level].push(p);
        stats.visibleInstances++;
        if (level===0) stats.nearInstances++; else if(level===1) stats.mediumInstances++; else stats.farInstances++;
      }
      for (const {mesh,fade,level} of family.batches) {
        const list = buckets[level];mesh.count=list.length;mesh.visible=list.length>0;
        list.forEach((p,index)=>{
          mesh.setMatrixAt(index,p.matrix);color.setRGB(p.tint,p.tint,p.tint);mesh.setColorAt(index,color);
          fade.setXYZW(index,p.fadeFrom,p.fadeTo,p.fadeStart,p.endDistance);
        });
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;fade.needsUpdate=true;
        if (list.length) mesh.computeBoundingSphere();
        stats.renderedTriangles += list.length * (mesh.geometry.index?.count ?? 0) / 3;
      }
    }
  }
  updateGround();
  return { updateGround, treeBounds, stats, root, update(dt:number,camera?:THREE.Camera,focus?:THREE.Vector3,force=false){
    wind.value+=dt;regroupTime+=dt;
    if(camera){camera.getWorldPosition(cameraPosition);viewXZ.value.set(cameraPosition.x,cameraPosition.z);}
    if(camera)lastCamera=camera;if(focus)lastFocus=focus;
    if(force||regroupTime>=.15){regroupTime=0;regroup();}
  }, count:[...placements.values()].reduce((sum,list)=>sum+list.length,0) };
}
