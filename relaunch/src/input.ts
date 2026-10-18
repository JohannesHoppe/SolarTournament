/** Rotation, thrust and fire state, combined from keyboard and mouse. */
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

export type Action = 'confirm' | 'pause' | 'quit' | 'camera' | 'flip' | 'pointer-released';
type ActionHandler = (action: Action) => void;

/** How strongly mouse movement deflects the virtual stick, per pixel. */
const MOUSE_SENSITIVITY = 0.0035;
/** The virtual stick returns to center with this rate (1/s), so the ship stops turning. */
const MOUSE_RECENTER_RATE = 2.2;

export class Input {
  private readonly keys = new Set<string>();
  private readonly mouseStick = { x: 0, y: 0 };
  private mouseFire = false;
  private handler: ActionHandler = () => {};

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
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
    this.canvas.requestPointerLock?.();
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

    return {
      yaw: clamp(axis(['ArrowRight'], ['ArrowLeft']) + this.mouseStick.x),
      pitch: clamp(axis(['ArrowUp'], ['ArrowDown']) + this.mouseStick.y),
      roll: axis(['KeyE'], ['KeyQ']),
      thrust: k('KeyW', 'ShiftLeft', 'ShiftRight') ? 1 : 0,
      strafeX: axis(['KeyD'], ['KeyA']),
      strafeY: axis(['KeyR'], ['KeyF']),
      strafeZ: -(k('KeyS') ? 1 : 0),
      fire: k('Space') || this.mouseFire,
    };
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
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
