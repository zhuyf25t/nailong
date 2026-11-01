import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadAssets, loadLocalGlb } from './game/assets';
import { createGarden, OBSTACLES } from './game/scene';
import { createController, DEAD_ZONE } from './game/controller';
import { createCameraObstruction } from './game/cameraObstruction';
import { createShooting } from './game/shooting';
import { createTouchControls } from './game/touchControls';
import { createChallenge } from './game/challenge';
import { createDroneEncounter } from './game/droneEncounter';
import { createTerrainEditor, parseTerrainFile, terrainKey } from './game/terrainEditor';
import { DEFAULT_TERRAIN_CONFIG, TERRAIN_HALF_SIZE } from './game/terrain';
import { createProps } from './game/props';
import { aimFacing, dampAngle, CRATE_HEIGHT } from './game/movement';
import { segmentTerrainTime } from './game/shootingMath';
import './style.css';

const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const resetIcon = icon('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>');
const pauseIcon = icon('<path d="M9 5v14M15 5v14"/>');
const cubeIcon = icon('<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5"/>');
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="奶龙小靶场首页"><span class="brand-mark"><i></i><i></i><b></b></span><span>奶龙<span class="brand-light">小靶场</span><small>A LITTLE GARDEN, A LITTLE ADVENTURE.</small></span></a>
    <div class="header-center"><span class="live-dot"></span> 花园练习场 <span class="divider"></span> 自由练习</div>
    <div class="header-actions"><button id="import-open" class="button subtle" aria-label="导入 GLB">${cubeIcon}<span>导入 GLB</span></button><button id="reset" class="button subtle" aria-label="回到起点">${resetIcon}<span>回到起点</span></button><button id="pause" class="button dark">${pauseIcon}<span>暂停</span><kbd>Esc</kbd></button></div>
  </header>
  <main>
    <section class="playground" aria-label="三维花园练习场">
      <canvas id="game" aria-label="游戏画布，WASD 移动，空格跳跃，鼠标越过蓝框转向" tabindex="0"></canvas>
      <div class="scene-heading"><span class="eyebrow">GARDEN / 01</span><h1>今天，轻松打几靶。</h1><p>走走、跳跳，让能量飞一会儿。</p></div>
      <div class="scoreboard"><div><span>命中</span><strong id="hits">00</strong></div><span class="score-divider"></span><div><span>发射</span><strong id="shots">00</strong></div><span class="practice-tag">不限时</span></div>
      <div class="aim-zone" id="aim-zone" aria-hidden="true"><span class="zone-label"><i></i>框内瞄准 · 越界转向</span><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span></div>
      <div class="turn-edge left" id="turn-left">‹</div><div class="turn-edge right" id="turn-right">›</div><div class="turn-edge top" id="turn-up">⌃</div><div class="turn-edge bottom" id="turn-down">⌄</div>
      <div class="reticle" id="reticle" aria-hidden="true"><span></span></div>
      <div class="scene-footer"><span class="scene-caption"><span class="sun-symbol">☀</span> 花园晴日 <i></i> <span id="motion">正在准备</span></span><span class="performance"><span class="live-dot"></span><span id="fps">—</span> FPS</span></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <div class="overlay" id="loading"><div class="loading-card"><span class="sprout">✦</span><span class="eyebrow">A LITTLE MOMENT</span><h2 id="loading-title">把小花园搬过来…</h2><p id="loading-text">准备角色和场景模型</p><div class="load-track"><span id="load-progress"></span></div><button id="reload" class="button dark" hidden>重新加载</button></div></div>
      <div class="overlay pause-overlay" id="pause-overlay" hidden><div class="pause-card"><span class="eyebrow">TAKE A LITTLE BREAK</span><h2>奶龙歇一会儿。</h2><p>回来后，继续你的小小冒险。</p><button id="resume" class="button dark large">继续练习 <span>→</span></button><small>点击继续后，移动鼠标恢复镜头控制</small></div></div>
      <div class="drop-indicator" id="drop-indicator" hidden>${cubeIcon}<strong>把 GLB 放进小花园</strong><span>文件只在本机浏览器中预览</span></div>
    </section>
    <footer class="control-bar"><div class="control"><span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>移动</span></div><span class="control-separator"></span><div class="control"><kbd class="space-key">SPACE</kbd><span>跳跃</span></div><span class="control-separator"></span><div class="control">${icon('<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7M6 9h12"/>')}<span>左键发射脉冲</span></div><div class="control mouse-guide"><span class="mini-zone"></span><span>越框转向 · 滚轮缩放</span></div><span class="footer-note">慢慢来，快乐不计时 <span>✳</span></span></footer>
  </main>
  <dialog id="import-dialog"><form method="dialog"><button class="dialog-close" aria-label="关闭">×</button></form><span class="eyebrow">BRING SOMETHING NEW</span><h2>放一个模型进花园</h2><p>选择独立的 <b>.glb</b> 文件，模型会出现在奶龙身旁。也可以直接拖进画面。</p><button id="pick-model" type="button" class="file-picker">${cubeIcon}<strong>选择 GLB 文件</strong><span>最大 30 MB · 不会上传到服务器</span></button><input id="model-file" type="file" accept=".glb" hidden/><p class="import-note">导入模型用于外观预览，自动调整大小；不会替换可操作的奶龙。包含动画时播放第一段。</p><p id="import-status" role="status"></p><button id="remove-model" class="button subtle" hidden>移除导入的模型</button></dialog>
