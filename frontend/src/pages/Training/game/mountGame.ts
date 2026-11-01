import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { TrainingConfig } from '../../../objects/training/TrainingConfig';
import type { TerrainConfig } from '../../../objects/training/TerrainConfig';
import type { ResultSubmission } from '../../../objects/records/ResultSubmission';
import type { GameSettings } from '../../../system/settings/GameSettings';
import type { RunSetup } from '../../../objects/training/RunSetup';
import type { RunId } from '../../../objects/training/RunId';
import type { RunEventInput } from '../../../objects/records/RunEvent';
import type { RecordedRun } from '../../../objects/records/RecordedRun';
import { createReplayRecorder } from './recording/createReplayRecorder';
import { loadAssets, type GameAssets } from './core/assets';
import { createGarden } from './core/scene';
import { createController, DEAD_ZONE } from './core/controller';
import { createCameraObstruction } from './core/cameraObstruction';
import { createShooting } from './core/shooting';
import { createDroneEncounter } from './core/droneEncounter';
import { createTouchControls } from './core/touchControls';
import { createChallenge } from './core/challenge';
import { aimFacing, dampAngle } from './core/movement';
import { segmentTerrainTime, segmentBoxTime } from './core/shootingMath';
import { createMissionProgress } from './core/missionProgress';
import { lessonConfig, makeLessonSetup, type LessonOptions, type LessonProgress } from './core/lesson';
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
  setup?: RunSetup | null;
  runId?: RunId | null;
  lesson?: LessonOptions;
  onLessonProgress?(progress: LessonProgress): void;
  onRecording?(recording: RecordedRun): void;
  onRecordingError?(message: string): void;
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
  const lesson = options.practice ? options.lesson : undefined;
  const setup = lesson && options.setup ? makeLessonSetup(options.setup, lesson) : options.setup;
  const world = setup?.world;
  const config = lesson && setup ? lessonConfig(options.config, setup) : world ? { ...options.config, terrain: world.terrain, drones: { ...options.config.drones, spawns: world.drones.map(({ x, z, yaw }) => ({ x, z, yaw })) } } : options.config;
  const mission = createMissionProgress(setup?.mission.objective ?? { kind: 'clear_drones' }, world);
  const lessonProgress: LessonProgress = { elapsedSeconds: 0, status: 'ready', beaconActivated: false, toolUsed: false, toolEffective: false, escapedDetection: false };
  let sawLock = false;
  const observedLocks = new Set<string>();
  const recorder = setup && options.onRecording ? createReplayRecorder({ runId: options.runId ?? null, config: lesson ? config : options.config, world: setup.world, mapVersionId: setup.mapVersionId, missionId: setup.mission.id, assetVersion: setup.assetVersion }) : undefined;
  let recordingCritical = false;
  let recordingFailed = false;
  function recordingFailure() { if (recordingFailed) return; recordingFailed = true; options.onRecordingError?.('过程记录暂时中断，本局成绩仍会正常结算。'); }
  const recordEvent = (event: RunEventInput) => {
    if (lesson && event.kind === 'drone-state' && event.actorId) {
      if (event.detail === 'locked:saw-player') observedLocks.add(event.actorId);
      if (event.detail === 'alert:lost-sight' && observedLocks.has(event.actorId)) lessonProgress.escapedDetection = true;
    }
    if (!recordingFailed) { try { recorder?.event(event); } catch { recordingFailure(); } }
    recordingCritical = true;
  };
  const advanceRecording = (deltaMs: number, scoreMs: number) => { if (!recordingFailed) { try { recorder?.advance(deltaMs, scoreMs); } catch { recordingFailure(); } } };
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${styles}</style><section class="playground" data-paused="true" aria-label="花谷无人机训练场">
    <canvas id="game" tabindex="0" aria-label="WASD移动，空格跳跃，鼠标瞄准，左键发射，Esc暂停"></canvas>
    <div class="hud"><div class="mission"><span class="eyebrow">BLOOM VALLEY / OPERATION</span><h2 id="mission-title"></h2><p id="mission-note"></p></div><div class="scores"><div><span>击落</span><strong id="destroyed">0/4</strong></div><div><span>命中 / 发射</span><strong id="shots">0 / 0</strong></div><div><span>用时</span><strong id="time">00:00</strong></div></div></div>
    <div class="aim-zone" id="aim-zone"><span>框内瞄准 · 越界转向</span></div><div class="reticle" id="reticle"></div>
    <div id="threat" class="threat" role="status" hidden></div><div id="finish-status" class="finish-status" role="status" hidden></div>
    <div class="objective-guide" id="objective-guide" role="status" hidden></div><div class="mission-actions"><button id="interact" hidden>启动信标 · E</button><button id="tool" hidden></button></div>
    <div class="bottom"><span class="tips">W A S D 移动 · 空格跳跃 · 左键射击<br>E 交互 · Q 道具 · 越框转向 · Esc 暂停</span><div class="buttons"><button id="near" aria-label="拉近镜头">＋</button><button id="far" aria-label="拉远镜头">−</button><button id="pause">暂停</button><button id="exit">离开</button></div></div>
    <div class="overlay" id="loading"><div class="card"><span class="sprout">✳</span><span class="eyebrow">A LITTLE MOMENT</span><h2 id="loading-title">正在准备花谷</h2><p id="loading-text">载入场景与角色…</p><div class="load-track"><i id="progress"></i></div><button id="loading-exit" hidden>返回主菜单</button></div></div>
    <div class="overlay" id="ready" hidden><div class="card"><span class="eyebrow">READY WHEN YOU ARE</span><h2>准备好出发了吗？</h2><p id="ready-note"></p><button id="start">开始行动</button><button id="ready-exit" class="secondary">返回主菜单</button></div></div>
    <div class="overlay" id="pause-overlay" hidden><div class="card"><span class="eyebrow">TAKE A LITTLE BREAK</span><h2>花谷为你暂停了。</h2><p>继续后会有 3 秒准备时间。<br>切换窗口不会推进本局时间。</p><button id="resume">继续行动</button><button id="pause-exit" class="secondary">离开训练场</button></div></div>
    <div class="countdown" id="countdown" hidden aria-live="polite"><span id="countdown-label">准备行动</span><strong id="countdown-value">3</strong></div>
  </section>`;
  const element = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const found = root.getElementById(id); if (!found) throw new Error(`Missing game element ${id}`); return found as T;
  };
  const canvas = element<HTMLCanvasElement>('game');
  canvas.dataset.configVersion = config.version;
  canvas.dataset.mode = options.practice ? 'practice' : 'account';
  const playground = root.querySelector<HTMLElement>('.playground')!;
  const abort = new AbortController();
  const audio = createGameAudio(options.settings.volume);
  const cleanup: Array<() => void> = [];
  let settings = { ...options.settings };
  let disposed = false, loaded = false, started = false, finished = false;
  let internallyPaused = false, externallySuspended = options.suspended ?? false;
  let resumeRemaining = 0;
  let tailRemaining = EXPLOSION_SECONDS;
  let resultAtMs = 0;
  const completion = createRoundCompletion(EXPLOSION_SECONDS, result => {
    if (!recorder || recordingFailed) { options.onFinish(result); return; }
    void recorder.finish({ resultAtMs, outcome: result.outcome }).then(recording => { if (!disposed) options.onRecording?.(recording); })
      .catch(() => { if (!disposed) options.onRecordingError?.('成绩已完成，但本次过程记录暂时无法生成。'); })
      .finally(() => { if (!disposed) options.onFinish(result); });
  });
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
  let queuedInteract = false, queuedTool = false;
  const pointer = new THREE.Vector2();
  const coarse = matchMedia('(pointer: coarse)').matches;
  const challenge = createChallenge({ mode: mission.isBeaconMission || lesson ? 'objective' : 'elimination', targetCount: config.drones.spawns.length });
  const pauseLike = () => internallyPaused || externallySuspended || !started || finished || resumeRemaining > 0 || challenge.state.phase === 'countdown';
  function listen(target: EventTarget, type: string, listener: EventListener, settings?: AddEventListenerOptions) {
    target.addEventListener(type, listener, settings); cleanup.push(() => target.removeEventListener(type, listener, settings));
  }
  function clearInput() { firing = false; queuedShot = false; queuedInteract = false; queuedTool = false; pointerInside = false; touch?.reset(); }
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
  element('mission-title').textContent = lesson ? { cover: '练习：摆脱一次锁定', tool: '练习：让道具真正生效', beacon: '练习：启动信标并返回' }[lesson.kind] : mission.isBeaconMission ? '启动信标 → 返回撤离点' : `清除 ${config.drones.spawns.length} 架巡逻无人机`;
  element('mission-note').textContent = lesson ? '30 秒机制课 · 准备与暂停不计时 · 不保存账号成绩' : mission.isBeaconMission ? '清场可选 · 两侧进入庭院，信标会打开正门近路。' : options.practice ? '游客练习 · 本局成绩不会保存' : '避开扫描与追击，借掩体逐一击落。';
  const toolNames = { none: '不携带', curtain: '干扰幕', decoy: '诱饵信标', pulse: '冲击脉冲' };
  const toolDescriptions = { none: '', curtain: '干扰幕只遮断视线；释放后换方向离开，近距离仍可能被撞。', decoy: '诱饵吸引尚未看见你的无人机，不会抢走可见目标的追击。', pulse: '近距脉冲短暂停顿并推开无人机，墙体会挡住推移。' };
  const toolKind = setup?.loadout.tool ?? 'none';
  element<HTMLButtonElement>('tool').hidden = toolKind === 'none';
  element('tool').textContent = `${toolNames[toolKind]} · Q · 1 次`;
  const lessonNotes = { cover: '走近无人机让它发现你，再绕到实体墙后，让它失去锁定。只击毁无人机不会完成这节课。', tool: toolKind === 'curtain' ? '先让无人机锁定你，再按 Q 释放干扰幕，遮断它的视线。烟幕不挡机体，释放后及时侧移。' : toolKind === 'decoy' ? '保持在无人机视线外，面向它附近按 Q 投放诱饵；它真正转向诱饵后完成。' : '靠近无人机至 5 米内，按 Q 释放脉冲；需要实际影响到无人机才算完成。', beacon: '穿过试验场，靠近发光信标按 E，再返回出生处的撤离圈。可以先处理无人机，也可以绕开。' };
  element('ready-note').textContent = lesson ? `30 秒实际练习：${lessonNotes[lesson.kind]} 准备和暂停不计时，本课不保存账号成绩。` : `${mission.isBeaconMission ? '靠近发光信标按 E，正门打开后返回绿色营地圈。清除无人机是可选目标。' : `每架无人机需要命中 ${config.drones.maxHp} 次；全部击落即完成。`} ${toolDescriptions[toolKind]} ${options.practice ? '本局不保存账号成绩。' : ''}`;
  element('start').textContent = options.practice ? '开始练习 · 不保存成绩' : '开始行动';
  for (const id of ['exit', 'ready-exit', 'loading-exit', 'pause-exit']) listen(element(id), 'click', exit);
  listen(element('pause'), 'click', pause);
  listen(element('resume'), 'click', resume);
  listen(element('near'), 'click', () => controller?.setCameraDistance(controller.getCameraDistance() - 1));
  listen(element('far'), 'click', () => controller?.setCameraDistance(controller.getCameraDistance() + 1));
  listen(element('start'), 'click', () => {
    if (!loaded || started || disposed || externallySuspended) return;
    audio.unlock(); started = true; challenge.reset(!options.practice); controller?.reset(); encounter?.reset(); mission.reset(); garden?.setGateOpen(false); garden?.setBeaconActivated(false);
    lessonProgress.status = 'active'; options.onLessonProgress?.({ ...lessonProgress });
    element('ready').hidden = true; syncPause(); canvas.focus({ preventScroll: true });
    if (options.practice) audio.play('start');
  });
  listen(window, 'keydown', event => {
    const keyboard = event as KeyboardEvent;
    if (!keyboard.repeat && !pauseLike() && keyboard.composedPath().includes(canvas)) {
      if (keyboard.code === 'KeyE') { keyboard.preventDefault(); queuedInteract = true; }
      if (keyboard.code === 'KeyQ') { keyboard.preventDefault(); queuedTool = true; }
    }
    if (keyboard.code !== 'Escape' || keyboard.repeat || !started || finished || externallySuspended) return;
    keyboard.preventDefault(); if (internallyPaused) resume(); else pause();
  });
  listen(element('interact'), 'click', () => { if (!pauseLike()) { queuedInteract = true; canvas.focus({ preventScroll: true }); } });
  listen(element('tool'), 'click', () => { if (!pauseLike()) { queuedTool = true; canvas.focus({ preventScroll: true }); } });
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
    lessonProgress.elapsedSeconds = challenge.state.elapsed; lessonProgress.beaconActivated = mission.state.beaconActivated;
    resultAtMs = Math.round(challenge.state.elapsed * 1000);
    const outcome = challenge.state.outcome === 'victory' ? 'victory' : 'defeat';
    recordEvent({ kind: 'round-end', actorId: 'player', position: garden ? { x: garden.character.position.x, y: garden.character.position.y, z: garden.character.position.z } : null, detail: outcome });
    completion.finish({ outcome, shotsFired: challenge.state.shots, hits: challenge.state.hits, destroyed: challenge.state.destroyed, elapsedMs: resultAtMs, ...(mission.isBeaconMission ? { objectiveProgress: { ...mission.state } } : {}) });
    if (lesson && lessonProgress.status !== 'complete' && lessonProgress.status !== 'timeout') lessonProgress.status = outcome === 'victory' ? 'complete' : 'defeat';
    options.onLessonProgress?.({ ...lessonProgress });
    element('finish-status').textContent = lesson ? lessonProgress.status === 'complete' ? '练习完成 · 你掌握了这项机制' : lessonProgress.status === 'timeout' ? '练习时间到 · 可以再试一次' : '被撞到了 · 回看后再试' : outcome === 'victory' ? mission.isBeaconMission ? '信标已恢复 · 安全撤离' : '无人机已全部清除 · 行动完成' : '被无人机撞到了 · 行动中断';
    element('finish-status').hidden = false;
    if (challenge.state.outcome === 'defeat' && lessonProgress.status !== 'timeout' && garden) { garden.character.visible = false; audio.play('explosion'); }
    syncPause(); syncScore();
  }
  function syncScore() {
    element('destroyed').textContent = `${challenge.state.destroyed}/${config.drones.spawns.length}`;
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
      garden = createGarden(assets, coarse || settings.quality === 'low', config.drones.spawns, world);
      garden.setTerrain(world?.terrain ?? options.terrain);
      const { scene, character, gun, terrain, targets, mixer, idle, walk } = garden;
      const reflectionScene = new RoomEnvironment(); const generator = new THREE.PMREMGenerator(renderer);
      try { reflection = generator.fromScene(reflectionScene, .04); scene.environment = reflection.texture; scene.environmentIntensity = .45; } finally { reflectionScene.dispose(); generator.dispose(); }
      const camera = new THREE.PerspectiveCamera(50, 1, .1, 260);
      controller = createController({ canvas, camera, character, obstacles: garden.obstacles, terrain, inputScope: root, spawn: garden.worldSpawn, halfSize: world?.bounds.halfSize }); controller.setSensitivity(settings.cameraSensitivity); controller.setPaused(true);
      const obstruction = createCameraObstruction();
      const boxes = garden.getProjectileBoxes();
      encounter = createDroneEncounter(scene, targets, terrain.sampleHeight, config.drones, { obstacles: garden.obstacles, world, seed: setup?.seed, onEvent: recordEvent,
        onToolEffect() { lessonProgress.toolEffective = true; },
      }); encounter.setEnabled(true);
      shooting = createShooting(scene, targets, target => {
        if (finished) return;
        const result = encounter!.hit(target); if (!result.hit) return;
        challenge.hit(); audio.play(result.destroyed ? 'explosion' : 'hit');
        if (result.destroyed && challenge.destroy(result.id)) finish();
      }, terrain, config.weapon, { obstacles: garden.obstacles,
        onShot(shot) { recordEvent({ kind: 'shot', actorId: 'player', targetId: shot.id, position: shot.position }); },
        onImpact(impact) { if (impact.targetIndex !== null) {
          // Each confirmed impact applies the brain's one-point damage immediately after this callback.
          const hpAfter = Math.max(0, (encounter?.snapshot()[impact.targetIndex].hp ?? 1) - 1);
          recordEvent({ kind: 'hit', actorId: impact.projectileId, targetId: world?.drones[impact.targetIndex].id ?? `drone-${impact.targetIndex}`, position: impact.position, value: hpAfter });
        } },
      });
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
      function captureFrame(force = false) {
        if (!recorder || recordingFailed || !encounter || !shooting || !controller) return;
        const drones = encounter.snapshot();
        try { recorder.capture({
          player: { position: { x: character.position.x, y: character.position.y, z: character.position.z }, yaw: character.rotation.y, animation: !controller.update(0).grounded ? 'jump' : animationWeight > .2 ? 'walk' : aimWeight > .2 ? 'aim' : 'idle', animationTime: mixer.time, aimWeight, alive: character.visible },
          drones: drones.map(drone => ({ id: drone.stableId, position: { x: drone.x, y: drone.y, z: drone.z }, yaw: drone.yaw, hp: drone.hp, state: drone.state, flight: drone.flight, stunned: drone.stunned })),
          projectiles: shooting.snapshot().map(projectile => { const length = Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z); return { id: projectile.id, position: projectile.position, direction: { x: projectile.velocity.x / length, y: projectile.velocity.y / length, z: projectile.velocity.z / length } }; }),
          tools: encounter.toolSnapshot().active.map(tool => ({ id: tool.id, kind: tool.kind, position: tool.position, radius: tool.radius, remainingMs: Math.max(0, Math.round(tool.remaining * 1000)), active: true })),
          world: { openGateIds: mission.state.beaconActivated ? world?.objects.filter(object => object.kind === 'gate').map(object => object.id) ?? [] : [], ...mission.state },
          camera: { position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, target: { x: controller.cameraTarget.x, y: controller.cameraTarget.y, z: controller.cameraTarget.z }, fov: camera.fov },
        }, { force, critical: recordingCritical }); } catch { recordingFailure(); }
        recordingCritical = false;
      }
      captureFrame(true);
      previous = performance.now();
      renderer.setAnimationLoop(now => {
        if (disposed || !renderer || !garden || !controller || !shooting || !encounter) return;
        const elapsed = Math.max(0, (now - previous) / 1000); previous = now;
        if (document.hidden) return;
        const dt = Math.min(elapsed, .05);
        const finishingAtStart = finished;
        const tailDt = finishingAtStart && !internallyPaused && !externallySuspended ? Math.min(dt, tailRemaining) : 0;
        let justStarted = false;
        const clockActive = started && !internallyPaused && !externallySuspended && !finished;
        if (clockActive && resumeRemaining > 0) {
          resumeRemaining = Math.max(0, resumeRemaining - elapsed); countdown(resumeRemaining);
          if (resumeRemaining === 0) { audio.play('start'); syncPause(); canvas.focus({ preventScroll: true }); }
        } else if (clockActive) {
          const wasCountdown = challenge.state.phase === 'countdown';
          if (wasCountdown) challenge.advance(Math.min(elapsed, challenge.state.countdown));
          if (wasCountdown && challenge.state.phase === 'playing') { justStarted = true; audio.play('start'); syncPause(); canvas.focus({ preventScroll: true }); }
          else if (wasCountdown) countdown(challenge.state.countdown);
        }
        let active = started && !pauseLike() && !justStarted;
        if (active) { challenge.advance(dt); advanceRecording(dt * 1000, Math.round(challenge.state.elapsed * 1000)); }
        else if (tailDt > 0) advanceRecording(tailDt * 1000, resultAtMs);
        const state = controller.update(active ? dt : 0);
        if (active) obstruction.update(camera, controller.cameraTarget, boxes, terrain.sampleHeight, dt); else obstruction.reset();
        if (active && queuedTool) {
          queuedTool = false;
          if (encounter.useTool(toolKind, character.position, character.rotation.y)) { lessonProgress.toolUsed = true; audio.play('hit'); }
        }
        if (active && queuedInteract) {
          queuedInteract = false;
          if (mission.activate(character.position, terrain.sampleHeight, (from, to) => !boxes.some(box => segmentBoxTime(from, to, box) !== null) && segmentTerrainTime(from, to, terrain.sampleHeight) === null)) {
            garden.setBeaconActivated(true); garden.setGateOpen(true); audio.play('start');
            recordEvent({ kind: 'beacon', actorId: 'player', targetId: world!.beacon.id, position: { x: world!.beacon.x, y: terrain.sampleHeight(world!.beacon.x, world!.beacon.z), z: world!.beacon.z }, detail: 'activated' });
            world!.objects.filter(object => object.kind === 'gate').forEach(object => recordEvent({ kind: 'gate', actorId: 'player', targetId: object.id, detail: 'opened', position: { x: object.x, y: terrain.sampleHeight(object.x, object.z), z: object.z } }));
          }
        }
        const threat = encounter.update(dt, character.position, camera, active);
        if (threat.contact !== null && challenge.fail()) { finish(); active = false; }
        if (active && mission.extract(character.position, terrain.sampleHeight)) {
          recordEvent({ kind: 'extract', actorId: 'player', targetId: world!.extraction.id, position: { x: character.position.x, y: character.position.y, z: character.position.z } });
          if (!lesson || lesson.kind === 'beacon') { challenge.complete(); finish(); active = false; }
        }
        if (active && lesson) {
          sawLock ||= threat.locked > 0;
          const complete = lesson.kind === 'cover' ? lessonProgress.escapedDetection : lesson.kind === 'tool' ? lessonProgress.toolEffective : mission.state.extracted;
          if (complete) { lessonProgress.status = 'complete'; challenge.complete(); finish(); active = false; }
          else if (challenge.state.elapsed >= Math.min(60, Math.max(10, lesson.durationSeconds))) { lessonProgress.status = 'timeout'; challenge.fail(); finish(); active = false; }
        }
        if (active || tailDt > 0) encounter.updateEffects(active ? dt : tailDt);
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
            if (intersections[0] && intersections[0].distance < groundDistance) aimPoint.copy(intersections[0].point); else raycaster.ray.at(Number.isFinite(groundDistance) ? groundDistance : config.weapon.projectileRange, aimPoint);
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
        element<HTMLButtonElement>('tool').disabled = pauseLike() || encounter.toolSnapshot().used;
        element('tool').textContent = `${toolNames[toolKind]} · ${encounter.toolSnapshot().used ? '已使用' : 'Q · 1 次'}`;
        element('interact').hidden = !active || !mission.canActivate(character.position, terrain.sampleHeight);
        element('objective-guide').hidden = !active || (!mission.isBeaconMission && !lesson);
        if (lesson && lesson.kind !== 'beacon') {
          element('objective-guide').textContent = `${Math.max(0, Math.ceil(lesson.durationSeconds - challenge.state.elapsed))} 秒 · ${lesson.kind === 'cover' ? sawLock ? '已被发现：绕到实体墙后摆脱锁定' : '靠近红色扫描区，观察锁定提示' : lessonProgress.toolUsed ? '已使用道具：等待它实际影响无人机' : toolKind === 'curtain' ? '先被锁定，再按 Q 释放干扰幕' : toolKind === 'decoy' ? '在视线外朝无人机附近投放诱饵 · Q' : '接近无人机至 5 米内，释放脉冲 · Q'}`;
        } else if (world && mission.isBeaconMission) {
          const goal = mission.state.beaconActivated ? world.extraction : world.beacon;
          const distance = Math.round(Math.hypot(goal.x - character.position.x, goal.z - character.position.z));
          element('objective-guide').textContent = mission.state.beaconActivated ? `信标已恢复 · 返回营地 ${distance} m · 正门近路已打开` : `前往信标 ${distance} m · 从左右入口进入庭院`;
        }
        zone.classList.toggle('turning', Math.abs(state.turnX) + Math.abs(state.turnY) > .02);
        renderer.render(scene, camera); statsTime += elapsed;
        if (active || tailDt > 0 || recordingCritical) captureFrame(recordingCritical || finished);
        if (tailDt > 0) { tailRemaining = Math.max(0, tailRemaining - tailDt); completion.advance(tailDt); if (disposed) return; }
        if (statsTime > .2) {
          lessonProgress.elapsedSeconds = challenge.state.elapsed; lessonProgress.beaconActivated = mission.state.beaconActivated;
          options.onLessonProgress?.({ ...lessonProgress });
          canvas.dataset.beacon = String(mission.state.beaconActivated); canvas.dataset.extracted = String(mission.state.extracted); canvas.dataset.tool = JSON.stringify(encounter.toolSnapshot());
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
    destroy() { if (disposed) return; disposed = true; abort.abort(); completion.cancel(); recorder?.dispose(); clearInput(); for (const remove of cleanup.splice(0)) remove(); releaseResources(); audio.dispose(); root.replaceChildren(); },
  };
}
