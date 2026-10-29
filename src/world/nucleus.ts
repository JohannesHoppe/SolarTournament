import * as THREE from 'three';
import { Randomizer } from '../random';
import { bakeCube, cachedRelief, detailMap, Noise, patchRelief, pitCell, pitDistance, pitGrid, samplerNormal, sphere, type Crater, type ReliefSampler, type ReliefTexel } from './rocks';

/**
 * A comet's nucleus: an irregular, elongated body of two lobes joined by a neck, as the nuclei
 * spacecraft have photographed are, generated like the rock shapes (integer hashing and
 * polynomials only, see world/rocks), so every browser builds the same one. Its surface is a
 * crust of dark dust (a nucleus reflects only about 4 % of the light, darker than charcoal):
 * smooth plains where the dust settled (in the neck above all), rough terrain pitted with small
 * hollows and broken into terraces with cliffs, a few deep sinkholes with steep walls where the
 * ice beneath boiled away (the vents its jets stream from, see nucleusVents), and patches of
 * bright exposed ice on the cliffs, the sinkholes' walls and a few spots between. The body
 * is a mesh in the shape's outline, its fine relief and its shade a relief map baked by the
 * rocks' bake (see world/rocks, bakeCube, patchRelief). Pure looks: the comet's head collides
 * as a sphere (see game/comet, HEAD_RADIUS).
 */

/** Fixed seed of the nucleus: every browser builds the same one. */
const NUCLEUS_SEED = 1066;

/** The body's semi-axes before its neck, lumps and terraces, in shares of the head's radius: long and slender, as comet nuclei are (about 1.7 : 1.1 : 1). */
export const NUCLEUS_AXES = new THREE.Vector3(1.32, 0.86, 0.78);
/**
 * The neck between the two lobes: the body pinched by NECK (share of its radius) where the
 * direction from its center runs square to the long axis, NECK_AT off the middle, so one lobe
 * is larger than the other, and over NECK_WIDTH to either side; NECK_BEND deeper on one side,
 * so the lobes stand at an angle to each other, as on a bent peanut.
 */
const NECK = 0.48;
const NECK_AT = -0.12;
const NECK_WIDTH = 0.42;
const NECK_BEND = 0.35;
/** One lobe is LOBES larger than the other (share of the radius, growing along the long axis). */
const LOBES = 0.1;
/** Large lumps of the body (share of its radius) and their size (cycles across it). */
const LUMPS = 0.11;
const LUMP_FREQUENCY = 1.1;
/**
 * The terraces of the rough terrain: TERRACE_STEPS steps over the noise's range, each
 * TERRACE_HEIGHT high (share of the radius, 2.5 m on the head), its cliff the last CLIFF of a
 * step; the dust plains run as a smooth slope over the same rise, so terraces and plains lie at
 * the same height on average.
 */
const TERRACE_STEPS = 5;
const TERRACE_HEIGHT = 0.035;
const CLIFF = 0.3;
/** The deep sinkholes: how many, how wide (rim radius as a chord on the unit sphere, 6 to 11 m on the head) and how deep (share of the radius); their floor is flat out to SINK_FLOOR of their width. */
const SINKHOLES = 6;
const SINK_WIDTH: readonly [number, number] = [0.09, 0.16];
const SINK_DEPTH = 0.08;
const SINK_FLOOR = 0.65;
/** The small pits of the rough terrain that only the relief map shows: how many, how wide (chord on the unit sphere) and how deep (in their widths). */
const PITS = 180;
const PIT_WIDTH: readonly [number, number] = [0.014, 0.05];
const PIT_DEPTH = 0.28;
/** How bright the crust is besides its tone (the multiplier of NUCLEUS_COLOR), and exposed ice. The relief map's alpha holds the multiplier over LIGHT_RANGE. */
const ICE_LIGHT = 6;
export const LIGHT_RANGE = 8;

