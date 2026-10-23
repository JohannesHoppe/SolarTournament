import { msg } from '../i18n/i18n';
import { storageGet, storageSet } from '../storage';

/**
 * The picture's quality: one ladder of looks, from the picture as designed down to the cheapest
 * one, rung by rung. Every rung sets only looks: the shared world (rocks, colliders, the round,
 * what goes over the network) is the same on every rung, so a phone on the last rung plays the
 * same game as a desktop on the first.
 */
export interface Look {
  /** The most device pixels per CSS pixel the picture is drawn with (the screen's own ratio caps it). */
  pixelRatio: number;
  /** The bloom's resolution as a share of the picture's: 1 full, 0.5 half (a quarter of the pixels), 0 off. */
  bloom: number;
  /** Edge of the sun's shadow map (px); 0 casts no shadows at all. */
  shadows: number;
  /** The clear lacquer over the hulls (a second specular layer in every hull pixel). */
  lacquer: boolean;
  /** Share of the particles and the space dust drawn (0..1). */
  particles: number;
  /** How far out the field's rocks keep their full relief, as a share of the distance as designed (see AsteroidField.setDetail); 0 draws all in less detail. */
  rocks: number;
  /** Share of the belt's rocks drawn beyond the arena (0..1): scenery, 480 rocks of about 1000 triangles each. */
  belt: number;
  /** The title screen's pad: its pixel ratio, its shadow, and every how many frames it is drawn. */
  showcase: { pixelRatio: number; shadows: boolean; every: number };
  /** The reference plane's grid with its spokes, or only its rings (see ReferencePlane.setDetail). */
  spokes: boolean;
}

/** Knobs whose change compiles shaders anew: the governor turns them only where a hitch goes unseen (see Look, safe). */
export const COMPILING: readonly (keyof Look)[] = ['shadows', 'lacquer'];

const FULL: Look = { pixelRatio: 2, bloom: 1, shadows: 4096, lacquer: true, particles: 1, rocks: 1, belt: 1, showcase: { pixelRatio: 2, shadows: true, every: 1 }, spokes: true };

/**
 * The ladder, each rung a change to the one above it: the largest saving for the least loss
 * first, in the order the benchmark measured (README "Performance"). The field's rocks are most
 * of a frame's triangles (22 000 each up close, drawn twice: for the picture and for the sun's
 * shadows), and their fine relief barely shows from a distance, so the full relief keeps to
 * closer range first. Every full-screen pass costs per pixel, so the picture's resolution comes
 * down early and in small steps, with the bloom's resolution and the shadow map's edge between
 * them; the title screen's pad keeps a simpler look from the middle on. Shadows off costs a
 * shader compile and comes late; the lacquer saved nothing measurable and goes last.
 */
const STEPS: Partial<Look>[] = [
  {},
  { rocks: 0.5 },
  { rocks: 0.25 },
  { pixelRatio: 1.75 },
  { bloom: 0.5 },
  { shadows: 2048 },
  { pixelRatio: 1.5, showcase: { pixelRatio: 1.5, shadows: true, every: 1 } },
  { shadows: 1024 },
  { pixelRatio: 1.25, showcase: { pixelRatio: 1, shadows: false, every: 1 } },
  { particles: 0.5, belt: 0.5 },
  { shadows: 0 },
  { pixelRatio: 1, rocks: 0, belt: 0.25, showcase: { pixelRatio: 1, shadows: false, every: 2 }, spokes: false },
  { bloom: 0 },
  { pixelRatio: 0.75, particles: 0.35, lacquer: false },
];

/** The looks of the ladder's rungs, from the full picture (0) to the cheapest. */
export const LADDER: readonly Look[] = STEPS.reduce<Look[]>((rungs, step) => [...rungs, { ...(rungs.at(-1) ?? FULL), ...step }], []);

