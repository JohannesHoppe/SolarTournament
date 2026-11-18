import * as THREE from 'three';
import { atan2, cos, exp, hypot, sin } from '../detmath';
import { Randomizer } from '../random';
import { gridHeight, type GroundGrid } from './groundlod';

/**
 * What people left on an airless world's ground: in vacuum nothing blows a print away, so every
 * bootprint of a suit, every rover's and crawler's track, a sled's ruts, the scar of a ship that
 * slid along and the ring a lander's plume swept clear stay for millennia. They lie thick round
 * the depots, stations and claims people have worked at for centuries and thin out into the wilds,
 * where now and then a lone line of prints runs far out. Looks only: never collided with, never
 * shared, laid from the place's seed so every visit finds them where they were.
 *
 * Each trace is a strip lying on the ground as its finest level draws it (see world/groundlod,
 * gridHeight), a vertex wherever the strip's middle crosses an edge of the ground's faces, so it
 * bends with them; it reads its pattern from one baked atlas (see traceAtlas) and multiplies the
 * ground already drawn under it by twice that pattern's value (0.5 leaves the ground as it is),
 * so the ground's own light, shadow and color stay and a print only darkens or brightens them.
 * A strip fades out where it would be narrower than a few pixels on screen, so a line of prints
 * never shimmers in the distance. The wide traces (tracks, ruts of crawlers, scars and blast
 * rings) are one draw call, the fine ones (bootprints, sled runners) another; the cheaper rungs of
 * the picture's quality drop the fine ones first (see setTraceDetail).
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
 */