/**
 * The crust's color (linear RGB): a dark, faintly reddish gray, about 4 % of the light
 * reflected, darker than any rock of the field (see world/rocks, COMPOSITIONS); exposed ice is
 * ICE_LIGHT times brighter and tinted ICE_TINT, cool white.
 */
export const NUCLEUS_COLOR: readonly [number, number, number] = [0.04, 0.038, 0.036];
const ICE_TINT: readonly [number, number, number] = [0.9, 1, 1.18];

/** A deep sinkhole (see SINKHOLES): where it lies, how wide and deep. */
type Sinkhole = Crater;

/** Everything the nucleus is built from, drawn once from its seed. */
interface Recipe {
  noise: Noise;
  sinkholes: Sinkhole[];
  pits: Crater[];
  pitGrid: Map<number, Crater[]>;
}

let recipe: Recipe | undefined;

/** The nucleus's fixed recipe (its noise, sinkholes and pits), the same on every call and every browser. */
function nucleusRecipe(): Recipe {
  if (recipe) return recipe;
  const r = new Randomizer(NUCLEUS_SEED);
  const noise = new Noise(r.nextInt());
  const direction = () => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
  const sinkholes: Sinkhole[] = [];
  while (sinkholes.length < SINKHOLES) {
    const center = direction();
    const width = r.range(SINK_WIDTH[0], SINK_WIDTH[1]);
    // apart from each other, and off the neck, where the dust lies deep
    if (Math.abs(center.x - NECK_AT) < 0.25 || sinkholes.some((s) => s.center.distanceTo(center) < s.width + width + 0.15)) continue;
    sinkholes.push({ center, width, depth: SINK_DEPTH * r.range(0.7, 1.2) });
  }
  const pits: Crater[] = [];
  for (let i = 0; i < PITS; i++) {
    // a power law: most pits small, few larger
    const size = r.nextFloat();
    const width = PIT_WIDTH[0] + (PIT_WIDTH[1] - PIT_WIDTH[0]) * size * size;
    pits.push({ center: direction(), width, depth: width * PIT_DEPTH });
  }
  recipe = { noise, sinkholes, pits, pitGrid: pitGrid(pits, 1.4) };
  return recipe;
}

const smooth = THREE.MathUtils.smoothstep;

/**
 * The nucleus's surface at a direction (unit vector) from its center: how far it reaches there
 * (`bump`, a share added to 1 on NUCLEUS_AXES) and how bright it is (`value`, the multiplier of
 * NUCLEUS_COLOR over LIGHT_RANGE). With `fine`, also what only the relief map shows (the small
 * pits, boulders, grain); without, the outline the meshes take.
 */
