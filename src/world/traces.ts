import * as THREE from 'three';
import { atan2, cos, exp, hypot, sin } from '../detmath';
import { Randomizer } from '../random';
import { DETAIL_RES, tileNoise } from './rocks';
import { drawnOn, gridHeight, levelHeight, STEPS, TILE, tileLevel, type GroundGrid } from './groundlod';

/**
 * What people left on an airless world's ground: in vacuum nothing blows a print away, so every
 * bootprint of a suit, every rover's and crawler's track, a sled's ruts, the scar of a ship that
 * slid along and the ring a lander's plume swept clear stay for millennia. They lie thick round
 * the depots, stations and claims people have worked at for centuries and thin out into the wilds,
 * where now and then a lone line of prints runs far out. Looks only: never collided with, never
 * shared, laid from the place's seed so every visit finds them where they were.
 *
 * Each trace is a strip cut at every edge of the ground's faces (see drapeTriangle), so each of
 * its pieces lies in one face, on the ground as its finest level draws it (see world/groundlod,
 * gridHeight); every corner also carries how far each coarser level of the ground's tile lies
 * above or below it there, and the strip rises or sinks onto the level its tile draws, so it lies
 * on the ground as drawn at every distance. It reads its pattern from one baked atlas (see
 * traceAtlas) and multiplies the ground already drawn under it by twice that pattern's value (0.5
 * leaves the ground as it is), so the ground's own light, shadow and color stay and a print only
 * darkens or brightens them. A strip fades out where it would be narrower than a few pixels on
 * screen, so a line of prints never shimmers in the distance. A ground's traces are drawn in
 * chunks, one for each tile of the ground (see world/groundlod, TILE), the wide traces (tracks,
 * ruts of crawlers, scars and blast rings) and the fine ones (bootprints, sled runners) apart: a
 * chunk out of view, or so far that all its strips would be thinner than a few pixels, is not
 * drawn, each one drawn is a draw call. The cheaper rungs of the picture's quality drop the fine
 * ones (see setTraceDetail).
 */

/** The kinds of traces, each a column of the atlas. */
export type TraceKind = 'boots' | 'rover' | 'crawler' | 'sled' | 'slide' | 'blast';

/**
 * Each kind's strip as built (units, 1 unit = 5 cm): `width` across, one tile of its pattern
 * every `tile` along, `column` of the atlas, `fine` whether it is a fine trace. A line of prints
 * is 70 cm wide (two boot soles 32 by 12 cm, 22 cm apart), four steps of 80 cm a tile; a rover's
 * two tyres 26 cm wide on a gauge of 1.9 m with a chevron tread every 10 cm; a crawler's two
 * treads 1.4 m wide on a gauge of 4 m, a cleat every 30 cm; a sled's two runners 20 cm wide on a
 * gauge of 2.4 m; a slid ship's scar 12 m wide; a blast ring its radius wide (the ring's own).
 * `slope` is the steepest ground (rise over run) a trace of the kind runs up or down: a walker in
 * a suit on loose dust 0.5 (27°), a rover 0.35 (19°), a loaded crawler 0.3 (17°, its haul sliding
 * back beyond), a sled 0.25 (14°, a dragged load running away downhill beyond), a slid ship 0.6
 * (31°: it ploughs on where it fell, kept only off cliffs); a blast ring is laid where its lander
 * set down, never walked, and has none.
 */
export const TRACE_KINDS: Readonly<Record<TraceKind, { column: number; width: number; tile: number; fine: boolean; slope: number }>> = {
  boots: { column: 0, width: 14, tile: 64, fine: true, slope: 0.5 },
  rover: { column: 1, width: 48, tile: 20, fine: false, slope: 0.35 },
  crawler: { column: 2, width: 120, tile: 24, fine: false, slope: 0.3 },
  sled: { column: 3, width: 64, tile: 80, fine: true, slope: 0.25 },
  slide: { column: 4, width: 240, tile: 400, fine: false, slope: 0.6 },
  blast: { column: 5, width: 0, tile: 0, fine: false, slope: Infinity },
};

/** The atlas: ATLAS_COLUMNS columns of COLUMN × ATLAS_HEIGHT texels, one per kind; a column's pattern spans its texels from GUTTER to COLUMN − GUTTER, neutral outside. */
export const COLUMN = 64;
export const ATLAS_COLUMNS = 8;
export const ATLAS_WIDTH = COLUMN * ATLAS_COLUMNS;
export const ATLAS_HEIGHT = 256;
export const GUTTER = 2;
/** The texel value that leaves the ground as it is: the shader reads a texel t as t · 255 / 256, so 128 is exactly 0.5. */
export const NEUTRAL = 128;
/** The texture coordinate u of `a` across a strip of `kind` (0 one side, 1 the other). */
export const atlasU = (kind: TraceKind, a: number) => (TRACE_KINDS[kind].column * COLUMN + GUTTER + a * (COLUMN - 2 * GUTTER)) / ATLAS_WIDTH;

const TAU = Math.PI * 2;
const { smoothstep } = THREE.MathUtils;
/** A rounded box's signed distance: negative inside the box of half extents (hw, hl), corners rounded by `r`. */
function roundedBox(p: number, q: number, hw: number, hl: number, r: number): number {
  const dx = Math.abs(p) - hw + r;
  const dy = Math.abs(q) - hl + r;
  const outside = Math.sqrt(Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}
/** A print pressed into dust (its signed distance `sdf`, units): dark where it is pressed, `inside` gives its floor's tone; a bright rim of pushed-up dust `rim` wide around it. */
function pressed(sdf: number, inside: number, rim: number, bright = 0.1): number {
  if (sdf < 0) return inside + (0.5 + bright - inside) * smoothstep(sdf, -0.4, 0);
  return 0.5 + bright * (1 - smoothstep(sdf, 0, rim));
}

/** The steps of a tile of bootprints: where along (units), how far off the strip's middle, how turned (rad, with its cosine and sine); seeded so no two steps are alike. */
const FOOTSTEPS = (() => {
  const r = new Randomizer(4101);
  return Array.from({ length: 4 }, (_, k) => {
    const step = { along: (k + 0.5) * 16 + r.range(-1, 1), side: (k % 2 ? 1 : -1) * (2.2 + r.range(-0.3, 0.3)), turn: r.range(-0.12, 0.12) + (k % 2 ? 0.05 : -0.05) };
    return { ...step, c: cos(step.turn), s: sin(step.turn) };
  });
})();
/** A slid ship's gouges across its scar: middle (units off the scar's middle), half width, depth, and a wander along it. */
const GOUGES = (() => {
  const r = new Randomizer(4102);
  return Array.from({ length: 16 }, () => ({ middle: r.range(-100, 100), half: 1 + 5 * r.nextFloat() * r.nextFloat(), depth: r.range(0.06, 0.16), wander: r.range(0.5, 3), phase: r.range(0, TAU) }));
})();
/** A blast ring's rays: their counts round a quarter of the ring (whole, so the pattern closes), weights and phases. */
const RAYS = (() => {
  const r = new Randomizer(4103);
  return Array.from({ length: 6 }, () => ({ count: 2 + Math.floor(r.range(0, 9)), weight: r.range(0.3, 1), phase: r.range(0, TAU) }));
})();

/**
 * A kind's pattern along one row of its tile, at `b` along it (0..1, the pattern tiles): what
 * depends on `b` alone reckoned once, the pattern at `a` across the strip (0..1) handed back as a
 * function. 0.5 neutral, darker where the ground is pressed or scoured, brighter where dust was
 * pushed up or swept clean.
 */
function patternRow(kind: TraceKind, b: number): (a: number) => number {
  const { width, tile } = TRACE_KINDS[kind];
  const y = b * tile;
  const across = (a: number) => (a - 0.5) * width;
  switch (kind) {
    case 'boots': {
      // the steps whose prints reach this row, each of the tile's and its neighbours'
      const near: { step: (typeof FOOTSTEPS)[number]; dy: number }[] = [];
      for (const step of FOOTSTEPS) {
        for (const shift of [-tile, 0, tile]) {
          const dy = y - step.along - shift;
          if (Math.abs(dy) <= 6) near.push({ step, dy });
        }
      }
      return (a) => {
        const x = across(a);
        let m = 0.5;
        for (const { step, dy } of near) {
          const dx = x - step.side;
          if (Math.abs(dx) > 4) continue;
          const p = dx * step.c - dy * step.s;
          const q = dx * step.s + dy * step.c;
          // the sole wider at its toe (+q), lugs across it every 4.5 cm
          const sdf = roundedBox(p, q, 1.1 + 0.15 * (q / 3.2), 3.2, 0.9);
          const lugs = 0.36 + 0.07 * sin((TAU * q) / 0.9);
          const v = pressed(sdf, lugs, 0.7, 0.11);
          if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
        }
        return m;
      };
    }
    case 'rover':
      return (a) => {
        const x = across(a);
        let m = 0.5;
        for (const middle of [-19, 19]) {
          const off = Math.abs(x - middle);
          const chevrons = 0.4 + 0.06 * sin((TAU * (y + off * 0.6)) / 2);
          const v = pressed(off - 2.6, chevrons, 1.6, 0.09);
          if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
        }
        return m;
      };
    case 'crawler': {
      const cleat = smoothstep((y / 6) % 1, 0.25, 0.32) * (1 - smoothstep((y / 6) % 1, 0.6, 0.68));
      return (a) => {
        const x = across(a);
        let m = 0.5;
        for (const middle of [-40, 40]) {
          const off = Math.abs(x - middle);
          const v = pressed(off - 14, 0.42 - 0.1 * cleat, 3, 0.1);
          if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
        }
        return m;
      };
    }
    case 'sled': {
      const drag = 0.8 + 0.2 * sin(TAU * b);
      return (a) => {
        const x = across(a);
        // a faint drag of the load between the runners, varying slowly along
        let m = 0.5 - 0.03 * (1 - smoothstep(Math.abs(x), 10, 18)) * drag;
        for (const middle of [-24, 24]) {
          const off = Math.abs(x - middle);
          const v = pressed(off - 2, 0.38 + 0.04 * (off / 2) * (off / 2), 1.5, 0.08);
          if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
        }
        return m;
      };
    }
    case 'slide': {
      const middles = GOUGES.map((g) => g.middle + g.wander * sin(TAU * b + g.phase));
      return (a) => {
        const x = across(a);
        // the whole scar scuffed a little darker, fading out at its sides
        let m = 0.5 - 0.035 * (1 - smoothstep(Math.abs(x), 96, 116));
        for (let k = 0; k < GOUGES.length; k++) {
          const g = GOUGES[k];
          const off = Math.abs(x - middles[k]);
          if (off < g.half) m -= g.depth * (1 - (off / g.half) * (off / g.half));
          else if (off < 2 * g.half) m += 0.9 * g.depth * (1 - (off - g.half) / g.half);
        }
        return Math.min(0.75, Math.max(0.22, m));
      };
    }
    case 'blast': {
      let rays = 0;
      for (const ray of RAYS) rays += ray.weight * sin(TAU * ray.count * b + ray.phase);
      // `a` the share of the ring's radius out from its middle: the ground under the lander scoured, a bright halo swept clean round it with rays, fading out to the rim
      return (a) => {
        const halo = 0.15 * (1 - smoothstep(a, 0.12, 1)) * (1 + 0.12 * rays);
        return 0.5 + halo * smoothstep(a, 0.1, 0.22) - 0.07 * (1 - smoothstep(a, 0.1, 0.2));
      };
    }
  }
}

/** A kind's pattern at `a` across its strip (0..1) and `b` along its tile (0..1), as patternRow reckons it. */
export const tracePattern = (kind: TraceKind, a: number, b: number): number => patternRow(kind, b)(a);

/** The atlas's texels (one byte each, value t meaning t · 255 / 256 · 2 times the ground): every kind's pattern, 3 × 3 samples a texel. */
export function traceAtlas(): Uint8Array {
  const data = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT).fill(NEUTRAL);
  const span = COLUMN - 2 * GUTTER;
  for (const kind of Object.keys(TRACE_KINDS) as TraceKind[]) {
    const column = TRACE_KINDS[kind].column;
    for (let j = 0; j < ATLAS_HEIGHT; j++) {
      const rows = [0, 1, 2].map((sj) => patternRow(kind, (j + (sj + 0.5) / 3) / ATLAS_HEIGHT));
      for (let i = 0; i < span; i++) {
        let sum = 0;
        for (let sj = 0; sj < 3; sj++) for (let si = 0; si < 3; si++) sum += rows[sj]((i + (si + 0.5) / 3) / span);
        data[j * ATLAS_WIDTH + column * COLUMN + GUTTER + i] = Math.min(255, Math.max(0, Math.round((sum / 9) * 256)));
      }
    }
  }
  return data;
}

