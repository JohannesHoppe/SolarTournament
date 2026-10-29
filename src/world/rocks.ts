import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { tangentDirections } from './surface';
import { impostorDirections, impostorGeometry, impostorMaterial, IMPOSTOR_VIEWS, type ImpostorGlow } from '../view/impostor';
import { hazeUniforms } from '../view/haze';

/** Fixed seed: every client builds the same rock shapes, so their measured surfaces match (see world/surface). */
const ROCK_SEED = 2584;
export const ROCK_COUNT = 16;
/** Edge subdivisions of the base icosahedron a rock's surface is measured from (20 · 33² ≈ 22 000 triangles): never drawn, built once per shape and kept only for Surface (see world/asteroids, world/surface), so collisions stay identical however light the drawn mesh is. */
export const DETAIL = 32;
/** Subdivisions of the mesh drawn up close (20 · 10² = 2000 triangles): the fine relief (crags, craters, grooves, cracks) lives in a baked relief map (see reliefMap), not in the mesh, so this stays low. */
export const NEAR_DETAIL = 9;
/** Subdivisions of the mesh drawn afar, where even the coarse shape barely shows (20 · 5² = 500 triangles). */
export const FAR_DETAIL = 4;
/** Subdivisions for a coarse field built quickly (e.g. in tests): 20 · 7² ≈ 1000 triangles each. */
export const DISTANT_DETAIL = 6;
/** Mean radius of a template in world units (40 to 55 m); the field scales it by 2.5 to 7. */
const MIN_RADIUS = 800;
const MAX_RADIUS = 1100;

interface Composition {
  /** The weathered surface's color (linear RGB). */
  color: [number, number, number];
  /** The tint of freshly exposed material (crater floors, young ejecta), multiplied onto the color where the surface is fresh: space weathering reddens and darkens a surface over time, so fresh rock shows paler and bluer. */
  fresh: [number, number, number];
  roughness: number;
  metalness: number;
}

/** Carbon-rich, stony, iron-bearing and metallic rocks, as in the real asteroid belt. */
const COMPOSITIONS: Composition[] = [
  { color: [0.09, 0.085, 0.08], fresh: [0.96, 1, 1.08], roughness: 0.95, metalness: 0 },
  { color: [0.24, 0.2, 0.16], fresh: [0.88, 0.98, 1.16], roughness: 0.92, metalness: 0 },
  { color: [0.26, 0.16, 0.11], fresh: [0.82, 0.98, 1.2], roughness: 0.9, metalness: 0.05 },
  { color: [0.28, 0.28, 0.3], fresh: [1.04, 1.02, 1], roughness: 0.6, metalness: 0.6 },
];

/**
 * Smooth 3D value noise in [-1, 1]. It uses integer hashing and polynomial blending only,
 * no transcendental functions, so every browser computes exactly the same shapes.
 */
export class Noise {
  constructor(private readonly seed: number) {}

  private lattice(x: number, y: number, z: number): number {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ this.seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h & 0xffff) / 32767.5 - 1;
  }

  /** Written out without helper closures (the bakes call it millions of times); the arithmetic is the plain trilinear blend of the quintic fade. */
  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const x1 = xi + 1, y1 = yi + 1, z1 = zi + 1;
    const n000 = this.lattice(xi, yi, zi), n100 = this.lattice(x1, yi, zi);
    const n010 = this.lattice(xi, y1, zi), n110 = this.lattice(x1, y1, zi);
    const n001 = this.lattice(xi, yi, z1), n101 = this.lattice(x1, yi, z1);
    const n011 = this.lattice(xi, y1, z1), n111 = this.lattice(x1, y1, z1);
    const a00 = n000 + (n100 - n000) * u, a10 = n010 + (n110 - n010) * u;
    const a01 = n001 + (n101 - n001) * u, a11 = n011 + (n111 - n011) * u;
    const b0 = a00 + (a10 - a00) * v, b1 = a01 + (a11 - a01) * v;
    return b0 + (b1 - b0) * w;
  }

  /** Fractal noise: octaves of halving size and amplitude. Ridged noise gives sharp crests. */
  fractal(x: number, y: number, z: number, octaves: number, ridged = false): number {
    let sum = 0, amplitude = 0.5, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      const s = this.sample(x * frequency, y * frequency, z * frequency);
      sum += amplitude * (ridged ? 1 - 2 * Math.abs(s) : s);
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum;
  }
}

export interface Crater {
  center: THREE.Vector3;
  /** Rim radius as chord length on the unit sphere. */
  width: number;
  depth: number;
}

/** Height of a bowl-shaped crater with a raised rim at a point of the unit sphere. */
function craterHeight(direction: THREE.Vector3, crater: Crater): number {
  const t = direction.distanceTo(crater.center) / crater.width;
  if (t >= 1.5) return 0;
  if (t < 1) return crater.depth * (t * t - 1) + crater.depth * 0.25 * t * t * t * t;
  const rim = (1.5 - t) / 0.5;
  return crater.depth * 0.25 * rim * rim;
}

/** Everything a rock shape is built from, drawn once from its seed (see rockRecipe) and shared by every detail level, the relief map and the impostor atlas alike. */
export interface RockRecipe {
  noiseSeed: number;
  composition: Composition;
  axes: THREE.Vector3;
  roughness: number;
  frequency: number;
  ridged: boolean;
  craters: Crater[];
}

const recipes = new Map<number, RockRecipe>();

/** The fixed recipe of a rock shape (its composition, proportions, roughness and craters), the same on every call and every browser. */
export function rockRecipe(index: number): RockRecipe {
  let recipe = recipes.get(index);
  if (recipe) return recipe;
  const r = new Randomizer(ROCK_SEED * 7919 + index * 104729);
  const noiseSeed = r.nextInt();
  const composition = COMPOSITIONS[r.nextInt() % COMPOSITIONS.length];

  const axes = new THREE.Vector3(1, r.range(0.6, 1), r.range(0.45, 0.85));
  if (r.nextFloat() < 0.35) axes.x *= r.range(1.3, 1.9);
  const radius = r.range(MIN_RADIUS, MAX_RADIUS);
  axes.multiplyScalar((3 * radius) / (axes.x + axes.y + axes.z));

  const roughness = r.range(0.1, 0.24);
  const frequency = r.range(1.1, 2.1);
  const ridged = r.nextFloat() < 0.4;
  const craters: Crater[] = [];
  const craterCount = 8 + (r.nextInt() % 22);
  for (let i = 0; i < craterCount; i++) {
    // many small craters, few large ones
    const size = r.nextFloat();
    const width = 0.06 + 0.42 * size * size * size;
    craters.push({ center: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), width, depth: width * r.range(0.18, 0.35) });
  }
  recipe = { noiseSeed, composition, axes, roughness, frequency, ridged, craters };
  recipes.set(index, recipe);
  return recipe;
}

/**
 * The rock's relief and shading at a direction from its center (unit vector): how far the
 * surface reaches there, as a share added to 1 (so the point is `direction * axes * (1 + bump)`),
 * and `shade`, the patchy, grainy, crater-fresh tint (multiplied onto the composition's color).
 * The same formula a mesh's vertices, its relief map and its impostor are built from, so all
 * agree on the shape wherever they sample it; `crags` scales the small crags (the relief map
 * takes them softer, see MAP_CRAGS), 1 for the shape itself.
 */
export function surfaceSample(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3, crags = 1): { bump: number; shade: number } {
  const x = direction.x * recipe.frequency, y = direction.y * recipe.frequency, z = direction.z * recipe.frequency;
  // large lumps, plus sharp crags and boulders on a smaller scale
  let height = recipe.roughness * noise.fractal(x, y, z, 5, recipe.ridged);
  height += crags * 0.04 * noise.fractal(x * 7 + 31, y * 7, z * 7, 3, true);
  let crater = 0;
  for (const c of recipe.craters) crater += craterHeight(direction, c);
  height += crater;

  // patchy surface, fine grain, and fresh, brighter material inside craters
  const patch = 0.8 + 0.4 * noise.fractal(x * 2 + 17, y * 2, z * 2, 3);
  const grain = 0.95 + 0.1 * noise.sample(x * 40, y * 40 + 5, z * 40);
  const fresh = crater < 0 ? 1 - crater * 1.5 : 1;
  return { bump: height, shade: patch * grain * fresh };
}