function nucleusSample(d: THREE.Vector3, fine: boolean, out: ReliefTexel): ReliefTexel {
  const { noise, sinkholes } = nucleusRecipe();
  // the neck, pinching the body into two lobes
  const u = (d.x - NECK_AT) / NECK_WIDTH;
  const waist = Math.abs(u) < 1 ? (1 - u * u) * (1 - u * u) : 0;
  const pinch = NECK * waist * (1 + NECK_BEND * d.y);
  // the large lumps, on a larger lobe and a smaller one
  let height = LOBES * d.x + LUMPS * noise.fractal(d.x * LUMP_FREQUENCY, d.y * LUMP_FREQUENCY, d.z * LUMP_FREQUENCY, 4);
  // rough terrain and dust plains: the dust gathers in the neck and in wide basins
  const rough = smooth(noise.fractal(d.x * 1.7 + 41.3, d.y * 1.7 - 7.1, d.z * 1.7 + 13.9, 2), -0.08, 0.16) * (1 - 0.85 * waist);
  // terraces: steps of the rough ground, each ending in a cliff
  const q = (noise.fractal(d.x * 2.9 + 77.7, d.y * 2.9 + 3.3, d.z * 2.9 - 29.1, 3) + 0.5) * TERRACE_STEPS;
  const step = Math.floor(q), f = q - step;
  const rise = f < 1 - CLIFF ? 0 : smooth(f, 1 - CLIFF, 1);
  // (a terrace's mean lies half a step less half its cliff below the slope through it)
  height += TERRACE_HEIGHT * (q - TERRACE_STEPS / 2 + rough * (step + rise + (1 - CLIFF) / 2 - q));
  // a cliff's face, where the ice beneath shows
  const cliff = rough * 4 * rise * (1 - rise);
  // the sinkholes: flat floors, steep walls
  let wall = 0;
  for (const sink of sinkholes) {
    const t = pitDistance(d, sink);
    if (t >= 1) continue;
    height -= sink.depth * (t < SINK_FLOOR ? 1 : 1 - smooth(t, SINK_FLOOR, 1));
    const s = (t - SINK_FLOOR) / (1 - SINK_FLOOR);
    if (s > 0) wall = Math.max(wall, 4 * s * (1 - s));
  }
  // the crust's tone: patchy, the dust of the plains a little lighter than the rough ground
  let light = (0.85 + 0.3 * noise.fractal(d.x * 5 + 11.1, d.y * 5 - 23.3, d.z * 5 + 5.5, 3)) * (1.08 - 0.16 * rough);
  if (fine) {
    const pits = nucleusRecipe().pitGrid.get(pitCell(d.x, d.y, d.z));
    if (pits) {
      for (const pit of pits) {
        const t = pitDistance(d, pit);
        if (t >= 1.4) continue;
        // pitted only where the ground is rough
        const depth = pit.depth * rough;
        const rim = (1.4 - t) / 0.4;
        height += t < 1 ? depth * (t * t - 1) : depth * 0.2 * rim * rim;
        if (t < 1) light *= 1 - 0.2 * rough * (1 - t * t);
      }
    }
    // boulders lying about, a little brighter than the dust around them
    const boulder = noise.sample(d.x * 30 + 101.1, d.y * 30 - 55.5, d.z * 30 + 7.3) - 0.5;
    if (boulder > 0) {
      const k = boulder / 0.5;
      height += 0.012 * k * k * (0.4 + 0.6 * rough);
      light *= 1 + 0.25 * k;
    }
    // grain of the crust
    height += 0.0012 * noise.sample(d.x * 40 - 19.9, d.y * 40 + 33.3, d.z * 40 + 61.1);
    light *= 0.94 + 0.12 * noise.sample(d.x * 60 + 3.7, d.y * 60 - 8.1, d.z * 60 + 2.2);
  }
  // exposed ice: on some cliffs, the sinkholes' walls, and a few patches between
  const iceOnCliffs = smooth(noise.sample(d.x * 7 - 51.7, d.y * 7 + 19.1, d.z * 7 + 87.3), 0.4, 0.6);
  // (frayed by a finer noise, so a patch is ragged, never a round spot)
  const patches = smooth(noise.sample(d.x * 5 + 7.7, d.y * 5 + 91.9, d.z * 5 - 3.3) + 0.4 * noise.sample(d.x * 23 - 9.1, d.y * 23 + 4.4, d.z * 23 + 71.7), 0.78, 0.92);
  const ice = Math.min(1, cliff * iceOnCliffs + wall * wall * 0.8 + patches);
  light += (ICE_LIGHT - light) * ice;
  out.bump = (1 + height) * (1 - pinch) - 1;
  out.value = Math.min(1, light / LIGHT_RANGE);
  return out;
}

/** The nucleus as its relief map shows it (see nucleusSample). */
const sampler: ReliefSampler = (direction, out) => nucleusSample(direction, true, out);

/** The six faces of the nucleus's relief map: as a rock's (see world/rocks, reliefMap), its alpha the brightness over LIGHT_RANGE. Baked by the same workers. */
export function bakeNucleusRelief(): Uint8Array[] {
  return bakeCube(NUCLEUS_AXES, sampler);
}

/** The nucleus's relief map (see bakeNucleusRelief). */
export function nucleusReliefMap(): THREE.CubeTexture {
  return cachedRelief('nucleus', 0, bakeNucleusRelief);
}

