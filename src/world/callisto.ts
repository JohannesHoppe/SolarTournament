import * as THREE from 'three';
import { cos, hypot, pow, sin } from '../detmath';
import { Randomizer } from '../random';
import { Noise } from './noise';
import { reliefPiece } from './horizon';
import type { Placement } from './asteroids';

/**
 * Valhalla on Callisto (the campaign's chapter 5, see docs/campaign/): a stretch of the ring zone
 * of the great basin on Jupiter's outermost large moon, the most cratered ground in the system.
 * Where things are, for the field and its scenery (world/valhalla).
 *
 * The place's y is the true vertical. Valhalla's middle lies far off along -x, so its rings cross
 * the field as long ridges running along z, one after the other towards +x, each rising gently
 * from the basin's side and dropping off in a scarp on the far side. Craters of every size lie
 * over all of it, the old ones flattened, the fresh ones deep. Jupiter stands still in the sky:
 * Callisto keeps one face to it.
 */

/** 1 km in units. */
const KM = 20000;

/** Callisto's pull at its surface (units/s²): 1.24 m/s², an eighth of a g, from its mass of 1.08 × 10²³ kg over its radius of 2,410 km. */
export const CALLISTO_FALL = 24.7;
/** Callisto's radius (units, 2,410 km): its ground falls away by some 20 m at 10 km. */
const CALLISTO_RADIUS = 2410 * KM;

/** The ground under the field's middle (units, 100 m below it). */
export const LAND = -2000;

/**
 * Valhalla's rings across the field: a ridge every RING_SPACING (units, 1.5 km) out from the
 * basin's middle at VALHALLA, RIDGE (150 m) high, rising over RING_RISE of the spacing and
 * dropping off over the rest. The real rings lie farther apart; here they are packed closer,
 * so that a sprint over the field crosses several.
 */
export const VALHALLA = new THREE.Vector3(-600 * KM, 0, 0);
export const RING_SPACING = 1.5 * KM;
const RIDGE = 3000;
const RING_RISE = 0.8;

/** The craters: CRATERS of them over CRATER_REACH around the field's middle, their radii from CRATER_MIN to CRATER_MAX (units, 40 m to 700 m), the small ones many. */
const CRATERS = 260;
const CRATER_REACH = 10 * KM;
const CRATER_MIN = 800;
const CRATER_MAX = 14000;
/** A crater's bowl: its depth a share of its radius, its rim's height and width shares too; an old one (a share of them) flattened by what struck since. */
const BOWL = 0.32;
const RIM = 0.07;
const RIM_WIDTH = 0.45;
/** Hummocks and boulders over all of it: a few meters, some 150 m across. */
const BUMPS = 90;
const BUMP_SCALE = 3000;
const bumps = new Noise(5005);

type Crater = { x: number; z: number; radius: number; depth: number };
/** The craters, cell by cell (CELL across), each listed in every cell its rim reaches into. */
const CELL = 2 * CRATER_MAX;
const cellKey = (cx: number, cz: number) => cx * 4096 + cz;
const craterCells = new Map<number, Crater[]>();
{
  const random = new Randomizer(5050);
  for (let i = 0; i < CRATERS; i++) {
    const x = (random.nextFloat() * 2 - 1) * CRATER_REACH;
    const z = (random.nextFloat() * 2 - 1) * CRATER_REACH;
    // radii falling off as a power, as a crater count does: many small, few large
    const radius = CRATER_MIN + (CRATER_MAX - CRATER_MIN) * pow(random.nextFloat(), 3);
    const depth = random.nextFloat() < 0.4 ? 0.35 : 1;
    const crater = { x, z, radius, depth };
    const reach = radius * (1 + RIM_WIDTH);
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
        const key = cellKey(cx, cz);
        const list = craterCells.get(key);
        if (list) list.push(crater);
        else craterCells.set(key, [crater]);
      }
    }
  }
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** A crater's relief at `out` (the distance from its middle in its radii): the bowl a parabola up to the rim, the rim a raised cosine over its width. */
function craterAt(crater: Crater, out: number): number {
  const bowl = out < 1 ? -BOWL * crater.radius * crater.depth * (1 - out * out) : 0;
  const off = Math.abs(out - 1) / RIM_WIDTH;
  const rim = off < 1 ? RIM * crater.radius * crater.depth * (0.5 + 0.5 * cos(Math.PI * off)) : 0;
  return bowl + rim;
}

/** Valhalla's ring at a distance from its middle: a gentle rise over RING_RISE of the spacing, then the scarp down. */
export function ringAt(out: number): number {
  const phase = out / RING_SPACING - Math.floor(out / RING_SPACING);
  return RIDGE * (phase < RING_RISE ? smooth(phase / RING_RISE) : 1 - smooth((phase - RING_RISE) / (1 - RING_RISE)));
}

/** Callisto's ground (units, its height) over (x, z): Valhalla's ridges, the craters, hummocks over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  let height = LAND + ringAt(hypot(x - VALHALLA.x, z - VALHALLA.z));
  const craters = craterCells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (craters) for (const crater of craters) height += craterAt(crater, hypot(x - crater.x, z - crater.z) / crater.radius);
  return height + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.7, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * CALLISTO_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 8 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(8 * KM, 2 * KM, 8 * KM);
/** Its box's top: over the highest the ground gets there, a ridge's crest with two craters' rims overlapping on it and the hummocks. */
const GROUND_TOP = LAND + RIDGE + 2 * RIM * CRATER_MAX + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/**
 * The Navy's old listening post among the craters (the third echo, see Callisto Echo): a bunker
 * half sunk into the ground, a lattice tower with a dish turned up at the sky, aerial masts; one
 * solid box of POST_HALF (units, 70 by 90 by 50 m) standing BURIED in the ground at POST_SPOT.
 */
export const POST_HALF = new THREE.Vector3(700, 900, 500);
// a flat stretch between the craters: the ground under the box within 3 m of level
const POST_SPOT = [10000, -34000] as const;
const BURIED = 200;
export const POST_AT = new THREE.Vector3(POST_SPOT[0], surfaceHeight(POST_SPOT[0], POST_SPOT[1]) + POST_HALF.y - BURIED, POST_SPOT[1]);

/** The post as the field's piece of kind 'rack' (type `type` in the yards' set). */
export function postPlacement(type: number): Placement {
  return { kind: 'rack', type, scale: 1, position: POST_AT.clone(), orientation: new THREE.Quaternion(), solid: true };
}

/** Where the HUD marks the basin: towards Valhalla's middle, on the ground at the field's edge (units). */
export const VALHALLA_MARK = new THREE.Vector3(-GROUND_HALF.x, surfaceHeight(-GROUND_HALF.x, 0), 0);

/**
 * Jupiter over Valhalla: Callisto keeps one face to it, so it stands still in the sky, some 34°
 * up, 4.4° across (from 1.88 million km off, its radius 71,500 km), eight times as wide as the
 * full moon from Earth; drawn as a sphere at JUPITER_DISTANCE (units, inside the sky's sphere of
 * stars, which it hides) sized to look as large.
 */
const JUPITER_DISTANCE = 250000;
const JUPITER_ANGLE = 0.038;
const JUPITER_UP = 0.59;
// on the sky's side away from the sun (see SUN_DIRECTION), so its lit face shows
export const JUPITER_AT = new THREE.Vector3(cos(JUPITER_UP) * 0.6, sin(JUPITER_UP), cos(JUPITER_UP) * 0.8).normalize().multiplyScalar(JUPITER_DISTANCE);
export const JUPITER_SIZE = JUPITER_DISTANCE * sin(JUPITER_ANGLE);