export const TRACE_KINDS: Readonly<Record<TraceKind, { column: number; width: number; tile: number; fine: boolean; slope: number }>> = {
  boots: { column: 0, width: 14, tile: 64, fine: true, slope: 0.5 },
  rover: { column: 1, width: 48, tile: 20, fine: false, slope: 0.35 },
  crawler: { column: 2, width: 120, tile: 24, fine: false, slope: 0.3 },
  sled: { column: 3, width: 64, tile: 80, fine: true, slope: 0.25 },
  slide: { column: 4, width: 240, tile: 400, fine: false, slope: 0.6 },
  blast: { column: 5, width: 0, tile: 0, fine: false, slope: 1 },
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
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
/** A rounded box's signed distance: negative inside the box of half extents (hw, hl), corners rounded by `r`. */
function roundedBox(p: number, q: number, hw: number, hl: number, r: number): number {
  const dx = Math.abs(p) - hw + r;
  const dy = Math.abs(q) - hl + r;
  const outside = Math.sqrt(Math.max(dx, 0) * Math.max(dx, 0) + Math.max(dy, 0) * Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}
/** A print pressed into dust (its signed distance `sdf`, units): dark where it is pressed, `inside` gives its floor's tone; a bright rim of pushed-up dust `rim` wide around it. */
function pressed(sdf: number, inside: number, rim: number, bright = 0.1): number {
  if (sdf < 0) return inside + (0.5 + bright - inside) * smooth(-0.4, 0, sdf);
  return 0.5 + bright * (1 - smooth(0, rim, sdf));
}

/** The steps of a tile of bootprints: where along (units), how far off the strip's middle, how turned (rad); seeded so no two steps are alike. */
const STEPS = (() => {
  const r = new Randomizer(4101);
  return Array.from({ length: 4 }, (_, k) => ({ along: (k + 0.5) * 16 + r.range(-1, 1), side: (k % 2 ? 1 : -1) * (2.2 + r.range(-0.3, 0.3)), turn: r.range(-0.12, 0.12) + (k % 2 ? 0.05 : -0.05) }));
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
 * A kind's pattern at `a` across its strip (0..1) and `b` along its tile (0..1, the pattern
 * tiles), 0.5 neutral, darker where the ground is pressed or scoured, brighter where dust was
 * pushed up or swept clean.
 */
export function tracePattern(kind: TraceKind, a: number, b: number): number {
  const { width, tile } = TRACE_KINDS[kind];
  const x = (a - 0.5) * width;
  const y = b * tile;
  switch (kind) {
    case 'boots': {
      let m = 0.5;
      for (const step of STEPS) {
        for (const shift of [-tile, 0, tile]) {
          const dx = x - step.side;
          const dy = y - step.along - shift;
          if (Math.abs(dy) > 6 || Math.abs(dx) > 4) continue;
          const c = cos(step.turn);
          const s = sin(step.turn);
          const p = dx * c - dy * s;
          const q = dx * s + dy * c;
          // the sole wider at its toe (+q), lugs across it every 4.5 cm
          const sdf = roundedBox(p, q, 1.1 + 0.15 * (q / 3.2), 3.2, 0.9);
          const lugs = 0.36 + 0.07 * sin((TAU * q) / 0.9);
          const v = pressed(sdf, lugs, 0.7, 0.11);
          if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
        }
      }
      return m;
    }
    case 'rover': {
      let m = 0.5;
      for (const middle of [-19, 19]) {
        const off = Math.abs(x - middle);
        const chevrons = 0.4 + 0.06 * sin((TAU * (y + off * 0.6)) / 2);
        const v = pressed(off - 2.6, chevrons, 1.6, 0.09);
        if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
      }
      return m;
    }
    case 'crawler': {
      let m = 0.5;
      for (const middle of [-40, 40]) {
        const off = Math.abs(x - middle);
        const cleat = smooth(0.25, 0.32, (y / 6) % 1) * (1 - smooth(0.6, 0.68, (y / 6) % 1));
        const v = pressed(off - 14, 0.42 - 0.1 * cleat, 3, 0.1);
        if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
      }
      return m;
    }
    case 'sled': {
      // a faint drag of the load between the runners, varying slowly along
      let m = 0.5 - 0.03 * (1 - smooth(10, 18, Math.abs(x))) * (0.8 + 0.2 * sin(TAU * b));
      for (const middle of [-24, 24]) {
        const off = Math.abs(x - middle);
        const v = pressed(off - 2, 0.38 + 0.04 * (off / 2) * (off / 2), 1.5, 0.08);
        if (Math.abs(v - 0.5) > Math.abs(m - 0.5)) m = v;
      }
      return m;
    }
    case 'slide': {
      // the whole scar scuffed a little darker, fading out at its sides
      let m = 0.5 - 0.035 * (1 - smooth(96, 116, Math.abs(x)));
      for (const g of GOUGES) {
        const off = Math.abs(x - g.middle - g.wander * sin(TAU * b + g.phase));
        if (off < g.half) m -= g.depth * (1 - (off / g.half) * (off / g.half));
        else if (off < 2 * g.half) m += 0.9 * g.depth * (1 - (off - g.half) / g.half);
      }
      return Math.min(0.75, Math.max(0.22, m));
    }
    case 'blast': {
      // `a` the share of the ring's radius out from its middle: the ground under the lander scoured, a bright halo swept clean round it with rays, fading out to the rim
      let rays = 0;
      for (const ray of RAYS) rays += ray.weight * sin(TAU * ray.count * b + ray.phase);
      const halo = 0.15 * (1 - smooth(0.12, 1, a)) * (1 + 0.12 * rays);
      return 0.5 + halo * smooth(0.1, 0.22, a) - 0.07 * (1 - smooth(0.1, 0.2, a));
    }
  }
}

/** The atlas's texels (one byte each, value t meaning t · 255 / 256 · 2 times the ground): every kind's pattern, 3 × 3 samples a texel. */
export function traceAtlas(): Uint8Array {
  const data = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT).fill(NEUTRAL);
  const span = COLUMN - 2 * GUTTER;
  for (const kind of Object.keys(TRACE_KINDS) as TraceKind[]) {
    const column = TRACE_KINDS[kind].column;
    for (let j = 0; j < ATLAS_HEIGHT; j++) {
      for (let i = 0; i < span; i++) {
        let sum = 0;
        for (let sj = 0; sj < 3; sj++) for (let si = 0; si < 3; si++) sum += tracePattern(kind, (i + (si + 0.5) / 3) / span, (j + (sj + 0.5) / 3) / ATLAS_HEIGHT);
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
 * of its distance more, for a coarser level of the ground strays from the finest by up to 2 px
 * (see world/groundlod), some 0.2 % of the distance.
 */
const TRACE_LIFT = 2;
const TRACE_LIFT_SHARE = 0.0025;
/** A strip fades in between these widths on screen (px), so it never shimmers once it is thinner. */
const FADE_PX = [1.5, 4] as const;
/** A ship's scrape mark fades out over the last third of SCRAPE_LIFE (s) after it was made. */
export const SCRAPE_LIFE = 180;

/** The picture's height in pixels, for a strip's width on screen; set before each strip is drawn. */
const picture = { value: 1080 };
const now = { value: 0 };

function traceMaterial(fades: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlasTexture() }, picture, now },
    defines: fades ? { FADES: '', LIFE: SCRAPE_LIFE.toFixed(1) } : {},
    vertexShader: `
      attribute vec2 trace;
      #ifdef FADES
      attribute float born;
      uniform float now;
      #endif
      uniform float picture;
      varying vec2 vUv;
      varying float vStrength;
      void main() {
        vec4 eye = modelViewMatrix * vec4(position, 1.0);
        float d = max(length(eye.xyz), 1.0);
        float px = trace.y * projectionMatrix[1][1] * picture * 0.5 / d;
        vStrength = trace.x * smoothstep(${FADE_PX[0].toFixed(1)}, ${FADE_PX[1].toFixed(1)}, px);
        #ifdef FADES
        vStrength *= 1.0 - smoothstep(LIFE * 0.667, LIFE, now - born);
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
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

let wideMaterial: THREE.ShaderMaterial | null = null;
let fineMaterial: THREE.ShaderMaterial | null = null;
let scrapeMaterial: THREE.ShaderMaterial | null = null;
/** The share of the traces drawn, as the picture's quality last set it (see setTraceDetail). */
let detail = 1;
const materials = () => {
  wideMaterial ??= traceMaterial(false);
  fineMaterial ??= traceMaterial(false);
  scrapeMaterial ??= traceMaterial(true);
  return { wide: wideMaterial, fine: fineMaterial, scrape: scrapeMaterial };
};
/** The traces the picture's quality draws (see view/quality, Look.traces): 1 all of them, from 0.5 only the wide ones and the ships' scrapes, 0 none. */
export function setTraceDetail(share: number) {
  detail = share;
  const { wide, fine, scrape } = materials();
  wide.visible = scrape.visible = share > 0;
  fine.visible = share >= 1;
}

/** Sets the picture's height before a strip is drawn: the render target's, or the canvas's. */
function measurePicture(renderer: THREE.WebGLRenderer) {
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

/** What a place's ground is marked with: its `seed`, its sites, the ways it lays itself (`ways`), the lone lines of prints in the wilds (`wilds`, 3 unless given) and the old landing sites out there (`landings`, 1 unless given). */
export interface TracePlan {
  seed: number;
  sites: readonly TraceSite[];
  ways?: readonly TraceWay[];
  wilds?: number;
  landings?: number;
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
 * site; the place's own ways along its lanes; out in the wilds a few lone lines of prints far from anything and an old landing site.
 * A trace keeps off slopes too steep for it (a rover off 19°, a walker off 27°) and to the
 * ground, and shows fainter the farther it lies from the sites, older and less walked.
 */
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
  const strengthAt = (x: number, z: number) => (plan.sites.length ? 0.55 + 0.45 * exp(-nearest(x, z) / (3 * KM)) : 0.7) * r.range(0.75, 1);

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
      for (const dodge of [0, 0.5, -0.5, 1, -1]) {
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
    // a road to the nearest other site
    let other = -1;
    plan.sites.forEach((s, j) => {
      if (j !== index && (other < 0 || hypot(s.x - site.x, s.z - site.z) < hypot(plan.sites[other].x - site.x, plan.sites[other].z - site.z))) other = j;
    });
    if (other > index) {
      const to = plan.sites[other];
      const angle = atan2(to.z - site.z, to.x - site.x);
      const [x, z] = edge(angle);
      const kind = r.nextFloat() < 0.7 ? 'rover' : 'crawler';
      road(kind, walk(kind, x, z, angle, 4 * hypot(to.x - site.x, to.z - site.z), 10 * M, 0.04, { x: to.x, z: to.z, pull: 0.15 }), strengthAt(x, z), 2 + Math.floor(r.range(0, 2)));
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

  // the wilds: a place far from every site
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
    if (at) prints(at[0], at[1], r.range(0, TAU), r.range(0.4, 2) * KM, r.range(0.6, 0.9));
  }
  for (let k = 0; k < (plan.landings ?? 1); k++) {
    const at = far();
    if (!at) continue;
    landing(at[0], at[1], r.range(0.6, 0.9));
    add('rover', walk('rover', at[0] + 40 * M, at[1], r.range(0, TAU), r.range(0.3, 1.2) * KM, 10 * M, 0.12), r.range(0.6, 0.9));
  }
  return { trails, rings };
}

/** Where the segment from (ax, az) to (bx, bz) crosses an edge of the grid's faces: its parameters in (0, 1), sorted. */
export function crossings(grid: GroundGrid, ax: number, az: number, bx: number, bz: number): number[] {
  const ga = [(ax - grid.x0) / grid.cellX, (az - grid.z0) / grid.cellZ];
  const gb = [(bx - grid.x0) / grid.cellX, (bz - grid.z0) / grid.cellZ];
  const out: number[] = [];
  const lines = (from: number, to: number) => {
    if (from === to) return;
    for (let k = Math.ceil(Math.min(from, to)); k <= Math.floor(Math.max(from, to)); k++) {
      const t = (k - from) / (to - from);
      if (t > 1e-9 && t < 1 - 1e-9) out.push(t);
    }
  };
  lines(ga[0], gb[0]);
  lines(ga[1], gb[1]);
  // each cell's diagonal, where the cell's whole coordinates sum to one more: ix + iz whole
  lines(ga[0] + ga[1], gb[0] + gb[1]);
  return out.sort((p, q) => p - q);
}

/** A strip's buffers as they grow. */
class StripBuilder {
  readonly position: number[] = [];
  readonly uv: number[] = [];
  readonly trace: number[] = [];
  readonly index: number[] = [];
  constructor(private readonly grid: GroundGrid) {}

  /** A trail along its middle line: a row of vertices across it at each of its points and wherever its middle crosses a face's edge, each on the ground beneath it. */
  trail({ kind, points, width, strength }: Trail, shift: number) {
    const { grid } = this;
    const { tile } = TRACE_KINDS[kind];
    const across = Math.max(2, Math.ceil(width / (Math.min(grid.cellX, grid.cellZ) * 0.5)) + 1);
    const count = points.length / 2;
    // each point's sideways direction: the mean of its two segments'
    const side = (i: number): [number, number] => {
      const j = Math.min(count - 1, i + 1);
      const k = Math.max(0, i - 1);
      const dx = points[j * 2] - points[k * 2];
      const dz = points[j * 2 + 1] - points[k * 2 + 1];
      const length = hypot(dx, dz) || 1;
      return [-dz / length, dx / length];
    };
    let along = shift;
    let previous = -1;
    const row = (x: number, z: number, sx: number, sz: number) => {
      const first = this.position.length / 3;
      for (let c = 0; c < across; c++) {
        const a = c / (across - 1);
        const px = x + sx * (a - 0.5) * width;
        const pz = z + sz * (a - 0.5) * width;
        this.position.push(px, gridHeight(grid, px, pz), pz);
        this.uv.push(atlasU(kind, a), along / tile);
        this.trace.push(strength, width);
      }
      if (previous >= 0) for (let c = 0; c + 1 < across; c++) this.index.push(previous + c, previous + c + 1, first + c, previous + c + 1, first + c + 1, first + c);
      previous = first;
    };
    for (let i = 0; i < count; i++) {
      const [x, z] = [points[i * 2], points[i * 2 + 1]];
      const [sx, sz] = side(i);
      row(x, z, sx, sz);
      if (i + 1 === count) break;
      const [bx, bz] = [points[i * 2 + 2], points[i * 2 + 3]];
      const length = hypot(bx - x, bz - z);
      const [tx, tz] = side(i + 1);
      let last = 0;
      for (const t of crossings(grid, x, z, bx, bz)) {
        along += (t - last) * length;
        last = t;
        // the direction across turns from the one point's to the next's
        const mx = sx + (tx - sx) * t;
        const mz = sz + (tz - sz) * t;
        const norm = hypot(mx, mz) || 1;
        row(x + (bx - x) * t, z + (bz - z) * t, mx / norm, mz / norm);
      }
      along += (1 - last) * length;
    }
  }

  /** A blast ring: rows of vertices round it at a fifth of its radius apart from its middle out, a quarter of the pattern's tile every quarter turn. */
  ring({ x, z, radius, strength }: Ring) {
    const spokes = 48;
    const rows = 6;
    const first = this.position.length / 3;
    for (let s = 0; s <= spokes; s++) {
      const angle = (s / spokes) * TAU;
      for (let k = 0; k < rows; k++) {
        const a = k / (rows - 1);
        const px = x + cos(angle) * a * radius;
        const pz = z + sin(angle) * a * radius;
        this.position.push(px, gridHeight(this.grid, px, pz), pz);
        this.uv.push(atlasU('blast', a), (s / spokes) * 4);
        this.trace.push(strength, radius);
      }
    }
    for (let s = 0; s < spokes; s++) {
      for (let k = 0; k + 1 < rows; k++) {
        const p = first + s * rows + k;
        const q = p + rows;
        this.index.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.setAttribute('trace', new THREE.Float32BufferAttribute(this.trace, 2));
    geometry.setIndex(this.index);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

/** The traces' geometries over `grid` as `plan` lays them (see layTraces): the wide ones and the fine ones. */
export function traceGeometries(plan: TracePlan, grid: GroundGrid): { wide: THREE.BufferGeometry; fine: THREE.BufferGeometry } {
  const { trails, rings } = layTraces(plan, grid);
  const wide = new StripBuilder(grid);
  const fine = new StripBuilder(grid);
  const r = new Randomizer(plan.seed + 1);
  for (const trail of trails) (TRACE_KINDS[trail.kind].fine ? fine : wide).trail(trail, r.range(0, TRACE_KINDS[trail.kind].tile));
  for (const ring of rings) wide.ring(ring);
  return { wide: wide.geometry(), fine: fine.geometry() };
}

/** The traces of `plan` on the ground of `grid`, in the ground's frame: two meshes, the wide traces and the fine ones (see setTraceDetail). */
export function groundTraces(plan: TracePlan, grid: GroundGrid): THREE.Group {
  const { wide, fine } = traceGeometries(plan, grid);
  const look = materials();
  setTraceDetail(detail);
  const group = new THREE.Group();
  for (const [geometry, material] of [
    [wide, look.wide],
    [fine, look.fine],
  ] as const) {
    if (!geometry.index?.count) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.onBeforeRender = measurePicture;
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

/** How many segments of scrape marks are kept (the oldest overwritten first), and how wide a mark is (units, 6 m: the plates of a hull's belly on the ground). */
export const SCRAPES = 384;
export const SCRAPE_WIDTH = 120;
/** A mark goes on once the hull moved this far (units, 1.5 m) on the ground, and starts anew after a gap of SCRAPE_GAP (s) or a jump farther than SCRAPE_JUMP (units, 40 m). */
const SCRAPE_STEP = 30;
const SCRAPE_GAP = 0.3;
const SCRAPE_JUMP = 800;

/**
 * The marks a ship's hull leaves where it glides on a world's ground (see world/hover, glide):
 * a scar SCRAPE_WIDTH wide in the slid ship's pattern, laid flat on the ground under the hull
 * along its way, fading out over SCRAPE_LIFE; the last SCRAPES segments of every ship together,
 * one draw call. Looks only, each browser its own.
 */
export class ScrapeMarks {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(SCRAPES * 4 * 3);
  private readonly uvs = new Float32Array(SCRAPES * 4 * 2);
  private readonly born = new Float32Array(SCRAPES * 4).fill(-1e9);
  private next = 0;
  private readonly last = new Map<object, { point: THREE.Vector3; across: THREE.Vector3; along: number; time: number }>();
  private static readonly direction = new THREE.Vector3();
  private static readonly across = new THREE.Vector3();

  constructor() {
    const index: number[] = [];
    for (let s = 0; s < SCRAPES; s++) index.push(s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 1, s * 4 + 3, s * 4 + 2);
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('born', new THREE.BufferAttribute(this.born, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('trace', new THREE.BufferAttribute(new Float32Array(SCRAPES * 4 * 2).fill(1).map((_, i) => (i % 2 ? SCRAPE_WIDTH : 1)), 2));
    this.mesh = new THREE.Mesh(this.geometry, materials().scrape);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.onBeforeRender = measurePicture;
  }

  /** The hull `key` glides at `point` on the ground (its outward `normal` there) at time `time` (s): the mark goes on from where it was last. */
  add(key: object, point: THREE.Vector3, normal: THREE.Vector3, time: number) {
    now.value = time;
    const last = this.last.get(key);
    if (!last || time - last.time > SCRAPE_GAP || last.point.distanceTo(point) > SCRAPE_JUMP) {
      this.last.set(key, { point: point.clone(), across: new THREE.Vector3(), along: 0, time });
      return;
    }
    const distance = last.point.distanceTo(point);
    if (distance < SCRAPE_STEP) {
      last.time = time;
      return;
    }
    const { direction, across } = ScrapeMarks;
    direction.subVectors(point, last.point).normalize();
    across.crossVectors(normal, direction).normalize().multiplyScalar(SCRAPE_WIDTH / 2);
    // a mark's first segment starts square to its way
    if (last.across.lengthSq() === 0) last.across.copy(across);
    const along = last.along + distance / TRACE_KINDS.slide.tile;
    const s = this.next;
    this.next = (this.next + 1) % SCRAPES;
    const corners = [
      [last.point, last.across, -1, last.along],
      [last.point, last.across, 1, last.along],
      [point, across, -1, along],
      [point, across, 1, along],
    ] as const;
    corners.forEach(([at, side, sign, v], k) => {
      const i = s * 4 + k;
      this.positions[i * 3] = at.x + side.x * sign;
      this.positions[i * 3 + 1] = at.y + side.y * sign;
      this.positions[i * 3 + 2] = at.z + side.z * sign;
      this.uvs[i * 2] = atlasU('slide', sign < 0 ? 0 : 1);
      this.uvs[i * 2 + 1] = v;
      this.born[i] = time;
    });
    for (const name of ['position', 'uv', 'born']) this.geometry.getAttribute(name).needsUpdate = true;
    last.point.copy(point);
    last.across.copy(across);
    last.along = along;
    last.time = time;
  }

  /** The frame's time (s), for the marks' fading. */
  update(time: number) {
    now.value = time;
  }

  /** Every mark gone: a new arena. */
  clear() {
    this.born.fill(-1e9);
    this.positions.fill(0);
    this.geometry.getAttribute('born').needsUpdate = true;
    this.geometry.getAttribute('position').needsUpdate = true;
    this.last.clear();
    this.next = 0;
  }
}

/**
 * The fine dust and the bare rock of a ground, as patches far larger than its tiles: a tiling
 * texture of PATCH_SIZE² texels of smooth value noise (two octaves on lattices of 8 and 16 that
 * wrap), which world/boneyard's groundMaterial reads twice at scales that never line up
 * (DUST_PATCH_TILE and DUST_PATCH_TILE_2, turned against each other) and sums as patchAt does.
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
  const r = new Randomizer(4110);
  const lattices = [8, 16].map((n) => ({ n, values: Array.from({ length: n * n }, () => r.nextFloat()) }));
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let j = 0; j < PATCH_SIZE; j++) {
    for (let i = 0; i < PATCH_SIZE; i++) {
      let value = 0;
      lattices.forEach(({ n, values }, octave) => {
        const x = ((i + 0.5) / PATCH_SIZE) * n;
        const y = ((j + 0.5) / PATCH_SIZE) * n;
        const [ix, iy] = [Math.floor(x), Math.floor(y)];
        const [u, v] = [fade(x - ix), fade(y - iy)];
        const at = (a: number, b: number) => values[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
        const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
        value += (top + (bottom - top) * v) * (octave ? 0.35 : 0.65);
      });
      data[j * PATCH_SIZE + i] = Math.round(value * 255);
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