/** The nucleus's surface normal as its relief map holds it, from finite differences `step` (radians) to either side: what a test reads the baked map against, and the vents' way out. */
export function nucleusNormal(direction: THREE.Vector3, step: number): THREE.Vector3 {
  return samplerNormal(NUCLEUS_AXES, sampler, direction, step);
}

/** The nucleus's surface at a direction as its relief map holds it (see nucleusSample). */
export function nucleusTexel(direction: THREE.Vector3): ReliefTexel {
  return nucleusSample(direction, true, { bump: 0, value: 0 });
}

/** The point of the nucleus's outline at a direction (unit vector), `radius` its scale, written into `target`. */
function outlinePoint(direction: THREE.Vector3, radius: number, target: THREE.Vector3, sampled: ReliefTexel): THREE.Vector3 {
  const { bump } = nucleusSample(direction, false, sampled);
  return target.copy(direction).multiply(NUCLEUS_AXES).multiplyScalar(radius * (1 + bump));
}

/**
 * The nucleus's mesh at a detail (subdivisions of the icosahedron), `radius` its scale (units):
 * the sphere's shared vertices moved out along their directions onto its outline, so it stays
 * one closed surface that never folds over itself (every direction from the center meets it
 * once).
 */
export function nucleusGeometry(detail: number, radius: number): THREE.BufferGeometry {
  const geometry = sphere(detail).clone();
  const position = geometry.attributes.position;
  const direction = new THREE.Vector3(), point = new THREE.Vector3(), sampled = { bump: 0, value: 0 };
  for (let i = 0; i < position.count; i++) {
    outlinePoint(direction.fromBufferAttribute(position, i).normalize(), radius, point, sampled);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A vent of the nucleus: where on it (its own frame, scaled by the radius) and the way its jet leaves (unit length). */
export interface Vent {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/** The step of a vent's way out (rad): wide, so it follows the ground around the sinkhole, not its walls. */
const VENT_STEP = 0.2;

/** The nucleus's vents, `radius` its scale: the floors of its sinkholes, where the ice beneath boils off as the sun reaches them. */
export function nucleusVents(radius: number): Vent[] {
  const sampled = { bump: 0, value: 0 };
  return nucleusRecipe().sinkholes.map((sink) => ({
    point: outlinePoint(sink.center, radius, new THREE.Vector3(), sampled),
    normal: nucleusNormal(sink.center, VENT_STEP),
  }));
}

/** How strongly the shared detail tile tilts the nucleus's normal up close. */
const NUCLEUS_DETAIL = 0.8;

/**
 * The nucleus's material (see patchRelief): its relief map's normal and brightness, exposed ice
 * cool white, the crust dark and dull; `closeUp` lays the rocks' shared detail tile over it.
 */
export function nucleusMaterial(closeUp: boolean): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...NUCLEUS_COLOR, THREE.LinearSRGBColorSpace), roughness: 1, metalness: 0 });
  patchRelief(material, {
    kind: 'nucleus',
    map: nucleusReliefMap(),
    axes: NUCLEUS_AXES.clone(),
    detail: closeUp ? detailMap() : null,
    strength: NUCLEUS_DETAIL,
    uniforms: { nucleusIce: { value: new THREE.Vector3(...ICE_TINT) } },
    pars: 'uniform vec3 nucleusIce;',
    color: NUCLEUS_RELIEF_COLOR,
  });
  return material;
}

/** The relief's brightness worked into the crust's color, the detail tile's grain on it up close; ice tinted cool white, and a little smoother. */
const NUCLEUS_RELIEF_COLOR = /* glsl */ `
	float nucleusLight = reliefTexel.a * ${LIGHT_RANGE.toFixed(1)} * mix( 1.0, reliefTile * 2.0, reliefNear );
	float nucleusIceShare = smoothstep( 2.0, ${(ICE_LIGHT - 1).toFixed(1)}, nucleusLight );
	diffuseColor.rgb *= nucleusLight * mix( vec3( 1.0 ), nucleusIce, nucleusIceShare );
`;
