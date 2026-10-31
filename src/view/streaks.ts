import * as THREE from 'three';
import { Overlay } from './overlay';

/**
 * Motion streaks: the flight computer's cue for where the ship moves, whatever the nose does and
 * whether or not dust or rock is in sight. A handful of short, faint azure dashes flow over the
 * screen the way the world would stream past a window at one fixed depth: out of the Course
 * marker's point (the focus of expansion) while the ship flies ahead of the camera, across the
 * screen from the side it lies on while the ship slides sideways, and into the Brake marker's
 * point while it flies backwards. Faster and longer the faster the ship goes, faint near the
 * focus (where they barely move) and at the screen's edges. With reduced motion they stand still:
 * fewer, shorter dashes pointing along the flow, redrawn only as the flow turns.
 *
 * One canvas over the picture, cleared only where the last frame drew; the dashes' count follows
 * the picture's quality (see Game.presentRound).
 */

/** The most dashes on screen at once. */
export const STREAKS = 20;
/** The flow's rate (1/s) is RATE_MAX × speed / (speed + RATE_HALF): 0.6/s at 150 m/s, 0.75/s at 250 m/s, about 0.9/s at 400 m/s (speed in units/s). */
const RATE_MAX = 1.2;
const RATE_HALF = 3000;
/** They fade in from SHOW_FROM to SHOW_FULL (units/s, 1 and 10 m/s): at rest the flight has no direction. */
const SHOW_FROM = 20;
const SHOW_FULL = 200;
/** A dash is as long as its point moves in TRAIL seconds, at most LONGEST px; shorter than SHORTEST px it is not drawn (near the focus). */
const TRAIL = 0.1;
const LONGEST = 90;
const SHORTEST = 3;
/** A dash lives LIFE to LIFE + LIFE_SPREAD seconds, fading in over its first FADE_IN and out over its last FADE_OUT seconds, so none pops. */
const LIFE = 0.7;
const FADE_IN = 0.15;
const FADE_OUT = 0.25;
const LIFE_SPREAD = 0.6;
/** Within this many px of the screen's edge a dash fades out. */
const EDGE_FADE = 60;
/** The dashes' strongest opacity, and their line (px). */
const ALPHA = 0.6;
const WIDTH = 1.5;
/** The projection's azure (see --hud in style.css). */
const COLOR = '#4d91ff';
/** With reduced motion: this share of the dashes, this much of their length. */
const STILL_SHARE = 0.6;
const STILL_LENGTH = 0.5;

/** The ship's velocity as the camera sees it (x right, y up, z back), reused. */
const seen = new THREE.Vector3();
const unturn = new THREE.Quaternion();
/** One point's flow, reused. */
const motion = { x: 0, y: 0 };

/**
 * How a point on screen (`x` right and `y` up from the middle, px) streams past when the camera
 * moves along `tx`, `ty`, `tz` (its own axes, a unit direction) at `rate` (1/s), for a lens of
 * `focal` px: the motion in px/s, `y` down the screen. Every point is taken at the same depth.
 */
export function flowAt(x: number, y: number, tx: number, ty: number, tz: number, rate: number, focal: number, out: { x: number; y: number }) {
  out.x = rate * (-focal * tx - x * tz);
  // the screen's y runs down
  out.y = -rate * (-focal * ty - y * tz);
  return out;
}

/** The flow's rate (1/s) at a speed (units/s), see RATE_MAX. */
export const flowRate = (speed: number) => (RATE_MAX * speed) / (speed + RATE_HALF);

/** What the standing dashes were drawn for (reduced motion): the dashes count, the flow's direction in the camera's frame, its fade and its rate. */
export interface StillDrawn {
  count: number;
  direction: THREE.Vector3;
  fade: number;
  rate: number;
}

/** Whether standing dashes drawn for `drawn` must be drawn anew: the flow turned, or its fade or rate (the speed) changed noticeably. */
export function stillStale(drawn: StillDrawn, count: number, direction: THREE.Vector3, fade: number, rate: number): boolean {
  return count !== drawn.count || direction.distanceToSquared(drawn.direction) >= 1e-4 || Math.abs(fade - drawn.fade) >= 0.02 || Math.abs(rate - drawn.rate) >= 0.02 * RATE_MAX;
}

