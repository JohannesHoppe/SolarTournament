type Collection = ReturnType<(typeof import('nipplejs'))['create']>;

/**
 * Touch controls for phones and tablets, shown on touch devices and hidden as soon as a key
 * is pressed. Left stick (fixed): turn the ship, drag up = nose up. Right stick (appears
 * under the thumb): maneuvering thrusters. Buttons: main drive, fire, brake, flip and hook (hold),
 * autopilot, overdrive, torpedo, pause.
 * nipplejs is only loaded once the touch UI is used.
 */
export class TouchControls {
  /** Stick positions and held buttons, read by Input every frame. */
  readonly turn = { x: 0, y: 0 };
  readonly push = { x: 0, y: 0 };
  drive = false;
  fire = false;
  brake = false;
  flip = false;
  hook = false;

  private sticks: Collection[] = [];
  private loading: Promise<void> | null = null;

  /** `onAction` hears the buttons that act at a tap: pause, autopilot, overdrive, torpedo. */
  constructor(onAction: (action: 'pause' | 'autopilot' | 'overdrive' | 'torpedo') => void) {
    // touch controls from the start only where touch is the only way to point (phones,
    // tablets); a laptop with a touch screen or a tablet with a trackpad starts with the
    // mouse and switches on the first touch
    const media = (query: string) => window.matchMedia?.(query).matches ?? false;
    this.setActive(media('(pointer: coarse)') && !media('(any-pointer: fine)'));
    window.addEventListener('keydown', (e) => {
      // typing the callsign on a phone's on-screen keyboard is not a switch to a hardware
      // keyboard, nor are the phone's volume keys or a headset's media keys (no key code, or
      // a key named Audio… or Media…)
      if (e.target instanceof HTMLInputElement || !e.code || /^(Audio|Media)/.test(e.key) || /^(Audio|Media)/.test(e.code)) return;
      this.setActive(false);
    });
    window.addEventListener('pointerdown', (e) => {
      // Only ever switch towards touch here: some browsers report touches as mouse events.
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setActive(true);
    });

    for (const held of ['drive', 'fire', 'brake', 'flip', 'hook'] as const) this.hold(`touch-${held}`, (down) => (this[held] = down));
    for (const action of ['pause', 'autopilot', 'overdrive', 'torpedo'] as const) {
      document.getElementById(`touch-${action}`)!.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onAction(action);
      });
    }

    // A stick can get stuck when the system swallows the touchend (app switch, incoming call):
    // rebuild the sticks in that case.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.destroySticks();
      else if (this.active) void this.createSticks();
    });
    document.addEventListener('touchcancel', () => {
      this.destroySticks();
      if (this.active) void this.createSticks();
    });
  }

  get active() {
    return document.body.classList.contains('touch');
  }

  private setActive(on: boolean) {
    document.body.classList.toggle('touch', on);
    if (on) void this.createSticks();
    else this.release();
  }

  private createSticks(): Promise<void> {
    if (this.sticks.length) return Promise.resolve();
    this.loading ??= import('nipplejs').then(({ default: nipplejs }) => {
      this.loading = null;
      const turn = nipplejs.create({
        zone: document.getElementById('touch-turn')!,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#ff9d00',
        size: 120,
      });
      turn.on('move', (e) => Object.assign(this.turn, quantize(e.data.vector)));
      turn.on('end', () => Object.assign(this.turn, { x: 0, y: 0 }));
      const push = nipplejs.create({
        zone: document.getElementById('touch-push')!,
        mode: 'dynamic',
        color: '#3fd0ff',
        size: 110,
      });
      push.on('move', (e) => Object.assign(this.push, quantize(e.data.vector)));
      push.on('end', () => Object.assign(this.push, { x: 0, y: 0 }));
      this.sticks = [turn, push];
    });
    // a chunk that failed to load (a dropped connection) is asked for again next time
    this.loading = this.loading.catch((error) => {
      this.loading = null;
      console.warn('Touch sticks unavailable', error);
    });
    return this.loading;
  }

  private destroySticks() {
    for (const stick of this.sticks) {
      try {
        stick.destroy();
      } catch {
        // already gone
      }
    }
    this.sticks = [];
    this.release();
  }

  /** Lets go of everything, e.g. when the touch UI hides. */
  private release() {
    Object.assign(this.turn, { x: 0, y: 0 });
    Object.assign(this.push, { x: 0, y: 0 });
    this.drive = this.fire = this.brake = this.flip = this.hook = false;
    for (const button of document.querySelectorAll('.touch-button.held')) button.classList.remove('held');
    // a finger whose lifting the system swallowed (a call, a switch of apps) holds nothing any more
    for (const fingers of this.fingers) fingers.clear();
  }

  /** The fingers on each hold button (see hold). */
  private readonly fingers: Set<number>[] = [];

  /** A button held while any finger is on it: a second finger lifting does not let go of it. */
  private hold(id: string, set: (down: boolean) => void) {
    const button = document.getElementById(id)!;
    const fingers = new Set<number>();
    this.fingers.push(fingers);
    button.addEventListener('pointerdown', (e) => {
      fingers.add(e.pointerId);
      button.classList.add('held');
      set(true);
      try {
        // keeps the button held while the thumb slides off it
        button.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
    });
    const up = (e: PointerEvent) => {
      fingers.delete(e.pointerId);
      if (fingers.size) return;
      button.classList.remove('held');
      set(false);
    };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }
}

/** Rounds stick positions to 1/30 steps, so finger jitter does not wobble the ship. */
function quantize(v: { x: number; y: number }) {
  return { x: Math.round(v.x * 30) / 30, y: Math.round(v.y * 30) / 30 };
}
