import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { ReplayPayload } from '../../objects/records/ReplayPayload.ts';
import { loadAssets, type GameAssets } from '../Training/game/core/assets.ts';
import { createGarden } from '../Training/game/core/scene.ts';
import { createDroneVisuals } from '../Training/game/core/droneVisuals.ts';
import { createToolVisuals } from '../Training/game/core/toolVisuals.ts';
import { CURTAIN_HEIGHT, CURTAIN_SECONDS, DECOY_SECONDS, curtainBlocksSegment, type TacticalEffect } from '../Training/game/core/tacticalTools.ts';
import { segmentBoxTime, segmentTerrainTime, type ProjectileBox } from '../Training/game/core/shootingMath.ts';
import { createResourceDisposer } from '../Training/game/resources.ts';
import { clampReplayTime, replayScanRange, sampleReplay } from './player.ts';

export interface ReplayView {
  seek(timeMs: number): void;
  play(value: boolean): void;
  speed(value: number): void;
  camera(value: 'original' | 'overhead'): void;
  scans(value: boolean): void;
  path(value: boolean): void;
  dispose(): void;
}

interface ReplayViewOptions {
  signal: AbortSignal;
  onProgress(loaded: number, total: number): void;
  onTime(timeMs: number): void;
  onPlaying(value: boolean): void;
  onError(message: string): void;
}

