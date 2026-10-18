type Collection = ReturnType<(typeof import('nipplejs'))['create']>;

/**
 * Touch controls for phones and tablets, shown on touch devices and hidden as soon as a key
 * is pressed. Left stick (fixed): turn the ship, drag up = nose up. Right stick (appears
 * under the thumb): maneuvering thrusters. Buttons: main drive and fire (hold), flip, pause.
 * nipplejs is only loaded once the touch UI is used.
 */
export class TouchControls {
  /** Stick positions and held buttons, read by Input every frame. */
  readonly turn = { x: 0, y: 0 };
  readonly push = { x: 0, y: 0 };
  drive = false;
  fire = false;
  back = false;

  private sticks: Collection[] = [];
  private loading: Promise<void> | null = null;

  constructor(onFlip: () => void, onPause: () => void) {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.setActive(coarse);
    window.addEventListener('keydown', (e) => {
      // typing the callsign on a phone's on-screen keyboard is not a switch to a hardware keyboard
      if (!(e.target instanceof HTMLInputElement)) this.setActive(false);
    });
    window.addEventListener('pointerdown', (e) => {
      // Only ever switch towards touch here: some browsers report touches as mouse events.
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setActive(true);
    });

    this.hold('touch-drive', (down) => (this.drive = down));
    this.hold('touch-fire', (down) => (this.fire = down));
    this.hold('touch-back', (down) => (this.back = down));
    this.tap('touch-flip', onFlip);
    this.tap('touch-pause', onPause);

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
        color: '#7fd8ff',
        size: 120,
      });
      turn.on('move', (e) => Object.assign(this.turn, quantize(e.data.vector)));
      turn.on('end', () => Object.assign(this.turn, { x: 0, y: 0 }));
      const push = nipplejs.create({
        zone: document.getElementById('touch-push')!,
        mode: 'dynamic',
        color: '#ffd36b',
        size: 110,
      });
      push.on('move', (e) => Object.assign(this.push, quantize(e.data.vector)));
      push.on('end', () => Object.assign(this.push, { x: 0, y: 0 }));
      this.sticks = [turn, push];
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
    this.drive = this.fire = this.back = false;
  }

  private hold(id: string, set: (down: boolean) => void) {
    const button = document.getElementById(id)!;
    button.addEventListener('pointerdown', (e) => {
      button.classList.add('held');
      set(true);
      try {
        // keeps the button held while the thumb slides off it
        button.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
    });
    const up = () => {
      button.classList.remove('held');
      set(false);
    };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }

  private tap(id: string, action: () => void) {
    document.getElementById(id)!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      action();
    });
  }
}

/** Rounds stick positions to 1/30 steps, so finger jitter does not wobble the ship. */
function quantize(v: { x: number; y: number }) {
  return { x: Math.round(v.x * 30) / 30, y: Math.round(v.y * 30) / 30 };
}