/** The rock's actual surface point in the direction (unit vector) `direction`, written into `target`, and its shade there. */
function surfacePoint(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3, target: THREE.Vector3): { point: THREE.Vector3; shade: number } {
  const { bump, shade } = surfaceSample(noise, recipe, direction);
  target.set(direction.x * recipe.axes.x * (1 + bump), direction.y * recipe.axes.y * (1 + bump), direction.z * recipe.axes.z * (1 + bump));
  return { point: target, shade };
}

/** A small crater of the relief map only (see Relief): rim radius as chord length on the unit sphere, and how fresh it is (0 old and weathered, 1 young, its floor and ejecta bright). */
interface Pit extends Crater {
  fresh: number;
}

/** A family of parallel grooves: troughs where the surface meets the planes `dot(point, normal) = (k + offset) · spacing`, `normal` across the rock's long axis, so the troughs run along it. In shares of the mean radius. */
interface Groove {
  normal: THREE.Vector3;
  spacing: number;
  offset: number;
  width: number;
  depth: number;
}

/**
 * The fine relief of a rock shape that only its maps show, never its meshes or its collisions
 * (see reliefSample): dense small craters, grooves along the long axis, fissures, boulders and
 * grain. Drawn from a seed of its own, so the shape's recipe (and with it every vertex) stays
 * as it is.
 */
interface Relief {
  pits: Pit[];
  /** The pits that reach into each cell of a grid over the unit cube (see pitCell), so a sample checks only the few near it. */
  pitGrid: Map<number, Pit[]>;
  grooves: Groove[];
  /** The rock's mean semi-axis, to measure grooves on the surface rather than by direction. */
  meanAxis: number;
  /** How deep the fissures cut (share of the radius), 0 for a rock without. */
  fissures: number;
  /** How many boulders lie about: the noise level above which a bump becomes one (higher: fewer). */
  boulders: number;
}

/** How much of the shape's small crags its relief map shows: half, so the craters, grooves and cracks on top read through them instead of drowning in rubble. The drawn meshes are too coarse to show the crags in their outline, so map and mesh still agree. */
const MAP_CRAGS = 0.5;

/** Cells per unit of the pit grid over [-1, 1]³ (see Relief.pitGrid). */
const PIT_GRID = 8;
/** The cell of the pit grid a direction (unit vector) lies in. */
export const pitCell = (x: number, y: number, z: number) => {
  const c = (v: number) => Math.min(2 * PIT_GRID - 1, Math.max(0, Math.floor((v + 1) * PIT_GRID)));
  return c(x) + 2 * PIT_GRID * (c(y) + 2 * PIT_GRID * c(z));
};

/** How far a direction (unit vector) lies from a pit's center, in its widths. */
export function pitDistance(d: THREE.Vector3, pit: Crater): number {
  const dx = d.x - pit.center.x, dy = d.y - pit.center.y, dz = d.z - pit.center.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / pit.width;
}

/** Pits (anything round at a direction, `width` across as a chord on the unit sphere) listed in every cell of the pit grid they reach into within `reach` of their width, so a sample checks only the few near it (see pitCell). */
export function pitGrid<T extends Crater>(pits: T[], reach: number): Map<number, T[]> {
  const grid = new Map<number, T[]>();
  for (const pit of pits) {
    const span = pit.width * reach;
    const lo = (v: number) => Math.max(0, Math.floor((v - span + 1) * PIT_GRID));
    const hi = (v: number) => Math.min(2 * PIT_GRID - 1, Math.floor((v + span + 1) * PIT_GRID));
    for (let z = lo(pit.center.z); z <= hi(pit.center.z); z++) {
      for (let y = lo(pit.center.y); y <= hi(pit.center.y); y++) {
        for (let x = lo(pit.center.x); x <= hi(pit.center.x); x++) {
          const key = x + 2 * PIT_GRID * (y + 2 * PIT_GRID * z);
          const list = grid.get(key);
          if (list) list.push(pit);
          else grid.set(key, [pit]);
        }
      }
    }
  }
  return grid;
}

const reliefs = new Map<number, Relief>();

/** The fixed fine relief of a rock shape (see Relief), the same on every call and every browser. */
function rockRelief(index: number): Relief {
  let relief = reliefs.get(index);
  if (relief) return relief;
  const recipe = rockRecipe(index);
  const r = new Randomizer(ROCK_SEED * 6007 + index * 7883 + 1);
  const pits: Pit[] = [];
  const pitCount = 150 + (r.nextInt() % 100);
  for (let i = 0; i < pitCount; i++) {
    // a power law: most pits a few cells of the map across, few much larger
    const size = r.nextFloat();
    const width = 0.02 + 0.09 * size * size * size;
    const fresh = r.nextFloat();
    pits.push({ center: new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize(), width, depth: width * r.range(0.24, 0.36), fresh: fresh * fresh });
  }
  // grooves run along the longest axis, as on the elongated real asteroids (Phobos, Eros)
  const { axes } = recipe;
  const long = axes.x >= axes.y && axes.x >= axes.z ? new THREE.Vector3(1, 0, 0) : axes.y >= axes.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const grooves: Groove[] = [];
  const families = r.nextFloat() < 0.75 ? (r.nextFloat() < 0.4 ? 2 : 1) : 0;
  for (let i = 0; i < families; i++) {
    const normal = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
    normal.addScaledVector(long, -normal.dot(long));
    if (normal.lengthSq() < 1e-4) normal.set(long.y, long.z, long.x);
    normal.normalize();
    grooves.push({ normal, spacing: r.range(0.07, 0.13), offset: r.nextFloat(), width: r.range(0.011, 0.018), depth: r.range(0.006, 0.012) });
  }
  const fissures = r.nextFloat() < 0.8 ? r.range(0.004, 0.009) : 0;
  const boulders = r.range(0.42, 0.6);
  relief = { pits, pitGrid: pitGrid(pits, 1.6), grooves, meanAxis: (axes.x + axes.y + axes.z) / 3, fissures, boulders };
  reliefs.set(index, relief);
  return relief;
}

/**
 * The rock's surface as its maps show it, at a direction (unit vector): the shape's own relief
 * and shade (see surfaceSample) with the fine relief on top (see Relief): dense small craters
 * with raised rims, their floors fresh and bright when young; grooves along the long axis and
 * fissures, both darker; boulders; regolith grain. Written into `out`.
 */