/** Presentation only. Recorded state is the only source of entity positions and outcomes. */
export async function mountReplay(canvas: HTMLCanvasElement, replay: ReplayPayload, options: ReplayViewOptions): Promise<ReplayView> {
  if (replay.manifest.assetVersion !== 'garden-v1' || replay.manifest.formatVersion !== 1) throw new Error('这份回放使用了尚未支持的场景或回放版本。');
  let assets: GameAssets | undefined;
  let garden: ReturnType<typeof createGarden> | undefined;
  let visuals: ReturnType<typeof createDroneVisuals> | undefined;
  let toolVisuals: ReturnType<typeof createToolVisuals> | undefined;
  let reflection: THREE.WebGLRenderTarget | undefined;
  let observer: ResizeObserver | undefined;
  let disposed = false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1;
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 320);
  let timeMs = replay.manifest.coverage.fromMs, playing = false, rate = 1;
  let cameraMode: 'original' | 'overhead' = 'original', showScans = true, showPath = false;
  let previous = performance.now(), notified = 0;
  const pauseHidden = () => { if (document.hidden) { playing = false; options.onPlaying(false); } previous = performance.now(); };
  const lostContext = (event: Event) => { event.preventDefault(); playing = false; options.onPlaying(false); options.onError('图形上下文已中断，请重新加载回放。'); };
  function dispose() {
    if (disposed) return;
    disposed = true; renderer.setAnimationLoop(null); observer?.disconnect();
    document.removeEventListener('visibilitychange', pauseHidden); canvas.removeEventListener('webglcontextlost', lostContext);
    options.signal.removeEventListener('abort', dispose);
    visuals?.dispose(); toolVisuals?.dispose(); garden?.dispose();
    const disposer = createResourceDisposer();
    if (garden) disposer.object(garden.scene);
    if (assets) for (const asset of Object.values(assets)) disposer.object(asset.scene);
    reflection?.dispose(); renderer.dispose(); renderer.forceContextLoss();
    canvas.dataset.ready = 'false';
  }
  options.signal.addEventListener('abort', dispose, { once: true });
  try {
    assets = await loadAssets(options.onProgress, options.signal);
    if (disposed || options.signal.aborted) { const disposer = createResourceDisposer(); for (const asset of Object.values(assets)) disposer.object(asset.scene); throw new DOMException('已离开回放', 'AbortError'); }
    const frozenWorld = replay.manifest.world;
    const rules = { ...replay.manifest.config.drones, spawns: frozenWorld.drones };
    garden = createGarden(assets, true, rules.spawns, frozenWorld);
    const { scene, character, targets, terrain, mixer, idle, walk } = garden;
    const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
    try { reflection = generator.fromScene(room, .04); scene.environment = reflection.texture; scene.environmentIntensity = .45; }
    finally { room.dispose(); generator.dispose(); }
    const aimClip = THREE.AnimationClip.findByName(assets.nailong.animations, 'Aim');
    const aim = aimClip ? mixer.clipAction(aimClip).setLoop(THREE.LoopOnce, 1).play() : null;
    if (aim) aim.clampWhenFinished = true;
    visuals = createDroneVisuals(scene, terrain.sampleHeight, rules);
    const gates = new Map(frozenWorld.objects.filter(object => object.kind === 'gate').map(object => [object.id, scene.getObjectByName(`WorldObject:${object.id}`)]));
    let gateKey = '', toolKey = '';
    let boxes: ProjectileBox[] = [];
    const projectiles = new THREE.Group(); projectiles.name = 'ReplayProjectiles'; scene.add(projectiles);
    const coreGeometry = new THREE.SphereGeometry(.065, 10, 6);
    const trailGeometry = new THREE.CylinderGeometry(.045, 0, .42, 6); trailGeometry.rotateX(Math.PI / 2);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff2d2', toneMapped: false });
    const trailMaterial = new THREE.MeshBasicMaterial({ color: '#ffc879', toneMapped: false });
    const bulletSlots = Array.from({ length: 64 }, () => {
      const root = new THREE.Group(); const core = new THREE.Mesh(coreGeometry, coreMaterial); core.scale.z = 1.65;
      const trail = new THREE.Mesh(trailGeometry, trailMaterial); trail.position.z = -.27; root.add(core, trail); projectiles.add(root); return root;
    });
    toolVisuals = createToolVisuals(scene);
    const effectRoot = new THREE.Group(); effectRoot.name = 'ReplayRecordedEffects'; scene.add(effectRoot);
    const effectSlots = Array.from({ length: 16 }, () => {
      const material = new THREE.MeshBasicMaterial({ color: '#ffb96c', transparent: true, opacity: .8, wireframe: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material); effectRoot.add(mesh); return mesh;
    });
    const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(replay.frames.map(frame => new THREE.Vector3(frame.player.position.x, frame.player.position.y + .08, frame.player.position.z))), new THREE.LineBasicMaterial({ color: '#46ded1', transparent: true, opacity: .85, depthWrite: false }));
    path.name = 'ReplayPlayerPath'; scene.add(path);
    const forward = new THREE.Vector3(0, 0, 1), direction = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
    const eyePositions = frozenWorld.drones.map(() => new THREE.Vector3());
    function render() {
      if (disposed || !garden || !visuals) return;
      const frame = sampleReplay(replay, timeMs); if (!frame) return;
      character.position.set(frame.player.position.x, frame.player.position.y, frame.player.position.z);
      character.rotation.y = frame.player.yaw; character.visible = frame.player.alive;
      const walking = frame.player.animation === 'walk' ? 1 : 0;
      idle.setEffectiveWeight(1 - walking); walk.setEffectiveWeight(walking); aim?.setEffectiveWeight(frame.player.aimWeight);
      if (aim) aim.paused = false;
      mixer.setTime(frame.player.animationTime);
      frame.drones.forEach(drone => {
        const index = frozenWorld.drones.findIndex(value => value.id === drone.id); const target = targets[index];
        if (!target) return;
        target.root.position.set(drone.position.x, drone.position.y - .8, drone.position.z);
        target.root.rotation.set(drone.flight === 'diving' ? -.14 : 0, drone.yaw, 0);
        target.root.visible = drone.hp > 0 && drone.state !== 'destroyed'; target.center.copy(target.root.position); target.center.y += .8;
      });
      const nextGateKey = [...frame.world.openGateIds].sort().join('|');
      if (gateKey !== nextGateKey || boxes.length === 0) {
        gateKey = nextGateKey;
        for (const [id, root] of gates) if (root) root.visible = !frame.world.openGateIds.includes(id);
        boxes = frozenWorld.objects.filter(object => object.kind !== 'gate' || !frame.world.openGateIds.includes(object.id)).map(object => {
          const y = terrain.sampleHeight(object.x, object.z);
          return { min: { x: object.x - object.width / 2, y, z: object.z - object.depth / 2 }, max: { x: object.x + object.width / 2, y: y + object.height, z: object.z + object.depth / 2 } };
        });
        visuals.invalidateTerrain();
      }
      garden.setBeaconActivated(frame.world.beaconActivated);
      const recordedTools: TacticalEffect[] = frame.tools.filter(tool => tool.active).map(tool => ({ id: tool.id, kind: tool.kind,
        position: { ...tool.position }, radius: tool.radius, remaining: tool.remainingMs / 1000,
        duration: tool.kind === 'curtain' ? CURTAIN_SECONDS : tool.kind === 'decoy' ? DECOY_SECONDS : .6,
        height: tool.kind === 'curtain' ? CURTAIN_HEIGHT : 0 }));
      const nextToolKey = recordedTools.filter(tool => tool.kind === 'curtain' && tool.remaining > 0).map(tool => `${tool.id}:${tool.position.x},${tool.position.y},${tool.position.z}:${tool.radius}`).join('|');
      if (toolKey !== nextToolKey) { toolKey = nextToolKey; visuals.invalidateTerrain(); }
      toolVisuals?.update(recordedTools, 0);
      if (cameraMode === 'original') {
        camera.position.set(frame.camera.position.x, frame.camera.position.y, frame.camera.position.z);
        cameraTarget.set(frame.camera.target.x, frame.camera.target.y, frame.camera.target.z); camera.fov = frame.camera.fov;
      } else {
        camera.position.set(character.position.x, character.position.y + 30, character.position.z + 11);
        cameraTarget.copy(character.position); camera.fov = 56;
      }
      camera.lookAt(cameraTarget); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      visuals.update(frozenWorld.drones.map((configured, index) => {
        const drone = frame.drones.find(value => value.id === configured.id);
        const position = eyePositions[index]; if (drone) position.set(drone.position.x, drone.position.y, drone.position.z);
        return { id: index, position, yaw: drone?.yaw ?? 0, hp: drone?.hp ?? 0, maxHp: rules.maxHp, mode: drone?.state ?? 'destroyed',
          range: replayScanRange(drone, rules.scanRange, showScans), fovDegrees: rules.scanFovDegrees,
          hasLineOfSight: (destination: { x: number; y: number; z: number }) => !recordedTools.some(tool => curtainBlocksSegment(tool, position, destination)) && !boxes.some(box => segmentBoxTime(position, destination, box) !== null) && segmentTerrainTime(position, destination, terrain.sampleHeight) === null };
      }), camera, 0);
      bulletSlots.forEach((root, index) => {
        const projectile = frame.projectiles[index]; root.visible = Boolean(projectile);
        if (!projectile) return;
        root.position.set(projectile.position.x, projectile.position.y, projectile.position.z);
        direction.set(projectile.direction.x, projectile.direction.y, projectile.direction.z).normalize();
        if (direction.lengthSq() > 0) root.quaternion.setFromUnitVectors(forward, direction);
      });
      const effects = replay.events.filter(event => event.position && event.tMs <= timeMs && timeMs - event.tMs < (event.kind === 'destroyed' || event.kind === 'contact' ? 1200 : 180) && ['shot', 'hit', 'destroyed', 'contact'].includes(event.kind)).slice(-16);
      effectSlots.forEach((mesh, index) => {
        const event = effects[index]; mesh.visible = Boolean(event); if (!event?.position) return;
        const big = event.kind === 'destroyed' || event.kind === 'contact'; const progress = (timeMs - event.tMs) / (big ? 1200 : 180);
        mesh.position.set(event.position.x, event.position.y, event.position.z); mesh.scale.setScalar(big ? .2 + progress * 1.9 : .05 + progress * .22);
        mesh.material.opacity = (1 - progress) * .8; mesh.material.color.set(event.kind === 'contact' ? '#ff715d' : '#ffcc86');
      });
      path.visible = showPath; path.geometry.setDrawRange(0, replay.frames.findIndex(value => value.tMs > timeMs) < 0 ? replay.frames.length : replay.frames.findIndex(value => value.tMs > timeMs));
      garden.updateEnvironment(0, camera, character.position);
      garden.seekEnvironmentTime(timeMs / 1000);
      renderer.render(scene, camera);
      canvas.dataset.timeMs = String(Math.round(timeMs)); canvas.dataset.mode = 'read-only-replay'; canvas.dataset.ready = 'true';
    }
    const resize = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (width > 0 && height > 0) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); }
    };
    observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    document.addEventListener('visibilitychange', pauseHidden); canvas.addEventListener('webglcontextlost', lostContext);
    renderer.setAnimationLoop(now => {
      if (disposed) return;
      const elapsed = Math.max(0, Math.min(100, now - previous)); previous = now;
      if (playing) {
        timeMs = clampReplayTime(replay, timeMs + elapsed * rate);
        if (timeMs >= replay.manifest.coverage.toMs) { playing = false; options.onPlaying(false); }
        render();
        if (now - notified > 80 || !playing) { notified = now; options.onTime(timeMs); }
      }
    });
    render();
    return {
      seek(value) { timeMs = clampReplayTime(replay, value); render(); options.onTime(timeMs); },
      play(value) { if (value && timeMs >= replay.manifest.coverage.toMs) timeMs = replay.manifest.coverage.fromMs; previous = performance.now(); playing = value; options.onPlaying(value); render(); options.onTime(timeMs); },
      speed(value) { if ([.25, .5, 1, 2].includes(value)) rate = value; },
      camera(value) { cameraMode = value; render(); }, scans(value) { showScans = value; render(); }, path(value) { showPath = value; render(); }, dispose,
    };
  } catch (error) { dispose(); throw error; }
}