`;

// Additional game flows share the same canvas and scene.
document.querySelector('.header-actions')!.insertAdjacentHTML('afterbegin', '<button id="terrain-open" class="button subtle" aria-label="地形工坊"><span>地形工坊</span>⌁</button><button id="tools-open" class="button subtle" aria-label="更多工具" aria-expanded="false">⋯</button>');
document.querySelector('.playground')!.insertAdjacentHTML('beforeend', `
  <div class="buff-list" id="buff-list" aria-live="polite"></div>
  <div class="countdown" id="countdown" hidden aria-live="polite"><span>准备好了吗</span><strong id="countdown-number">3</strong></div>
  <div class="welcome" id="welcome" hidden><div class="welcome-card"><span class="eyebrow">A SUNNY LITTLE ESCAPE</span><span class="welcome-flower">✳</span><h2>今天也要<br/>玩得开心。</h2><p>和奶龙一起走进花谷。<br/>一把脉冲枪，一场三十秒的小冒险。</p><button id="welcome-challenge" class="button dark large">开始 30 秒挑战 <span>→</span></button><button id="welcome-practice" class="button subtle large">先在花园走走</button><small>无需登录 · 电脑与触屏操作</small></div></div>
  <div class="overlay result-overlay" id="results" hidden><div class="result-card"><span class="eyebrow">A LITTLE MOMENT OF JOY</span><span class="result-flower">✳</span><h2>快乐，收集完毕！</h2><div class="result-score"><strong id="result-score">0</strong><span>本局得分</span></div><div class="result-metrics"><div><b id="result-hits">0</b><span>命中靶子</span></div><div><b id="result-accuracy">0%</b><span>命中率</span></div><div><b id="result-best">0</b><span>本地图最佳</span></div></div><p id="result-note">成绩保存在当前浏览器。</p><button id="retry" class="button dark large">再挑战一次 <span>→</span></button><button id="result-practice" class="button subtle">回到花园</button></div></div>
  <div class="tool-menu" id="tool-menu" hidden><button id="debug-toggle" aria-pressed="false">显示碰撞与地形线框</button><button id="touch-toggle" aria-pressed="false">预览触屏操作</button></div>
