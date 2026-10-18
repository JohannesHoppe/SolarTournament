/** Steering, throttle and fire state, combined from keyboard and mouse. */
export interface Controls {
  /** -1 = left, 1 = right */
  yaw: number;
  /** -1 = nose down, 1 = nose up */
  pitch: number;
  boost: boolean;
  brake: boolean;
  fire: boolean;
}

export type Action = 'confirm' | 'pause' | 'quit' | 'camera' | 'pointer-released';
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
    const decay = Math.exp(-MOUSE_RECENTER_RATE * dt);
    this.mouseStick.x *= decay;
    this.mouseStick.y *= decay;

    const keyYaw = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    const keyPitch = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);

    return {
      yaw: clamp(keyYaw + this.mouseStick.x),
      pitch: clamp(keyPitch + this.mouseStick.y),
      boost: k('ShiftLeft', 'ShiftRight'),
      brake: k('KeyX'),
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
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