/** The menu's fixed choices: presets on the ladder. */
export const TIERS = ['low', 'medium', 'high'] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_RUNGS: Record<Tier, number> = { high: 0, medium: 6, low: 11 };
/** The tiers as the menu names them. */
export const TIER_NAMES: Record<Tier, string> = { low: msg('Low'), medium: msg('Medium'), high: msg('High') };

/** The preset at or above a rung: what the menu names it. */
export function tierOf(rung: number): Tier {
  return rung >= TIER_RUNGS.low ? 'low' : rung >= TIER_RUNGS.medium ? 'medium' : 'high';
}

/** What a browser tells about its device (see deviceHints). */
export interface DeviceHints {
  /** The GPU as WebGL names it, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, ...)" or "Mali-G715". */
  renderer: string;
  /** A touch screen is the main input (a phone or a tablet). */
  touch: boolean;
  /** Logical CPU cores (navigator.hardwareConcurrency), 0 when unknown. */
  cores: number;
  /** Device memory in GB (navigator.deviceMemory, Chromium only), 0 when unknown. */
  memory: number;
}

/**
 * The tier a device starts on before the governor has seen it play: a software renderer (no
 * GPU) and every phone or tablet start low, since their screens have many pixels for small
 * GPUs; a small machine or an integrated Intel GPU starts on medium, everything else on high.
 * The governor climbs from there if the device keeps up.
 */
export function guessTier(hints: DeviceHints): Tier {
  const gpu = hints.renderer.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(gpu)) return 'low';
  if (hints.touch) return 'low';
  if ((hints.cores > 0 && hints.cores <= 4) || (hints.memory > 0 && hints.memory <= 4)) return 'medium';
  if (/intel/.test(gpu) && !/arc/.test(gpu)) return 'medium';
  return 'high';
}

/** The browser's hints about its device, for guessTier. */
export function deviceHints(gl: WebGLRenderingContext | WebGL2RenderingContext): DeviceHints {
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  return { renderer, touch: window.matchMedia('(pointer: coarse)').matches, cores: navigator.hardwareConcurrency ?? 0, memory };
}

/**
 * The Host's choice in the menu, kept in the browser: a tier pinned by hand, or auto with the
 * rung the governor last found smooth on this device, its start next time.
 */
export interface Quality {
  choice: Tier | 'auto';
  rung?: number;
}
const QUALITY_KEY = 'solartournament.quality';

export function loadQuality(): Quality {
  try {
    const kept = JSON.parse(storageGet(QUALITY_KEY) ?? '{}') as Partial<Quality>;
    const choice = (TIERS as readonly string[]).includes(kept.choice as string) ? (kept.choice as Tier) : 'auto';
    const rung = Number.isInteger(kept.rung) && kept.rung! >= 0 && kept.rung! < LADDER.length ? kept.rung : undefined;
    return { choice, rung };
  } catch {
    return { choice: 'auto' };
  }
}

export function saveQuality(quality: Quality) {
  storageSet(QUALITY_KEY, JSON.stringify(quality));
}

/** The frame rate the governor holds (frames/s): below it for DOWN_SECONDS, it takes a rung down. */
export const TARGET_FPS = 50;
export const DOWN_SECONDS = 2;
/**
 * At UP_FPS or above for UP_SECONDS, with the frame's own work (script and the draw calls'
 * submission) under HEADROOM of the frame, it takes a rung up. The browser draws no faster than
 * the screen refreshes, so a smooth frame rate alone says nothing about the headroom left.
 */
export const UP_FPS = 58;
export const UP_SECONDS = 8;
const HEADROOM = 0.6;
/** After every change the governor waits this long (s): the new picture settles, its buffers are made. */
export const COOLDOWN_SECONDS = 3;
/**
 * A rung left for being slow is not climbed back to for BACKOFF_SECONDS, twice as long after
 * every further time: the frame rate never seesaws between two rungs.
 */
