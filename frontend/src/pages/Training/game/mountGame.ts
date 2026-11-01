import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { TrainingConfig } from '../../../objects/training/TrainingConfig';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import type { ResultSubmission } from '../../../objects/records/ResultSubmission';
import type { GameSettings } from '../../../system/settings/GameSettings';
import { loadAssets, type GameAssets } from './core/assets';
import { createGarden, OBSTACLES } from './core/scene';
import { createController, DEAD_ZONE } from './core/controller';
import { createCameraObstruction } from './core/cameraObstruction';
import { createShooting } from './core/shooting';
import { createDroneEncounter } from './core/droneEncounter';
import { createTouchControls } from './core/touchControls';
import { createChallenge } from './core/challenge';
import { aimFacing, dampAngle, CRATE_HEIGHT } from './core/movement';
import { segmentTerrainTime } from './core/shootingMath';
import { TERRAIN_HALF_SIZE } from './core/terrain';
import { EXPLOSION_SECONDS } from './core/explosion';
import { createResourceDisposer } from './resources';
import { createGameAudio } from './audio';
import { createRoundCompletion } from './roundCompletion';
import styles from './game.css?inline';

export interface GameOptions {
  config: TrainingConfig;
  terrain: TerrainConfig;
  settings: GameSettings;
  practice?: boolean;
  suspended?: boolean;
  onFinish(submission: ResultSubmission): void;
  onExit(): void;
  onReady?(): void;
}
export interface GameHandle {
  readonly ready: Promise<void>;
  setSettings(settings: GameSettings): void;
  setSuspended(value: boolean): void;
  pause(): void;
  destroy(): void;
}

