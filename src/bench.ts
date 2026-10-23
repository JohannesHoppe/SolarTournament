import type * as THREE from 'three';
import type { Game } from './game/game';
import type { RoundMode } from './game/race';
import { t } from './i18n/i18n';
import { BENCH_FEATURES, BENCH_ON, LADDER, tierOf, TIER_NAMES, type BenchFeature, type Tier } from './view/quality';
import { FIELD_RADIUS } from './world/asteroids';
import { ARENAS, type ArenaId } from './world/arenas';

/**
 * The benchmark (`?bench`, `?bench=<seconds per measurement>`, `&only=<sections>`): it plays a fixed scene (a solo
 * round of the default rivals, the Host's clone watching, the camera on a fixed circle around
 * the field) and measures the frame time with everything on, then with each feature switched off
 * on its own (the occasional effects, glitch and datamosh, switched on), every rung of the
 * quality ladder, every arena with and without its landmark, and the modes with their scenery.
 * Between two features it measures everything on again, and a feature's cost is the difference
 * to the mean of the two around it, so a fight that grows or calms down does not count as a
 * cost. The table shows on screen at the end (a phone runs it too), in the console, and as JSON
 * on `window.benchResult` and to copy or download.
 *
 * The frame time is the time between two frames the browser shows: it includes waiting for the
 * GPU, but never drops below the screen's refresh (16.7 ms at 60 Hz), so on a fast device the
 * script's own work and the GPU time (where the browser can time the GPU) say more.
 */

/** One measurement: its frame time and what the frame did. */
export interface Measurement {
  section: string;
  label: string;
  /** The median time between frames (ms), so a single stall (a garbage collection, a busy machine) does not count, and the frame rate it makes. */
  frameMs: number;
  fps: number;
  /** The frame's own work (ms): script, simulation, submitting the draw calls. */
  scriptMs: number;
  /** The GPU's time per frame (ms) where the browser can time it, else null. */
  gpuMs: number | null;
  calls: number;
  triangles: number;
  /** A feature's cost: the frame time it adds (ms) and as a share of the frame with everything on (%). */
  costMs?: number;
  costShare?: number;
}

export interface BenchResult {
  device: { renderer: string; pixelRatio: number; viewport: [number, number]; cores: number; memory: number; touch: boolean; guessed: string; gpuTimer: boolean; userAgent: string };
  seconds: number;
  measurements: Measurement[];
}

/** The benchmark's sections; `&only=quality,arenas` runs only those. */
export const BENCH_SECTIONS = ['menu', 'features', 'quality', 'arenas', 'modes'] as const;
export type BenchSection = (typeof BENCH_SECTIONS)[number];

/** Seconds of warm-up before each measurement: a switched feature compiles its shaders, buffers are made anew. */
const WARMUP = 1;
/** Seconds the bench round runs before the first measurement: the clones are printed, the bots find each other. */
const SETTLE = 3;
/** The camera's circle around the field's middle (units) and how high above its plane. */
const PATH_RADIUS = FIELD_RADIUS * 0.7;
const PATH_HEIGHT = FIELD_RADIUS * 0.12;

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/** Times the GPU frame by frame where the browser offers it (EXT_disjoint_timer_query_webgl2). */
class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private active: WebGLQuery | null = null;
  private readonly waiting: WebGLQuery[] = [];
  readonly times: number[] = [];

  constructor(renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get available() {
    return !!this.ext;
  }

  /** Called once a frame, after the game drew it: closes the frame's query and opens the next one's. */
  tick() {
    const { gl, ext } = this;
    if (!ext) return;
    if (this.active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.waiting.push(this.active);
    }
    this.active = gl.createQuery();
    if (this.active) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.active);
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this.waiting.length && gl.getQueryParameter(this.waiting[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.waiting.shift()!;
      if (!disjoint) this.times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
    }
  }
}

