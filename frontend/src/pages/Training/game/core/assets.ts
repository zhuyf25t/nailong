import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createResourceDisposer } from '../resources';

export const MODEL_NAMES = ['nailong', 'bubble-gun'] as const;
export type ModelName = (typeof MODEL_NAMES)[number];
export type GameAssets = Record<ModelName, GLTF> & { nature: GLTF; arenaProps: GLTF; drone: GLTF };

export async function loadAssets(progress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<GameAssets> {
  const loader = new GLTFLoader();
  let completed = 0;
  const files = [...MODEL_NAMES.map(name=>[name,`assets/models/${name}.glb`] as const), ['nature','assets/nature/megakit.glb'] as const,
    ['arenaProps','assets/arena/props.glb'] as const,['drone','assets/arena/eye-drone.glb'] as const];
  const outcomes = await Promise.allSettled(files.map(async ([name,path]) => {
    const url = new URL(`${import.meta.env.BASE_URL}${path}`, location.href);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`场景资源加载失败（${response.status}）`);
    const model = await loader.parseAsync(await response.arrayBuffer(), new URL('.', url).href);
    model.scene.traverse(object => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    if (!signal?.aborted) progress(++completed, files.length);
    return [name, model] as const;
  }));
  const failure = outcomes.find(outcome => outcome.status === 'rejected');
  if (failure || signal?.aborted) {
    const disposer = createResourceDisposer();
    for (const outcome of outcomes) if (outcome.status === 'fulfilled') disposer.object(outcome.value[1].scene);
    throw failure?.reason ?? new DOMException('场景已离开', 'AbortError');
  }
  const entries = outcomes.flatMap(outcome => outcome.status === 'fulfilled' ? [outcome.value] : []);
  const assets = Object.fromEntries(entries) as GameAssets;
  try {
    for (const name of ['Idle', 'Walk', 'Aim', 'Shoot']) {
      if (!assets.nailong.animations.some(animation => animation.name === name)) throw new Error(`角色缺少 ${name} 动画`);
    }
    if (!assets.nailong.scene.getObjectByName('weapon_socket')) throw new Error('角色缺少持枪节点');
    if (!assets['bubble-gun'].scene.getObjectByName('muzzle')) throw new Error('脉冲枪缺少枪口节点');
    if (!assets.arenaProps.scene.getObjectByName('SupplyCrate') || !assets.arenaProps.scene.getObjectByName('Barrel')) throw new Error('缺少精选场景道具');
    if (!assets.drone.animations.some(clip=>clip.name==='Idle')) throw new Error('训练无人机缺少待机动画');
    return assets;
  } catch (error) {
    const disposer = createResourceDisposer();
    for (const asset of Object.values(assets)) disposer.object(asset.scene);
    throw error;
  }
}

export async function loadLocalGlb(file: File): Promise<GLTF> {
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('请选择 .glb 文件');
  if (file.size > 30 * 1024 * 1024) throw new Error('请使用 30 MB 以内的 GLB');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 20 || new DataView(buffer).getUint32(0, true) !== 0x46546c67) throw new Error('这不是有效的 GLB 文件');
  // Local previews stay self-contained: never fetch external resources referenced by an uploaded GLB.
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(4,true)!==2 || view.getUint32(16,true)!==0x4e4f534a || jsonLength>buffer.byteLength-20) throw new Error('GLB 文件头不完整或版本不支持');
  const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const resources = [...(metadata.buffers ?? []), ...(metadata.images ?? [])];
  if (resources.some(resource => resource.uri && !resource.uri.startsWith('data:'))) throw new Error('请导出包含贴图的独立 GLB，不使用外部资源');
  return new GLTFLoader().parseAsync(buffer, '');
}