let atlas: THREE.DataTexture | null = null;
function atlasTexture(): THREE.DataTexture {
  if (atlas) return atlas;
  atlas = new THREE.DataTexture(traceAtlas(), ATLAS_WIDTH, ATLAS_HEIGHT, THREE.RedFormat, THREE.UnsignedByteType);
  atlas.wrapS = THREE.ClampToEdgeWrapping;
  atlas.wrapT = THREE.RepeatWrapping;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.anisotropy = 4;
  atlas.needsUpdate = true;
  return atlas;
}

/**
 * How far a strip's vertex is drawn towards the camera (units): TRACE_LIFT, and TRACE_LIFT_SHARE
 * of its distance more, for the depth buffer's steps grow with the distance (on a 24-bit buffer
 * and a near plane of 50 cm about 2 units at 1 km), and where a tile's last coarse cells are not
 * square their faces bend across a finest face by a little more than the strip follows.
 */
const TRACE_LIFT = 2;
const TRACE_LIFT_SHARE = 0.0025;
/** A strip fades in between these widths on screen (px), so it never shimmers once it is thinner. */
const FADE_PX = [1.5, 4] as const;
/** A ship's scrape mark fades out over the last third of SCRAPE_LIFE (s) after it was made. */
export const SCRAPE_LIFE = 180;
/**
 * The traces are drawn after the ground and before every other see-through thing (sparks, smoke,
 * explosions, jets, renderOrder 0), so they multiply the ground alone and never what glows above
 * it; after the backdrops behind everything (renderOrder −2 to −1), which they never cover.
 */
const TRACE_ORDER = -0.5;

/** The picture's height in pixels, for a strip's width on screen; set before each strip is drawn. */
const picture = { value: 1080 };
const now = { value: 0 };
/** The scrape marks' triangles laid so far (see ScrapeMarks): a mark fades as newer ones come to take its place. */
const head = { value: 0 };
/** The atlas, baked the first time a trace is drawn (see prepare). */
const atlasUniform: { value: THREE.DataTexture | null } = { value: null };