/** Runs the benchmark on the game, with an overlay that shows its progress and, at the end, its table. */
export async function runBench(game: Game, seconds: number, only: BenchSection[] = []): Promise<BenchResult> {
  const runs = (section: BenchSection) => !only.length || only.includes(section);
  const panel = Object.assign(document.createElement('div'), { className: 'bench' });
  const status = Object.assign(document.createElement('p'), { className: 'bench-status' });
  panel.append(Object.assign(document.createElement('h2'), { textContent: t('Benchmark') }), status);
  document.body.append(panel);
  const gpu = new GpuTimer(game.renderer);
  const graphics = game.graphics;
  graphics.hold = true;
  const result: BenchResult = {
    device: {
      renderer: graphics.renderer,
      pixelRatio: window.devicePixelRatio,
      viewport: [window.innerWidth, window.innerHeight],
      cores: navigator.hardwareConcurrency ?? 0,
      memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
      touch: window.matchMedia('(pointer: coarse)').matches,
      guessed: graphics.guessed,
      gpuTimer: gpu.available,
      userAgent: navigator.userAgent,
    },
    seconds,
    measurements: [],
  };

  // the camera flies the same arc in every measurement: the same rocks, the same sky
  let pathStart = 0;
  const fly = (camera: THREE.PerspectiveCamera) => {
    const angle = ((performance.now() - pathStart) / 1000 / (seconds + WARMUP)) * Math.PI * 0.5;
    camera.position.set(Math.cos(angle) * PATH_RADIUS, PATH_HEIGHT, Math.sin(angle) * PATH_RADIUS);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };

  const counts: Record<BenchSection, number> = { menu: 3, features: (BENCH_FEATURES.length - 3) * 2, quality: LADDER.length, arenas: ARENAS.length * 3 + 2, modes: 3 + 2 };
  // the round of the features and the ladder starts with one measurement of everything on
  const total = BENCH_SECTIONS.filter(runs).reduce((sum, section) => sum + counts[section], runs('features') || runs('quality') ? 1 : 0);
  let done = 0;
  const measure = async (section: string, label: string): Promise<Measurement> => {
    status.textContent = t('Measuring {what} ({n} of {total})', { what: `${section}: ${label}`, n: ++done, total });
    pathStart = performance.now();
    for (let waited = 0; waited < WARMUP; ) {
      const before = performance.now();
      await nextFrame();
      gpu.tick();
      waited += (performance.now() - before) / 1000;
    }
    gpu.times.length = 0;
    let frames = 0;
    let script = 0;
    let calls = 0;
    let triangles = 0;
    const start = performance.now();
    let last = start;
    const intervals: number[] = [];
    while (last - start < seconds * 1000) {
      const now = await nextFrame();
      intervals.push(now - last);
      last = now;
      gpu.tick();
      frames++;
      script += game.lastFrameMs;
      calls += game.renderer.info.render.calls;
      triangles += game.renderer.info.render.triangles;
    }
    const frameMs = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    const measurement: Measurement = {
      section,
      label,
      frameMs,
      fps: 1000 / frameMs,
      scriptMs: script / frames,
      gpuMs: gpu.times.length ? gpu.times.reduce((a, b) => a + b, 0) / gpu.times.length : null,
      calls: Math.round(calls / frames),
      triangles: Math.round(triangles / frames),
    };
    result.measurements.push(measurement);
    return measurement;
  };
  const wait = async (s: number) => {
    const until = performance.now() + s * 1000;
    while (performance.now() < until) await nextFrame();
  };
  /**
   * A feature's cost against the mean of `bases`: what it adds per frame. Measured in GPU time
   * where every measurement compared has it, since the frame time snaps to the screen's
   * refresh; in frame time otherwise, and always for the title screen's pad, which draws in a
   * context of its own that the GPU timer does not see.
   */
  const cost = (m: Measurement, bases: Measurement[], on: boolean, byFrame = false) => {
    const all = [m, ...bases];
    const times = !byFrame && all.every((x) => x.gpuMs !== null) ? all.map((x) => x.gpuMs!) : all.map((x) => x.frameMs);
    const base = times.slice(1).reduce((sum, x) => sum + x, 0) / bases.length;
    m.costMs = on ? times[0] - base : base - times[0];
    m.costShare = (m.costMs / base) * 100;
  };
  /** Measures `feature` switched, against the mean of everything on before and after. */
  const compare = async (section: string, feature: BenchFeature, before: Measurement) => {
    const on = BENCH_ON.includes(feature);
    game.setBench(feature, true);
    const switched = await measure(section, on ? `+ ${feature}` : `− ${feature}`);
    game.setBench(feature, false);
    const after = await measure(section, t('everything on'));
    cost(switched, [before, after], on, feature === 'showcase');
    return after;
  };

  graphics.rung = 0;
  graphics.apply(true, true);
  // the title screen, with and without the pad
  if (runs('menu')) {
    game.benchMenu();
    await wait(SETTLE);
    const menu = await measure(t('menu'), t('everything on'));
    await compare(t('menu'), 'showcase', menu);
  }

  // the features, one by one, in the belt's deathmatch, and the ladder, rung by rung
  if (runs('features') || runs('quality')) {
    await scene('belt', 'deathmatch');
    let base = await measure(t('features'), t('everything on'));
    if (runs('features')) {
      for (const feature of BENCH_FEATURES) {
        if (feature === 'showcase' || feature === 'guide' || feature === 'lens') continue;
        base = await compare(t('features'), feature, base);
      }
    }
    if (runs('quality')) {
      for (let rung = 0; rung < LADDER.length; rung++) {
        graphics.rung = rung;
        graphics.apply(true, true);
        const m = await measure(t('quality'), `${rung} (${t(TIER_NAMES[tierOf(rung)])})`);
        cost(m, [base], false);
      }
      graphics.rung = 0;
      graphics.apply(true, true);
    }
  }

  // every arena, and what its landmark costs; the black hole's lens too
  if (runs('arenas')) {
    for (const arena of ARENAS) {
      await scene(arena.id, 'deathmatch');
      const all = await measure(t('arenas'), arena.id);
      await compare(t('arenas'), 'landmark', all);
      if (arena.id === 'hole') await compare(t('arenas'), 'lens', all);
    }
  }

  // the modes with their scenery: gates and the racing line, the bases, the battleship
  if (runs('modes')) {
    for (const mode of ['race', 'flag', 'fleet'] as RoundMode[]) {
      await scene('belt', mode);
      const all = await measure(t('modes'), mode);
      if (mode === 'race') await compare(t('modes'), 'guide', all);
    }
  }

  async function scene(arena: ArenaId, mode: RoundMode) {
    game.benchRound(arena, mode);
    game.benchCamera = fly;
    await wait(SETTLE);
  }

  game.benchCamera = null;
  graphics.hold = false;
  game.benchMenu();
  status.textContent = t('Done: {n} measurements of {seconds} s each.', { n: result.measurements.length, seconds });
  report(panel, result);
  Object.assign(window, { benchResult: result });
  console.table(result.measurements);
  return result;
}