`);
document.querySelector('.scoreboard')!.insertAdjacentHTML('beforeend', '<div class="round-clock"><span id="mode-label">自由练习</span><strong id="time-left">∞</strong></div>');
document.querySelector('.practice-tag')!.remove();
document.querySelector('.control-bar')!.insertAdjacentHTML('beforeend', '<button id="challenge-start" class="button challenge-button">挑战 30 秒 ↗</button><span id="map-name" class="map-name">花谷地图</span><span class="touch-note">左手移动 · 右手瞄准 · 按住发射</span>');
document.querySelector('.scene-heading h1')!.textContent = '群山之间，自由探索。';
document.querySelector('.scene-heading p')!.textContent = '沿小径走进林地，寻找山谷里的训练无人机。';
document.querySelector('.scene-heading .eyebrow')!.textContent = 'BLOOM VALLEY / EXPLORE';
document.querySelector('.welcome-card p')!.innerHTML = '走进群山环抱的花谷。<br/>自由探索，或来一场三十秒训练。';
el('welcome-practice').textContent='探索山谷';
el('map-name').textContent='群山花谷';
document.querySelector('#tool-menu')!.insertAdjacentHTML('beforeend', '<button id="camera-near">拉近镜头 ＋</button><button id="camera-far">拉远镜头 −</button><button id="props-toggle" aria-pressed="false">显示道具原型</button>');
document.querySelector('.header-center')!.innerHTML = '<span class="live-dot"></span> 花谷练习场 <span class="divider"></span> <span id="header-mode">自由练习</span>';
el('resume').innerHTML = '继续游戏 <span>→</span>';
document.querySelector('.scene-heading h1')!.textContent = '清除四架巡逻无人机。';
document.querySelector('.scene-heading p')!.textContent = '躲开红色扫描与追击；无人机撞到你就会自爆。';
document.querySelector('.scene-heading .eyebrow')!.textContent = 'BLOOM VALLEY / DRONE HUNT';
document.querySelector('.welcome-card p')!.innerHTML = '四架无人机正在巡逻。<br/>避开扫描与追击，逐一击落，安全回家。';
el('welcome-challenge').innerHTML = '开始清除行动 <span>→</span>';
el('challenge-start').textContent = '重新开始 ↗';
document.querySelector('.scoreboard>div>span')!.textContent = '击落';
document.querySelector('.result-card h2')!.textContent = '花谷，暂时安全了。';
document.querySelector('.result-score>span')!.textContent = '无人机已清除';
document.querySelector('#result-hits+span')!.textContent = '命中脉冲';
document.querySelector('#result-best+span')!.textContent = '最快用时';
document.querySelector('.playground')!.insertAdjacentHTML('beforeend', '<div id="threat-status" class="threat-status" role="status" hidden></div>');

function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id) as T; }
const canvas = el<HTMLCanvasElement>('game');
const playground = document.querySelector<HTMLElement>('.playground')!;
app.dataset.screen = 'welcome';
const zone = el('aim-zone');
zone.style.width = `${DEAD_ZONE.width * 100}%`; zone.style.height = `${DEAD_ZONE.height * 100}%`;
let ready = false;
let paused = false;
let started = false;
let editing = false;
let toastTimeout = 0;
function toast(message: string) { el('toast').textContent = message; el('toast').classList.add('show'); clearTimeout(toastTimeout); toastTimeout = window.setTimeout(()=>el('toast').classList.remove('show'),2600); }
el('reload').onclick = () => location.reload();

async function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.25 : 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const assets = await loadAssets((loaded,total)=>{
    el('load-progress').style.width = `${loaded / total * 100}%`;
    el('loading-text').textContent = `正在载入模型 ${loaded} / ${total}`;
  });
  const garden = createGarden(assets, coarse);
  // Bake a small reflection environment once so imported metal is readable in shade.
  const reflectionScene = new RoomEnvironment();
  const reflectionGenerator = new THREE.PMREMGenerator(renderer);
  garden.scene.environment = reflectionGenerator.fromScene(reflectionScene, 0.04).texture;
  garden.scene.environmentIntensity = 0.45;
  reflectionScene.dispose();
  reflectionGenerator.dispose();
  const { scene, character, gun, mixer, idle, walk, targets } = garden;
  const { terrain } = garden;
  try { const saved = localStorage.getItem('nailong-terrain-v1'); if (saved) garden.setTerrain(parseTerrainFile(JSON.parse(saved))); } catch { /* A damaged local save must not stop play. */ }
  const camera = new THREE.PerspectiveCamera(50,1,0.1,260);
  function frameWelcome() {
    character.rotation.y = .32;
    camera.position.set(4.6,5.3,11.8);
    // Portrait phones show the character above the entry card; desktop places it beside it.
    camera.lookAt(camera.aspect < 0.85 ? 0 : 1.8, camera.aspect < 0.85 ? 1.2 : 1.0, camera.aspect < 0.85 ? 4 : 3);
  }
  const controller = createController({ canvas, camera, character, obstacles: OBSTACLES, terrain });
  el('camera-near').onclick = () => controller.setCameraDistance(controller.getCameraDistance() - 1);
  el('camera-far').onclick = () => controller.setCameraDistance(controller.getCameraDistance() + 1);
  const cameraObstruction = createCameraObstruction();
  const cameraBoxes = OBSTACLES.map(o => ({ min: { x:o.x-o.halfX, y:0, z:o.z-o.halfZ }, max: { x:o.x+o.halfX, y:0, z:o.z+o.halfZ } }));
  const challenge = createChallenge({ mode: 'elimination', targetCount: targets.length });
  const encounter = createDroneEncounter(scene,targets,(x,z)=>terrain.sampleHeight(x,z));
  let resultRevealRemaining = 0;
  const shooting = createShooting(scene,targets,target=>{
    const outcome = encounter.hit(target);
    if (!outcome.hit) return;
    challenge.hit();
    if (outcome.destroyed) {
      toast(`无人机 ${outcome.id+1} 已击落`);
      if (challenge.destroy(outcome.id)) finish();
    }
    syncScore();el('hits').classList.remove('bump');void el('hits').offsetWidth;el('hits').classList.add('bump');
  }, terrain);
  const pointer = new THREE.Vector2(0,0);
  const raycaster = new THREE.Raycaster();
  const aimPoint = new THREE.Vector3();
  const rayEnd = new THREE.Vector3();
  const aimGround = (x: number,z: number) => Math.abs(x) <= TERRAIN_HALF_SIZE && Math.abs(z) <= TERRAIN_HALF_SIZE ? terrain.sampleHeight(x,z) : -Infinity;
  const viewDirection = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  let viewYaw = Math.PI;
  let firing = false, pointerInside = false, queuedShot = false;
  const muzzle = gun.getObjectByName('muzzle')!;
  const muzzlePosition = new THREE.Vector3();
  let importMixer: THREE.AnimationMixer | null = null;
  let imported: THREE.Group | null = null;
  const dialog = el<HTMLDialogElement>('import-dialog');
  let debug = false, touchPreview = false, propsEnabled = false, bubbleTime = 0, springTime = 0, bloomTime = 0;
  const aimClip = THREE.AnimationClip.findByName(assets.nailong.animations, 'Aim');
  const shootClip = THREE.AnimationClip.findByName(assets.nailong.animations, 'Shoot');
  const aimAction = aimClip ? mixer.clipAction(aimClip).setLoop(THREE.LoopOnce, 1) : null;
  if (aimAction) { aimAction.clampWhenFinished = true; aimAction.play().setEffectiveWeight(0); }
  const shootAction = shootClip ? mixer.clipAction(shootClip).setLoop(THREE.LoopOnce, 1) : null;
  let aimWeight = 0;
  const touch = createTouchControls({ element: playground, canvas, controller,
    onFire(active) { firing = active && !paused && started && ['practice','playing'].includes(challenge.state.phase); if(firing)queuedShot=true; pointerInside = true; },
    onAim(x,y) { pointer.set(x,y); pointerInside = true; },
  });
  const props = createProps(scene, terrain, kind => {
    if (kind === 'bubble') { bubbleTime = 8; shooting.setBubbleBoost(true); toast('能量补给！强化脉冲持续 8 秒'); }
    if (kind === 'spring') { springTime = 8; controller.setJumpMultiplier(1.25); toast('弹簧蘑菇！这次可以跳得更高'); }
    if (kind === 'bloom') { bloomTime = 6; toast('花种醒了，花谷为你开花。'); }
    syncBuffs();
  });
  props.setEnabled(false);
  function formatTime(seconds: number) { return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`; }
  function syncScore() {
    el('hits').textContent = `${challenge.state.destroyed}/${targets.length}`; el('shots').textContent = String(challenge.state.shots).padStart(2,'0');
    el('mode-label').textContent = '用时';
    el('time-left').textContent = formatTime(challenge.state.elapsed);
    el('header-mode').textContent = challenge.state.phase === 'practice' ? '自由探索' : challenge.state.phase === 'results' ? challenge.state.outcome === 'defeat' ? '行动中断' : '行动完成' : '无人机清除';
    el<HTMLButtonElement>('pause').disabled = challenge.state.phase === 'results';
    const locked = ['playing','countdown'].includes(challenge.state.phase);
    el<HTMLButtonElement>('terrain-open').disabled = locked; el<HTMLButtonElement>('challenge-start').disabled = !ready;
    el('countdown').hidden = paused || challenge.state.phase !== 'countdown'; el('countdown-number').textContent = String(Math.ceil(challenge.state.countdown));
    canvas.dataset.phase = challenge.state.phase;
    canvas.dataset.outcome = challenge.state.outcome ?? '';
  }
  function syncBuffs() {
    el('buff-list').innerHTML = `${bubbleTime>0?`<span class="buff bubble-buff">◉ 强化脉冲 <b>${Math.ceil(bubbleTime)}s</b></span>`:''}${springTime>0?`<span class="buff spring-buff">↟ 弹簧脚 <b>${Math.ceil(springTime)}s</b></span>`:''}${bloomTime>0?'<span class="buff bloom-buff">✿ 花谷绽放</span>':''}`;
    canvas.dataset.buffs = [bubbleTime>0?'bubble':'',springTime>0?'spring':'',bloomTime>0?'bloom':''].filter(Boolean).join(',');
  }
  const editor = createTerrainEditor(playground, terrain.config, config => {
    garden.setTerrain(config); controller.resnapToTerrain(); shooting.reset(); encounter.reset(); encounter.invalidateTerrain(); challenge.reset(false); props.reposition();
    bubbleTime = springTime = bloomTime = 0; controller.setJumpMultiplier(1); props.reset(); syncBuffs();
    if (imported) imported.position.y = terrain.sampleHeight(imported.position.x, imported.position.z);
    canvas.dataset.terrain = JSON.stringify(terrain.config);
    el('map-name').textContent = terrainKey(terrain.config) === terrainKey(DEFAULT_TERRAIN_CONFIG) ? '花谷地图' : '我的花谷';
  }, () => { editing = false; editor.close(); setPaused(false); });
  function closeTools() { el('tool-menu').hidden = true; el('tools-open').setAttribute('aria-expanded','false'); }
  function enter(challenging: boolean) {
    app.dataset.screen = 'game';
    character.scale.setScalar(1); character.visible = true; resultRevealRemaining = 0;
    started = true; editing = false; editor.close(); dialog.close(); el('welcome').hidden = true; el('results').hidden = true; closeTools();
    challenge.reset(challenging); controller.reset(); controller.setJumpMultiplier(1); shooting.reset(); encounter.reset(); encounter.setEnabled(true); props.reset();
    bubbleTime = springTime = bloomTime = 0; firing = false; queuedShot=false; touch.reset(); syncBuffs(); shootAction?.stop(); aimWeight = 0;
    pointer.set(0,0); pointerInside=false; el('reticle').style.opacity='0';
    // A camera cut must rebuild visibility before the first countdown frame.
    garden.updateEnvironment(0,camera,character.position,true);
    encounter.update(0,character.position,camera,false);
    setPaused(false); toast(challenging ? '每架 3 发；发现你后会追击，别让它碰到你！' : '自由探索也有危险；借箱子遮挡视线，躲开追击。');
  }
  function finish() {
    const defeated = challenge.state.outcome === 'defeat';
    setPaused(true, false); el('results').hidden = true; resultRevealRemaining = .55;
    const result = challenge.result(); let best: number | null = null, saved = true;
    try {
      const key = `nailong-drone-best-v2:${terrainKey(terrain.config)}`;
      const old = Number(localStorage.getItem(key));
      if (Number.isFinite(old) && old > 0) best = old;
      if (!defeated) { best = Math.min(best ?? Infinity, challenge.state.elapsed); localStorage.setItem(key, String(best)); }
    } catch { saved = false; }
    if (defeated) { character.visible = false; toast('被无人机撞到了！本次行动结束。'); }
    targets.forEach(target=>{if(!target.alive)target.root.visible=false;});
    el('threat-status').hidden = true;
    el('results').dataset.outcome = defeated ? 'defeat' : 'victory';
    document.querySelector('.result-card h2')!.textContent = defeated ? '差一点，下次再来。' : '花谷，暂时安全了。';
    document.querySelector('.result-card>.eyebrow')!.textContent = defeated ? 'MISSION INTERRUPTED' : 'VALLEY SECURED';
    document.querySelector('.result-score>span')!.textContent = defeated ? '已击落 · 避开追击再试一次' : '无人机已清除';
    el('result-score').textContent = `${challenge.state.destroyed} / ${targets.length}`; el('result-hits').textContent = String(result.hits); el('result-accuracy').textContent = `${result.accuracy}%`; el('result-best').textContent = best === null ? '—' : formatTime(best);
    el('result-note').textContent = defeated ? `坚持了 ${formatTime(challenge.state.elapsed)}。锁定后受击仍会追来；借箱子、坡地遮挡后再反击。` : `本次用时 ${formatTime(challenge.state.elapsed)} · ${saved ? '最快记录保存在当前浏览器' : '浏览器未允许保存记录'}`;
  }
  el('welcome-challenge').onclick = el('retry').onclick = () => enter(true);
  el('welcome-practice').onclick = el('result-practice').onclick = () => enter(false);
  el('challenge-start').onclick = () => { if (ready) enter(true); };
  el('terrain-open').onclick = () => { if (!ready || ['playing','countdown'].includes(challenge.state.phase)) return; if (!started || challenge.state.phase === 'results') enter(false); editing = true; setPaused(true,false); editor.open(); closeTools(); };
  el('tools-open').onclick = () => { el('tool-menu').hidden = !el('tool-menu').hidden; el('tools-open').setAttribute('aria-expanded',String(!el('tool-menu').hidden)); };
  el('debug-toggle').onclick = () => { debug=!debug; garden.setDebug(debug); el('debug-toggle').setAttribute('aria-pressed',String(debug)); el('debug-toggle').textContent=debug?'隐藏碰撞与地形线框':'显示碰撞与地形线框'; canvas.dataset.debug=String(debug); closeTools(); };
  el('touch-toggle').onclick = () => { touchPreview=!touchPreview; playground.toggleAttribute('data-touch-preview',touchPreview); el('touch-toggle').setAttribute('aria-pressed',String(touchPreview)); el('touch-toggle').textContent=touchPreview?'关闭触屏预览':'预览触屏操作'; closeTools(); touch.reset(); pointer.set(0,0); };
  el('props-toggle').onclick = () => {
    propsEnabled=!propsEnabled; props.reset(); props.setEnabled(propsEnabled);
    bubbleTime=springTime=bloomTime=0; shooting.setBubbleBoost(false); controller.setJumpMultiplier(1); syncBuffs();
    el('props-toggle').setAttribute('aria-pressed',String(propsEnabled));
    el('props-toggle').textContent=propsEnabled?'隐藏道具原型':'显示道具原型'; closeTools();
  };

  function setPaused(value: boolean, overlay = true) {
    paused=value;controller.setPaused(value || challenge.state.phase === 'countdown');firing=false;queuedShot=false;touch.reset();
    el('pause-overlay').hidden=!value || !overlay || !started;
    el('pause').innerHTML=value?`${icon('<path d="m9 4 11 8-11 8V4Z"/>')}<span>继续</span><kbd>Esc</kbd>`:`${pauseIcon}<span>暂停</span><kbd>Esc</kbd>`;
    if (!value) canvas.focus({preventScroll:true});
    syncScore();
  }
  el('pause').onclick=()=>{if(ready && started && !editing && !dialog.open && challenge.state.phase!=='results')setPaused(!paused);};
  el('resume').onclick=()=>setPaused(false);
  el('reset').onclick=()=>{if(ready)enter(false);};
  window.addEventListener('keydown',event=>{if(event.code==='Escape'&&!event.repeat&&ready&&started&&!dialog.open&&!editing&&challenge.state.phase!=='results'){event.preventDefault();setPaused(!paused);}});
  const autoPause=()=>{if(ready&&started&&!editing&&!dialog.open&&challenge.state.phase!=='results')setPaused(true);};
  window.addEventListener('blur',autoPause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||touchPreview||coarse)return;
    const bounds=canvas.getBoundingClientRect();
    const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
    pointer.set(x / bounds.width * 2 - 1, -(y / bounds.height * 2 - 1)); pointerInside=true;
    el('reticle').style.left=`${x}px`;el('reticle').style.top=`${y}px`;el('reticle').style.opacity='1';
  });
  canvas.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'&&!touchPreview){pointerInside=false;firing=false;el('reticle').style.opacity='0';}});
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&!touchPreview&&!coarse&&event.button===0&&!paused&&ready&&started&&['practice','playing'].includes(challenge.state.phase)){firing=true;queuedShot=true;}});
  window.addEventListener('pointerup',event=>{if(event.pointerType==='mouse'&&!touchPreview)firing=false;});
  window.addEventListener('pointercancel',event=>{if(event.pointerType==='mouse'){firing=false;queuedShot=false;}});
  canvas.addEventListener('contextmenu',event=>event.preventDefault());

  function disposeImported() {
    if (!imported) return;
    importMixer?.stopAllAction(); importMixer?.uncacheRoot(imported); importMixer=null;
    scene.remove(imported);
    imported.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>{Object.values(material).forEach(v=>{if(v instanceof THREE.Texture)v.dispose();});material.dispose();});}});
    imported=null;el('remove-model').hidden=true;
  }
  async function importFile(file: File) {
    if(['playing','countdown'].includes(challenge.state.phase)){toast('本局结束后再导入模型。');return;}
    if(!started||challenge.state.phase==='results')enter(false);
    el('import-status').textContent='正在读取模型…';setPaused(true,false);
    try {
      const gltf=await loadLocalGlb(file);
      const wrapper=new THREE.Group();wrapper.add(gltf.scene);
      const box=new THREE.Box3().setFromObject(wrapper);const size=box.getSize(new THREE.Vector3());
      const maxDimension=Math.max(size.x,size.y,size.z);
      if (!Number.isFinite(maxDimension)||maxDimension<0.001) throw new Error('模型没有可见的有效尺寸');
      gltf.scene.scale.multiplyScalar(2.4/maxDimension);wrapper.updateMatrixWorld(true);
      box.setFromObject(wrapper);const center=box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
      wrapper.position.set(THREE.MathUtils.clamp(character.position.x+2.4,-9,9),0,character.position.z-0.3);
      wrapper.position.y=terrain.sampleHeight(wrapper.position.x,wrapper.position.z);
      wrapper.traverse(object=>{object.castShadow=true;object.receiveShadow=true;});
      disposeImported();imported=wrapper;scene.add(wrapper);
      if(gltf.animations.length){importMixer=new THREE.AnimationMixer(wrapper);importMixer.clipAction(gltf.animations[0]).play();}
      el('import-status').textContent=`已导入 ${file.name} · ${gltf.animations.length} 段动画`;
      el('remove-model').hidden=false;dialog.close();setPaused(false);toast(`已放入 ${file.name}`);
    } catch(error) {el('import-status').textContent=error instanceof Error?error.message:'模型读取失败';if(!dialog.open)dialog.showModal();}
  }
  el('import-open').onclick=()=>{if(!ready)return;if(['playing','countdown'].includes(challenge.state.phase)){toast('本局结束后再导入模型。');return;}if(!started||challenge.state.phase==='results')enter(false);setPaused(true,false);dialog.showModal();};
  dialog.addEventListener('close',()=>{if(started&&paused&&!editing&&challenge.state.phase!=='results')setPaused(false);});
  el('pick-model').onclick=()=>el<HTMLInputElement>('model-file').click();
  el<HTMLInputElement>('model-file').onchange=event=>{const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file)void importFile(file);input.value='';};
  el('remove-model').onclick=()=>{disposeImported();el('import-status').textContent='已移除预览模型';};
  let dragDepth=0;
  playground.addEventListener('dragenter',event=>{event.preventDefault();if(ready){dragDepth++;el('drop-indicator').hidden=false;}});
  playground.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;el('drop-indicator').hidden=true;}});
  playground.addEventListener('dragover',event=>{event.preventDefault();});
  playground.addEventListener('drop',event=>{event.preventDefault();dragDepth=0;el('drop-indicator').hidden=true;const file=event.dataTransfer?.files[0];if(file&&ready)void importFile(file);});

  const resize = new ResizeObserver(()=>{
    const {width,height}=canvas.getBoundingClientRect();
    if(width>0&&height>0){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(!started)frameWelcome();garden.updateEnvironment(0,camera,character.position,true);}
  });resize.observe(canvas);
  const bounds=canvas.getBoundingClientRect();renderer.setSize(bounds.width,bounds.height,false);camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();
  controller.setPaused(true);paused=true;
  character.scale.setScalar(1.3);
  frameWelcome();
  garden.updateEnvironment(0,camera,character.position,true);
  // Warm the scanner/health materials while the loading overlay is still present.
  encounter.setEnabled(true); encounter.update(0,character.position,camera,false);
  await renderer.compileAsync(scene,camera);
  encounter.setEnabled(false); encounter.update(0,character.position,camera,false);
  renderer.render(scene,camera);
  ready=true;el('loading').hidden=true;el('welcome').hidden=false;el('motion').textContent='等你出发';
  canvas.dataset.ready='true';canvas.dataset.terrain=JSON.stringify(terrain.config);syncScore();
  let previous=performance.now(),statsTime=0,frames=0,animationWeight=0;
  renderer.setAnimationLoop(now=>{
    const elapsed=(now-previous)/1000;const dt=Math.min(elapsed,0.05);previous=now;
    // The visibility handler already pauses gameplay. Hidden tabs need no GPU work.
    if (document.hidden) return;
    const before=challenge.state.phase;
    if(started&&!paused&&challenge.advance(elapsed))finish();
    if(before==='countdown'&&challenge.state.phase==='playing'){controller.setPaused(false);toast('开始！');}
    const state=controller.update(dt);
    let active=started&&!paused&&['practice','playing'].includes(challenge.state.phase);
    if (active) {
      OBSTACLES.forEach((o,i)=>{cameraBoxes[i].min.y=terrain.sampleHeight(o.x,o.z);cameraBoxes[i].max.y=cameraBoxes[i].min.y+(o.height??CRATE_HEIGHT);});
      cameraObstruction.update(camera,controller.cameraTarget,cameraBoxes,terrain.sampleHeight,dt);
    } else cameraObstruction.reset();
    const threat=encounter.update(dt,character.position,camera,active);
    if (threat.contact !== null && challenge.fail()) { finish(); active = false; }
    // Result transitions freeze controls and enemies, but let their final burst finish.
    if (!paused || challenge.state.phase === 'results') encounter.updateEffects(dt);
    if (resultRevealRemaining > 0) {
      resultRevealRemaining = Math.max(0, resultRevealRemaining - dt);
      if (resultRevealRemaining === 0) { el('results').hidden = false; el('retry').focus({ preventScroll: true }); }
    }
    if(!paused||!started) garden.updateEnvironment(dt,camera,character.position);
    if(active||!started){
      animationWeight=THREE.MathUtils.damp(animationWeight,state.moving&&state.grounded?1:0,10,dt);
      idle.setEffectiveWeight(1-animationWeight);walk.setEffectiveWeight(animationWeight);walk.setEffectiveTimeScale(Math.max(0.6,state.speed/3.2));
      aimWeight=THREE.MathUtils.damp(aimWeight,active&&(pointerInside||touchPreview||coarse)?0.8:0,14,dt);aimAction?.setEffectiveWeight(aimWeight);
      mixer.update(dt);importMixer?.update(dt);
    }
    if(active){
      const hadBubble=bubbleTime>0,hadSpring=springTime>0;
      bubbleTime=Math.max(0,bubbleTime-elapsed);springTime=Math.max(0,springTime-elapsed);bloomTime=Math.max(0,bloomTime-elapsed);
      if(hadBubble&&bubbleTime===0)shooting.setBubbleBoost(false);
      if(hadSpring&&springTime===0)controller.setJumpMultiplier(1);
      props.update(elapsed,character.position);
      // Resolve the cursor every frame, not inside the firing branch. Clicking never snaps the body.
      camera.getWorldDirection(viewDirection); viewDirection.y=0; viewDirection.normalize();
      viewYaw=Math.atan2(viewDirection.x,viewDirection.z);
      if (pointerInside || touchPreview || coarse) {
        camera.updateMatrixWorld(); raycaster.setFromCamera(pointer,camera);
        const activeTargets=targets.filter(t=>t.alive&&t.cooldown===0).map(t=>t.root);
        activeTargets.forEach(root=>root.updateWorldMatrix(true,true));
        const intersections=raycaster.intersectObjects(activeTargets,true);
        // Sample the same terrain height grid used for collision rather than testing 32K triangles per cursor update.
        raycaster.ray.at(80,rayEnd);
        const groundTime=segmentTerrainTime(raycaster.ray.origin,rayEnd,aimGround);
        const groundDistance=groundTime===null?Infinity:groundTime*80;
        if(intersections[0]&&intersections[0].distance<groundDistance)aimPoint.copy(intersections[0].point);
        else raycaster.ray.at(Number.isFinite(groundDistance)?groundDistance:40,aimPoint);
        aimDirection.copy(aimPoint).sub(character.position);
        // A cursor near the screen's bottom can hit ground behind the player. Keep aiming in front.
        const forwardDistance=aimDirection.dot(viewDirection);
        if(forwardDistance<1.25)aimPoint.addScaledVector(viewDirection,1.25-forwardDistance);
        aimDirection.copy(aimPoint).sub(character.position);
        character.rotation.y=dampAngle(character.rotation.y,aimFacing(aimDirection,viewYaw),dt,12);
      } else {
        character.rotation.y=dampAngle(character.rotation.y,viewYaw,dt,12);
      }
      if((firing||queuedShot)&&pointerInside){
        queuedShot=false;
        character.updateMatrixWorld(true);
        muzzle.getWorldPosition(muzzlePosition);
        if(shooting.fire(muzzlePosition,aimDirection.copy(aimPoint).sub(muzzlePosition).normalize())){challenge.shot();shootAction?.reset().setEffectiveWeight(1).play();}
      }
      shooting.update(dt);
    }
    el('threat-status').hidden=!started||paused||challenge.state.phase==='countdown'||(!threat.locked&&!threat.alerted);
    el('threat-status').dataset.state=threat.locked?'locked':'alert';
    el('threat-status').textContent=threat.locked?`${threat.locked} 架正在追击 · 撞到你会自爆！`:`${threat.alerted} 架正在高速搜索 · 借掩体脱身`;
    el('turn-left').style.opacity=String(Math.max(0,-state.turnX)*0.9);el('turn-right').style.opacity=String(Math.max(0,state.turnX)*0.9);
    el('turn-up').style.opacity=String(Math.max(0,-state.turnY)*0.9);el('turn-down').style.opacity=String(Math.max(0,state.turnY)*0.9);
    zone.classList.toggle('turning',Math.abs(state.turnX)+Math.abs(state.turnY)>0.02);
    renderer.render(scene,camera);
    statsTime+=elapsed;frames++;
    if(statsTime>0.3){
      syncScore();syncBuffs();
      el('fps').textContent=String(Math.round(frames/statsTime));
      el('motion').textContent=editing?'正在塑造花谷':!started?'等你出发':paused?'休息一下':!state.grounded?'轻轻一跃':state.moving?'正在散步':'自在探索';
      canvas.dataset.playerPosition=character.position.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.cameraPosition=camera.position.toArray().map(n=>n.toFixed(3)).join(',');
      canvas.dataset.grounded=String(state.grounded);canvas.dataset.paused=String(paused);
      canvas.dataset.playerYaw=character.rotation.y.toFixed(5);canvas.dataset.viewYaw=viewYaw.toFixed(5);
      canvas.dataset.cameraDistance=controller.getCameraDistance().toFixed(2);
      canvas.dataset.propsEnabled=String(propsEnabled);
      canvas.dataset.environment='Quaternius Stylized Nature MegaKit Standard';canvas.dataset.natureInstances=String(garden.natureCount);
      canvas.dataset.natureLod=JSON.stringify(garden.natureStats);
      canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);
      canvas.dataset.animations=assets.nailong.animations.map(a=>a.name).join(',');
      canvas.dataset.drones=JSON.stringify(encounter.snapshot());
      canvas.dataset.explosions=String(encounter.effectCount());
      statsTime=0;frames=0;
    }
  });
  if(import.meta.hot)import.meta.hot.dispose(()=>{renderer.setAnimationLoop(null);controller.dispose();touch.dispose();props.dispose();shooting.dispose();encounter.dispose();resize.disconnect();renderer.dispose();location.reload();});
}

start().catch(error=>{
  console.error(error);el('loading-title').textContent='小花园暂时没加载好';
  el('loading-text').textContent=error instanceof Error?error.message:'请确认浏览器支持 WebGL 2 后重试';
  el('reload').hidden=false;el('load-progress').style.width='0';
});
