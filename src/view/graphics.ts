import type * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import type { Belt } from '../world/belt';
import type { Landmarks } from '../world/landmarks';
import type { Space } from '../world/space';
import type { Bloom } from './bloom';
import { setParticleShare } from './effects';
import type { Lensing } from './lensing';
import { COMPILING, deviceHints, guessStartRung, guessTier, Governor, LADDER, loadQuality, saveQuality, tierOf, TIER_RUNGS, TOUCH_DOWN_SECONDS, TOUCH_UP_SECONDS, type Look, type Quality, type Tier } from './quality';
import type { ReferencePlane } from './plane';
import type { Showcase } from './showcase';
import { setLacquer } from './surfaces';

/**
 * The picture's quality as the game draws it: the rung of the ladder (see view/quality) the
 * Host pinned in the menu or the governor found, applied to the renderer, the bloom, the sun's
 * shadows, the hulls' lacquer, the particles, the title screen's pad, the reference plane's
 * grid, the gas giant landmark's segments and the black hole's lens. A knob that compiles
 * shaders anew (COMPILING) waits for a moment where a hitch goes unseen: the menu, the results,
 * a dead clone; the others change at once.
 */
export class Graphics {
  quality: Quality;
  /** The tier the device's hints suggest (see guessTier). */
  readonly guessed: Tier;
  readonly renderer: string;
  /** A touch screen is the main input (see device Hints): the governor steps down faster and climbs back up more cautiously (see watch). */
  private readonly touch: boolean;
  /** The rung the device's hints suggest it starts on (see guessStartRung): a touch device starts lower than its tier's own rung. */
  private readonly guessedRung: number;
  rung: number;
  /** What is drawn now; the compiling knobs of the rung may still wait (see settle). */
  look: Look;
  /** Knobs the benchmark sets over the rung's (see bench.ts). */
  override: Partial<Look> = {};
  /** The governor holds still (while the benchmark measures). */
  hold = false;
  /** Compiling knobs of the rung wait for a safe moment. */
  private waiting = false;
  private governor: Governor | null = null;
  private showcase: Showcase | null = null;
  /** The frame rate (frames/s) and the frame's own work (ms) as last measured, for the overlays. */
  fps = 0;
  busy = 0;
  private frames = 0;
  private seconds = 0;
  private work = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly bloom: Bloom,
    private readonly space: Space,
    private readonly field: AsteroidField,
    private readonly belt: Belt,
    private readonly plane: ReferencePlane,
    private readonly landmarks: Landmarks,
    private readonly lensing: Lensing,
    /** Called when the picture's resolution changes: the game sizes its buffers anew. */
    private readonly resize: () => void,
  ) {
    const hints = deviceHints(renderer.getContext());
    this.renderer = hints.renderer;
    this.guessed = guessTier(hints);
    this.touch = hints.touch;
    this.guessedRung = guessStartRung(hints);
    this.quality = loadQuality();
    this.rung = this.startRung();
    this.look = LADDER[this.rung];
    this.watch();
    this.apply(true, true);
  }

  /** The device pixels per CSS pixel the picture is drawn with. */
  get pixelRatio() {
    return Math.min(window.devicePixelRatio, this.look.pixelRatio);
  }

  /** The tier the menu shows: the one chosen, or the one the governor is on. */
  get tier(): Tier {
    return this.quality.choice === 'auto' ? tierOf(this.rung) : this.quality.choice;
  }

  /** The title screen's pad, once the menu built it. */
  setShowcase(showcase: Showcase) {
    this.showcase = showcase;
    showcase.setLook(this.look.showcase);
  }

  /** The Host's choice in the menu: a tier pins its rung and stops the governor, auto starts it where it last found the device smooth. */
  choose(choice: Quality['choice']) {
    this.quality = { ...this.quality, choice };
    saveQuality(this.quality);
    this.rung = this.startRung();
    this.watch();
    this.apply(true, true);
  }

  /**
   * One frame: `dt` seconds since the last, `busy` seconds of the frame's own work. `safe`
   * says whether a hitch would go unseen now (see Graphics).
   */
  frame(dt: number, busy: number, safe: boolean) {
    this.measure(dt, busy);
    const rung = this.hold ? null : (this.governor?.sample(dt, busy) ?? null);
    if (rung !== null) this.rung = rung;
    if (rung !== null || (safe && this.waiting)) this.apply(safe);
  }

  /** Starts the governor's watch anew: after a pause, a hidden tab, a change of screen. */
  pause() {
    this.governor?.reset();
  }

  /** Applies the rung (and the benchmark's knobs over it); the compiling knobs only when `safe`. */
  apply(safe: boolean, force = false) {
    const wanted = { ...LADDER[this.rung], ...this.override };
    const next = { ...wanted };
    if (!safe) for (const knob of COMPILING) Object.assign(next, { [knob]: compiles(knob, this.look, wanted) ? this.look[knob] : wanted[knob] });
    const before = this.look;
    this.waiting = JSON.stringify(next) !== JSON.stringify(wanted);
    if (!force && JSON.stringify(next) === JSON.stringify(before)) return;
    this.look = next;
    this.bloom.setScale(next.bloom);
    this.space.setLook(next.shadows, next.particles);
    this.field.setDetail(next.rocks);
    this.belt.setShare(next.belt);
    setLacquer(next.lacquer);
    setParticleShare(next.particles);
    this.showcase?.setLook(next.showcase);
    this.plane.setDetail(next.spokes);
    this.landmarks.setDetail(next.landmark);
    this.lensing.setSamples(next.lens);
    if (next.pixelRatio !== before.pixelRatio) this.resize();
  }

  private startRung(): number {
    const { choice, rung } = this.quality;
    return choice === 'auto' ? (rung ?? this.guessedRung) : TIER_RUNGS[choice];
  }

  private watch() {
    if (this.quality.choice !== 'auto') {
      this.governor = null;
      return;
    }
    const tuning = this.touch ? { downSeconds: TOUCH_DOWN_SECONDS, upSeconds: TOUCH_UP_SECONDS } : undefined;
    this.governor = new Governor(this.rung, undefined, tuning);
    // the rung that held is where this device starts next time
    this.governor.stable = (rung) => {
      if (this.quality.choice !== 'auto' || this.quality.rung === rung) return;
      this.quality = { choice: 'auto', rung };
      saveQuality(this.quality);
    };
  }

  /** The frame rate and the work per frame, every half second, for the overlays. */
  private measure(dt: number, busy: number) {
    this.frames++;
    this.seconds += dt;
    this.work += busy;
    if (this.seconds < 0.5) return;
    this.fps = this.frames / this.seconds;
    this.busy = (this.work / this.frames) * 1000;
    this.frames = this.seconds = this.work = 0;
  }
}

/** Whether changing `knob` from `look` to `wanted` compiles shaders: shadows on or off (not their size), lacquer on or off. */
function compiles(knob: keyof Look, look: Look, wanted: Look): boolean {
  if (knob === 'shadows') return look.shadows > 0 !== wanted.shadows > 0;
  return look[knob] !== wanted[knob];
}
