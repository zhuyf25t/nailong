import * as THREE from 'three';

/** A mount owns its assets. Shared GLTF references are released exactly once. */
export function createResourceDisposer() {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  const skeletons = new Set<THREE.Skeleton>();
  const nodes = new Set<THREE.Object3D>();
  function texture(value: unknown) {
    if (!(value instanceof THREE.Texture) || textures.has(value)) return;
    textures.add(value);
    const image: unknown = value.source.data;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap && !images.has(image)) {
      images.add(image); image.close();
    }
    value.dispose();
  }
  function material(value: THREE.Material) {
    if (materials.has(value)) return;
    materials.add(value);
    for (const entry of Object.values(value)) texture(entry);
    if (value instanceof THREE.ShaderMaterial) for (const uniform of Object.values(value.uniforms)) texture(uniform.value);
    value.dispose();
  }
  function object(root: THREE.Object3D) {
    root.traverse(node => {
      if (nodes.has(node)) return;
      nodes.add(node);
      if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
        if (!geometries.has(node.geometry)) { geometries.add(node.geometry); node.geometry.dispose(); }
        for (const entry of Array.isArray(node.material) ? node.material : [node.material]) material(entry);
      }
      if (node instanceof THREE.Mesh) {
        if (node.customDepthMaterial) material(node.customDepthMaterial);
        if (node.customDistanceMaterial) material(node.customDistanceMaterial);
      }
      if (node instanceof THREE.SkinnedMesh && !skeletons.has(node.skeleton)) {
        skeletons.add(node.skeleton); node.skeleton.dispose();
      }
      if (node instanceof THREE.InstancedMesh) node.dispose();
      if (node instanceof THREE.DirectionalLight || node instanceof THREE.SpotLight || node instanceof THREE.PointLight) node.shadow.dispose();
    });
    if (root instanceof THREE.Scene) { texture(root.environment); texture(root.background); }
  }
  return { object, texture };
}