/** The table on screen, and the JSON to copy or download. */
function report(panel: HTMLElement, result: BenchResult) {
  const device = Object.assign(document.createElement('p'), {
    className: 'bench-device',
    textContent: `${result.device.renderer} · ${result.device.viewport.join('×')} @ ${result.device.pixelRatio} · ${result.device.cores} ${t('cores')} · ${t('guessed tier: {tier}', { tier: t(TIER_NAMES[result.device.guessed as Tier]) })} · ${result.device.gpuTimer ? t('GPU timer') : t('no GPU timer')}`,
  });
  const table = document.createElement('table');
  const heads = [t('Section'), t('What'), t('ms per frame'), t('fps'), t('cost (ms)'), t('cost (%)'), t('script (ms)'), t('GPU (ms)'), t('draw calls'), t('triangles')];
  const row = (cells: string[], tag: 'th' | 'td') => {
    const tr = document.createElement('tr');
    tr.append(...cells.map((text) => Object.assign(document.createElement(tag), { textContent: text })));
    return tr;
  };
  const fixed = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? '' : value.toFixed(digits));
  table.append(row(heads, 'th'), ...result.measurements.map((m) => row([m.section, m.label, fixed(m.frameMs), fixed(m.fps, 0), fixed(m.costMs), fixed(m.costShare, 0), fixed(m.scriptMs), fixed(m.gpuMs), String(m.calls), String(m.triangles)], 'td')));
  const json = JSON.stringify(result, null, 1);
  const copy = Object.assign(document.createElement('button'), { type: 'button', textContent: t('Copy JSON') });
  copy.addEventListener('click', () => void navigator.clipboard?.writeText(json));
  const download = Object.assign(document.createElement('a'), { textContent: t('Download JSON'), download: 'solartournament-bench.json', href: URL.createObjectURL(new Blob([json], { type: 'application/json' })) });
  const close = Object.assign(document.createElement('button'), { type: 'button', textContent: t('Close') });
  close.addEventListener('click', () => panel.remove());
  const actions = Object.assign(document.createElement('p'), { className: 'bench-actions' });
  actions.append(copy, download, close);
  panel.append(device, Object.assign(document.createElement('div'), { className: 'bench-table' }), actions);
  panel.querySelector('.bench-table')!.append(table);
}

/**
 * The frame meter (`?fps`, and while the benchmark runs): frame rate, the frame's own work and
 * the rung of the quality ladder the picture is on, so the governor can be watched at work.
 */
export function showMeter(game: Game) {
  const meter = Object.assign(document.createElement('p'), { className: 'bench-meter' });
  document.body.append(meter);
  const graphics = game.graphics;
  setInterval(() => {
    meter.textContent = t('{fps} fps · {ms} ms · step {rung} of {rungs} ({tier})', {
      fps: graphics.fps.toFixed(0),
      ms: graphics.busy.toFixed(1),
      rung: graphics.rung,
      rungs: LADDER.length - 1,
      tier: t(TIER_NAMES[tierOf(graphics.rung)]),
    });
  }, 500);
}
