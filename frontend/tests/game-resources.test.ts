import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createResourceDisposer } from '../src/pages/Training/game/resources';

test('shared GLTF geometry, material, texture and custom shadow materials release once', () => {
  const scene = new THREE.Scene();
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const depth = new THREE.MeshDepthMaterial({ map: texture });
  const model = new THREE.Mesh(geometry, material); model.customDepthMaterial = depth; source.add(model);
  scene.add(source.clone(true)); scene.environment = texture;
  const counts = { geometry: 0, material: 0, depth: 0, texture: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  material.addEventListener('dispose', () => counts.material++);
  depth.addEventListener('dispose', () => counts.depth++);
  texture.addEventListener('dispose', () => counts.texture++);
  const disposer = createResourceDisposer(); disposer.object(scene); disposer.object(source); disposer.object(scene);
  assert.deepEqual(counts, { geometry: 1, material: 1, depth: 1, texture: 1 });
});

test('instance buffers and skeleton bone textures receive disposal events', () => {
  const scene = new THREE.Scene();
  const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  const skinned = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  skinned.skeleton = new THREE.Skeleton([new THREE.Bone()]); skinned.skeleton.computeBoneTexture();
  let instanceDisposals = 0, boneDisposals = 0;
  instanced.addEventListener('dispose', () => instanceDisposals++);
  skinned.skeleton.boneTexture!.addEventListener('dispose', () => boneDisposals++);
  scene.add(instanced, skinned);
  const disposer = createResourceDisposer(); disposer.object(scene); disposer.object(scene);
  assert.equal(instanceDisposals, 1); assert.equal(boneDisposals, 1);
});