function reliefSample(noise: Noise, recipe: RockRecipe, relief: Relief, d: THREE.Vector3, out: { bump: number; shade: number }) {
  const base = surfaceSample(noise, recipe, d, MAP_CRAGS);
  let bump = base.bump, shade = base.shade;

  const pits = relief.pitGrid.get(pitCell(d.x, d.y, d.z));
  if (pits) {
    for (const pit of pits) {
      const t = pitDistance(d, pit);
      if (t >= 1.6) continue;
      if (t < 1) {
        // the bowl, its floor fresher the younger the pit
        bump += pit.depth * (t * t - 1) + pit.depth * 0.3 * t * t * t * t;
        shade *= 1 + (0.15 + 0.55 * pit.fresh) * (1 - t * t);
      } else {
        // the raised rim, and beyond it the ejecta: bright around a young pit, weathered dark around an old one
        const rim = (1.6 - t) / 0.6;
        bump += pit.depth * 0.3 * rim * rim;
        shade *= 1 + (pit.fresh * 0.35 - 0.1) * rim;
      }
    }
  }

  const px = (d.x * recipe.axes.x) / relief.meanAxis, py = (d.y * recipe.axes.y) / relief.meanAxis, pz = (d.z * recipe.axes.z) / relief.meanAxis;
  for (const groove of relief.grooves) {
    // a little warped and broken into segments, so they read as fractures, not as a ruler's lines
    const warp = 0.012 * noise.sample(px * 9 + 3.1, py * 9 - 7.7, pz * 9 + 5.3);
    const q = (px * groove.normal.x + py * groove.normal.y + pz * groove.normal.z + warp) / groove.spacing + groove.offset;
    const off = Math.abs(q - Math.round(q)) * groove.spacing;
    if (off >= groove.width) continue;
    const segment = Math.min(1, Math.max(0, (noise.sample(px * 3.3 - 13.1, py * 3.3 + 2.9, pz * 3.3 + 21.7) + 0.15) * 3));
    if (segment <= 0) continue;
    const k = 1 - off / groove.width;
    const trough = k * k * (3 - 2 * k) * segment;
    bump -= groove.depth * trough;
    shade *= 1 - 0.3 * trough;
  }

  if (relief.fissures > 0) {
    // the zero crossings of a noise make a network of thin cracks; a second noise lets them run out
    const n = noise.fractal(d.x * 7 + 71.3, d.y * 7 + 11.1, d.z * 7 - 37.7, 2);
    const a = Math.abs(n) / 0.035;
    if (a < 1) {
      const mask = Math.min(1, Math.max(0, noise.sample(d.x * 2.6 - 5.5, d.y * 2.6 + 9.9, d.z * 2.6 + 1.7) * 3 + 0.3));
      const crack = (1 - a) * (1 - a) * mask;
      bump -= relief.fissures * crack;
      shade *= 1 - 0.45 * crack;
    }
  }

  const boulder = noise.sample(d.x * 26 + 101.1, d.y * 26 - 55.5, d.z * 26 + 7.3) - relief.boulders;
  if (boulder > 0) {
    const k = boulder / (1 - relief.boulders);
    bump += 0.016 * k * k;
    shade *= 1 + 0.2 * k;
  }

  // regolith: a fine grain of dust and pebbles
  bump += 0.0015 * noise.sample(d.x * 30 - 19.9, d.y * 30 + 33.3, d.z * 30 + 61.1);
  out.bump = bump;
  out.shade = shade;
  return out;
}

const spheres = new Map<number, THREE.BufferGeometry>();

/** The unit sphere every rock (and the comet's nucleus, see world/nucleus) of a detail starts from, with shared vertices; built once per detail, as it takes most of a rock's time. */
export function sphere(detail: number): THREE.BufferGeometry {
  let geometry = spheres.get(detail);
  if (!geometry) {
    geometry = new THREE.IcosahedronGeometry(1, detail);
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    geometry = mergeVertices(geometry);
    spheres.set(detail, geometry);
  }
  return geometry;
}

/**
 * The direction a texel of a cube map's face stands for, as WebGL picks face and texel for a
 * direction (the OpenGL ES 3.0 cube map table): `face` in the order +x, −x, +y, −y, +z, −z,
 * `s` across a row and `t` down the rows (both −1..1, row 0 at t = −1).
 */
function cubeTexelDirection(face: number, s: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  if (face === 0) out.set(1, -t, -s);
  else if (face === 1) out.set(-1, -t, s);
  else if (face === 2) out.set(s, 1, t);
  else if (face === 3) out.set(s, -1, -t);
  else if (face === 4) out.set(s, -t, 1);
  else out.set(-s, -t, -1);
  return out.normalize();
}

/** The finite-difference normal at a direction, from the same recipe a mesh's vertices come from (see surfacePoint): the true surface normal there, independent of how many triangles draw it. */
function bakedNormal(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const side = bakedNormal.side, across = bakedNormal.across;
  const p0 = bakedNormal.p0, p1 = bakedNormal.p1, p2 = bakedNormal.p2, nearby = bakedNormal.nearby;
  tangentDirections(direction, side, across);
  surfacePoint(noise, recipe, direction, p0);
  nearby.copy(direction).addScaledVector(side, NORMAL_STEP).normalize();
  surfacePoint(noise, recipe, nearby, p1).point.sub(p0);
  nearby.copy(direction).addScaledVector(across, NORMAL_STEP).normalize();
  surfacePoint(noise, recipe, nearby, p2).point.sub(p0);
  out.crossVectors(p1, p2).normalize();
  if (out.dot(direction) < 0) out.negate();
  return out;
}
bakedNormal.side = new THREE.Vector3();
bakedNormal.across = new THREE.Vector3();
bakedNormal.p0 = new THREE.Vector3();
bakedNormal.p1 = new THREE.Vector3();
bakedNormal.p2 = new THREE.Vector3();
bakedNormal.nearby = new THREE.Vector3();

/** The step to either side for a baked normal (share of the way out, about 3°), as world/asteroids.ts uses for a collision normal. */
const NORMAL_STEP = 0.05;

/**
 * Where cell (i, j) of tile `tile` lies in the data of an atlas of `tiles` square tiles of
 * `res` cells laid out side by side (a texture `tiles · res` wide, `res` high): row j runs across
 * every tile, as WebGL reads a DataTexture row by row.
 */
export function atlasOffset(tile: number, tiles: number, res: number, i: number, j: number): number {
  return ((j * tiles + tile) * res + i) * 4;
}

/** Edge length, in texels, of each of the 6 faces of a rock's relief map: about 0.7° a texel, 1.5 to 4 m on a rock of the field. */
export const RELIEF_RES = 128;
/** What a relief map holds at a direction: how far the surface reaches there (a share added to 1 on the shape's ellipsoid, see surfacePoint) and the value its alpha keeps (0..1). */
export interface ReliefTexel {
  bump: number;
  value: number;
}
/** A shape's surface as a relief map shows it: what it holds at a direction (unit vector), written into `out`. */
export type ReliefSampler = (direction: THREE.Vector3, out: ReliefTexel) => ReliefTexel;
/** The materials with a relief map of their own per shape: rock, ice (see world/ice) and the comet's nucleus (see world/nucleus). */
export type ReliefKind = 'rock' | 'ice' | 'nucleus';

/** The surface point a sampler gives at a direction, on the ellipsoid of `axes`, written into `target`. */
function reliefPoint(axes: THREE.Vector3, sample: ReliefSampler, direction: THREE.Vector3, target: THREE.Vector3, sampled: ReliefTexel): THREE.Vector3 {
  const { bump } = sample(direction, sampled);
  return target.set(direction.x * axes.x * (1 + bump), direction.y * axes.y * (1 + bump), direction.z * axes.z * (1 + bump));
}

/** A rock shape's surface as its relief map shows it (see reliefSample): its alpha holds half the shade. */
function rockSampler(index: number): ReliefSampler {
  const recipe = rockRecipe(index), relief = rockRelief(index), noise = new Noise(recipe.noiseSeed);
  const sampled = { bump: 0, shade: 1 };
  return (direction, out) => {
    reliefSample(noise, recipe, relief, direction, sampled);
    out.bump = sampled.bump;
    out.value = Math.min(1, sampled.shade / 2);
    return out;
  };
}

/**
 * A rock shape's relief map: a cube map in the rock's own frame, each texel holding the
 * surface's normal there (rgb, object space, encoded as 0.5 + 0.5 · n) and its shade (alpha,
 * half the multiplier of the composition's color, see reliefSample). A shader looks it up by the
 * direction from the rock's center (no UV unwrap: a rock is star-shaped around its center, so
 * every direction meets its surface once) and turns the normal into world space with the
 * object's normalMatrix, as it would a vertex normal. WebGL 2 filters a cube map across its
 * faces' edges and builds its mipmaps, so it shows no seam and no shimmer however small the rock.
 * The surface is sampled once per texel, with a texel's rim around each face, and the normal is
 * the cross product of the differences to the neighbouring texels. Baked once per shape and
 * shared by every mesh and LOD level of it; ice has maps of its own (see world/ice).
 */
export function reliefMap(index: number): THREE.CubeTexture {
  return cachedRelief('rock', index, bakeRelief);
}

const reliefMaps = new Map<string, THREE.CubeTexture>();

/** The relief map of a shape of a kind: baked by a worker already (see bakeReliefMaps), else by `bake` here and now. */
export function cachedRelief(kind: ReliefKind, index: number, bake: (index: number) => Uint8Array[]): THREE.CubeTexture {
  let map = reliefMaps.get(kind + index);
  if (map) return map;
  map = cubeMap(bake(index));
  reliefMaps.set(kind + index, map);
  return map;
}

/** The six faces of a rock shape's relief map (see reliefMap). */
export function bakeRelief(index: number): Uint8Array[] {
  return bakeCube(rockRecipe(index).axes, rockSampler(index));
}

