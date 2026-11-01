interface TouchController {
  setMoveInput(x: number, forward: number): void;
  rotateView(dx: number, dy: number): void;
  queueJump(): void;
  setMouseLookEnabled(value: boolean): void;
}

interface TouchControlsOptions {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  controller: TouchController;
  onFire(active: boolean): void;
  /** Normalized device coordinates, with screen-up positive Y. */
  onAim(x: number, y: number): void;
}

/** Independent pointer IDs let the player move, aim, shoot and jump together. */
export function createTouchControls({ element, canvas, controller, onFire, onAim }: TouchControlsOptions) {
  const container = document.createElement('div');
  container.className = 'touch-controls';
  container.setAttribute('aria-label', '触屏游戏操作');
  container.innerHTML = `
    <button class="touch-stick" type="button" aria-label="移动摇杆">
      <span class="touch-knob"></span><span class="touch-stick-label">移动</span>
    </button>
    <span class="touch-look-hint">滑动右侧 · 转动视角</span>
    <button class="touch-fire" type="button" aria-label="按住射击，滑动瞄准"><span>◎</span><small>射击</small></button>
    <button class="touch-jump" type="button" aria-label="跳跃"><span>↑</span><small>跳跃</small></button>`;
  element.append(container);
  const stick = container.querySelector<HTMLButtonElement>('.touch-stick')!;
  const knob = container.querySelector<HTMLElement>('.touch-knob')!;
  const fire = container.querySelector<HTMLButtonElement>('.touch-fire')!;
  const jump = container.querySelector<HTMLButtonElement>('.touch-jump')!;
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  container.style.touchAction = 'none';
  let disposed = false;
  let stickPointer: number | null = null;
  let firePointer: number | null = null;
  let lookPointer: number | null = null;
  let stickOrigin = { x: 0, y: 0, radius: 1 };
  let firePosition = { x: 0, y: 0 };
  let lookPosition = { x: 0, y: 0 };
  const removers: Array<() => void> = [];
  const coarsePointer = matchMedia('(pointer: coarse)');

  function listen(target: EventTarget, type: string, callback: (event: PointerEvent) => void) {
    const listener = callback as EventListener;
    target.addEventListener(type, listener, { passive: false });
    removers.push(() => target.removeEventListener(type, listener));
  }

  function release(target: HTMLElement, pointer: number | null) {
    if (pointer !== null && target.hasPointerCapture(pointer)) target.releasePointerCapture(pointer);
  }

  function isPreview() {
    return !!element.closest('[data-touch-preview]') || document.documentElement.hasAttribute('data-touch-preview') || document.body.hasAttribute('data-touch-preview');
  }

  function syncInputMode() {
    controller.setMouseLookEnabled(!coarsePointer.matches && !isPreview());
  }
  const modeObserver = new MutationObserver(syncInputMode);
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    modeObserver.observe(ancestor, { attributes: true, attributeFilter: ['data-touch-preview'] });
  }
  coarsePointer.addEventListener('change', syncInputMode);
  syncInputMode();

  function setStick(event: PointerEvent) {
    const dx = event.clientX - stickOrigin.x;
    const dy = event.clientY - stickOrigin.y;
    const length = Math.hypot(dx, dy);
    const factor = length > stickOrigin.radius ? stickOrigin.radius / length : 1;
    const x = dx * factor;
    const y = dy * factor;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    const magnitude = Math.hypot(x, y) / stickOrigin.radius;
    // A small inner dead zone avoids unintentional drifting under a resting thumb.
    const response = magnitude < 0.12 ? 0 : (magnitude - 0.12) / 0.88 / magnitude;
    controller.setMoveInput(x / stickOrigin.radius * response, -y / stickOrigin.radius * response);
  }

  function rotate(previous: { x: number; y: number }, event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) {
      controller.rotateView((event.clientX - previous.x) / bounds.width, (event.clientY - previous.y) / bounds.height);
    }
    previous.x = event.clientX;
    previous.y = event.clientY;
    onAim(0, 0);
  }

  listen(stick, 'pointerdown', (event) => {
    if (disposed || stickPointer !== null || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = stick.getBoundingClientRect();
    stickOrigin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius: Math.max(1, Math.min(bounds.width, bounds.height) * 0.34) };
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    stick.classList.add('is-active');
    setStick(event);
  });
  listen(stick, 'pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault();
    setStick(event);
  });
  const endStick = (event: PointerEvent) => {
    if (event.pointerId !== stickPointer) return;
    const pointer = stickPointer;
    stickPointer = null;
    release(stick, pointer);
    stick.classList.remove('is-active');
    knob.style.transform = 'translate(0px, 0px)';
    controller.setMoveInput(0, 0);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(stick, type, endStick);

  listen(fire, 'pointerdown', (event) => {
    if (disposed || firePointer !== null || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    firePointer = event.pointerId;
    firePosition = { x: event.clientX, y: event.clientY };
    fire.setPointerCapture(event.pointerId);
    fire.classList.add('is-active');
    onAim(0, 0);
    onFire(true);
  });
  listen(fire, 'pointermove', (event) => {
    if (event.pointerId !== firePointer) return;
    event.preventDefault();
    rotate(firePosition, event);
  });
  const endFire = (event: PointerEvent) => {
    if (event.pointerId !== firePointer) return;
    const pointer = firePointer;
    firePointer = null;
    release(fire, pointer);
    fire.classList.remove('is-active');
    onFire(false);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(fire, type, endFire);

  listen(jump, 'pointerdown', (event) => {
    if (disposed || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    controller.queueJump();
  });

  listen(canvas, 'pointerdown', (event) => {
    if (disposed || lookPointer !== null || event.button !== 0) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen' && !isPreview()) return;
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX < bounds.left + bounds.width * 0.43) return;
    event.preventDefault();
    lookPointer = event.pointerId;
    lookPosition = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    onAim(0, 0);
    controller.rotateView(0, 0);
  });
  listen(canvas, 'pointermove', (event) => {
    if (event.pointerId !== lookPointer) return;
    event.preventDefault();
    rotate(lookPosition, event);
  });
  const endLook = (event: PointerEvent) => {
    if (event.pointerId !== lookPointer) return;
    const pointer = lookPointer;
    lookPointer = null;
    release(canvas, pointer);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, endLook);

  function reset() {
    const pointers = { stick: stickPointer, fire: firePointer, look: lookPointer };
    stickPointer = firePointer = lookPointer = null;
    release(stick, pointers.stick);
    release(fire, pointers.fire);
    release(canvas, pointers.look);
    knob.style.transform = 'translate(0px, 0px)';
    stick.classList.remove('is-active');
    fire.classList.remove('is-active');
    controller.setMoveInput(0, 0);
    onFire(false);
    syncInputMode();
  }
  function visibilityChanged() { if (document.hidden) reset(); }
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', visibilityChanged);

  function dispose() {
    if (disposed) return;
    disposed = true;
    reset();
    for (const remove of removers) remove();
    window.removeEventListener('blur', reset);
    document.removeEventListener('visibilitychange', visibilityChanged);
    modeObserver.disconnect();
    coarsePointer.removeEventListener('change', syncInputMode);
    controller.setMouseLookEnabled(true);
    canvas.style.touchAction = previousTouchAction;
    container.remove();
  }
  return { reset, dispose };
}