export const BACKOFF_SECONDS = 30;
/** A rung held this long (s) without stepping down is the device's (see Governor.stable). */
export const STABLE_SECONDS = 20;
/** A frame longer than this (s) is a stall (a shader compiled, the tab came back), not the frame rate. */
const STALL = 0.25;

/**
 * Watches the frame rate and moves along the ladder: down a rung when a stretch of
 * DOWN_SECONDS runs below TARGET_FPS, up a rung after UP_SECONDS at UP_FPS or above with
 * headroom to spare. Fed the real frame times; only what is drawn depends on it.
 */
export class Governor {
  private frames = 0;
  private seconds = 0;
  private work = 0;
  /** Seconds in a row at UP_FPS or above with headroom. */
  private smooth = 0;
  private cooldown = COOLDOWN_SECONDS;
  /** Seconds on the current rung without a step down. */
  private held = 0;
  /** The clock (s of frames seen), and per rung: until when it is barred after being left for slow, and how often it was. */
  private clock = 0;
  private readonly barred = new Map<number, { until: number; times: number }>();
  /** Called once the current rung held STABLE_SECONDS (see held). */
  stable: (rung: number) => void = () => {};

  constructor(
    public rung: number,
    private readonly last = LADDER.length - 1,
  ) {}

  /** Starts watching anew (after a pause, a change of the screen), with a moment to settle. */
  reset() {
    this.frames = this.seconds = this.work = this.smooth = 0;
    this.cooldown = COOLDOWN_SECONDS;
  }

  /**
   * One frame: `dt` seconds since the last one, `busy` seconds of it spent on the frame's own
   * work. Returns the rung to switch to, or null to keep the current one.
   */
  sample(dt: number, busy = 0): number | null {
    if (dt <= 0 || dt > STALL) return null;
    this.clock += dt;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    this.frames++;
    this.seconds += dt;
    this.work += busy;
    this.held += dt;
    if (this.held >= STABLE_SECONDS) {
      this.held = -Infinity;
      this.stable(this.rung);
    }
    if (this.seconds < DOWN_SECONDS) return null;
    const fps = this.frames / this.seconds;
    const spare = this.work / this.seconds < HEADROOM;
    const stretch = this.seconds;
    this.frames = this.seconds = this.work = 0;
    if (fps < TARGET_FPS && this.rung < this.last) {
      const bar = this.barred.get(this.rung) ?? { until: 0, times: 0 };
      this.barred.set(this.rung, { until: this.clock + BACKOFF_SECONDS * 2 ** bar.times, times: bar.times + 1 });
      return this.step(this.rung + 1);
    }
    this.smooth = fps >= UP_FPS && spare ? this.smooth + stretch : 0;
    const up = this.rung - 1;
    if (this.smooth >= UP_SECONDS && up >= 0 && (this.barred.get(up)?.until ?? 0) <= this.clock) return this.step(up);
    return null;
  }

  private step(rung: number): number {
    this.rung = rung;
    this.held = 0;
    this.reset();
    return rung;
  }
}

/**
 * What the benchmark (bench.ts) switches, one at a time, to see what each costs: the passes
 * after the scene (all of them, or one), the knobs of the ladder, the scene's parts, the DOM
 * and canvas overlays, the sound; the occasional effects (glitch, datamosh) it switches on.
 */
export const BENCH_FEATURES = ['post', 'bloom', 'lens', 'resolution', 'shadows', 'lacquer', 'detail', 'field', 'belt', 'landmark', 'sky', 'dust', 'particles', 'ships', 'wrecks', 'guide', 'hud', 'radar', 'attitude', 'audio', 'showcase', 'glitch', 'datamosh'] as const;
export type BenchFeature = (typeof BENCH_FEATURES)[number];
/** The benchmark's features that are switched on to measure them; all others are switched off. */
export const BENCH_ON: readonly BenchFeature[] = ['glitch', 'datamosh'];
