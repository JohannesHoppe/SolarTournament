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

export type Action = 'confirm' | 'back' | 'pause' | 'quit' | 'camera' | 'flip' | 'radio';
type ActionHandler = (action: Action) => void;

/** The pointer at this share of the shorter screen side away from the center turns at full rate. */
const MOUSE_FULL_DEFLECTION = 0.4;
/** Around the center the pointer does not turn the ship (share of full deflection), so it can fly straight. */
const MOUSE_DEADZONE = 0.06;
/** Shift (fine aim) scales turning down to this share, for precise aiming. */
const FINE_AIM = 0.3;
/** Stick deflections below this are treated as zero, so worn sticks do not drift. */
const STICK_DEADZONE = 0.15;

/** Buttons of the standard gamepad layout (Xbox naming). */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9 } as const;
const PAD_ACTIONS: [number, Action][] = [
  [PAD.a, 'confirm'],
  [PAD.menu, 'pause'],
  // B brakes in flight; in the menus it goes back, it never quits
  [PAD.b, 'back'],
  [PAD.view, 'camera'],
  [PAD.y, 'flip'],
];

/**
 * Mouse flight: the pointer stays visible and the ship turns towards it. Its offset from the
 * screen center is the stick deflection; a click fires. Nothing captures the mouse, so it can
 * always leave the game, and Escape only pauses.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly mouseStick = { x: 0, y: 0 };
  private mouseFire = false;
  private steering = false;
  private handler: ActionHandler = () => {};
  private readonly padPressed = new Set<number>();
  private readonly touch = new TouchControls(() => this.handler('flip'), () => this.handler('pause'));

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.resetMouse();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.steering || this.touch.active) return;
      this.mouseFire = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    document.addEventListener('mousemove', (e) => {
      // phones emulate mouse events for taps; they steer with the on-screen sticks
      if (!this.steering || this.touch.active) return;
      const full = Math.min(window.innerWidth, window.innerHeight) * MOUSE_FULL_DEFLECTION;
      this.mouseStick.x = mouseAxis((e.clientX - window.innerWidth / 2) / full);
      this.mouseStick.y = mouseAxis((window.innerHeight / 2 - e.clientY) / full);
    });
    // a pointer outside the window does not keep the ship spinning
    document.documentElement.addEventListener('mouseleave', () => this.resetMouse());
  }

  onAction(handler: ActionHandler) {
    this.handler = handler;
  }

  /** The mouse steers while a clone is flying; in menus it is just a pointer. */
  steerWithMouse(on: boolean) {
    this.steering = on;
    this.canvas.classList.toggle('steering', on);
    this.resetMouse();
  }

  get touchActive() {
    return this.touch.active;
  }

  resetMouse() {
    this.mouseStick.x = this.mouseStick.y = 0;
    this.mouseFire = false;
  }

  /** The brake is held: S, B on the gamepad, or BRAKE on touch. The flight computer flips and burns. */
  get braking(): boolean {
    return this.keys.has('KeyS') || this.touch.brake || (this.gamepad()?.buttons[PAD.b]?.pressed ?? false);
  }

  /** Reads the current controls. */
  read(): Controls {
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const axis = (plus: string[], minus: string[]) => (k(...plus) ? 1 : 0) - (k(...minus) ? 1 : 0);

    // Gamepad: left stick turns (pull back = nose up, as in aircraft), right stick pushes
    // sideways and up/down, right trigger is the main drive, left trigger or A fires.
    const pad = this.gamepad();
    const stick = (i: number) => deadzone(pad?.axes[i] ?? 0);
    const button = (i: number) => pad?.buttons[i]?.value ?? 0;

    const touch = this.touch;
    const aim = k('ShiftLeft', 'ShiftRight') ? FINE_AIM : 1;

    return {
      yaw: clamp(axis(['ArrowRight'], ['ArrowLeft']) + this.mouseStick.x + stick(0) + touch.turn.x) * aim,
      pitch: clamp(axis(['ArrowUp'], ['ArrowDown']) + this.mouseStick.y + stick(1) + touch.turn.y) * aim,
      roll: clamp(axis(['KeyE'], ['KeyQ']) + button(PAD.rb) - button(PAD.lb)),
      thrust: Math.max(k('KeyW') || touch.drive ? 1 : 0, button(PAD.rt)),
      strafeX: clamp(axis(['KeyD'], ['KeyA']) + stick(2) + touch.push.x),
      strafeY: clamp(axis(['KeyR'], ['KeyF']) - stick(3) + touch.push.y),
      strafeZ: -button(PAD.x),
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
    // releasing a key always counts, wherever the focus is, so no key stays held
    if (!down) this.keys.delete(e.code);
    if (e.target instanceof HTMLInputElement) {
      if (down && e.code === 'Enter' && !e.repeat) this.handler('confirm');
      return;
    }
    if (down) this.keys.add(e.code);
    // keys the game uses never also press the button that happens to have the focus
    if (e.code === 'Enter' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();

    if (!down || e.repeat) return;
    if (e.code === 'Enter') this.handler('confirm');
    if (e.code === 'Escape' || e.code === 'KeyP') this.handler('pause');
    if (e.code === 'KeyQ') this.handler('quit');
    if (e.code === 'KeyC') this.handler('camera');
    if (e.code === 'KeyX') this.handler('flip');
    if (e.code === 'KeyM') this.handler('radio');
  }
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Letters of the keyboard layout in use, by physical key; empty where the browser does not tell. */
const layout = new Map<string, string>();

/**
 * Learns the keyboard layout (Chromium browsers only). The game binds physical keys, as on a
 * US keyboard; on AZERTY the key in W's place reads Z, and the labels say so.
 */
export async function learnKeyboardLayout(): Promise<void> {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
  try {
    const map = await keyboard?.getLayoutMap();
    map?.forEach((key, code) => layout.set(code, key.toUpperCase()));
  } catch {
    // not allowed here (e.g. in a frame): the US labels stay
  }
}

/** Every single letter in a label as the player's keyboard prints it ("A / D" → "Q / D" on AZERTY). */
export function keyLabel(label: string): string {
  return label.replace(/\b[A-Z]\b/g, (letter) => layout.get('Key' + letter) ?? letter);
}

/** Pointer offset (1 = full deflection) to stick deflection: dead zone in the center, clamped at the edge. */
function mouseAxis(offset: number) {
  const magnitude = Math.abs(offset);
  return magnitude < MOUSE_DEADZONE ? 0 : clamp((Math.sign(offset) * (magnitude - MOUSE_DEADZONE)) / (1 - MOUSE_DEADZONE));
}

/** Removes the dead zone and rescales the rest of the stick travel to 0..1. */
function deadzone(v: number) {
  const magnitude = Math.abs(v);
  return magnitude < STICK_DEADZONE ? 0 : (Math.sign(v) * (magnitude - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}