/** One mounted scene owns its clock, DOM, input, audio and GPU resources. */
export function mountGame(host: HTMLElement, options: GameOptions): GameHandle {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${styles}</style><section class="playground" data-paused="true" aria-label="花谷无人机训练场">
    <canvas id="game" tabindex="0" aria-label="WASD移动，空格跳跃，鼠标瞄准，左键发射，Esc暂停"></canvas>
    <div class="hud"><div class="mission"><span class="eyebrow">BLOOM VALLEY / OPERATION</span><h2 id="mission-title"></h2><p id="mission-note"></p></div><div class="scores"><div><span>击落</span><strong id="destroyed">0/4</strong></div><div><span>命中 / 发射</span><strong id="shots">0 / 0</strong></div><div><span>用时</span><strong id="time">00:00</strong></div></div></div>
    <div class="aim-zone" id="aim-zone"><span>框内瞄准 · 越界转向</span></div><div class="reticle" id="reticle"></div>
    <div id="threat" class="threat" role="status" hidden></div><div id="finish-status" class="finish-status" role="status" hidden></div>
    <div class="bottom"><span class="tips">W A S D 移动 · 空格跳跃 · 左键射击<br>越框转向 · 滚轮缩放 · Esc 暂停</span><div class="buttons"><button id="near" aria-label="拉近镜头">＋</button><button id="far" aria-label="拉远镜头">−</button><button id="pause">暂停</button><button id="exit">离开</button></div></div>
    <div class="overlay" id="loading"><div class="card"><span class="sprout">✳</span><span class="eyebrow">A LITTLE MOMENT</span><h2 id="loading-title">正在准备花谷</h2><p id="loading-text">载入场景与角色…</p><div class="load-track"><i id="progress"></i></div><button id="loading-exit" hidden>返回主菜单</button></div></div>
    <div class="overlay" id="ready" hidden><div class="card"><span class="eyebrow">READY WHEN YOU ARE</span><h2>准备好出发了吗？</h2><p id="ready-note"></p><button id="start">开始行动</button><button id="ready-exit" class="secondary">返回主菜单</button></div></div>
    <div class="overlay" id="pause-overlay" hidden><div class="card"><span class="eyebrow">TAKE A LITTLE BREAK</span><h2>花谷为你暂停了。</h2><p>继续后会有 3 秒准备时间。<br>切换窗口不会推进本局时间。</p><button id="resume">继续行动</button><button id="pause-exit" class="secondary">离开训练场</button></div></div>
    <div class="countdown" id="countdown" hidden aria-live="polite"><span id="countdown-label">准备行动</span><strong id="countdown-value">3</strong></div>
  </section>`;
  const element = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const found = root.getElementById(id); if (!found) throw new Error(`Missing game element ${id}`); return found as T;
  };
  const canvas = element<HTMLCanvasElement>('game');
  canvas.dataset.configVersion = options.config.version;
  canvas.dataset.mode = options.practice ? 'practice' : 'account';
  const playground = root.querySelector<HTMLElement>('.playground')!;
  const abort = new AbortController();
  const audio = createGameAudio(options.settings.volume);
  const cleanup: Array<() => void> = [];
  let settings = { ...options.settings };
  let disposed = false, loaded = false, started = false, finished = false;
  let internallyPaused = false, externallySuspended = options.suspended ?? false;
  let resumeRemaining = 0;
  const completion = createRoundCompletion(EXPLOSION_SECONDS, options.onFinish);
  let renderer: THREE.WebGLRenderer | undefined;
  let assets: GameAssets | undefined;
  let garden: ReturnType<typeof createGarden> | undefined;
  let controller: ReturnType<typeof createController> | undefined;
  let touch: ReturnType<typeof createTouchControls> | undefined;
  let encounter: ReturnType<typeof createDroneEncounter> | undefined;
  let shooting: ReturnType<typeof createShooting> | undefined;
  let reflection: THREE.WebGLRenderTarget | undefined;
  let previous = performance.now();
  let firing = false, queuedShot = false, pointerInside = false;
  const pointer = new THREE.Vector2();
  const coarse = matchMedia('(pointer: coarse)').matches;
  const challenge = createChallenge({ mode: 'elimination', targetCount: options.config.drones.spawns.length });
  const pauseLike = () => internallyPaused || externallySuspended || !started || finished || resumeRemaining > 0 || challenge.state.phase === 'countdown';
  function listen(target: EventTarget, type: string, listener: EventListener, settings?: AddEventListenerOptions) {
    target.addEventListener(type, listener, settings); cleanup.push(() => target.removeEventListener(type, listener, settings));
  }
  function clearInput() { firing = false; queuedShot = false; pointerInside = false; touch?.reset(); }
  function syncPause() {
    controller?.setPaused(pauseLike());
    clearInput();
    playground.dataset.paused = String(pauseLike());
    element('pause-overlay').hidden = !started || finished || !internallyPaused || externallySuspended;
    element('countdown').hidden = externallySuspended || internallyPaused || finished || (resumeRemaining <= 0 && challenge.state.phase !== 'countdown');
    audio.setSuspended(internallyPaused || externallySuspended || document.hidden);
    previous = performance.now();
  }
  function pause() { if (!disposed && started && !finished) { internallyPaused = true; resumeRemaining = 0; syncPause(); } }
  function resume() {
    if (disposed || !started || finished || externallySuspended) return;
    audio.unlock(); internallyPaused = false; lastBeep = 0;
    // Resuming an interrupted start countdown restarts that countdown, not two consecutive timers.
    if (challenge.state.phase === 'countdown') { challenge.state.countdown = 3; resumeRemaining = 0; }
    else resumeRemaining = 3;
    element('countdown-label').textContent = '继续行动'; syncPause();
  }
  function setSuspended(value: boolean) {
    if (disposed || externallySuspended === value) return;
    externallySuspended = value;
    // Dismissing a settings/exit dialog must not resume a live encounter implicitly.
    if (!value && started && !finished) { internallyPaused = true; resumeRemaining = 0; }
    syncPause();
  }
  function setSettings(value: GameSettings) {
    settings = { ...value };
    audio.setVolume(settings.volume); controller?.setSensitivity(settings.cameraSensitivity);
    if (renderer) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : coarse ? 1.25 : 1.6));
      renderer.shadowMap.enabled = settings.quality === 'high'; renderer.shadowMap.needsUpdate = true;
    }
  }
  function exit() { pause(); options.onExit(); }
  const zone = element('aim-zone'); zone.style.width = `${DEAD_ZONE.width * 100}%`; zone.style.height = `${DEAD_ZONE.height * 100}%`;
  element('mission-title').textContent = `清除 ${options.config.drones.spawns.length} 架巡逻无人机`;
  element('mission-note').textContent = options.practice ? '游客练习 · 本局成绩不会保存' : '避开扫描与追击，借掩体逐一击落。';
  element('ready-note').textContent = options.practice ? '自由练习不保存成绩。躲开扫描和追击，按住左键发射脉冲，清除全部无人机。' : '每架无人机需要命中 ' + options.config.drones.maxHp + ' 次。被扫描发现后它会追来，碰到你即行动失败。';
  element('start').textContent = options.practice ? '开始练习 · 不保存成绩' : '开始行动';
  for (const id of ['exit', 'ready-exit', 'loading-exit', 'pause-exit']) listen(element(id), 'click', exit);
  listen(element('pause'), 'click', pause);
  listen(element('resume'), 'click', resume);
  listen(element('near'), 'click', () => controller?.setCameraDistance(controller.getCameraDistance() - 1));
  listen(element('far'), 'click', () => controller?.setCameraDistance(controller.getCameraDistance() + 1));
  listen(element('start'), 'click', () => {
    if (!loaded || started || disposed || externallySuspended) return;
    audio.unlock(); started = true; challenge.reset(!options.practice); controller?.reset(); encounter?.reset();
    element('ready').hidden = true; syncPause(); canvas.focus({ preventScroll: true });
    if (options.practice) audio.play('start');
  });
  listen(window, 'keydown', event => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.code !== 'Escape' || keyboard.repeat || !started || finished || externallySuspended) return;
    keyboard.preventDefault(); if (internallyPaused) resume(); else pause();
  });
  listen(window, 'blur', pause);
  listen(document, 'visibilitychange', () => { if (document.hidden) pause(); audio.setSuspended(document.hidden || internallyPaused || externallySuspended); previous = performance.now(); });
  listen(playground, 'pointerdown', () => audio.unlock(), { passive: true });
  function updatePointer(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    element('reticle').style.left = `${(pointer.x + 1) / 2 * 100}%`; element('reticle').style.top = `${(1 - pointer.y) / 2 * 100}%`;
    pointerInside = true;
  }
  listen(canvas, 'pointermove', event => { const pointerEvent = event as PointerEvent; if (!pauseLike() && pointerEvent.pointerType !== 'touch' && pointerEvent.pointerType !== 'pen') updatePointer(pointerEvent); });
  listen(canvas, 'pointerdown', event => {
    const pointerEvent = event as PointerEvent;
    if (pauseLike() || pointerEvent.pointerType === 'touch' || pointerEvent.pointerType === 'pen') return;
    updatePointer(pointerEvent); canvas.focus({ preventScroll: true });
    if (pointerEvent.button === 0) { firing = true; queuedShot = true; }
  });
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointerleave', event => { if ((event as PointerEvent).pointerType === 'mouse') clearInput(); });
  // TouchControls owns individual fingers; releasing the movement finger must not stop the firing finger.
  listen(window, 'pointerup', event => { if ((event as PointerEvent).pointerType === 'mouse') firing = false; });
  listen(window, 'pointercancel', event => { if ((event as PointerEvent).pointerType === 'mouse') clearInput(); });
  let lastBeep = 0;
  function countdown(value: number) {
    const integer = Math.ceil(value); element('countdown-value').textContent = String(integer);
    if (integer > 0 && integer !== lastBeep) { audio.play('countdown'); lastBeep = integer; }
  }
  function finish() {
    if (finished || disposed) return;
    finished = true;
    completion.finish({ outcome: challenge.state.outcome === 'victory' ? 'victory' : 'defeat', shotsFired: challenge.state.shots, hits: challenge.state.hits, destroyed: challenge.state.destroyed, elapsedMs: Math.round(challenge.state.elapsed * 1000) });
    element('finish-status').textContent = challenge.state.outcome === 'victory' ? '无人机已全部清除 · 行动完成' : '被无人机撞到了 · 行动中断';
    element('finish-status').hidden = false;
    if (challenge.state.outcome === 'defeat' && garden) { garden.character.visible = false; audio.play('explosion'); }
    syncPause(); syncScore();
  }
  function syncScore() {
    element('destroyed').textContent = `${challenge.state.destroyed}/${options.config.drones.spawns.length}`;
    element('shots').textContent = `${challenge.state.hits} / ${challenge.state.shots}`;
    const seconds = Math.floor(challenge.state.elapsed);
    element('time').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    canvas.dataset.phase = !started ? 'ready' : challenge.state.phase;
    canvas.dataset.paused = String(pauseLike()); canvas.dataset.outcome = challenge.state.outcome ?? '';
    canvas.dataset.elapsedMs = String(Math.round(challenge.state.elapsed * 1000));
  }
  function releaseResources() {
    renderer?.setAnimationLoop(null);
    controller?.dispose(); touch?.dispose(); shooting?.dispose(); encounter?.dispose(); garden?.dispose();
    const disposer = createResourceDisposer();
    if (garden) disposer.object(garden.scene);
    if (assets) for (const asset of Object.values(assets)) disposer.object(asset.scene);
    reflection?.dispose(); reflection = undefined;
    renderer?.renderLists.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
    renderer = undefined; garden = undefined; assets = undefined; controller = undefined; touch = undefined; shooting = undefined; encounter = undefined;
  }
  async function load() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.NeutralToneMapping;
      setSettings(settings);
      assets = await loadAssets((done, total) => { element('progress').style.width = `${done / total * 100}%`; element('loading-text').textContent = `载入模型 ${done} / ${total}`; }, abort.signal);
      if (disposed) { releaseResources(); return; }
      garden = createGarden(assets, coarse || settings.quality === 'low', options.config.drones.spawns);
      garden.setTerrain(options.terrain);
      const { scene, character, gun, terrain, targets, mixer, idle, walk } = garden;
      const reflectionScene = new RoomEnvironment(); const generator = new THREE.PMREMGenerator(renderer);
      try { reflection = generator.fromScene(reflectionScene, .04); scene.environment = reflection.texture; scene.environmentIntensity = .45; } finally { reflectionScene.dispose(); generator.dispose(); }
      const camera = new THREE.PerspectiveCamera(50, 1, .1, 260);
      controller = createController({ canvas, camera, character, obstacles: OBSTACLES, terrain, inputScope: root }); controller.setSensitivity(settings.cameraSensitivity); controller.setPaused(true);
      const obstruction = createCameraObstruction();
      const boxes = OBSTACLES.map(obstacle => { const y = terrain.sampleHeight(obstacle.x, obstacle.z); return { min: { x: obstacle.x - obstacle.halfX, y, z: obstacle.z - obstacle.halfZ }, max: { x: obstacle.x + obstacle.halfX, y: y + (obstacle.height ?? CRATE_HEIGHT), z: obstacle.z + obstacle.halfZ } }; });
      encounter = createDroneEncounter(scene, targets, terrain.sampleHeight, options.config.drones); encounter.setEnabled(true);
      shooting = createShooting(scene, targets, target => {
        if (finished) return;
        const result = encounter!.hit(target); if (!result.hit) return;
        challenge.hit(); audio.play(result.destroyed ? 'explosion' : 'hit');
        if (result.destroyed && challenge.destroy(result.id)) finish();
      }, terrain, options.config.weapon);
      touch = createTouchControls({ element: playground, canvas, controller,
        onFire(value) { if (pauseLike()) return; firing = value; queuedShot ||= value; pointerInside = true; },
        onAim(x, y) { if (!pauseLike()) { pointer.set(x, y); pointerInside = true; } },
      });
      const resize = () => {
        if (!renderer || !garden) return;
        const bounds = canvas.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
        renderer.setSize(bounds.width, bounds.height, false); camera.aspect = bounds.width / bounds.height; camera.updateProjectionMatrix(); garden.updateEnvironment(0, camera, character.position, true);
      };
      const observer = new ResizeObserver(resize); observer.observe(canvas); cleanup.push(() => observer.disconnect()); resize();
      garden.updateEnvironment(0, camera, character.position, true); encounter.update(0, character.position, camera, false);
      element('loading-text').textContent = '准备光照与扫描效果…'; await renderer.compileAsync(scene, camera);
      if (disposed) { releaseResources(); return; }
      renderer.render(scene, camera); loaded = true; canvas.dataset.ready = 'true'; element('loading').hidden = true; element('ready').hidden = false; options.onReady?.();
      const aimClip = THREE.AnimationClip.findByName(assets.nailong.animations, 'Aim');
      const aimAction = aimClip ? mixer.clipAction(aimClip).setLoop(THREE.LoopOnce, 1) : null;
      if (aimAction) { aimAction.clampWhenFinished = true; aimAction.play().setEffectiveWeight(0); }
      const shootClip = THREE.AnimationClip.findByName(assets.nailong.animations, 'Shoot');
      const shootAction = shootClip ? mixer.clipAction(shootClip).setLoop(THREE.LoopOnce, 1) : null;
      const raycaster = new THREE.Raycaster(); const aimPoint = new THREE.Vector3(); const rayEnd = new THREE.Vector3(); const viewDirection = new THREE.Vector3(); const aimDirection = new THREE.Vector3(); const muzzlePosition = new THREE.Vector3();
      const muzzle = gun.getObjectByName('muzzle')!;
      const aimGround = (x: number, z: number) => Math.abs(x) <= TERRAIN_HALF_SIZE && Math.abs(z) <= TERRAIN_HALF_SIZE ? terrain.sampleHeight(x, z) : -Infinity;
      let animationWeight = 0, aimWeight = 0, statsTime = 0;
      previous = performance.now();
      renderer.setAnimationLoop(now => {
        if (disposed || !renderer || !garden || !controller || !shooting || !encounter) return;
        const elapsed = Math.max(0, (now - previous) / 1000); previous = now;
        if (document.hidden) return;
        const dt = Math.min(elapsed, .05);
        const clockActive = started && !internallyPaused && !externallySuspended && !finished;
        if (clockActive && resumeRemaining > 0) {
          resumeRemaining = Math.max(0, resumeRemaining - elapsed); countdown(resumeRemaining);
          if (resumeRemaining === 0) { audio.play('start'); syncPause(); canvas.focus({ preventScroll: true }); }
        } else if (clockActive) {
          const wasCountdown = challenge.state.phase === 'countdown'; challenge.advance(elapsed);
          if (wasCountdown && challenge.state.phase === 'playing') { audio.play('start'); syncPause(); canvas.focus({ preventScroll: true }); }
          else if (wasCountdown) countdown(challenge.state.countdown);
        }
        let active = started && !pauseLike();
        const state = controller.update(active ? dt : 0);
        if (active) obstruction.update(camera, controller.cameraTarget, boxes, terrain.sampleHeight, dt); else obstruction.reset();
        const threat = encounter.update(dt, character.position, camera, active);
        if (threat.contact !== null && challenge.fail()) { finish(); active = false; }
        if (!internallyPaused && !externallySuspended) encounter.updateEffects(dt);
        if (finished && !internallyPaused && !externallySuspended) { completion.advance(dt); if (disposed) return; }
        if (!internallyPaused && !externallySuspended && !finished) garden.updateEnvironment(dt, camera, character.position);
        if (active || !started) {
          animationWeight = THREE.MathUtils.damp(animationWeight, state.moving && state.grounded ? 1 : 0, 10, dt);
          idle.setEffectiveWeight(1 - animationWeight); walk.setEffectiveWeight(animationWeight); walk.setEffectiveTimeScale(Math.max(.6, state.speed / 3.2));
          aimWeight = THREE.MathUtils.damp(aimWeight, active && (pointerInside || coarse) ? .8 : 0, 14, dt); aimAction?.setEffectiveWeight(aimWeight); mixer.update(dt);
        }
        if (active) {
          camera.getWorldDirection(viewDirection); viewDirection.y = 0; viewDirection.normalize(); const viewYaw = Math.atan2(viewDirection.x, viewDirection.z);
          if (pointerInside || coarse) {
            camera.updateMatrixWorld(); raycaster.setFromCamera(pointer, camera);
            const live = targets.filter(target => target.alive && target.cooldown === 0).map(target => target.root);
            live.forEach(target => target.updateWorldMatrix(true, true)); const intersections = raycaster.intersectObjects(live, true);
            raycaster.ray.at(80, rayEnd); const groundTime = segmentTerrainTime(raycaster.ray.origin, rayEnd, aimGround); const groundDistance = groundTime === null ? Infinity : groundTime * 80;
            if (intersections[0] && intersections[0].distance < groundDistance) aimPoint.copy(intersections[0].point); else raycaster.ray.at(Number.isFinite(groundDistance) ? groundDistance : options.config.weapon.projectileRange, aimPoint);
            aimDirection.copy(aimPoint).sub(character.position); const forward = aimDirection.dot(viewDirection); if (forward < 1.25) aimPoint.addScaledVector(viewDirection, 1.25 - forward);
            aimDirection.copy(aimPoint).sub(character.position); character.rotation.y = dampAngle(character.rotation.y, aimFacing(aimDirection, viewYaw), dt, 12);
          } else character.rotation.y = dampAngle(character.rotation.y, viewYaw, dt, 12);
          if ((firing || queuedShot) && pointerInside) {
            queuedShot = false; character.updateMatrixWorld(true); muzzle.getWorldPosition(muzzlePosition);
            if (shooting.fire(muzzlePosition, aimDirection.copy(aimPoint).sub(muzzlePosition).normalize())) { challenge.shot(); audio.play('shot'); shootAction?.reset().setEffectiveWeight(1).play(); }
          }
          shooting.update(dt);
        }
        element('threat').hidden = !active || (!threat.locked && !threat.alerted);
        element('threat').dataset.state = threat.locked ? 'locked' : 'alert';
        element('threat').textContent = threat.locked ? `${threat.locked} 架正在追击 · 借掩体甩开它们！` : `${threat.alerted} 架正在高速搜索`;
        zone.classList.toggle('turning', Math.abs(state.turnX) + Math.abs(state.turnY) > .02);
        renderer.render(scene, camera); statsTime += elapsed;
        if (statsTime > .2) {
          syncScore(); canvas.dataset.playerPosition = character.position.toArray().map(value => value.toFixed(3)).join(','); canvas.dataset.grounded = String(state.grounded); canvas.dataset.drones = JSON.stringify(encounter.snapshot()); canvas.dataset.explosions = String(encounter.effectCount()); canvas.dataset.cameraDistance = controller.getCameraDistance().toFixed(2); canvas.dataset.quality = settings.quality; canvas.dataset.terrain = JSON.stringify(terrain.config); canvas.dataset.triangles = String(renderer.info.render.triangles); statsTime = 0;
        }
      });
    } catch (error) {
      releaseResources();
      if (disposed || abort.signal.aborted) return;
      element('loading-title').textContent = '场景暂时没有准备好'; element('loading-text').textContent = error instanceof Error ? error.message : '请确认浏览器支持 WebGL 2'; element('loading-exit').hidden = false;
    }
  }
  const ready = load();
  return {
    ready, setSettings, setSuspended, pause,
    destroy() { if (disposed) return; disposed = true; abort.abort(); completion.cancel(); clearInput(); for (const remove of cleanup.splice(0)) remove(); releaseResources(); audio.dispose(); root.replaceChildren(); },
  };
}