/** The six faces of a relief map of a shape on the ellipsoid of `axes` (see reliefMap), each RELIEF_RES² texels of RGBA, rows from the face's t = −1 on, as WebGL takes a cube map's face. */
export function bakeCube(axes: THREE.Vector3, sample: ReliefSampler): Uint8Array[] {
  const R = RELIEF_RES, W = R + 2;
  const points = new Float32Array(W * W * 3);
  const shades = new Float32Array(W * W);
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const sampled = { bump: 0, value: 0 };
  const du = new THREE.Vector3(), dv = new THREE.Vector3(), normal = new THREE.Vector3();
  const faces: Uint8Array[] = [];
  for (let face = 0; face < 6; face++) {
    for (let j = -1; j <= R; j++) {
      const t = ((j + 0.5) / R) * 2 - 1;
      for (let i = -1; i <= R; i++) {
        const s = ((i + 0.5) / R) * 2 - 1;
        cubeTexelDirection(face, s, t, direction);
        reliefPoint(axes, sample, direction, point, sampled);
        const k = (j + 1) * W + i + 1;
        points[k * 3] = point.x;
        points[k * 3 + 1] = point.y;
        points[k * 3 + 2] = point.z;
        shades[k] = sampled.value;
      }
    }
    const data = new Uint8Array(R * R * 4);
    for (let j = 0; j < R; j++) {
      for (let i = 0; i < R; i++) {
        const k = (j + 1) * W + i + 1;
        const right = (k + 1) * 3, left = (k - 1) * 3, down = (k + W) * 3, up = (k - W) * 3;
        du.set(points[right] - points[left], points[right + 1] - points[left + 1], points[right + 2] - points[left + 2]);
        dv.set(points[down] - points[up], points[down + 1] - points[up + 1], points[down + 2] - points[up + 2]);
        normal.crossVectors(du, dv).normalize();
        // the cross product's sign depends on the face's handedness; the surface faces outward
        if (normal.x * points[k * 3] + normal.y * points[k * 3 + 1] + normal.z * points[k * 3 + 2] < 0) normal.negate();
        const o = (j * R + i) * 4;
        data[o] = Math.round((normal.x * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        data[o + 3] = Math.round(Math.min(1, Math.max(0, shades[k])) * 255);
      }
    }
    faces.push(data);
  }
  return faces;
}

/** A relief map's faces (see bakeRelief) as a cube texture, mipmapped by WebGL. */
function cubeMap(faces: Uint8Array[]): THREE.CubeTexture {
  const map = new THREE.CubeTexture(faces.map((data) => new THREE.DataTexture(data, RELIEF_RES, RELIEF_RES, THREE.RGBAFormat)));
  map.format = THREE.RGBAFormat;
  map.type = THREE.UnsignedByteType;
  map.colorSpace = THREE.NoColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

/** A relief map a worker bakes: its kind and its shape. */
export type ReliefJob = [ReliefKind, number];

/**
 * Bakes the relief maps of every rock shape, of every ice shape (see bakeRelief, world/ice) and
 * of the comet's nucleus (see world/nucleus) in background workers, a few shapes each, side by
 * side: the startup waits for the slowest worker instead of all 33 maps in a row, and the page
 * keeps loading meanwhile. Where workers are missing or fail, a map is baked here when it is
 * first asked for (see cachedRelief).
 */
export async function bakeReliefMaps(): Promise<void> {
  if (typeof Worker === 'undefined') return;
  const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const jobs: ReliefJob[] = [...Array.from({ length: ROCK_COUNT }, (_, i): ReliefJob[] => [['rock', i], ['ice', i]]).flat(), ['nucleus', 0]];
  const shapes = (w: number) => jobs.filter((_, k) => k % count === w);
  const bake = (indices: ReliefJob[]) =>
    new Promise<void>((resolve) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./relief.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        resolve();
        return;
      }
      let left = indices.length;
      const done = () => {
        worker.terminate();
        resolve();
      };
      worker.onmessage = (event: MessageEvent<{ kind: ReliefKind; index: number; faces: Uint8Array[] }>) => {
        const { kind, index, faces } = event.data;
        if (!reliefMaps.has(kind + index)) reliefMaps.set(kind + index, cubeMap(faces));
        if (--left === 0) done();
      };
      worker.onerror = done;
      worker.postMessage(indices);
    });
  await Promise.all(Array.from({ length: count }, (_, w) => bake(shapes(w))));
}

/** The surface normal of a rock shape as its relief map holds it (see reliefMap), from finite differences `step` (radians) to either side: what a test reads the baked map against. */
export function reliefNormal(index: number, direction: THREE.Vector3, step: number): THREE.Vector3 {
  return samplerNormal(rockRecipe(index).axes, rockSampler(index), direction, step);
}

/** The surface normal a sampler gives on the ellipsoid of `axes` (see bakeCube), from finite differences `step` (radians) to either side. */
export function samplerNormal(axes: THREE.Vector3, sample: ReliefSampler, direction: THREE.Vector3, step: number): THREE.Vector3 {
  const sampled = { bump: 0, value: 0 };
  const side = new THREE.Vector3(), across = new THREE.Vector3(), nearby = new THREE.Vector3();
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  tangentDirections(direction, side, across);
  [side, side.clone().negate(), across, across.clone().negate()].forEach((offset, i) => reliefPoint(axes, sample, nearby.copy(direction).addScaledVector(offset, step).normalize(), p[i], sampled));
  const normal = new THREE.Vector3().crossVectors(p[0].sub(p[1]), p[2].sub(p[3])).normalize();
  return normal.dot(direction) < 0 ? normal.negate() : normal;
}

/** The shade of a rock shape at a direction as its relief map holds it (see reliefSample): the multiplier of the composition's color. */
export function reliefShade(index: number, direction: THREE.Vector3): number {
  const recipe = rockRecipe(index);
  return reliefSample(new Noise(recipe.noiseSeed), recipe, rockRelief(index), direction, { bump: 0, shade: 1 }).shade;
}

/** Directions around a rock's own (unit vectors across it, see rockTone) over which its tone is averaged: a ring of about 15° and its middle. */
const TONE_RING: [number, number][] = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];

/** The color a rock shape's surface takes at a shade (see reliefSample), written into `out` (linear RGB): its composition's color times the shade, tinted towards its fresh color where the shade is bright, as the shader does (see ROCK_RELIEF_COLOR). */
function tone(recipe: RockRecipe, shade: number, out: [number, number, number]): [number, number, number] {
  const freshness = Math.min(1, Math.max(0, (shade - 1) * 1.5));
  const { color, fresh } = recipe.composition;
  for (let c = 0; c < 3; c++) out[c] = color[c] * shade * (1 + (fresh[c] - 1) * freshness);
  return out;
}

/**
 * The color a drawn rock shows around a direction from its center (in its own frame), as its
 * relief map paints it: its composition's color times the mean shade there, the fresh tint
 * included. Null for a mesh that is no rock. For what is built onto a rock in its colors (the
 * Belt's mining, see world/mining).
 */
export function rockTone(mesh: THREE.Object3D, direction: THREE.Vector3): THREE.Color | null {
  const index = mesh.userData.rockShape;
  if (typeof index !== 'number') return null;
  const recipe = rockRecipe(index), relief = rockRelief(index), noise = new Noise(recipe.noiseSeed);
  const d = direction.clone().normalize(), side = new THREE.Vector3(), across = new THREE.Vector3(), at = new THREE.Vector3();
  const sampled = { bump: 0, shade: 1 };
  tangentDirections(d, side, across);
  let shade = reliefSample(noise, recipe, relief, d, sampled).shade;
  for (const [a, b] of TONE_RING) shade += reliefSample(noise, recipe, relief, at.copy(d).addScaledVector(side, a * 0.26).addScaledVector(across, b * 0.26).normalize(), sampled).shade;
  return new THREE.Color(...tone(recipe, shade / (TONE_RING.length + 1), [0, 0, 0]));
}

