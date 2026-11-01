import * as THREE from 'three';
import {
  WALK_SPEED,
  advanceCharacterMovement,
  advancePlanarVelocity,
  edgeTurn,
  movementDirection,
  safeDelta,
  supportHeight,
  type GroundVector,
  type JumpState,
  type Obstacle,
} from './movement';

export { DEAD_ZONE } from './movement';

interface ControllerOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  character: THREE.Group;
  obstacles: Obstacle[];
  /** Limit keyboard input to this mounted game, including events inside a ShadowRoot. */
  inputScope?: HTMLElement | ShadowRoot;
  spawn?: { x: number; z: number; yaw: number };
  halfSize?: number;
  terrain?: {
    sampleHeight(x: number, z: number): number;
    normalAt(x: number, z: number): THREE.Vector3;
  };
}

export interface ControllerState {
  moving: boolean;
  grounded: boolean;
  speed: number;
  turnX: number;
  turnY: number;
}

const CONTROL_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const FOLLOW_DISTANCE = 8.4;
// Frame the character below the centre reticle, especially on narrow touch screens.
const FOLLOW_HEIGHT = 2.55;
const INITIAL_PITCH = 0.16;
const MIN_PITCH = 0.08;
const MAX_PITCH = 0.95;

export function createController({ canvas, camera, character, obstacles, terrain, inputScope, spawn = { x: 0, z: 4, yaw: Math.PI }, halfSize }: ControllerOptions) {
  const keys = new Set<string>();
  const followTarget = new THREE.Vector3();
  let velocity: GroundVector = { x: 0, z: 0 };
  let jump: JumpState = { y: 0, verticalVelocity: 0, grounded: true };
  let jumpQueued = false;
  let jumpMultiplier = 1;
  let sensitivity = 1;
  let moveInput = { x: 0, forward: 0 };
  let yaw = 0;
  let pitch = INITIAL_PITCH;
  let cameraDistance = FOLLOW_DISTANCE;
  let desiredCameraDistance = FOLLOW_DISTANCE;
  let pointerArmed = false;
  let mouseLookEnabled = true;
  let requestedTurn = { x: 0, y: 0 };
  let turn = { x: 0, y: 0 };
  let paused = false;
  let disposed = false;
  let lastState: ControllerState = { moving: false, grounded: true, speed: 0, turnX: 0, turnY: 0 };
  const previousTabIndex = canvas.getAttribute('tabindex');
  if (previousTabIndex === null) canvas.tabIndex = 0;
  const groundHeight = (x: number, z: number) => terrain?.sampleHeight(x, z) ?? 0;
  const groundSurface = { sampleHeight: groundHeight, normalAt: (x: number, z: number) => terrain?.normalAt(x, z) ?? { x: 0, y: 1, z: 0 } };

  function clearInput() {
    keys.clear();
    jumpQueued = false;
    pointerArmed = false;
    requestedTurn = { x: 0, y: 0 };
    turn = { x: 0, y: 0 };
    velocity = { x: 0, z: 0 };
    moveInput = { x: 0, forward: 0 };
  }

  function isGameKeyTarget(event: KeyboardEvent) {
    const path = event.composedPath();
    if (inputScope && !path.includes(inputScope) && !path.includes(canvas)) return false;
    const interactive = 'input, textarea, select, button, a, [contenteditable], [role="button"], [role="dialog"]';
    for (const target of path) {
      if (target === canvas) return true;
      if (target instanceof Element && target.matches(interactive)) return false;
      if (target === inputScope) return true;
    }
    return !inputScope;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (paused || disposed || !CONTROL_KEYS.has(event.code) || !isGameKeyTarget(event)) return;
    if (event.repeat && !keys.has(event.code)) return;
    event.preventDefault();
    if (event.code === 'Space' && !event.repeat && !keys.has('Space') && jump.grounded) jumpQueued = true;
    keys.add(event.code);
  }

  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.code);
  }

  function onPointerMove(event: PointerEvent) {
    if (paused || disposed || !mouseLookEnabled || event.pointerType === 'touch' || event.pointerType === 'pen') return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    requestedTurn = edgeTurn(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
    );
    pointerArmed = true;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      pointerArmed = false;
      requestedTurn = { x: 0, y: 0 };
      turn = { x: 0, y: 0 };
    }
    if (!paused) canvas.focus({ preventScroll: true });
  }

  function onPointerLeave(event: PointerEvent) {
    if (mouseLookEnabled && event.pointerType !== 'touch' && event.pointerType !== 'pen') clearInput();
  }

  function onVisibilityChange() {
    if (document.hidden) clearInput();
  }

  function setCameraDistance(value: number) {
    if (Number.isFinite(value)) desiredCameraDistance = THREE.MathUtils.clamp(value, 7, 12);
  }

  function onWheel(event: WheelEvent) {
    if (paused || disposed || event.ctrlKey) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    setCameraDistance(desiredCameraDistance * Math.exp(THREE.MathUtils.clamp(delta, -500, 500) * .001));
  }

  function placeCamera() {
    const horizontalDistance = Math.cos(pitch) * cameraDistance;
    const x = followTarget.x + Math.sin(yaw) * horizontalDistance;
    const z = followTarget.z + Math.cos(yaw) * horizontalDistance;
    // Supply the intended orbit. The camera sweep pulls it in before a mountain;
    // lifting it to the terrain behind the player would suddenly produce a top-down view.
    camera.position.set(x, followTarget.y + Math.sin(pitch) * cameraDistance, z);
    camera.lookAt(followTarget);
  }

  function reset() {
    clearInput();
    const height = groundHeight(spawn.x, spawn.z);
    jump = { y: height, verticalVelocity: 0, grounded: true };
    jumpMultiplier = 1;
    yaw = spawn.yaw - Math.PI;
    pitch = INITIAL_PITCH;
    character.position.set(spawn.x, height, spawn.z);
    character.rotation.y = spawn.yaw;
    followTarget.set(spawn.x, height + FOLLOW_HEIGHT, spawn.z);
    placeCamera();
    lastState = { moving: false, grounded: true, speed: 0, turnX: 0, turnY: 0 };
  }

  function update(rawDt: number): ControllerState {
    const dt = safeDelta(rawDt);
    if (paused || disposed || dt === 0) {
      return { ...lastState, moving: false, speed: 0, turnX: 0, turnY: 0 };
    }
    const desiredTurn = pointerArmed ? requestedTurn : { x: 0, y: 0 };
    // Re-entering the frame must stop that axis immediately, with no residual drift.
    if (desiredTurn.x === 0) turn.x = 0;
    if (desiredTurn.y === 0) turn.y = 0;
    const rotation = advancePlanarVelocity(
      { x: turn.x, z: turn.y },
      { x: desiredTurn.x, z: desiredTurn.y },
      dt,
      12,
    );
    turn = { x: rotation.velocity.x, y: rotation.velocity.z };
    yaw -= rotation.displacement.x * 1.75 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch + rotation.displacement.z * 1.1 * sensitivity, MIN_PITCH, MAX_PITCH);

    const right = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) + moveInput.x;
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) + moveInput.forward;
    const direction = movementDirection(right, forward, yaw);
    const planar = advancePlanarVelocity(velocity, { x: direction.x * WALK_SPEED, z: direction.z * WALK_SPEED }, dt);
    velocity = planar.velocity;
    const movement = advanceCharacterMovement(character.position, jump, planar.displacement, dt, jumpQueued, obstacles, groundSurface, jumpMultiplier, halfSize);
    const next = movement.position;
    const actualX = next.x - character.position.x;
    const actualZ = next.z - character.position.z;
    const speed = Math.hypot(actualX, actualZ) / dt;
    character.position.x = next.x;
    character.position.z = next.z;
    // Movement strafes/backpedals. The aiming layer owns facing, even without firing.

    jump = movement.jump;
    jumpQueued = false;
    character.position.y = jump.y;
    const followSmoothing = 1 - Math.exp(-9 * dt);
    cameraDistance = THREE.MathUtils.damp(cameraDistance, desiredCameraDistance, 8, dt);
    followTarget.x += (character.position.x - followTarget.x) * followSmoothing;
    followTarget.y += (character.position.y + FOLLOW_HEIGHT - followTarget.y) * followSmoothing;
    followTarget.z += (character.position.z - followTarget.z) * followSmoothing;
    placeCamera();

    lastState = { moving: speed > 0.08, grounded: jump.grounded, speed, turnX: turn.x, turnY: turn.y };
    return lastState;
  }

  function setPaused(value: boolean) {
    paused = value;
    clearInput();
  }

  /** Input adapters choose the mode; the controller does not inspect UI/CSS state. */
  function setMouseLookEnabled(value: boolean) {
    mouseLookEnabled = value;
    pointerArmed = false;
    requestedTurn = { x: 0, y: 0 };
    turn = { x: 0, y: 0 };
  }

  /** Joystick axes, each [-1, 1]; positive forward moves away from the camera. */
  function setMoveInput(x: number, forward: number) {
    if (paused || disposed) return;
    moveInput = {
      x: Number.isFinite(x) ? THREE.MathUtils.clamp(x, -1, 1) : 0,
      forward: Number.isFinite(forward) ? THREE.MathUtils.clamp(forward, -1, 1) : 0,
    };
  }

  /** Touch deltas are fractions of canvas width/height, with screen-down positive. */
  function rotateView(dx: number, dy: number) {
    if (paused || disposed || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    pointerArmed = false;
    requestedTurn = { x: 0, y: 0 };
    turn = { x: 0, y: 0 };
    yaw -= dx * Math.PI * 1.4 * sensitivity;
    pitch = THREE.MathUtils.clamp(pitch + dy * Math.PI * sensitivity, MIN_PITCH, MAX_PITCH);
    placeCamera();
  }

  function queueJump() {
    if (!paused && !disposed && jump.grounded) jumpQueued = true;
  }

  function resnapToTerrain() {
    clearInput();
    const height = supportHeight(character.position, Infinity, obstacles, groundHeight);
    jump = { y: height, verticalVelocity: 0, grounded: true };
    character.position.y = height;
    followTarget.set(character.position.x, height + FOLLOW_HEIGHT, character.position.z);
    lastState = { moving: false, grounded: true, speed: 0, turnX: 0, turnY: 0 };
    placeCamera();
  }

  function setJumpMultiplier(value: number) {
    jumpMultiplier = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.5, 2) : 1;
  }

  function setSensitivity(value: number) {
    if (Number.isFinite(value)) sensitivity = THREE.MathUtils.clamp(value, 0.25, 3);
  }

  function dispose() {
    disposed = true;
    clearInput();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clearInput);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('wheel', onWheel);
    if (previousTabIndex === null) canvas.removeAttribute('tabindex');
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', onVisibilityChange);
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  reset();
  return { update, reset, setPaused, setMouseLookEnabled, setMoveInput, rotateView, queueJump, resnapToTerrain, setJumpMultiplier, setSensitivity, setCameraDistance, getCameraDistance: () => desiredCameraDistance, cameraTarget: followTarget, dispose };
}