function traceMaterial(fades: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { atlas: atlasUniform, picture, now, head, level: { value: new THREE.Vector4() } },
    defines: fades ? { FADES: '', LIFE: SCRAPE_LIFE.toFixed(1), KEEP: SCRAPE_KEEP.toFixed(1) } : {},
    vertexShader: `
      attribute vec2 trace;
      #ifdef FADES
      attribute vec2 age;
      uniform float now;
      uniform float head;
      #else
      attribute vec4 coarse;
      uniform vec4 level;
      #endif
      uniform float picture;
      varying vec2 vUv;
      varying float vStrength;
      void main() {
        vec3 at = position;
        #ifndef FADES
        // onto the level its tile of the ground draws (see coarse)
        at.y += dot(coarse, level);
        #endif
        vec4 eye = modelViewMatrix * vec4(at, 1.0);
        float d = max(length(eye.xyz), 1.0);
        float px = trace.y * projectionMatrix[1][1] * picture * 0.5 / d;
        vStrength = trace.x * smoothstep(${FADE_PX[0].toFixed(1)}, ${FADE_PX[1].toFixed(1)}, px);
        #ifdef FADES
        vStrength *= (1.0 - smoothstep(LIFE * 0.667, LIFE, now - age.x)) * (1.0 - smoothstep(KEEP * 0.667, KEEP, head - age.y));
        #endif
        eye.xyz *= 1.0 - min(0.5, (${TRACE_LIFT.toFixed(1)} + d * ${TRACE_LIFT_SHARE}) / d);
        gl_Position = projectionMatrix * eye;
        vUv = uv;
      }`,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 vUv;
      varying float vStrength;
      void main() {
        float m = mix(0.5, texture2D(atlas, vUv).r * (255.0 / 256.0), vStrength);
        gl_FragColor = vec4(m, m, m, 1.0);
      }`,
    // twice the strip's value times the ground drawn under it: 0.5 leaves it as it is
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.SrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    // seen from either side (a scrape mark is laid facing down), in one pass: a strip lies flat and never hides itself
    side: THREE.DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
  });
}

let wideMaterial: THREE.ShaderMaterial | null = null;
let fineMaterial: THREE.ShaderMaterial | null = null;
let scrapeMaterial: THREE.ShaderMaterial | null = null;
const materials = () => {
  wideMaterial ??= traceMaterial(false);
  fineMaterial ??= traceMaterial(false);
  scrapeMaterial ??= traceMaterial(true);
  return { wide: wideMaterial, fine: fineMaterial, scrape: scrapeMaterial };
};
/** Whether the fine traces (bootprints, sleds' runners) are drawn, as the picture's quality sets it (see view/quality, Look.traces); the wide ones and the ships' scrapes always are. */
export function setTraceDetail(fine: boolean) {
  materials().fine.visible = fine;
}

/** Before a trace is drawn: the atlas baked the first time, the picture's height (the render target's, or the canvas's) for a strip's width on screen. */
function prepare(renderer: THREE.WebGLRenderer) {
  atlasUniform.value ??= atlasTexture();
  const target = renderer.getRenderTarget();
  picture.value = target ? target.height : renderer.domElement.height;
}

/**
 * A site people have worked at for centuries, in the ground's frame (units): its middle, `size`
 * the radius of what is built there (its tracks start at its edge), `busy` how much traffic it
 * sees (0..1: a lone outpost to a depot), `pads` how many landers set down beside it.
 */
export interface TraceSite {
  x: number;
  z: number;
  size: number;
  busy: number;
  pads?: number;
}

/** A way a place lays itself, where its traffic runs along a lane: its kind, its middle line (x, z pairs, units) and how many times it was driven beside itself. */
export interface TraceWay {
  kind: TraceKind;
  points: readonly number[];
  passes: number;
}

/**
 * What a place's ground is marked with: its `seed`, its sites, the ways it lays itself (`ways`), the lone lines of prints in the wilds (`wilds`, 3 unless given) and the old landing sites out there (`landings`, 1 unless given).
 * `weathering` (0..1, none unless given) is the share by which a trace fades where nobody walks it again, far from every site: on a world whose ground is not still, frost settling out of a thin air (Pluto, Triton) or the snow of its plumes (Enceladus) softens over centuries what lies there undisturbed, while round a site the traffic keeps its tracks fresh.
 */
export interface TracePlan {
  seed: number;
  sites: readonly TraceSite[];
  ways?: readonly TraceWay[];
  wilds?: number;
  landings?: number;
  weathering?: number;
}

/** One trace as laid: its kind, its middle line (x, z pairs, units), its width across (units), how strongly it shows (0..1). */
export interface Trail {
  kind: TraceKind;
  points: number[];
  width: number;
  strength: number;
}
/** A blast ring: its middle, radius (units) and strength. */
export interface Ring {
  x: number;
  z: number;
  radius: number;
  strength: number;
}

const KM = 20000;
const M = 20;

/**
 * The traces of a plan over `grid`: round each site its roads out into the land (rover tracks,
 * crawler treads and sled ruts, some driven again and again beside each other), rover loops
 * round it, many short lines of prints wandering off its edge, its landers' blast rings with the
 * crew's prints round them, and the scars of ships that slid in; a road to the nearest other
 * site a vehicle can reach, found round whatever stands between and never laid where it would not arrive (`routeRoad`); the place's own ways along its lanes; out in the wilds a few lone lines of prints far from anything and an old landing site.
 * A trace keeps off slopes too steep for it (a rover off 19°, a walker off 27°) and to the
 * ground, and shows fainter the farther it lies from the sites, older and less walked.
 */
/** The lattice a road between two sites is searched on, in units (20 m): fine enough to find a valley head's ramp, coarse enough to search a world's ground in a few milliseconds. */
const ROUTE_CELL = 20 * M;

/**
 * The shortest way a vehicle of slope limit `limit` (rise over run) drives from (x, z) to within
 * `reach` of (tx, tz), on a lattice of ROUTE_CELL with its diagonals, every step and its middle
 * no steeper than the limit, inside `inside`, searched within a box round the two ends reaching out as far again as they lie apart, at least 4 km (A*);
 * as points every 10 m, smoothed where the smoothing keeps every stretch within the limit, or
 * null where no such way exists, so a road between two sites is always one that arrives.
 */
export function routeRoad(x: number, z: number, tx: number, tz: number, reach: number, limit: number, inside: (x: number, z: number) => boolean, height: (x: number, z: number) => number): number[] | null {
  const span = hypot(tx - x, tz - z);
  const pad = Math.max(4 * KM, span);
  const x0 = Math.min(x, tx) - pad;
  const z0 = Math.min(z, tz) - pad;
  const nx = Math.ceil((Math.max(x, tx) + pad - x0) / ROUTE_CELL) + 1;
  const nz = Math.ceil((Math.max(z, tz) + pad - z0) / ROUTE_CELL) + 1;
  const px = (i: number) => x0 + (i % nx) * ROUTE_CELL;
  const pz = (i: number) => z0 + Math.floor(i / nx) * ROUTE_CELL;
  const start = Math.round((z - z0) / ROUTE_CELL) * nx + Math.round((x - x0) / ROUTE_CELL);
  const cost = new Float64Array(nx * nz).fill(Infinity);
  const from = new Int32Array(nx * nz).fill(-1);
  const done = new Uint8Array(nx * nz);
  // a binary heap of (estimate, node)
  const heap: number[] = [];
  const push = (f: number, node: number) => {
    heap.push(f, node);
    for (let c = heap.length - 2; c > 0; ) {
      const p = (((c >> 1) - 1) >> 1) << 1;
      if (heap[p] <= heap[c]) break;
      [heap[p], heap[c], heap[p + 1], heap[c + 1]] = [heap[c], heap[p], heap[c + 1], heap[p + 1]];
      c = p;
    }
  };
  const pop = (): number => {
    const node = heap[1];
    const lastF = heap[heap.length - 2];
    const lastN = heap[heap.length - 1];
    heap.length -= 2;
    if (heap.length) {
      heap[0] = lastF;
      heap[1] = lastN;
      for (let p = 0; ; ) {
        const a = 2 * p + 2;
        const b = a + 2;
        let m = p;
        if (a < heap.length && heap[a] < heap[m]) m = a;
        if (b < heap.length && heap[b] < heap[m]) m = b;
        if (m === p) break;
        [heap[p], heap[m], heap[p + 1], heap[m + 1]] = [heap[m], heap[p], heap[m + 1], heap[p + 1]];
        p = m;
      }
    }
    return node;
  };
  const steep = (ax: number, az: number, bx: number, bz: number, run: number) => {
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const ha = height(ax, az);
    const hm = height(mx, mz);
    return Math.abs(hm - ha) > (limit * run) / 2 || Math.abs(height(bx, bz) - hm) > (limit * run) / 2;
  };
  if (start < 0 || start >= nx * nz) return null;
  cost[start] = 0;
  push(span, start);
  let goal = -1;
  while (heap.length) {
    const node = pop();
    if (done[node]) continue;
    done[node] = 1;
    const ax = px(node);
    const az = pz(node);
    if (hypot(tx - ax, tz - az) < reach) {
      goal = node;
      break;
    }
    const col = node % nx;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || col + dx < 0 || col + dx >= nx) continue;
        const next = node + dz * nx + dx;
        if (next < 0 || next >= nx * nz || done[next]) continue;
        const bx = px(next);
        const bz = pz(next);
        const run = dx && dz ? ROUTE_CELL * Math.SQRT2 : ROUTE_CELL;
        if (!inside(bx, bz) || steep(ax, az, bx, bz, run)) continue;
        const g = cost[node] + run;
        if (g >= cost[next]) continue;
        cost[next] = g;
        from[next] = node;
        push(g + hypot(tx - bx, tz - bz), next);
      }
  }
  if (goal < 0) return null;
  const corners: number[] = [];
  for (let node = goal; node >= 0; node = from[node]) corners.unshift(px(node), pz(node));
  corners[0] = x;
  corners[1] = z;
  // the lattice's corners pulled straight: from each corner on to the farthest one, up to 3 km
  // on, that a straight drive reaches within the slope, every 10 m of it checked (the lattice's
  // stairs gone)
  const STRIDE_10M = 10 * M;
  const clear = (i: number, j: number) => {
    const steps = Math.max(1, Math.ceil(hypot(corners[j] - corners[i], corners[j + 1] - corners[i + 1]) / STRIDE_10M));
    for (let s = 1; s <= steps; s++) {
      const ax = corners[i] + ((corners[j] - corners[i]) * (s - 1)) / steps;
      const az = corners[i + 1] + ((corners[j + 1] - corners[i + 1]) * (s - 1)) / steps;
      const bx = corners[i] + ((corners[j] - corners[i]) * s) / steps;
      const bz = corners[i + 1] + ((corners[j + 1] - corners[i + 1]) * s) / steps;
      if (!inside(bx, bz) || steep(ax, az, bx, bz, hypot(bx - ax, bz - az))) return false;
    }
    return true;
  };
  const pulled = [corners[0], corners[1]];
  for (let i = 0; i + 2 < corners.length; ) {
    let j = i + 2;
    while (j + 2 < corners.length && j - i < 2 * 150 && clear(i, j + 2)) j += 2;
    pulled.push(corners[j], corners[j + 1]);
    i = j;
  }
  // a point every 10 m along them
  const raw: number[] = [];
  for (let i = 0; i + 3 < pulled.length; i += 2) {
    const steps = Math.max(1, Math.round(hypot(pulled[i + 2] - pulled[i], pulled[i + 3] - pulled[i + 1]) / STRIDE_10M));
    for (let s = i ? 1 : 0; s <= steps; s++) raw.push(pulled[i] + ((pulled[i + 2] - pulled[i]) * s) / steps, pulled[i + 1] + ((pulled[i + 3] - pulled[i + 1]) * s) / steps);
  }
  // the corners rounded into a driven curve, a point kept where moving it would make a stretch too steep
  let points = raw.slice();
  for (let pass = 0; pass < 24; pass++) {
    const next = points.slice();
    for (let i = 2; i + 3 < points.length; i += 2) {
      const sx = (points[i - 2] + 2 * points[i] + points[i + 2]) / 4;
      const sz = (points[i - 1] + 2 * points[i + 1] + points[i + 3]) / 4;
      const run = 10 * M;
      if (!steep(next[i - 2], next[i - 1], sx, sz, run) && !steep(sx, sz, points[i + 2], points[i + 3], run)) {
        next[i] = sx;
        next[i + 1] = sz;
      }
    }
    points = next;
  }
  return points;
}

export function layTraces(plan: TracePlan, grid: GroundGrid): { trails: Trail[]; rings: Ring[] } {
  const r = new Randomizer(plan.seed);
  const trails: Trail[] = [];
  const rings: Ring[] = [];
  const margin = 0.03;
  const minX = grid.x0 + grid.nx * grid.cellX * margin;
  const maxX = grid.x0 + grid.nx * grid.cellX * (1 - margin);
  const minZ = grid.z0 + grid.nz * grid.cellZ * margin;
  const maxZ = grid.z0 + grid.nz * grid.cellZ * (1 - margin);
  const inside = (x: number, z: number) => x > minX && x < maxX && z > minZ && z < maxZ;
  const height = (x: number, z: number) => gridHeight(grid, x, z);
  const nearest = (x: number, z: number) => plan.sites.reduce((best, site) => Math.min(best, Math.max(0, hypot(x - site.x, z - site.z) - site.size)), Infinity);
  /** How strongly a trace shows where it starts: fainter far from every site. */
  const weathering = plan.weathering ?? 0;
  const strengthAt = (x: number, z: number) => {
    const near = plan.sites.length ? exp(-nearest(x, z) / (3 * KM)) : 0;
    return (plan.sites.length ? 0.55 + 0.45 * near : 0.7) * (1 - weathering * (1 - near)) * r.range(0.75, 1);
  };

  /** A walk from (x, z) heading `heading` for `length` units in steps of `step`, its heading wandering by up to `wander` a step and turned towards `toward` if given; it turns off a slope too steep for `kind` and stops where it finds no way or leaves the ground. */
  const walk = (kind: TraceKind, x: number, z: number, heading: number, length: number, step: number, wander: number, toward?: { x: number; z: number; pull: number }): number[] => {
    const points = [x, z];
    const limit = TRACE_KINDS[kind].slope;
    for (let s = 0; s < length; s += step) {
      heading += r.range(-1, 1) * wander;
      if (toward) {
        const want = atan2(toward.z - z, toward.x - x);
        let turn = want - heading;
        turn -= TAU * Math.round(turn / TAU);
        heading += turn * toward.pull;
        if (hypot(toward.x - x, toward.z - z) < step * 2) break;
      }
      let moved = false;
      for (const dodge of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2]) {
        const nx = x + cos(heading + dodge) * step;
        const nz = z + sin(heading + dodge) * step;
        if (!inside(nx, nz)) continue;
        if (Math.abs(height(nx, nz) - height(x, z)) > limit * step) continue;
        heading += dodge;
        x = nx;
        z = nz;
        moved = true;
        break;
      }
      if (!moved) break;
      points.push(x, z);
    }
    return points;
  };
  /** A trail as laid, broken off wherever a stretch of it is too steep for its kind (a loop, a way beside another, a place's own way). */
  const add = (kind: TraceKind, points: number[], strength: number, width = TRACE_KINDS[kind].width) => {
    const limit = TRACE_KINDS[kind].slope;
    let piece: number[] = points.slice(0, 2);
    const finish = () => {
      if (piece.length >= 4) trails.push({ kind, points: piece, width, strength });
    };
    for (let i = 2; i + 1 < points.length; i += 2) {
      const run = hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
      if (Math.abs(height(points[i], points[i + 1]) - height(points[i - 2], points[i - 1])) > limit * run) {
        finish();
        piece = [];
      }
      piece.push(points[i], points[i + 1]);
    }
    finish();
  };
  /** The same way driven again beside the first: shifted `offset` across, wandering a little apart. */
  const beside = (points: number[], offset: number): number[] => {
    const out: number[] = [];
    let drift = 0;
    for (let i = 0; i < points.length; i += 2) {
      const j = Math.min(points.length - 2, i + 2);
      const k = Math.max(0, i - 2);
      const dx = points[j] - points[k];
      const dz = points[j + 1] - points[k + 1];
      const length = hypot(dx, dz) || 1;
      drift = Math.min(1.5, Math.max(-1.5, drift + r.range(-0.15, 0.15)));
      const x = points[i] - (dz / length) * (offset + drift * M);
      const z = points[i + 1] + (dx / length) * (offset + drift * M);
      if (!inside(x, z)) break;
      out.push(x, z);
    }
    return out;
  };
  const prints = (x: number, z: number, heading: number, length: number, strength: number) => add('boots', walk('boots', x, z, heading, length, 30, 0.18), strength);
  const road = (kind: TraceKind, points: number[], strength: number, passes: number) => {
    add(kind, points, strength);
    for (let p = 1; p < passes; p++) add(kind, beside(points, (p % 2 ? 1 : -1) * Math.ceil(p / 2) * r.range(2.5, 6) * M), strength * r.range(0.7, 1));
  };
  const pick = (): TraceKind => {
    const k = r.nextFloat();
    return k < 0.55 ? 'rover' : k < 0.8 ? 'crawler' : 'sled';
  };
  /** A lander's blast ring at (x, z), its crew's prints walking off it. */
  const landing = (x: number, z: number, strength: number) => {
    const radius = r.range(12, 30) * M;
    rings.push({ x, z, radius, strength });
    const walkers = 3 + Math.floor(r.range(0, 4));
    for (let w = 0; w < walkers; w++) {
      const angle = r.range(0, TAU);
      prints(x + cos(angle) * radius * 0.7, z + sin(angle) * radius * 0.7, angle + r.range(-0.6, 0.6), (30 + 120 * r.nextFloat()) * M, strength);
    }
  };

  // the pairs of sites a road joins (the lower index times the count, plus the higher)
  const joined = new Set<number>();
  plan.sites.forEach((site, index) => {
    const { busy, size } = site;
    const edge = (angle: number, out = 0) => [site.x + cos(angle) * (size + out), site.z + sin(angle) * (size + out)] as const;
    // roads out into the land
    const spokes = 3 + Math.round(5 * busy);
    for (let k = 0; k < spokes; k++) {
      const angle = ((k + r.range(-0.3, 0.3)) / spokes) * TAU;
      const [x, z] = edge(angle);
      const kind = pick();
      road(kind, walk(kind, x, z, angle + r.range(-0.3, 0.3), r.range(1, 4) * KM * (0.5 + busy), 10 * M, 0.08), strengthAt(x, z), 1 + Math.floor(r.nextFloat() * 3 * busy));
    }
    // loops round it
    const loops = 2 + Math.round(4 * busy);
    for (let k = 0; k < loops; k++) {
      const radius = size * r.range(1.15, 2.2) + r.range(20, 80) * M;
      const start = r.range(0, TAU);
      const turn = r.range(0.5, 1) * TAU;
      const points: number[] = [];
      for (let t = 0; t <= turn; t += (10 * M) / radius) {
        const wobble = 1 + 0.08 * sin(3 * t + start) + 0.05 * sin(7 * t);
        const x = site.x + cos(start + t) * radius * wobble;
        const z = site.z + sin(start + t) * radius * wobble;
        if (!inside(x, z)) break;
        points.push(x, z);
      }
      add('rover', points, strengthAt(site.x, site.z));
    }
    // the people on foot round its edge
    const walkers = 8 + Math.round(30 * busy);
    for (let k = 0; k < walkers; k++) {
      const angle = r.range(0, TAU);
      const [x, z] = edge(angle, r.range(0, 40) * M);
      const length = (20 + 280 * r.nextFloat() * r.nextFloat()) * M;
      prints(x, z, angle + r.range(-1.2, 1.2), length, strengthAt(x, z));
    }
    // its landers
    for (let k = 0; k < (site.pads ?? 0); k++) {
      const angle = r.range(0, TAU);
      const [x, z] = edge(angle, r.range(100, 400) * M);
      if (!inside(x, z)) continue;
      landing(x, z, strengthAt(x, z));
      road('rover', walk('rover', x, z, angle + Math.PI, KM, 10 * M, 0.05, { x: site.x, z: site.z, pull: 0.2 }), strengthAt(x, z), 1);
    }
    // ships that slid in
    const slides = 1 + Math.round(2 * busy);
    for (let k = 0; k < slides; k++) {
      const angle = r.range(0, TAU);
      const [x, z] = edge(angle, r.range(100, 800) * M);
      add('slide', walk('slide', x, z, r.range(0, TAU), r.range(60, 250) * M, 5 * M, 0.01), strengthAt(x, z), r.range(160, 280));
    }
    // a road to the nearest other site a vehicle can reach, unless the two are joined already:
    // the way is searched round whatever stands between (along a rift's rim to a valley head and
    // down it), and a road that cannot arrive is never laid, since nobody drives one that leads
    // nowhere; the next nearest is tried instead, and a site no vehicle can leave for any other
    // keeps only its roads out into the land
    const others = plan.sites
      .map((_, j) => j)
      .filter((j) => j !== index)
      .sort((a, b) => hypot(plan.sites[a].x - site.x, plan.sites[a].z - site.z) - hypot(plan.sites[b].x - site.x, plan.sites[b].z - site.z));
    const kind = r.nextFloat() < 0.7 ? 'rover' : 'crawler';
    const passes = 2 + Math.floor(r.range(0, 2));
    for (const other of others) {
      const pair = Math.min(index, other) * plan.sites.length + Math.max(index, other);
      if (joined.has(pair)) break;
      const to = plan.sites[other];
      const [x, z] = edge(atan2(to.z - site.z, to.x - site.x));
      const points = routeRoad(x, z, to.x, to.z, to.size, TRACE_KINDS[kind].slope, inside, height);
      if (!points) continue;
      joined.add(pair);
      road(kind, points, strengthAt(x, z), passes);
      break;
    }
  });

  // a place's own ways, a point every 10 m so a steep stretch along them is found
  for (const way of plan.ways ?? []) {
    const points: number[] = [];
    for (let i = 0; i + 3 < way.points.length; i += 2) {
      const [ax, az, bx, bz] = [way.points[i], way.points[i + 1], way.points[i + 2], way.points[i + 3]];
      const steps = Math.max(1, Math.ceil(hypot(bx - ax, bz - az) / (10 * M)));
      for (let s = i ? 1 : 0; s <= steps; s++) points.push(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
    }
    road(way.kind, points, r.range(0.85, 1), way.passes);
  }

  // the wilds: a place far from every site, where nobody walks a trace again
  const aged = 1 - weathering;
  const far = (): [number, number] | null => {
    for (let k = 0; k < 30; k++) {
      const x = r.range(minX, maxX);
      const z = r.range(minZ, maxZ);
      if (!plan.sites.length || nearest(x, z) > 2 * KM) return [x, z];
    }
    return null;
  };
  for (let k = 0; k < (plan.wilds ?? 3); k++) {
    const at = far();
    if (at) prints(at[0], at[1], r.range(0, TAU), r.range(0.4, 2) * KM, aged * r.range(0.6, 0.9));
  }
  for (let k = 0; k < (plan.landings ?? 1); k++) {
    const at = far();
    if (!at) continue;
    landing(at[0], at[1], aged * r.range(0.6, 0.9));
    add('rover', walk('rover', at[0] + 40 * M, at[1], r.range(0, TAU), r.range(0.3, 1.2) * KM, 10 * M, 0.12), aged * r.range(0.6, 0.9));
  }
  return { trails, rings };
}

/**
 * The values each corner of a piece of a trace carries while it is cut (see drapeTriangle): its
 * x and z in the ground's frame (units), then the atlas's u and v, the strength and the width.
 */
export const STRIDE = 6;
/** A triangle cut by a face's three edges keeps at most six corners: room for them as the cuts go. */
const MOST_CORNERS = 8;
const cutA = new Float64Array(MOST_CORNERS * STRIDE);
const cutB = new Float64Array(MOST_CORNERS * STRIDE);
/** A piece of a trace smaller than this (units², a square of 1 cm) is a sliver a cut left on an edge: dropped. */
const SLIVER = 0.04;

/** Which face of `grid` a point lies in: its cell's index, twice over, and one more for the cell's upper face (b, c, d). */
function faceOf(grid: GroundGrid, x: number, z: number): number {
  const gx = Math.min(grid.nx - 1e-9, Math.max(0, (x - grid.x0) / grid.cellX));
  const gz = Math.min(grid.nz - 1e-9, Math.max(0, (z - grid.z0) / grid.cellZ));
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  return (iz * grid.nx + ix) * 2 + (gx - ix + (gz - iz) > 1 ? 1 : 0);
}

/** Keeps of the convex polygon in `from` (`count` corners) what lies where a · gx + b · gz + c ≥ 0 (gx, gz its place on `grid` in cells), into `to`; returns its corners. */
function cut(grid: GroundGrid, from: Float64Array, count: number, to: Float64Array, a: number, b: number, c: number): number {
  let out = 0;
  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    const here = (a * (from[k * STRIDE] - grid.x0)) / grid.cellX + (b * (from[k * STRIDE + 1] - grid.z0)) / grid.cellZ + c;
    const there = (a * (from[next * STRIDE] - grid.x0)) / grid.cellX + (b * (from[next * STRIDE + 1] - grid.z0)) / grid.cellZ + c;
    if (here >= 0) {
      for (let v = 0; v < STRIDE; v++) to[out * STRIDE + v] = from[k * STRIDE + v];
      out++;
    }
    if (here >= 0 !== there >= 0) {
      const t = here / (here - there);
      for (let v = 0; v < STRIDE; v++) to[out * STRIDE + v] = from[k * STRIDE + v] + (from[next * STRIDE + v] - from[k * STRIDE + v]) * t;
      out++;
    }
  }
  return out;
}

/** The area (units²) of the polygon in `poly` with `count` corners. */
function area(poly: Float64Array, count: number): number {
  let sum = 0;
  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    sum += poly[k * STRIDE] * poly[next * STRIDE + 1] - poly[next * STRIDE] * poly[k * STRIDE + 1];
  }
  return Math.abs(sum) / 2;
}

/**
 * Cuts the triangle of a trace in `triangle` (three corners of STRIDE values) at every edge of
 * `grid`'s faces (the grid's lines and each cell's diagonal), handing each piece, a convex polygon
 * lying in one face, to `emit` with its corners and the cell it lies in. A triangle within one face
 * goes whole. Every corner then lies on the face as drawn, and so does every point between them.
 */
export function drapeTriangle(grid: GroundGrid, triangle: Float64Array, emit: (piece: Float64Array, count: number, ix: number, iz: number) => void) {
  const face = faceOf(grid, triangle[0], triangle[1]);
  if (faceOf(grid, triangle[STRIDE], triangle[STRIDE + 1]) === face && faceOf(grid, triangle[2 * STRIDE], triangle[2 * STRIDE + 1]) === face) {
    const cell = face >> 1;
    emit(triangle, 3, cell % grid.nx, Math.floor(cell / grid.nx));
    return;
  }
  let [gx0, gx1, gz0, gz1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let k = 0; k < 3; k++) {
    const gx = (triangle[k * STRIDE] - grid.x0) / grid.cellX;
    const gz = (triangle[k * STRIDE + 1] - grid.z0) / grid.cellZ;
    [gx0, gx1, gz0, gz1] = [Math.min(gx0, gx), Math.max(gx1, gx), Math.min(gz0, gz), Math.max(gz1, gz)];
  }
  const [ix0, ix1] = [Math.max(0, Math.floor(gx0)), Math.min(grid.nx - 1, Math.floor(gx1))];
  const [iz0, iz1] = [Math.max(0, Math.floor(gz0)), Math.min(grid.nz - 1, Math.floor(gz1))];
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      // the lower face (a, b, d): right of the cell's left line, above its first row, below its diagonal; the upper (b, c, d) the other way round
      for (const upper of [false, true]) {
        const s = upper ? -1 : 1;
        cutA.set(triangle.subarray(0, 3 * STRIDE));
        let count = cut(grid, cutA, 3, cutB, s, 0, upper ? ix + 1 : -ix);
        if (count >= 3) count = cut(grid, cutB, count, cutA, 0, s, upper ? iz + 1 : -iz);
        if (count >= 3) count = cut(grid, cutA, count, cutB, -s, -s, upper ? -(1 + ix + iz) : 1 + ix + iz);
        if (count >= 3 && area(cutB, count) > SLIVER) emit(cutB, count, ix, iz);
      }
    }
  }
}

/** One chunk's buffers as they grow: the pieces of the traces lying on one tile of the ground. */
class ChunkBuilder {
  readonly position: number[] = [];
  readonly uv: number[] = [];
  readonly trace: number[] = [];
  readonly coarse: number[] = [];
  readonly index: number[] = [];
  /** The widest strip in the chunk (units): how far it shows (see TraceChunk). */
  widest = 0;
}

/** The traces' pieces sorted into the chunks of a ground: one per tile (see world/groundlod, TILE), the wide traces and the fine ones apart. */
class TraceBuilder {
  readonly chunks = new Map<number, { wide: ChunkBuilder; fine: ChunkBuilder }>();
  private readonly tilesX: number;
  private readonly corners = new Float64Array(4 * STRIDE);
  private readonly triangle = new Float64Array(3 * STRIDE);
  private fine = false;

  /** `tiled` whether the ground is drawn in tiles of levels (see world/groundlod, tiledGround), which the traces follow. */
  constructor(
    private readonly grid: GroundGrid,
    private readonly tiled: boolean,
  ) {
    this.tilesX = Math.ceil(grid.nx / TILE);
  }

  private readonly emit = (piece: Float64Array, count: number, ix: number, iz: number) => {
    const key = Math.floor(iz / TILE) * this.tilesX + Math.floor(ix / TILE);
    let chunk = this.chunks.get(key);
    if (!chunk) this.chunks.set(key, (chunk = { wide: new ChunkBuilder(), fine: new ChunkBuilder() }));
    const into = this.fine ? chunk.fine : chunk.wide;
    const first = into.position.length / 3;
    const { grid } = this;
    for (let k = 0; k < count; k++) {
      const o = k * STRIDE;
      const [x, z] = [piece[o], piece[o + 1]];
      const y = gridHeight(grid, x, z);
      into.position.push(x, y, z);
      into.uv.push(piece[o + 2], piece[o + 3]);
      into.trace.push(piece[o + 4], piece[o + 5]);
      into.widest = Math.max(into.widest, piece[o + 5]);
      // how far each coarser level of the tile lies from the finest here: within one finest face
      // the coarse faces are planes too, so the strip lies on whichever level is drawn
      if (this.tiled) for (let level = 1; level < STEPS.length; level++) into.coarse.push(levelHeight(grid, level, x, z) - y);
    }
    for (let k = 1; k + 1 < count; k++) into.index.push(first, first + k, first + k + 1);
  };

  /** A quad of a strip, its corners in `corners` (one side, the other, the other on, the one on): whole when it lies in one face, else its two triangles cut at the faces' edges. */
  private quad(fine: boolean) {
    this.fine = fine;
    const { grid, corners, triangle } = this;
    const face = faceOf(grid, corners[0], corners[1]);
    if (faceOf(grid, corners[STRIDE], corners[STRIDE + 1]) === face && faceOf(grid, corners[2 * STRIDE], corners[2 * STRIDE + 1]) === face && faceOf(grid, corners[3 * STRIDE], corners[3 * STRIDE + 1]) === face) {
      // as two triangles (0, 1, 3) and (1, 2, 3), the same as cut
      const cell = face >> 1;
      triangle.set(corners.subarray(0, 2 * STRIDE));
      triangle.set(corners.subarray(3 * STRIDE, 4 * STRIDE), 2 * STRIDE);
      this.emit(triangle, 3, cell % grid.nx, Math.floor(cell / grid.nx));
      triangle.set(corners.subarray(STRIDE, 4 * STRIDE));
      this.emit(triangle, 3, cell % grid.nx, Math.floor(cell / grid.nx));
      return;
    }
    triangle.set(corners.subarray(0, 2 * STRIDE));
    triangle.set(corners.subarray(3 * STRIDE, 4 * STRIDE), 2 * STRIDE);
    drapeTriangle(grid, triangle, this.emit);
    triangle.set(corners.subarray(STRIDE, 4 * STRIDE));
    drapeTriangle(grid, triangle, this.emit);
  }

  /** Sets corner `k` of the quad. */
  private corner(k: number, x: number, z: number, u: number, v: number, strength: number, width: number) {
    const o = k * STRIDE;
    const { corners } = this;
    corners[o] = x;
    corners[o + 1] = z;
    corners[o + 2] = u;
    corners[o + 3] = v;
    corners[o + 4] = strength;
    corners[o + 5] = width;
  }

  /** A trail along its middle line: a quad from each of its points to the next, across it square to its way (the mean of the two segments' directions at a point). */
  trail({ kind, points, width, strength }: Trail, shift: number) {
    const { tile, fine } = TRACE_KINDS[kind];
    const count = points.length / 2;
    const side = (i: number): [number, number] => {
      const j = Math.min(count - 1, i + 1);
      const k = Math.max(0, i - 1);
      const dx = points[j * 2] - points[k * 2];
      const dz = points[j * 2 + 1] - points[k * 2 + 1];
      const length = hypot(dx, dz) || 1;
      return [-dz / length, dx / length];
    };
    let along = shift;
    for (let i = 0; i + 1 < count; i++) {
      const [ax, az, bx, bz] = [points[i * 2], points[i * 2 + 1], points[i * 2 + 2], points[i * 2 + 3]];
      const [sx, sz] = side(i);
      const [tx, tz] = side(i + 1);
      const next = along + hypot(bx - ax, bz - az);
      const half = width / 2;
      this.corner(0, ax - sx * half, az - sz * half, atlasU(kind, 0), along / tile, strength, width);
      this.corner(1, ax + sx * half, az + sz * half, atlasU(kind, 1), along / tile, strength, width);
      this.corner(2, bx + tx * half, bz + tz * half, atlasU(kind, 1), next / tile, strength, width);
      this.corner(3, bx - tx * half, bz - tz * half, atlasU(kind, 0), next / tile, strength, width);
      this.quad(fine);
      along = next;
    }
  }

  /** A blast ring: rings of quads round it, a fifth of its radius apart from its middle out, a quarter of the pattern's tile every quarter turn. */
  ring({ x, z, radius, strength }: Ring) {
    const spokes = 48;
    const rows = 5;
    for (let s = 0; s < spokes; s++) {
      const [a0, a1] = [(s / spokes) * TAU, ((s + 1) / spokes) * TAU];
      const [c0, s0, c1, s1] = [cos(a0), sin(a0), cos(a1), sin(a1)];
      for (let k = 0; k < rows; k++) {
        const [r0, r1] = [k / rows, (k + 1) / rows];
        this.corner(0, x + c0 * r0 * radius, z + s0 * r0 * radius, atlasU('blast', r0), (s / spokes) * 4, strength, radius);
        this.corner(1, x + c0 * r1 * radius, z + s0 * r1 * radius, atlasU('blast', r1), (s / spokes) * 4, strength, radius);
        this.corner(2, x + c1 * r1 * radius, z + s1 * r1 * radius, atlasU('blast', r1), ((s + 1) / spokes) * 4, strength, radius);
        this.corner(3, x + c1 * r0 * radius, z + s1 * r0 * radius, atlasU('blast', r0), ((s + 1) / spokes) * 4, strength, radius);
        this.quad(false);
      }
    }
  }
}

/** A chunk's geometry, or null when it holds nothing. */
function chunkGeometry(chunk: ChunkBuilder): THREE.BufferGeometry | null {
  if (!chunk.index.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(chunk.position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(chunk.uv, 2));
  geometry.setAttribute('trace', new THREE.Float32BufferAttribute(chunk.trace, 2));
  if (chunk.coarse.length) geometry.setAttribute('coarse', new THREE.Float32BufferAttribute(chunk.coarse, 4));
  geometry.setIndex(chunk.index);
  geometry.computeBoundingSphere();
  // the strip rises or sinks onto a coarser level by as much as its corners say
  let most = 0;
  for (const off of chunk.coarse) most = Math.max(most, Math.abs(off));
  geometry.boundingSphere!.radius += most;
  return geometry;
}

/** A ground's traces as built: each chunk's tile (its index among the ground's tiles), its geometries and the widest strip in each. */
export interface TraceChunkData {
  tile: number;
  wide: THREE.BufferGeometry | null;
  fine: THREE.BufferGeometry | null;
  widest: { wide: number; fine: number };
}

/** The traces' geometries over `grid` as `plan` lays them (see layTraces), in chunks by the ground's tiles; `tiled` whether the ground is drawn in tiles of levels, whose levels the traces follow. */
export function traceChunks(plan: TracePlan, grid: GroundGrid, tiled: boolean): TraceChunkData[] {
  const { trails, rings } = layTraces(plan, grid);
  const builder = new TraceBuilder(grid, tiled);
  const r = new Randomizer(plan.seed + 1);
  for (const trail of trails) builder.trail(trail, r.range(0, TRACE_KINDS[trail.kind].tile));
  for (const ring of rings) builder.ring(ring);
  return [...builder.chunks].map(([tile, { wide, fine }]) => ({ tile, wide: chunkGeometry(wide), fine: chunkGeometry(fine), widest: { wide: wide.widest, fine: fine.widest } }));
}

const sphere = new THREE.Sphere();
const eye = new THREE.Vector3();
/** The level each chunk of traces is drawn on: one of STEPS's, as a picker of the strip's `coarse` offsets (see the shader). */
const LEVELS = STEPS.map((_, level) => new THREE.Vector4(level === 1 ? 1 : 0, level === 2 ? 1 : 0, level === 3 ? 1 : 0, level === 4 ? 1 : 0));

/**
 * A chunk's strips of one kind (wide or fine) as drawn: before each draw the atlas and the
 * picture's height (see prepare), and the level its tile of the ground draws now (`userData.tile`,
 * its index among the ground's children, which the chunk's traces follow; −1 for a ground drawn
 * whole). A class of its own so a clone of the ground keeps all of it.
 */
class TraceMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  override onBeforeRender(renderer: THREE.WebGLRenderer) {
    prepare(renderer);
    const tile = this.userData.tile as number;
    // the mesh, its chunk, the traces' group, the ground whose children the tiles are
    const level = tile >= 0 ? tileLevel(this.parent?.parent?.parent?.children[tile]) : 0;
    this.material.uniforms.level.value = LEVELS[level];
    this.material.uniformsNeedUpdate = true;
  }
}

/**
 * A chunk of traces: drawn only while its widest strip (`userData.widest`, units) would be wider
 * on screen than a strip fades in at, seen from the nearest point of its bounds; the material fades
 * every strip on its own (see the shader), this only spares the draw of what would show nothing.
 */
class TraceChunk extends THREE.LOD {
  override update(camera: THREE.Camera) {
    const mesh = this.children[0] as TraceMesh | undefined;
    if (!mesh) return;
    sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    const distance = Math.max(1, eye.setFromMatrixPosition(camera.matrixWorld).distanceTo(sphere.center) - sphere.radius);
    mesh.visible = ((this.userData.widest as number) * camera.projectionMatrix.elements[5] * picture.value * 0.5) / distance >= FADE_PX[0];
  }

  override copy(source: this, recursive?: boolean): this {
    // as any other object, its children with it (a LOD copies only its levels, which a chunk has none of)
    THREE.Object3D.prototype.copy.call(this, source, recursive);
    return this;
  }
}

/**
 * The traces of `plan` on the ground of `grid`, in the ground's frame (see traceChunks); `tiled`
 * whether the ground is drawn in tiles of levels (see world/groundlod, tiledGround), in which case
 * the group goes among the tiles' siblings, so each chunk finds its tile. The group also marks the
 * grid the ground is drawn on (see world/groundlod, drawnOn), for the ships' scrape marks.
 */
export function groundTraces(plan: TracePlan, grid: GroundGrid, tiled = false): THREE.Group {
  const look = materials();
  const group = drawnOn(new THREE.Group(), grid);
  for (const { tile, wide, fine, widest } of traceChunks(plan, grid, tiled)) {
    for (const [geometry, material, width] of [
      [wide, look.wide, widest.wide],
      [fine, look.fine, widest.fine],
    ] as const) {
      if (!geometry) continue;
      const mesh = new TraceMesh(geometry, material);
      mesh.userData.tile = tiled ? tile : -1;
      // they lie on ground that casts its own shadow
      mesh.userData.shadowless = true;
      mesh.castShadow = false;
      mesh.renderOrder = TRACE_ORDER;
      const chunk = new TraceChunk();
      chunk.userData.widest = width;
      chunk.add(mesh);
      group.add(chunk);
    }
  }
  return group;
}

/** How many triangles of scrape marks are kept, the oldest overwritten first; a mark fades out (see SCRAPE_KEEP) before its place is taken. */
export const SCRAPE_TRIANGLES = 8192;
/** The most triangles one stretch of a mark is cut into on the ground's faces (a stretch is at most SCRAPE_JUMP long, the faces at least 25 m across: a few dozen at most). */
const SCRAPE_STRETCH_MOST = 64;
/** A mark has faded out once this many triangles were laid after it, before its place in the buffer is taken. */
export const SCRAPE_KEEP = SCRAPE_TRIANGLES - SCRAPE_STRETCH_MOST;
/** How wide a mark is (units, 6 m: the plates of a hull's belly on the ground). */
export const SCRAPE_WIDTH = 120;
/**
 * A mark's next stretch goes on once the hull moved SCRAPE_STEP (units, 1.5 m) on the ground and
 * SCRAPE_TICK (s) after the last: at most ten stretches a second a hull, a few triangles each, so
 * SCRAPE_TRIANGLES hold about SCRAPE_LIFE of a hull gliding all the time. It starts anew after a
 * gap of SCRAPE_GAP (s) or a jump farther than SCRAPE_JUMP (units, 40 m).
 */
const SCRAPE_STEP = 30;
export const SCRAPE_TICK = 0.1;
const SCRAPE_GAP = 0.3;
const SCRAPE_JUMP = 800;

/** A ground as a scrape mark is laid on it (see AsteroidField, drawnGround): its grid and the matrices between the grid's frame and the world. */
export interface ScrapeGround {
  grid: GroundGrid;
  toWorld: THREE.Matrix4;
  fromWorld: THREE.Matrix4;
}

/** Where a hull's mark goes on from: the last point and the direction across there (world), how far along its pattern, when it last touched, when it last laid a stretch. */
interface MarkEnd {
  point: THREE.Vector3;
  across: THREE.Vector3;
  along: number;
  time: number;
  laid: number;
}

const direction = new THREE.Vector3();
const across = new THREE.Vector3();
const corner = new THREE.Vector3();
/** A stretch's four corners (see ScrapeMarks.add) and one of its two triangles, (0, 1, 3) and (1, 2, 3), as the strips' quads are split. */
const stretch = new Float64Array(4 * STRIDE);
const scrapeTriangle = new Float64Array(3 * STRIDE);
const HALVES = [
  [0, 1, 3],
  [1, 2, 3],
] as const;
const UPLOADED = ['position', 'uv', 'age'] as const;

/**
 * The marks a ship's hull leaves where it glides on a world's ground (see world/hover, glide):
 * a scar SCRAPE_WIDTH wide in the slid ship's pattern under the hull along its way, cut at the
 * edges of the ground's faces and laid on the ground as drawn (see drapeTriangle), fading out over
 * SCRAPE_LIFE; every ship's marks in one buffer of SCRAPE_TRIANGLES triangles, one draw call. A
 * mark fades out sooner, alike, once newer marks come to take its place. Looks only: each browser
 * lays them itself, for the ships it runs and those it follows alike.
 */
export class ScrapeMarks {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(SCRAPE_TRIANGLES * 3 * 3);
  private readonly uvs = new Float32Array(SCRAPE_TRIANGLES * 3 * 2);
  /** Each vertex's time it was laid (s) and the count of triangles laid before it (see head). */
  private readonly ages = new Float32Array(SCRAPE_TRIANGLES * 3 * 2).fill(-1e9);
  private last = new WeakMap<object, MarkEnd>();
  private shown = true;
  /** The stretch being laid: its ground, the triangles laid before it, its time. */
  private ground: ScrapeGround | null = null;
  private start = 0;
  private time = 0;

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('age', new THREE.BufferAttribute(this.ages, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('trace', new THREE.BufferAttribute(new Float32Array(SCRAPE_TRIANGLES * 3 * 2).map((_, i) => (i % 2 ? SCRAPE_WIDTH : 1)), 2));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, materials().scrape);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = TRACE_ORDER;
    this.mesh.onBeforeRender = prepare;
    this.mesh.visible = false;
    // the scrape marks' material is shared, and with it the count of triangles laid: one set of marks at a time
    head.value = 0;
  }

  /** Whether marks are drawn in this arena: on airless ground only, as the traces people left lie there alone. */
  set enabled(shown: boolean) {
    this.shown = shown;
    this.mesh.visible = shown && head.value > 0;
  }

  get enabled(): boolean {
    return this.shown;
  }

  /**
   * The hull `key` glides at `point` on the ground (its outward `normal` there) at time `time` (s),
   * on the drawn `ground` if it has one (else the mark lies flat through the point, on a box's
   * top): the mark goes on from where it was last.
   */
  add(key: object, point: THREE.Vector3, normal: THREE.Vector3, time: number, ground: ScrapeGround | null) {
    now.value = time;
    let last = this.last.get(key);
    if (!last) this.last.set(key, (last = { point: point.clone(), across: new THREE.Vector3(), along: 0, time: -Infinity, laid: -Infinity }));
    const distance = last.point.distanceTo(point);
    if (time - last.time > SCRAPE_GAP || distance > SCRAPE_JUMP) {
      last.point.copy(point);
      last.across.set(0, 0, 0);
      last.along = 0;
      last.time = last.laid = time;
      return;
    }
    last.time = time;
    if (distance < SCRAPE_STEP || time - last.laid < SCRAPE_TICK) return;
    direction.subVectors(point, last.point);
    // square to the way: on a drawn ground level in its grid's frame, else in the ground's plane
    if (ground) {
      direction.transformDirection(ground.fromWorld);
      across.set(-direction.z, 0, direction.x).transformDirection(ground.toWorld);
    } else across.crossVectors(normal, direction).normalize();
    across.multiplyScalar(SCRAPE_WIDTH / 2);
    // a mark's first stretch starts square to its way
    if (last.across.lengthSq() === 0) last.across.copy(across);
    const along = last.along + distance / TRACE_KINDS.slide.tile;
    // the stretch's corners: one side and the other where it was, the other and the one side here
    this.corner(0, last.point, last.across, -1, last.along, ground);
    this.corner(1, last.point, last.across, 1, last.along, ground);
    this.corner(2, point, across, 1, along, ground);
    this.corner(3, point, across, -1, along, ground);
    this.ground = ground;
    this.start = head.value;
    this.time = time;
    for (const [a, b, c] of HALVES) {
      scrapeTriangle.set(stretch.subarray(a * STRIDE, a * STRIDE + STRIDE), 0);
      scrapeTriangle.set(stretch.subarray(b * STRIDE, b * STRIDE + STRIDE), STRIDE);
      scrapeTriangle.set(stretch.subarray(c * STRIDE, c * STRIDE + STRIDE), 2 * STRIDE);
      if (ground) drapeTriangle(ground.grid, scrapeTriangle, this.lay);
      else this.lay(scrapeTriangle, 3);
    }
    this.upload(this.start);
    last.point.copy(point);
    last.across.copy(across);
    last.along = along;
    last.laid = time;
  }

  /**
   * Corner `k` of the stretch: `side` off `at` by `sign`, `v` along the pattern. On a drawn ground
   * its x and z in the grid's frame; on a flat top its world x, y and z in the first, second and
   * fifth values (the strength's place, which a mark keeps constant in its `trace`).
   */
  private corner(k: number, at: THREE.Vector3, side: THREE.Vector3, sign: number, v: number, ground: ScrapeGround | null) {
    const o = k * STRIDE;
    corner.copy(at).addScaledVector(side, sign);
    if (ground) corner.applyMatrix4(ground.fromWorld);
    stretch[o] = corner.x;
    stretch[o + 1] = ground ? corner.z : corner.y;
    stretch[o + 2] = atlasU('slide', sign < 0 ? 0 : 1);
    stretch[o + 3] = v;
    stretch[o + 4] = corner.z;
    stretch[o + 5] = SCRAPE_WIDTH;
  }

  /** A piece of the stretch into the buffer, fanned into triangles: on its ground its corners at the grid's height taken into the world, on a flat top as they are (see corner). */
  private readonly lay = (piece: Float64Array, count: number) => {
    const { ground } = this;
    for (let k = 1; k + 1 < count && head.value - this.start < SCRAPE_STRETCH_MOST; k++) {
      const slot = head.value % SCRAPE_TRIANGLES;
      for (let n = 0; n < 3; n++) {
        const o = (n === 0 ? 0 : n === 1 ? k : k + 1) * STRIDE;
        const i = slot * 3 + n;
        if (ground) corner.set(piece[o], gridHeight(ground.grid, piece[o], piece[o + 1]), piece[o + 1]).applyMatrix4(ground.toWorld);
        else corner.set(piece[o], piece[o + 1], piece[o + 4]);
        corner.toArray(this.positions, i * 3);
        this.uvs[i * 2] = piece[o + 2];
        this.uvs[i * 2 + 1] = piece[o + 3];
        this.ages[i * 2] = this.time;
        this.ages[i * 2 + 1] = head.value;
      }
      head.value++;
    }
  };

  /** Uploads the triangles laid since `start`, only those (one range, or two where they wrap round the buffer's end). */
  private upload(start: number) {
    const count = head.value - start;
    if (!count) return;
    const first = start % SCRAPE_TRIANGLES;
    const tail = Math.min(count, SCRAPE_TRIANGLES - first);
    for (const name of UPLOADED) {
      const attribute = this.geometry.getAttribute(name) as THREE.BufferAttribute;
      const size = attribute.itemSize * 3;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(first * size, tail * size);
      if (count > tail) attribute.addUpdateRange(0, (count - tail) * size);
      attribute.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, Math.min(head.value, SCRAPE_TRIANGLES) * 3);
    this.mesh.visible = this.shown;
  }

  /** The frame's time (s), for the marks' fading. */
  update(time: number) {
    now.value = time;
  }

  /** Every mark gone: a new arena. */
  clear() {
    this.ages.fill(-1e9);
    const age = this.geometry.getAttribute('age') as THREE.BufferAttribute;
    age.clearUpdateRanges();
    age.needsUpdate = true;
    this.geometry.setDrawRange(0, 0);
    this.last = new WeakMap();
    head.value = 0;
    this.mesh.visible = false;
  }
}

/**
 * The fine dust and the bare rock of a ground, as patches far larger than its tiles: a tiling
 * texture of PATCH_SIZE² texels of smooth value noise (two octaves on lattices of 8 and 16 that
 * wrap, see world/rocks, tileNoise), which world/boneyard's groundMaterial reads twice at scales
 * that never line up (DUST_PATCH_TILE and DUST_PATCH_TILE_2, turned against each other) and sums
 * as patchAt does.
 */
export const PATCH_SIZE = 128;
/** The patches' two tiles (units, 2.4 km and 870 m), the second turned by PATCH_TURN (rad) and shifted by PATCH_SHIFT of a tile. */
export const DUST_PATCH_TILE = 48000;
export const DUST_PATCH_TILE_2 = 17400;
export const PATCH_TURN = 0.6435;
export const PATCH_SHIFT = 0.37;
/** Where the summed patches are fine dust (from FINE_DUST[0], fully at [1]) and bare rock (from BARE_ROCK[0] down, fully at [1]). */
export const FINE_DUST = [0.54, 0.64] as const;
export const BARE_ROCK = [0.46, 0.38] as const;

/** The patches' texels (one byte each). */
export function dustPatches(): Uint8Array {
  const data = new Uint8Array(PATCH_SIZE * PATCH_SIZE);
  // a texel's middle on the detail tile tileNoise wraps over
  const at = (i: number) => ((i + 0.5) / PATCH_SIZE) * DETAIL_RES;
  for (let j = 0; j < PATCH_SIZE; j++) {
    for (let i = 0; i < PATCH_SIZE; i++) {
      const value = 0.65 * tileNoise(at(i), at(j), 8, 4110) + 0.35 * tileNoise(at(i), at(j), 16, 4111);
      data[j * PATCH_SIZE + i] = Math.round((0.5 + 0.5 * value) * 255);
    }
  }
  return data;
}

/** A texture's texel read as the GPU reads it with linear filtering and repeat wrapping: `data` one byte a texel, `width` × `height`, at texture coordinates (u, v). */
export function sampleRepeat(data: Uint8Array, width: number, height: number, u: number, v: number): number {
  const x = u * width - 0.5;
  const y = v * height - 0.5;
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - ix, y - iy];
  const at = (a: number, b: number) => data[(((b % height) + height) % height) * width + (((a % width) + width) % width)] / 255;
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx;
  return top + (bottom - top) * fy;
}

/** The patches at a ground's (x, z) (units) as groundMaterial's shader sums them: 0 bare rock to 1 fine dust (see FINE_DUST, BARE_ROCK). */
export function patchAt(data: Uint8Array, x: number, z: number): number {
  const c = cos(PATCH_TURN);
  const s = sin(PATCH_TURN);
  const first = sampleRepeat(data, PATCH_SIZE, PATCH_SIZE, x / DUST_PATCH_TILE, z / DUST_PATCH_TILE);
  const second = sampleRepeat(data, PATCH_SIZE, PATCH_SIZE, (c * x - s * z) / DUST_PATCH_TILE_2 + PATCH_SHIFT, (s * x + c * z) / DUST_PATCH_TILE_2 + PATCH_SHIFT);
  return first * 0.62 + second * 0.38;
}

let patches: THREE.DataTexture | null = null;
/** The patches as a texture, made once (see dustPatches). */
export function dustPatchTexture(): THREE.DataTexture {
  if (patches) return patches;
  patches = new THREE.DataTexture(dustPatches(), PATCH_SIZE, PATCH_SIZE, THREE.RedFormat, THREE.UnsignedByteType);
  patches.wrapS = patches.wrapT = THREE.RepeatWrapping;
  patches.magFilter = THREE.LinearFilter;
  patches.minFilter = THREE.LinearMipmapLinearFilter;
  patches.generateMipmaps = true;
  patches.needsUpdate = true;
  return patches;
}

/**
 * The patches in groundMaterial's fragment shader, after the dust's map is read (`middleValue`
 * the photograph's value already doubled, changed in place; PLAIN_DUST the dust's own tone without
 * its grit and pebbles, as linear light): in fine dust the
 * pebbles and the photograph's relief smoothed away and the ground a little darker, as mature
 * fine dust is; on bare rock the photograph's relief stronger and the ground a little brighter.
 */
export const PATCH_GLSL = `
  vec2 groundAt = vMapUv * GROUND_DUST_TILE;
  mat2 patchTurn = mat2(${cos(PATCH_TURN).toFixed(5)}, ${sin(PATCH_TURN).toFixed(5)}, ${(-sin(PATCH_TURN)).toFixed(5)}, ${cos(PATCH_TURN).toFixed(5)});
  float patchValue = texture2D(dustPatchMap, groundAt / ${DUST_PATCH_TILE.toFixed(1)}).r * 0.62 + texture2D(dustPatchMap, patchTurn * groundAt / ${DUST_PATCH_TILE_2.toFixed(1)} + ${PATCH_SHIFT}).r * 0.38;
  float fineDust = smoothstep(${FINE_DUST[0]}, ${FINE_DUST[1]}, patchValue);
  float bareRock = smoothstep(${BARE_ROCK[0]}, ${BARE_ROCK[1]}, patchValue);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * PLAIN_DUST, fineDust * 0.75);
  middleValue = mix(middleValue, vec3(1.0), fineDust * 0.6);
  middleValue = mix(middleValue, 1.0 + (middleValue - 1.0) * 1.35, bareRock);
  middleValue *= 1.0 - 0.1 * fineDust + 0.1 * bareRock;`;