/** Edge length, in texels, of the detail map's tile (see detailMap). */
export const DETAIL_RES = 256;
/** How many units of a rock's own (unscaled) frame one tile of the detail map spans: 11 m on the template, 28 to 77 m on a rock of the field. */
const DETAIL_TILE = 220;
/** The view distances (world units) over which the detail map fades out: whole within 100 m, gone beyond 450 m, where the relief map alone holds enough. */
const DETAIL_NEAR = 2000;
const DETAIL_FAR = 9000;
let detailTexture: THREE.DataTexture | undefined;

/**
 * The detail every rock shares up close, as one tile that repeats seamlessly: a height field of
 * dense small craters with raised rims, boulders and regolith grain, made from seeded
 * randomness and integer hashing, stored as its slope (rg: the normal's tilt across the tile,
 * −∂h/∂u and −∂h/∂v, encoded as 0.5 + 0.5 · slope) and its shade (b: half the multiplier of the
 * color, fresh crater floors brighter, weathered rims darker). A rock lays it over its relief in
 * its own frame from three sides (see applyRockRelief), mipmapped so it calms into the mean
 * shade with distance instead of shimmering.
 */
export function detailMap(): THREE.DataTexture {
  if (detailTexture) return detailTexture;
  const R = DETAIL_RES;
  const height = new Float32Array(R * R);
  const shade = new Float32Array(R * R).fill(1);
  const valueNoise = tileNoise;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const k = y * R + x;
      height[k] = 1.2 * valueNoise(x, y, 64, 11) + 0.6 * valueNoise(x, y, 128, 13) + 2.5 * valueNoise(x, y, 16, 17);
      // dust patches: wide, faint differences of tone
      shade[k] = 1 + 0.1 * valueNoise(x, y, 4, 19) + 0.06 * valueNoise(x, y, 32, 23);
    }
  }
  const r = new Randomizer(ROCK_SEED * 31 + 5);
  // craters: many small, few large; the tile repeats, so a crater wraps around its edges
  for (let n = 0; n < 260; n++) {
    const size = r.nextFloat();
    const radius = 2 + 22 * size * size * size;
    const cx = r.nextFloat() * R, cy = r.nextFloat() * R;
    const depth = radius * r.range(0.2, 0.35);
    const fresh = r.nextFloat() * r.nextFloat();
    stampTile(cx, cy, radius, 1.6, (k, t) => {
      if (t < 1) {
        height[k] += depth * (t * t - 1) + depth * 0.3 * t * t * t * t;
        shade[k] *= 1 + (0.1 + 0.4 * fresh) * (1 - t * t);
      } else {
        const rim = (1.6 - t) / 0.6;
        height[k] += depth * 0.3 * rim * rim;
        shade[k] *= 1 + (fresh * 0.3 - 0.08) * rim;
      }
    });
  }
  // boulders and pebbles: round lumps, a little brighter than the dust they lie in
  for (let n = 0; n < 320; n++) {
    const radius = 0.8 + 2.6 * r.nextFloat() * r.nextFloat();
    const cx = r.nextFloat() * R, cy = r.nextFloat() * R;
    stampTile(cx, cy, radius, 1, (k, t) => {
      height[k] += radius * 0.7 * Math.sqrt(1 - t * t);
      shade[k] *= 1.08;
    });
  }
  for (let k = 0; k < shade.length; k++) shade[k] /= 2;
  detailTexture = tileTexture(height, shade);
  return detailTexture;
}

/** Calls `stamp` for every texel of a detail tile within `reach` radii of a round mark at (cx, cy), the tile's edges wrapping round: `k` the texel's index, `t` its distance in radii. */
export function stampTile(cx: number, cy: number, radius: number, reach: number, stamp: (k: number, t: number) => void) {
  const span = Math.ceil(radius * reach);
  for (let y = Math.floor(cy) - span; y <= Math.floor(cy) + span; y++) {
    for (let x = Math.floor(cx) - span; x <= Math.floor(cx) + span; x++) {
      const t = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
      if (t < reach) stamp(wrapTile(y) * DETAIL_RES + wrapTile(x), t);
    }
  }
}

/** A cell's place on a detail tile (see DETAIL_RES), its edges wrapping round. */
export const wrapTile = (v: number) => ((v % DETAIL_RES) + DETAIL_RES) % DETAIL_RES;

/** The value of a tile's lattice of `period` cells at a point of it, from an integer hash. */
function tileLattice(x: number, y: number, period: number, seed: number): number {
  let h = Math.imul(wrapTile(x) % period, 374761393) ^ Math.imul(wrapTile(y) % period, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32767.5 - 1;
}

/** Smooth value noise in [-1, 1] over a detail tile, `cells` across it, repeating with the tile, at the tile's texel (x, y). */
export function tileNoise(x: number, y: number, cells: number, seed: number): number {
  const size = DETAIL_RES / cells;
  const gx = x / size, gy = y / size;
  const xi = Math.floor(gx), yi = Math.floor(gy);
  const fx = gx - xi, fy = gy - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = tileLattice(xi, yi, cells, seed), b = tileLattice(xi + 1, yi, cells, seed);
  const c = tileLattice(xi, yi + 1, cells, seed), d = tileLattice(xi + 1, yi + 1, cells, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * A detail tile (DETAIL_RES² texels) as a texture that repeats, mipmapped: from its height field
 * the slope (rg: −∂h/∂u and −∂h/∂v, encoded as 0.5 + 0.5 · slope), and `third` (0..1) in b.
 */
export function tileTexture(height: Float32Array, third: Float32Array): THREE.DataTexture {
  const R = DETAIL_RES;
  const data = new Uint8Array(R * R * 4);
  const encode = (slope: number) => Math.round(Math.min(1, Math.max(0, 0.5 + 0.5 * slope)) * 255);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const k = y * R + x, o = k * 4;
      data[o] = encode(-(height[y * R + wrapTile(x + 1)] - height[y * R + wrapTile(x - 1)]) / 2);
      data[o + 1] = encode(-(height[wrapTile(y + 1) * R + x] - height[wrapTile(y - 1) * R + x]) / 2);
      data[o + 2] = Math.round(Math.min(1, Math.max(0, third[k])) * 255);
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, R, R, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** How many units of a shape's own (unscaled) frame one tile of the break map spans (see breakMap): 6 m on the template, 15 to 40 m on a rock of the field. */
const BREAK_TILE = 120;
let breakTexture: THREE.DataTexture | undefined;

/**
 * The fresh fracture face every piece of a broken rock or chunk of ice shares (see
 * world/fracture), one tile that repeats seamlessly, made like the detail map (see detailMap):
 * conchoidal ripples and sharp hackle ridges running across the break, and fine grain, as
 * slope (rg); and its crystals as shade (b, half the multiplier): grains of their own tone with
 * sharp edges, a few glinting brighter. Its mean b is 0.5 and its mean slope none, so far off,
 * mipmapped, it calms into the plain fresh color instead of shimmering.
 */
export function breakMap(): THREE.DataTexture {
  if (breakTexture) return breakTexture;
  const R = DETAIL_RES;
  const height = new Float32Array(R * R);
  const shade = new Float32Array(R * R);
  /** Grains on a jittered grid of GRAINS cells across the tile, each with its own tone: a cell's point and tone from an integer hash. */
  const GRAINS = 32;
  const grainHash = (x: number, y: number, seed: number) => (tileLattice(x, y, GRAINS, seed) + 1) / 2;
  const size = R / GRAINS;
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const k = y * R + x;
      height[k] = 3 * tileNoise(x, y, 4, 61) + 2.2 * Math.abs(tileNoise(x, y, 8, 67)) + 0.9 * tileNoise(x, y, 32, 71) + 0.45 * tileNoise(x, y, 128, 73);
      // the nearest grain's point among the cells around
      const gx = Math.floor(x / size), gy = Math.floor(y / size);
      let best = Infinity, tone = 0.5;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const cx = gx + dx, cy = gy + dy;
          const px = (cx + grainHash(cx, cy, 79)) * size, py = (cy + grainHash(cx, cy, 83)) * size;
          const d = (px - x - 0.5) ** 2 + (py - y - 0.5) ** 2;
          if (d < best) {
            best = d;
            tone = grainHash(cx, cy, 89);
          }
        }
      }
      shade[k] = 1 + 0.22 * (tone - 0.5) + (tone > 0.95 ? 0.25 : 0) + 0.05 * tileNoise(x, y, 64, 97);
    }
  }
  let mean = 0;
  for (const s of shade) mean += s / shade.length;
  for (let k = 0; k < shade.length; k++) shade[k] = (shade[k] / mean) * 0.5;
  breakTexture = tileTexture(height, shade);
  return breakTexture;
}

