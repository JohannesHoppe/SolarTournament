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

export type Action = 'confirm' | 'back' | 'pause' | 'quit' | 'camera' | 'radio' | 'help' | 'autopilot' | 'overdrive' | 'torpedo' | 'watch';
type ActionHandler = (action: Action) => void;

/** The pointer at this share of the shorter screen side away from the center turns at full rate. */
const MOUSE_FULL_DEFLECTION = 0.25;
/** Around the center the pointer does not turn the ship (share of full deflection), so it can fly straight. */
const MOUSE_DEADZONE = 0.08;
/** Shift (fine aim) scales turning down to this share, for precise aiming. */
const FINE_AIM = 0.3;
/** Stick deflections below this are treated as zero, so worn sticks do not drift. */
const STICK_DEADZONE = 0.15;
/** Two taps of a thruster key (or two flicks of the thruster stick) the same way within this time (ms) dodge. */
const DODGE_TAP_MS = 300;
/** The thruster keys: which axis each pushes, and which way. */
const THRUSTER_KEYS: Record<string, { axis: 'x' | 'y'; sign: number } | undefined> = {
  KeyD: { axis: 'x', sign: 1 },
  KeyA: { axis: 'x', sign: -1 },
  KeyR: { axis: 'y', sign: 1 },
  KeyF: { axis: 'y', sign: -1 },
};

/** Buttons of the standard gamepad layout (Xbox naming). */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, view: 8, menu: 9, leftStick: 10, rightStick: 11, up: 12 } as const;
const PAD_ACTIONS: [number, Action][] = [
  [PAD.a, 'confirm'],
  [PAD.menu, 'pause'],
  // B brakes in flight; in the menus it goes back, it never quits
  [PAD.b, 'back'],
  [PAD.view, 'camera'],
  [PAD.rightStick, 'autopilot'],
  [PAD.rb, 'overdrive'],
  [PAD.up, 'torpedo'],
];

/**
 * Mouse flight: the pointer stays visible and the ship turns towards it. Its offset from the
 * screen center is the stick deflection; a click fires. Nothing captures the mouse, so it can
 * always leave the game, and Escape only pauses.
 */
export class Input {
  private readonly keys = new Set<string>();
  /** The controls read() hands out, the same object every frame. */
  private readonly controls: Controls = { ...IDLE };
  private readonly mouseStick = { x: 0, y: 0 };
  private mouseFire = false;
  private steering = false;
  private handler: ActionHandler = () => {};
  private readonly padPressed = new Set<number>();
  /** A held since a screen changed (see holdFire). */
  private fireHeld = false;
  /** The thruster axes as last read, and the last time each was pushed fully one way (see dodge detection in read). */
  private readonly lastPush = { x: 0, y: 0 };
  private lastTap = { axis: '', sign: 0, at: -Infinity };
  /** A dodge asked for and not yet taken: sideways and up, each -1, 0 or 1. */
  private dodge: { x: number; y: number } | null = null;
  private readonly touch = new TouchControls(
    () => this.handler('pause'),
    () => this.handler('autopilot'),
    () => this.handler('overdrive'),
    () => this.handler('torpedo'),
  );

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
    // in flight a right click opens no menu, which would swallow the release of held keys
    canvas.addEventListener('contextmenu', (e) => {
      if (this.steering) e.preventDefault();
    });
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

  /** A gamepad is connected: mouse hints do not apply. */
  get gamepadActive() {
    return this.gamepad() !== null;
  }

  resetMouse() {
    this.mouseStick.x = this.mouseStick.y = 0;
    this.mouseFire = false;
  }

  /** The flip is held: X, Y on the gamepad, or FLIP on touch. The flight computer turns the ship against the flight. */
  get flipping(): boolean {
    return this.keys.has('KeyX') || this.touch.flip || (this.gamepad()?.buttons[PAD.y]?.pressed ?? false);
  }

  /** The brake is held: S, B on the gamepad, or BRAKE on touch. The flight computer flips and burns. */
  get braking(): boolean {
    return this.keys.has('KeyS') || this.touch.brake || (this.gamepad()?.buttons[PAD.b]?.pressed ?? false);
  }

  /** Reads the current controls. */
  read(): Controls {
    const keys = this.keys;
    const key = (code: string) => keys.has(code);
    const axis = (plus: string, minus: string) => (keys.has(plus) ? 1 : 0) - (keys.has(minus) ? 1 : 0);

    // Gamepad: left stick turns (pull back = nose up, as in aircraft), right stick pushes
    // sideways and up/down, right trigger is the main drive, left trigger or A fires.
    const pad = this.gamepad();
    const stick = (i: number) => deadzone(pad?.axes[i] ?? 0);
    const button = (i: number) => pad?.buttons[i]?.value ?? 0;

    const touch = this.touch;
    // fine aim: Shift, or pressing the left stick in
    const aim = key('ShiftLeft') || key('ShiftRight') || button(PAD.leftStick) > 0.5 ? FINE_AIM : 1;

    // the same object every frame: reading the controls allocates nothing
    const out = this.controls;
    out.yaw = clamp(axis('ArrowRight', 'ArrowLeft') + this.mouseStick.x + stick(0) + touch.turn.x) * aim;
    out.pitch = clamp(axis('ArrowUp', 'ArrowDown') + this.mouseStick.y + stick(1) + touch.turn.y) * aim;
    // the pilot does not roll: the flight computer keeps the ship upright (see Game.flightComputer)
    out.roll = 0;
    out.thrust = Math.max(key('KeyW') || touch.drive ? 1 : 0, button(PAD.rt));
    out.strafeX = clamp(axis('KeyD', 'KeyA') + stick(2) + touch.push.x);
    out.strafeY = clamp(axis('KeyR', 'KeyF') - stick(3) + touch.push.y);
    out.strafeZ = -button(PAD.x);
    out.fire = key('Space') || this.mouseFire || touch.fire || button(PAD.lt) > 0.5 || (button(PAD.a) > 0.5 && !this.fireHeld);
    // keys are told apart by their events (see onKey), the sticks by their travel from frame to frame
    this.detectDodge('x', stick(2) + touch.push.x);
    this.detectDodge('y', -stick(3) + touch.push.y);
    return out;
  }