export class Streaks extends Overlay {
  private readonly x = new Float32Array(STREAKS);
  private readonly y = new Float32Array(STREAKS);
  private readonly age = new Float32Array(STREAKS);
  private readonly life = new Float32Array(STREAKS);
  /** The box drawn last (px), cleared before the next picture; empty while left > right. */
  private readonly drawn = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  private last = NaN;
  /** With reduced motion: the flow the standing dashes were drawn for. */
  private readonly stillDrawn: StillDrawn = { count: -1, direction: new THREE.Vector3(), fade: 0, rate: 0 };

  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
    this.resized();
  }

  /** The dashes start over, spread over the new screen and through their lives. */
  protected resized() {
    this.drawn.left = Infinity;
    this.drawn.right = -Infinity;
    this.stillDrawn.count = -1;
    for (let i = 0; i < STREAKS; i++) this.spawn(i, Math.random());
  }

  /**
   * Draws the streaks for the ship moving at `velocity` (units/s) as `camera` sees it at round
   * time `now` (s), `count` of them; `show` false clears them. `still` stands them still (reduced
   * motion).
   */
  update(now: number, camera: THREE.PerspectiveCamera, velocity: THREE.Vector3, show: boolean, count: number, still: boolean) {
    const dt = Number.isFinite(this.last) ? Math.min(Math.max(now - this.last, 0), 0.1) : 0;
    this.last = now;
    const speed = velocity.length();
    const fade = show ? THREE.MathUtils.smoothstep(speed, SHOW_FROM, SHOW_FULL) : 0;
    if (fade <= 0) {
      this.clear();
      this.stillDrawn.count = -1;
      return;
    }
    seen.copy(velocity).divideScalar(speed).applyQuaternion(unturn.copy(camera.quaternion).invert());
    const n = still ? Math.round(count * STILL_SHARE) : count;
    const rate = flowRate(speed);
    // standing dashes are drawn anew only as the flow turns or the speed changes
    if (still && !stillStale(this.stillDrawn, n, seen, fade, rate)) return;
    this.stillDrawn.direction.copy(seen);
    this.stillDrawn.fade = fade;
    this.stillDrawn.rate = rate;
    this.stillDrawn.count = still ? n : -1;
    const { width, height } = this;
    const focal = (camera.projectionMatrix.elements[5] * height) / 2;
    const context = this.context;
    this.clear();
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.strokeStyle = COLOR;
    context.lineWidth = WIDTH;
    context.lineCap = 'round';
    const box = this.drawn;
    for (let i = 0; i < n; i++) {
      flowAt(this.x[i] - width / 2, height / 2 - this.y[i], seen.x, seen.y, seen.z, rate, focal, motion);
      if (!still) {
        this.x[i] += motion.x * dt;
        this.y[i] += motion.y * dt;
        this.age[i] += dt;
      }
      const x = this.x[i];
      const y = this.y[i];
      if (!still && (this.age[i] >= this.life[i] || x < 0 || y < 0 || x > width || y > height)) {
        this.spawn(i, 0);
        continue;
      }
      const pace = Math.hypot(motion.x, motion.y);
      const length = Math.min(pace * TRAIL, LONGEST) * (still ? STILL_LENGTH : 1);
      if (length < SHORTEST) continue;
      const edge = Math.min(1, Math.min(x, y, width - x, height - y) / EDGE_FADE);
      const lifetime = still ? 1 : Math.min(1, this.age[i] / FADE_IN, (this.life[i] - this.age[i]) / FADE_OUT);
      const alpha = ALPHA * fade * edge * lifetime * Math.min(1, (length - SHORTEST) / 10);
      if (alpha < 0.02) continue;
      const tailX = x - (motion.x / pace) * length;
      const tailY = y - (motion.y / pace) * length;
      context.globalAlpha = alpha;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(x, y);
      context.stroke();
      box.left = Math.min(box.left, x, tailX);
      box.top = Math.min(box.top, y, tailY);
      box.right = Math.max(box.right, x, tailX);
      box.bottom = Math.max(box.bottom, y, tailY);
    }
    context.globalAlpha = 1;
  }

  /** A dash anew, somewhere on screen, `age` of the way through its life. */
  private spawn(i: number, age: number) {
    this.x[i] = Math.random() * this.width;
    this.y[i] = Math.random() * this.height;
    this.life[i] = LIFE + Math.random() * LIFE_SPREAD;
    this.age[i] = age * this.life[i];
  }

  /** Clears what the last picture drew, and starts the next box. */
  private clear() {
    const box = this.drawn;
    if (box.left <= box.right) {
      const ratio = this.ratio;
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(Math.floor((box.left - 2) * ratio), Math.floor((box.top - 2) * ratio), Math.ceil((box.right - box.left + 4) * ratio), Math.ceil((box.bottom - box.top + 4) * ratio));
    }
    box.left = Infinity;
    box.top = Infinity;
    box.right = -Infinity;
    box.bottom = -Infinity;
  }
}