/** What a material shading with a shape's relief map is given (see patchRelief). */
export interface ReliefPatch {
  /** Which program it compiles to: rock or ice, each with and without the detail tile. */
  kind: ReliefKind;
  map: THREE.CubeTexture;
  /** The shape's ellipsoid, which maps a point of the mesh to the direction the map is read in. */
  axes: THREE.Vector3;
  /** The tile laid over the relief up close (the meshes drawn near, never the far ones), or null. */
  detail: THREE.DataTexture | null;
  /** How strongly the tile tilts the normal up close. */
  strength: number;
  /** The material's own uniforms. */
  uniforms: Record<string, THREE.IUniform>;
  /** The material's own declarations, after the shared ones (see RELIEF_PARS). */
  pars: string;
  /** What it works into the color right after three.js sets it, from `reliefTexel` (the map's texel), `reliefTile` (the tile's b, 0.5 without it) and `reliefNear` (how much of the tile shows); `reliefNormal` is the normal it shades with. */
  color: string;
  /** Any further change to the fragment shader. */
  fragment?: (source: string) => string;
  /** For the pieces of a broken shape (see world/fracture): their meshes carry `fracture`, 1 on a fresh fracture face, which shades with its own normal and the break tile (see breakMap) instead of the relief map; `reliefFracture` says how much of it a pixel is, `reliefBreak` the tile's b there (0.5 elsewhere). */
  piece?: boolean;
  /** How strongly the break tile tilts a fracture face's normal. */
  breakStrength?: number;
}

/**
 * Patches a material to shade with a shape's relief map instead of its low-poly mesh: the
 * normal and what the map's alpha holds come from a cube lookup by the direction from the
 * shape's own center, so the fine relief looks the same at any detail. Up close (`detail`), the
 * tile adds what is finer yet, projected along the shape's own three axes and blended by the
 * mesh's facing, fading out with distance.
 */
