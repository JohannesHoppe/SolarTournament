import { TouchControls } from './touch';

/** Rotation, thrust and fire state, combined from keyboard, mouse, gamepad and touch. */
export interface Controls {
  /** -1 = left, 1 = right */
  yaw: number;
  /** -1 = nose down, 1 = nose up */
  pitch: number;
  /** -1 = roll left, 1 = roll right */
  roll: number;
  /** Main drive 0..1 */
  thrust: number;
  /** Maneuvering thruster translation in ship space, each -1..1: right, up, forward. */
  strafeX: number;
  strafeY: number;
  strafeZ: number;
  fire: boolean;
}

export const IDLE: Readonly<Controls> = { yaw: 0, pitch: 0, roll: 0, thrust: 0, strafeX: 0, strafeY: 0, strafeZ: 0, fire: false };

export type Action = 'confirm' | 'pause' | 'quit' | 'camera' | 'flip' | 'radio' | 'pointer-released';
type ActionHandler = (action: Action) => void;

/** How strongly mouse movement deflects the virtual stick, per pixel. */
const MOUSE_SENSITIVITY = 0.0035;
/** The virtual stick returns to center with this rate (1/s), so the ship stops turning. */
const MOUSE_RECENTER_RATE = 2.2;
/** Stick deflections below this are treated as zero, so worn sticks do not drift. */
const STICK_DEADZONE = 0.15;

/** Buttons of the standard gamepad layout (Xbox naming). */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9 } as const;
const PAD_ACTIONS: [number, Action][] = [
  [PAD.a, 'confirm'],
  [PAD.menu, 'pause'],
  [PAD.b, 'quit'],
  [PAD.view, 'camera'],
  [PAD.y, 'flip'],
];

export class Input {
  private readonly keys = new Set<string>();
  private readonly mouseStick = { x: 0, y: 0 };
  private mouseFire = false;
  private handler: ActionHandler = () => {};
  private readonly padPressed = new Set<number>();
  private readonly touch = new TouchControls(() => this.handler('flip'), () => this.handler('pause'));

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.touch.active) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return;
      }
      this.mouseFire = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.mouseStick.x += e.movementX * MOUSE_SENSITIVITY;
      this.mouseStick.y -= e.movementY * MOUSE_SENSITIVITY;
      const length = Math.hypot(this.mouseStick.x, this.mouseStick.y);
      if (length > 1) {
        this.mouseStick.x /= length;
        this.mouseStick.y /= length;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas) return;
      this.resetMouse();
      // Browsers swallow the Escape key that releases the pointer, so this doubles as "pause".
      this.handler('pointer-released');
    });
  }

  onAction(handler: ActionHandler) {
    this.handler = handler;
  }

  lockPointer() {
    // touch devices steer with the on-screen sticks; mobile browsers reject pointer lock
    if (!this.touch.active) this.canvas.requestPointerLock?.();
  }

  get touchActive() {
    return this.touch.active;
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resetMouse() {
    this.mouseStick.x = this.mouseStick.y = 0;
    this.mouseFire = false;
  }

  /** Reads the current controls; advances the mouse stick recentering by dt seconds. */
  read(dt: number): Controls {
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const axis = (plus: string[], minus: string[]) => (k(...plus) ? 1 : 0) - (k(...minus) ? 1 : 0);
    const decay = Math.exp(-MOUSE_RECENTER_RATE * dt);
    this.mouseStick.x *= decay;
    this.mouseStick.y *= decay;

    // Gamepad: left stick turns (pull back = nose up, as in aircraft), right stick pushes
    // sideways and up/down, right trigger is the main drive, left trigger or A fires.
    const pad = this.gamepad();
    const stick = (i: number) => deadzone(pad?.axes[i] ?? 0);
    const button = (i: number) => pad?.buttons[i]?.value ?? 0;

    const touch = this.touch;

    return {
      yaw: clamp(axis(['ArrowRight'], ['ArrowLeft']) + this.mouseStick.x + stick(0) + touch.turn.x),
      pitch: clamp(axis(['ArrowUp'], ['ArrowDown']) + this.mouseStick.y + stick(1) + touch.turn.y),
      roll: clamp(axis(['KeyE'], ['KeyQ']) + button(PAD.rb) - button(PAD.lb)),
      thrust: Math.max(k('KeyW', 'ShiftLeft', 'ShiftRight') || touch.drive ? 1 : 0, button(PAD.rt)),
      strafeX: clamp(axis(['KeyD'], ['KeyA']) + stick(2) + touch.push.x),
      strafeY: clamp(axis(['KeyR'], ['KeyF']) - stick(3) + touch.push.y),
      strafeZ: -Math.max(k('KeyS') || touch.back ? 1 : 0, button(PAD.x)),
      fire: k('Space') || this.mouseFire || touch.fire || button(PAD.lt) > 0.5 || button(PAD.a) > 0.5,
    };
  }

  /** Polls gamepad buttons once per frame and turns new presses into actions. */
  poll() {
    const pad = this.gamepad();
    if (!pad) return;
    for (const [index, action] of PAD_ACTIONS) {
      const down = (pad.buttons[index]?.value ?? 0) > 0.5;
      if (down && !this.padPressed.has(index)) this.handler(action);
      if (down) this.padPressed.add(index);
      else this.padPressed.delete(index);
    }
  }

  /** The first connected gamepad with the standard layout, if any. */
  private gamepad(): Gamepad | null {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (pad?.connected && pad.mapping === 'standard') return pad;
    }
    return null;
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (e.target instanceof HTMLInputElement) {
      if (down && e.code === 'Enter') this.handler('confirm');
      return;
    }
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);

    if (!down || e.repeat) return;
    if (e.code === 'Enter') this.handler('confirm');
    if (e.code === 'Escape' || e.code === 'KeyP') this.handler('pause');
    if (e.code === 'KeyQ') this.handler('quit');
    if (e.code === 'KeyC') this.handler('camera');
    if (e.code === 'KeyX') this.handler('flip');
    if (e.code === 'KeyM') this.handler('radio');
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Removes the dead zone and rescales the rest of the stick travel to 0..1. */
function deadzone(v: number) {
  const magnitude = Math.abs(v);
  return magnitude < STICK_DEADZONE ? 0 : (Math.sign(v) * (magnitude - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}