  /** The dodge asked for since the last call, if any: sideways (x) and up (y), each -1, 0 or 1. */
  takeDodge(): { x: number; y: number } | null {
    const dodge = this.dodge;
    this.dodge = null;
    return dodge;
  }

  /** A thruster stick pushed fully one way twice in quick succession asks for a dodge that way. */
  private detectDodge(axis: 'x' | 'y', value: number) {
    const before = this.lastPush[axis];
    this.lastPush[axis] = value;
    if (Math.abs(value) < 0.9 || Math.abs(before) >= 0.5) return;
    this.tapped(axis, Math.sign(value));
  }

  /** A thruster key or stick went fully one way: the second time within DODGE_TAP_MS asks for a dodge. */
  private tapped(axis: 'x' | 'y', sign: number) {
    const now = performance.now();
    const tap = this.lastTap;
    if (tap.axis === axis && tap.sign === sign && now - tap.at < DODGE_TAP_MS) {
      this.dodge = { x: axis === 'x' ? sign : 0, y: axis === 'y' ? sign : 0 };
      this.lastTap = { axis: '', sign: 0, at: -Infinity };
      return;
    }
    this.lastTap = { axis, sign, at: now };
  }

  /**
   * A screen changed: the A button that confirmed it does not also fire the laser, until it
   * is let go. A is both confirm and a fire button.
   */
  holdFire() {
    this.fireHeld = true;
  }

  /** Polls gamepad buttons once per frame and turns new presses into actions. */
  poll() {
    const pad = this.gamepad();
    if (!pad || !((pad.buttons[PAD.a]?.value ?? 0) > 0.5)) this.fireHeld = false;
    if (!pad) return;
    // LB dodges the way the thruster stick points, sideways to the right when it rests
    const lb = (pad.buttons[PAD.lb]?.value ?? 0) > 0.5;
    if (lb && !this.padPressed.has(PAD.lb)) {
      const x = Math.sign(deadzone(pad.axes[2] ?? 0));
      const y = -Math.sign(deadzone(pad.axes[3] ?? 0));
      this.dodge = x || y ? { x, y } : { x: 1, y: 0 };
    }
    if (lb) this.padPressed.add(PAD.lb);
    else this.padPressed.delete(PAD.lb);
    for (const [index, action] of PAD_ACTIONS) {
      const down = (pad.buttons[index]?.value ?? 0) > 0.5;
      if (down && !this.padPressed.has(index)) this.handler(action);
      if (down) this.padPressed.add(index);
      else this.padPressed.delete(index);
    }
  }

  /** The first connected gamepad with the standard layout, if any. */
  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad?.connected && pad.mapping === 'standard') return pad;
    }
    return null;
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    // releasing a key always counts, wherever the focus is, so no key stays held
    if (!down) this.keys.delete(e.code);
    // the Enter that commits an input method's composition only ends the composition
    if (e.isComposing || e.keyCode === 229) return;
    // a slider (the radio's volume) takes no typing: the game's keys still fly the ship
    if (e.target instanceof HTMLInputElement && e.target.type !== 'range') {
      // in a text field only Enter, Escape and F1 belong to the game; the rest is typing
      if (e.code === 'F1') e.preventDefault();
      if (!down || e.repeat) return;
      if (e.code === 'Enter') this.handler('confirm');
      if (e.code === 'Escape') this.handler('back');
      if (e.code === 'F1') this.handler('help');
      return;
    }
    // a button or link the Host reached with Tab is pressed by Enter (a button by Space too) as
    // usual, and a slider reached so is moved by the arrows
    const reached = !this.steering && e.target instanceof HTMLElement && e.target.matches(':focus-visible');
    if (reached && e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
    if (reached && e.target instanceof HTMLAnchorElement && e.code === 'Enter') return;
    if (reached && e.target instanceof HTMLInputElement && e.code.startsWith('Arrow')) return;
    if (down) this.keys.add(e.code);
    // keys the game uses never also press the button that happens to have the focus
    if (e.code === 'Enter' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    // Tab switches the watched pilot while spectating, not the focus
    if (e.code === 'Tab' && this.steering) e.preventDefault();
    // F1 opens the controls, not the browser's help
    if (e.code === 'F1') e.preventDefault();

    if (!down || e.repeat) return;
    const thruster = THRUSTER_KEYS[e.code];
    if (thruster) this.tapped(thruster.axis, thruster.sign);
    if (e.code === 'Enter') this.handler('confirm');
    if (e.code === 'Escape' || e.code === 'KeyP') this.handler('pause');
    if (e.code === 'KeyQ') this.handler('quit');
    if (e.code === 'KeyC') this.handler('camera');
    if (e.code === 'KeyM') this.handler('radio');
    if (e.code === 'F1') this.handler('help');
    if (e.code === 'KeyT') this.handler('autopilot');
    if (e.code === 'KeyE') this.handler('overdrive');
    if (e.code === 'KeyG') this.handler('torpedo');
    if (e.code === 'Tab') this.handler('watch');
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