export function patchRelief(material: THREE.MeshStandardMaterial, patch: ReliefPatch) {
  // a define, not a uniform, so the near meshes' program and the far meshes' are cached apart
  if (patch.detail) material.defines = { ...material.defines, RELIEF_DETAIL: '' };
  if (patch.piece) material.defines = { ...material.defines, RELIEF_PIECE: '' };
  // rock and ice share this function, so its source cannot tell their programs apart
  const key = `relief-${patch.kind}${patch.piece ? '-piece' : ''}`;
  material.customProgramCacheKey = () => key;
  const fade = new THREE.Vector2(DETAIL_NEAR, DETAIL_FAR);
  material.onBeforeCompile = (shader) => {
    // the haze, as every material takes it (see view/haze)
    hazeUniforms(shader, material);
    Object.assign(shader.uniforms, patch.uniforms);
    shader.uniforms.reliefMap = { value: patch.map };
    shader.uniforms.reliefAxes = { value: patch.axes };
    shader.uniforms.reliefDetail = { value: patch.detail };
    shader.uniforms.reliefDetailStrength = { value: patch.strength };
    shader.uniforms.reliefDetailTile = { value: DETAIL_TILE };
    shader.uniforms.reliefDetailFade = { value: fade };
    shader.uniforms.reliefBreakMap = { value: patch.piece ? breakMap() : null };
    shader.uniforms.reliefBreakTile = { value: BREAK_TILE };
    shader.uniforms.reliefBreakStrength = { value: patch.breakStrength ?? 1 };
    // an instance's own turn (the belt draws its rocks instanced) is not in normalMatrix, so it
    // goes to the fragment as the three columns of instanceMatrix, the identity otherwise
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPosition;\nvarying vec3 vRockFacing;\nvarying vec3 vRockTurnX;\nvarying vec3 vRockTurnY;\nvarying vec3 vRockTurnZ;\nvarying float vRockFracture;\n#ifdef RELIEF_PIECE\nattribute float fracture;\n#endif')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvRockPosition = position;\n\tvRockFacing = normal;\n#ifdef RELIEF_PIECE\n\tvRockFracture = fracture;\n#else\n\tvRockFracture = 0.0;\n#endif\n#ifdef USE_INSTANCING\n\tvRockTurnX = instanceMatrix[0].xyz;\n\tvRockTurnY = instanceMatrix[1].xyz;\n\tvRockTurnZ = instanceMatrix[2].xyz;\n#else\n\tvRockTurnX = vec3( 1.0, 0.0, 0.0 );\n\tvRockTurnY = vec3( 0.0, 1.0, 0.0 );\n\tvRockTurnZ = vec3( 0.0, 0.0, 1.0 );\n#endif',
      );
    let fragment = shader.fragmentShader
      .replace(
        '#include <common>',
        // normalMatrix has no fragment-side declaration unless a material's own normalMap is
        // in object space (ours never is: the shape's normal comes from the relief map instead),
        // so it is declared here; three.js sets it for every object regardless of a material's
        // own uniforms, by name, so no extra uniform value is needed on our side.
        `#include <common>\nuniform mat3 normalMatrix;\n${RELIEF_PARS}\n${patch.pars}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${RELIEF_READ}\n${patch.color}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n\tnormal = normalize( normalMatrix * ( mat3( vRockTurnX, vRockTurnY, vRockTurnZ ) * reliefNormal ) );');
    if (patch.fragment) fragment = patch.fragment(fragment);
    shader.fragmentShader = fragment;
  };
}

const RELIEF_PARS = /* glsl */ `
uniform samplerCube reliefMap;
uniform vec3 reliefAxes;
uniform sampler2D reliefDetail;
uniform float reliefDetailStrength;
uniform float reliefDetailTile;
uniform vec2 reliefDetailFade;
varying vec3 vRockPosition;
varying vec3 vRockFacing;
varying vec3 vRockTurnX;
varying vec3 vRockTurnY;
varying vec3 vRockTurnZ;
varying float vRockFracture;
uniform sampler2D reliefBreakMap;
uniform float reliefBreakTile;
uniform float reliefBreakStrength;
`;

/** The relief map's texel and normal (kept for normal_fragment_maps), with the detail tile's tilt and its b up close. */
const RELIEF_READ = /* glsl */ `
	vec4 reliefTexel = textureCube( reliefMap, normalize( vRockPosition / reliefAxes ) );
	vec3 reliefNormal = normalize( reliefTexel.xyz * 2.0 - 1.0 );
	float reliefNear = 0.0;
	float reliefTile = 0.5;
#ifdef RELIEF_DETAIL
	// sampled everywhere, never inside a branch, so the mipmaps' choice stays well defined; fading by distance
	reliefNear = 1.0 - smoothstep( reliefDetailFade.x, reliefDetailFade.y, length( vViewPosition ) );
	// weighed by the mesh's own facing, not the relief's: the tile lies along the mesh's surface, and a crater wall tilted off it would smear it
	vec3 reliefWeights = pow( abs( normalize( vRockFacing ) ), vec3( 4.0 ) );
	reliefWeights /= reliefWeights.x + reliefWeights.y + reliefWeights.z;
	vec3 reliefAt = vRockPosition / reliefDetailTile;
	vec4 reliefAlongX = texture2D( reliefDetail, reliefAt.yz );
	vec4 reliefAlongY = texture2D( reliefDetail, reliefAt.xz );
	vec4 reliefAlongZ = texture2D( reliefDetail, reliefAt.xy );
	vec3 reliefTilt = reliefWeights.x * vec3( 0.0, reliefAlongX.xy * 2.0 - 1.0 ) + reliefWeights.y * vec3( reliefAlongY.x * 2.0 - 1.0, 0.0, reliefAlongY.y * 2.0 - 1.0 ) + reliefWeights.z * vec3( reliefAlongZ.xy * 2.0 - 1.0, 0.0 );
	reliefNormal = normalize( reliefNormal + reliefTilt * reliefDetailStrength * reliefNear );
	reliefTile = reliefWeights.x * reliefAlongX.b + reliefWeights.y * reliefAlongY.b + reliefWeights.z * reliefAlongZ.b;
#endif
	float reliefFracture = vRockFracture;
	float reliefBreak = 0.5;
#ifdef RELIEF_PIECE
	{
		// a fracture face: its own facing, tilted by the break tile laid on from three sides; sampled everywhere, never in a branch, for the mipmaps
		vec3 breakFacing = normalize( vRockFacing );
		vec3 breakWeights = pow( abs( breakFacing ), vec3( 4.0 ) );
		breakWeights /= breakWeights.x + breakWeights.y + breakWeights.z;
		vec3 breakAt = vRockPosition / reliefBreakTile;
		vec4 breakAlongX = texture2D( reliefBreakMap, breakAt.yz );
		vec4 breakAlongY = texture2D( reliefBreakMap, breakAt.xz );
		vec4 breakAlongZ = texture2D( reliefBreakMap, breakAt.xy );
		vec3 breakTilt = breakWeights.x * vec3( 0.0, breakAlongX.xy * 2.0 - 1.0 ) + breakWeights.y * vec3( breakAlongY.x * 2.0 - 1.0, 0.0, breakAlongY.y * 2.0 - 1.0 ) + breakWeights.z * vec3( breakAlongZ.xy * 2.0 - 1.0, 0.0 );
		reliefNormal = normalize( mix( reliefNormal, normalize( breakFacing + breakTilt * reliefBreakStrength ), reliefFracture ) );
		reliefBreak = mix( 0.5, breakWeights.x * breakAlongX.b + breakWeights.y * breakAlongY.b + breakWeights.z * breakAlongZ.b, reliefFracture );
	}
#endif
`;

/**
 * Patches a rock's material to shade with its relief map (see reliefMap, patchRelief): the
 * normal and the shade come from the map, fresh material takes the composition's fresh tint;
 * `closeUp` for the meshes drawn near, which lay the shared detail map (see detailMap) over it:
 * the smallest craters and boulders.
 */
export function applyRockRelief(material: THREE.MeshStandardMaterial, index: number, closeUp: boolean, piece = false) {
  const recipe = rockRecipe(index);
  patchRelief(material, {
    piece,
    kind: 'rock',
    map: reliefMap(index),
    axes: recipe.axes.clone(),
    detail: closeUp ? detailMap() : null,
    strength: ROCK_DETAIL,
    uniforms: { rockFresh: { value: new THREE.Vector3(...recipe.composition.fresh) } },
    pars: 'uniform vec3 rockFresh;',
    color: ROCK_RELIEF_COLOR,
  });
}

/** How bright a fresh fracture face is against the weathered surface (the multiplier of the composition's color, before the break tile's grain): pale, unweathered rock, wholly in the fresh tint. */
const ROCK_BREAK = 1.45;

/** The relief's shade worked into the rock's color, the grain of the detail tile on it up close, fresh material tinted; on a piece's fracture face the fresh break's paler color and its grain instead. */
const ROCK_RELIEF_COLOR = /* glsl */ `
	float rockMultiplier = mix( reliefTexel.a * 2.0 * mix( 1.0, reliefTile * 2.0, reliefNear ), ${ROCK_BREAK.toFixed(2)} * reliefBreak * 2.0, reliefFracture );
	float rockFreshness = max( clamp( ( rockMultiplier - 1.0 ) * 1.5, 0.0, 1.0 ), reliefFracture );
	diffuseColor.rgb *= rockMultiplier * mix( vec3( 1.0 ), rockFresh, rockFreshness );
`;

/** How strongly the detail map tilts a rock's normal up close. */
const ROCK_DETAIL = 1;

/**
 * One rock: a squashed or stretched ellipsoid, roughened by fractal noise and pocked with
 * craters, in its composition's color, shaded by its relief map (see applyRockRelief)
 * regardless of `detail`; `closeUp` for the meshes drawn near, which take the detail map too.
 */
function createRock(index: number, detail: number, closeUp: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(rockGeometry(index, detail, true), rockMaterial(index, closeUp, false));
  mesh.name = `rock-${index}`;
  // which shape it is, for what is built onto it in its colors (see rockTone)
  mesh.userData.rockShape = index;
  return mesh;
}

/** A rock shape's material in its composition's color, shaded by its relief map (see applyRockRelief); `piece` for the pieces of a broken rock (see world/fracture). */
function rockMaterial(index: number, closeUp: boolean, piece: boolean): THREE.MeshStandardMaterial {
  const { composition } = rockRecipe(index);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(...composition.color, THREE.LinearSRGBColorSpace),
    roughness: composition.roughness,
    metalness: composition.metalness,
  });
  applyRockRelief(material, index, closeUp, piece);
  return material;
}

const pieceMaterials = new Map<string, THREE.MeshStandardMaterial>();

/** The material of the pieces of a broken rock of a shape (see world/fracture), near with `closeUp`: one for all its pieces, made once. */
export function rockPieceMaterial(index: number, closeUp: boolean): THREE.MeshStandardMaterial {
  const key = `${index}:${closeUp}`;
  return pieceMaterials.get(key) ?? pieceMaterials.set(key, rockMaterial(index, closeUp, true)).get(key)!;
}

/**
 * A rock's shape at a detail: the sphere's vertices moved onto its surface; with `drawn` also
 * its normals, which only a mesh that is drawn needs (its color and fine relief come from its
 * relief map, see applyRockRelief).
 */
export function rockGeometry(index: number, detail: number, drawn: boolean): THREE.BufferGeometry {
  const recipe = rockRecipe(index);
  const noise = new Noise(recipe.noiseSeed);
  const geometry = sphere(detail).clone();
  const position = geometry.attributes.position;
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    direction.fromBufferAttribute(position, i).normalize();
    surfacePoint(noise, recipe, direction, point);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  if (drawn) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The rock shapes of the asteroid field, identical on every client; with a lower detail,
 * the same shapes for rocks so far away that even their coarse silhouette barely shows.
 * `closeUp` for the meshes drawn near: they lay the detail map over their relief (see applyRockRelief).
 */
export function createRocks(detail = DETAIL, closeUp = false): THREE.Mesh[] {
  return Array.from({ length: ROCK_COUNT }, (_, i) => createRock(i, detail, closeUp));
}

/** Never drawn: the material of the shapes only the collisions measure. */
const UNDRAWN = new THREE.MeshBasicMaterial();

/**
 * The rock shapes as the collisions measure them (see world/surface): their vertices only, in
 * full detail by default, without colors, normals or a material of their own, as nobody draws them.
 */
export function createRockShapes(detail = DETAIL): THREE.Mesh[] {
  return Array.from({ length: ROCK_COUNT }, (_, i) => {
    const mesh = new THREE.Mesh(rockGeometry(i, detail, false), UNDRAWN);
    mesh.name = `rock-shape-${i}`;
    return mesh;
  });
}

/** Edge length, in cells, of each view tile of an impostor atlas: coarse, as a billboard only ever shows where a real mesh would be a speck of a few pixels. */
const IMPOSTOR_RES = 20;
/** Steps (then binary-search halvings) a ray marches to find the shape's surface for a given view and pixel. */
const IMPOSTOR_MARCH_STEPS = 14;
const IMPOSTOR_MARCH_REFINE = 4;

/**
 * The rock's bump at a direction, from fewer octaves and without the fine crags or the
 * patch/grain shading (see surfaceSample): enough to march a ray to the right silhouette
 * (craters, the large lumps) without paying for detail a billboard never shows mid-march; the
 * hit point's exact shade and normal are still read with the full surfaceSample/bakedNormal.
 */
function approxBump(noise: Noise, recipe: RockRecipe, direction: THREE.Vector3): number {
  const x = direction.x * recipe.frequency, y = direction.y * recipe.frequency, z = direction.z * recipe.frequency;
  let crater = 0;
  for (const c of recipe.craters) crater += craterHeight(direction, c);
  return recipe.roughness * noise.fractal(x, y, z, 3, recipe.ridged) + crater;
}

/** Where within a billboard's pixel its shade is sampled (in half pixels from its center): a small rotated grid. */
const FOOTPRINT: [number, number][] = [[0.25, 0.75], [-0.75, 0.25], [-0.25, -0.75], [0.75, -0.25]];

/** What a shape's billboards share whatever they are painted (see impostorShape): the quad, the normal atlas, where each atlas cell meets the shape. */
interface ImpostorShape {
  geometry: THREE.BufferGeometry;
  normal: THREE.DataTexture;
  radius: number;
  /** Per atlas cell: the direction from the shape's center where its ray meets the surface (xyz) and how wide the cell is there (radians), 0 where it misses. */
  hits: Float32Array;
}

const impostorShapes = new Map<number, ImpostorShape>();

/**
 * The impostor of a rock shape (see view/impostor) besides its colors: its `normal` atlas
 * (object-space, same encoding as a relief map's), one IMPOSTOR_RES square tile per fixed view
 * direction, side by side, and where each cell meets the shape. Each tile is filled by marching
 * a ray from that direction into the shape's own implicit surface (the same recipe a mesh's
 * vertices come from), so the silhouette and the normal agree with the real shape without
 * rendering it. Shared by the billboards of rock and ice (see impostorAtlas).
 */
function impostorShape(index: number): ImpostorShape {
  const known = impostorShapes.get(index);
  if (known) return known;
  const recipe = rockRecipe(index);
  const noise = new Noise(recipe.noiseSeed);
  const reach = Math.max(recipe.axes.x, recipe.axes.y, recipe.axes.z) * 1.35;
  const normalData = new Uint8Array(IMPOSTOR_VIEWS * IMPOSTOR_RES * IMPOSTOR_RES * 4);
  const hits = new Float32Array(IMPOSTOR_VIEWS * IMPOSTOR_RES * IMPOSTOR_RES * 4);

  const view = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const warped = new THREE.Vector3();
  /** Whether a point at `t` along the march (from `origin`, towards the camera along `-view`) already lies inside the shape's cheap approximate bump (see approxBump). */
  const inside = (t: number): boolean => {
    sample.copy(origin).addScaledVector(view, -t);
    const length = sample.length();
    if (length < 1e-6) return true;
    direction.copy(sample).normalize();
    warped.copy(sample).divide(recipe.axes);
    return warped.length() < 1 + approxBump(noise, recipe, direction);
  };

  impostorDirections().forEach((d, tile) => {
    view.copy(d);
    // a right/up basis across the view direction, as the shader side computes its own from the object's turn
    tangentDirections(view, right, up);
    for (let j = 0; j < IMPOSTOR_RES; j++) {
      const v = (((j + 0.5) / IMPOSTOR_RES) * 2 - 1) * reach;
      for (let i = 0; i < IMPOSTOR_RES; i++) {
        const u = (((i + 0.5) / IMPOSTOR_RES) * 2 - 1) * reach;
        origin.copy(right).multiplyScalar(u).addScaledVector(up, v).addScaledVector(view, reach * 2);
        const o = atlasOffset(tile, IMPOSTOR_VIEWS, IMPOSTOR_RES, i, j);
        // march from far along +view towards the shape (t grows from 0); first hit, refined by bisection
        let hit = -1;
        const steps = IMPOSTOR_MARCH_STEPS;
        const span = reach * 4;
        let previous = inside(0);
        for (let k = 1; k <= steps && hit < 0; k++) {
          const t = (k / steps) * span;
          const now = inside(t);
          if (now && !previous) {
            let lo = ((k - 1) / steps) * span, hi = t;
            for (let r = 0; r < IMPOSTOR_MARCH_REFINE; r++) {
              const mid = (lo + hi) / 2;
              if (inside(mid)) hi = mid; else lo = mid;
            }
            hit = hi;
          }
          previous = now;
        }
        if (hit < 0) continue;
        sample.copy(origin).addScaledVector(view, -hit);
        direction.copy(sample).normalize();
        hits[o] = direction.x;
        hits[o + 1] = direction.y;
        hits[o + 2] = direction.z;
        hits[o + 3] = reach / IMPOSTOR_RES / sample.length();
        bakedNormal(noise, recipe, direction, normal);
        normalData[o] = Math.round((normal.x * 0.5 + 0.5) * 255);
        normalData[o + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
        normalData[o + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        normalData[o + 3] = 255;
      }
    }
  });

  const normalMap = new THREE.DataTexture(normalData, IMPOSTOR_RES * IMPOSTOR_VIEWS, IMPOSTOR_RES, THREE.RGBAFormat);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.minFilter = normalMap.magFilter = THREE.LinearFilter;
  normalMap.generateMipmaps = false;
  normalMap.needsUpdate = true;
  const shape = { geometry: impostorGeometry(reach), normal: normalMap, radius: reach, hits };
  impostorShapes.set(index, shape);
  return shape;
}

/** The color (0..1 a channel, as the atlas stores it) a billboard shows where the surface lies at a direction, written into `out`. */
export type ImpostorColor = (direction: THREE.Vector3, out: [number, number, number]) => void;

/**
 * The albedo atlas of a shape's billboards (see impostorShape): color and silhouette alpha,
 * the color averaged over each cell's footprint on the shape as a far mesh's mipmaps average its
 * relief map.
 */
export function impostorAtlas(index: number, color: ImpostorColor): THREE.DataTexture {
  const { hits } = impostorShape(index);
  const data = new Uint8Array(hits.length);
  const direction = new THREE.Vector3(), offset = new THREE.Vector3(), side = new THREE.Vector3(), across = new THREE.Vector3();
  const sum: [number, number, number] = [0, 0, 0], one: [number, number, number] = [0, 0, 0];
  for (let o = 0; o < hits.length; o += 4) {
    const footprint = hits[o + 3];
    if (footprint === 0) continue;
    direction.set(hits[o], hits[o + 1], hits[o + 2]);
    tangentDirections(direction, side, across);
    sum.fill(0);
    for (const [a, b] of FOOTPRINT) {
      color(offset.copy(direction).addScaledVector(side, a * footprint).addScaledVector(across, b * footprint).normalize(), one);
      for (let c = 0; c < 3; c++) sum[c] += one[c] / FOOTPRINT.length;
    }
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(Math.min(1, Math.max(0, sum[c])) * 255);
    data[o + 3] = 255;
  }
  const albedo = new THREE.DataTexture(data, IMPOSTOR_RES * IMPOSTOR_VIEWS, IMPOSTOR_RES, THREE.RGBAFormat);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.minFilter = albedo.magFilter = THREE.LinearFilter;
  albedo.generateMipmaps = false;
  albedo.needsUpdate = true;
  return albedo;
}

/** A billboard of a shape, painted by `color` (see impostorAtlas), with `glow` its material's own light (see view/impostor). */
export function shapeImpostor(index: number, color: ImpostorColor, glow?: ImpostorGlow): THREE.Mesh {
  const { geometry, normal, radius } = impostorShape(index);
  return new THREE.Mesh(geometry, impostorMaterial(impostorAtlas(index, color), normal, IMPOSTOR_RES, radius, glow));
}

const impostors = new Map<number, THREE.Mesh>();

/**
 * A billboard template for a rock shape (see view/impostor): a quad with a material sampling
 * this shape's baked impostor atlases, the color the relief map's shade gives. Built once per
 * shape and cloned (sharing geometry and material) for every field rock and belt instance of it.
 */
function rockImpostor(index: number): THREE.Mesh {
  let impostor = impostors.get(index);
  if (impostor) return impostor;
  const recipe = rockRecipe(index), relief = rockRelief(index), noise = new Noise(recipe.noiseSeed);
  const sampled = { bump: 0, shade: 1 };
  impostor = shapeImpostor(index, (direction, out) => tone(recipe, reliefSample(noise, recipe, relief, direction, sampled).shade, out));
  impostor.name = `rock-impostor-${index}`;
  impostors.set(index, impostor);
  return impostor;
}

/** A billboard template for every rock shape (see rockImpostor), in shape order, reused by the field's rocks and the belt. */
export function createImpostors(): THREE.Mesh[] {
  return Array.from({ length: ROCK_COUNT }, (_, i) => rockImpostor(i));
}
