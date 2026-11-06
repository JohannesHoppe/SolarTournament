import * as THREE from 'three';
import { hypot } from '../detmath';
import { Noise } from './noise';
import { Randomizer } from '../random';
import type { Placement } from './asteroids';

/**
 * Occator on Ceres (the campaign's chapter 3, see docs/campaign/): the Rockborn's capital built
 * into the inner wall of the crater Occator. Where things are, for the field and its scenery
 * (world/occator).
 *
 * The place's y is the true vertical. The field flies over the market terrace, a shelf of the
 * crater's wall slumped into steps: behind it the wall climbs in STEPS steps of habitat domes
 * and gallery mouths to the rim's crest; before it the terrace's edge drops to the crater floor,
 * which runs out some 40 km to the bright salt of Cerealia Facula round the dome in the crater's
 * middle. Ceres's surface curves away beyond the rim.
 *
 * The place is laid out along its own axes: `u` across the wall, from the crater towards the
 * rim, and `w` along it. The crater lies towards the sun, so the low sun of the place lights the
 * wall's faces: world x is -w, world z is u (see onPlace).
 */

/** 1 km in units. */
const KM = 20000;

/** A point of the place's own axes (u across the wall towards the rim, w along it) in the world. */
export const onPlace = (u: number, y: number, w: number) => new THREE.Vector3(-w, y, u);
/** Half extents along the place's axes (u, y, w) as the world's. */
const worldHalf = (half: THREE.Vector3) => new THREE.Vector3(half.z, half.y, half.x);

/** The market terrace under the field's center (units, 60 m below it). */
export const TERRACE = -1200;
/** Ceres's pull on its surface (units/s²): 0.28 m/s², about a 35th of a g, from its mass of 9.4 × 10²⁰ kg over its mean radius of 470 km. */
export const CERES_FALL = 5.6;
/** Ceres's mean radius (units, 470 km). */
const CERES_RADIUS = 470 * KM;

/** The terrace along u: from its edge over the crater floor to the foot of the wall's first step, and as wide along w (units). */
export const TERRACE_EDGE = -2 * KM;
export const CLIFF_X = 0.8 * KM;
export const TERRACE_WIDTH = 6 * KM;
/** The terrace's solid box along the place's axes, 400 m thick under its top. */
export const TERRACE_HALF = new THREE.Vector3((CLIFF_X - TERRACE_EDGE) / 2, 8000, TERRACE_WIDTH / 2);
/** The wall above the terrace: STEPS steps, each STEP_RISE high (units, 300 m) and STEP_DEPTH deep (1.5 km), up to the rim's crest. */
export const STEPS = 4;
export const STEP_RISE = 6000;
export const STEP_DEPTH = 1.5 * KM;
/** Where step `k` (1 the first above the terrace) begins (its face, units along u) and the height of its top. */
export const stepFace = (k: number) => CLIFF_X + (k - 1) * STEP_DEPTH;
export const stepTop = (k: number) => TERRACE + k * STEP_RISE;
/** The rim's crest, at the top of the last step. */
const CREST_X = stepFace(STEPS) + STEP_DEPTH;
const CREST = stepTop(STEPS);
/** A step's solid box along the place's axes: from its face to the next one's, from the terrace's base to its top. */
export const stepHalf = (k: number) => new THREE.Vector3(STEP_DEPTH / 2, (stepTop(k) - (TERRACE - 2 * TERRACE_HALF.y)) / 2, TERRACE_WIDTH / 2);

/** The crater floor under the terrace's edge (units, 1.5 km below the terrace). */
const FLOOR = TERRACE - 1.5 * KM;
/** Occator's radius (units, 46 km), its middle along -u from the rim's crest above the field. */
const OCCATOR_RADIUS = 46 * KM;
const CENTER_X = CREST_X - OCCATOR_RADIUS;
/** Cerealia Tholus, the dome in the crater's middle: 3 km across, 400 m high, in a pit 9 km across and 300 m deep. */
const DOME_RADIUS = 1.5 * KM;
const DOME_HEIGHT = 0.4 * KM;
const PIT_RADIUS = 4.5 * KM;
const PIT_DEPTH = 0.3 * KM;
/** Hills and slumps over the floor, a few hundred meters, some 6 km across; none on the terrace. */
const HILLS = 0.25 * KM;
const HILL_SCALE = 6 * KM;
const hillNoise = new Noise(3003);

/** How far the scenery reaches from the field (units, 160 km): across the crater and past its far rim. */
export const SURFACE_REACH = 160 * KM;

/** The middle of Occator, on its floor: where Cerealia Facula lies (along the place's axes, u and w). */
const CEREALIA_U = CENTER_X;
const CEREALIA_W = 0;
/** Vinalia Faculae, the thinner bright spots east of the middle: their middle (u, w). */
const VINALIA_U = CENTER_X + 16 * KM;
const VINALIA_W = 12 * KM;
/** Cerealia Facula in the world (units). */
export const CEREALIA = onPlace(CEREALIA_U, FLOOR, CEREALIA_W);

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * Ceres's surface (units, its height) over the world's (x, z): the crater floor out from the
 * terrace's edge, the pit and Cerealia's dome in the middle, the far wall climbing to the rim,
 * the steps of the near wall to its crest, Ceres's curve beyond the rim.
 */
export function surfaceHeight(x: number, z: number): number {
  return planHeight(z, -x);
}

/** surfaceHeight along the place's axes (u, w). */
export function planHeight(u: number, w: number): number {
  const out = hypot(u - CENTER_X, w);
  // how far inside the rim's crest, along the crater's radius: the field's center lies CREST_X inside it
  const inside = OCCATOR_RADIUS - out;
  let height: number;
  if (inside <= 0) {
    // the rim's outer flank falling away
    height = CREST - 1.2 * KM * smooth(-inside / (15 * KM));
  } else if (inside < CREST_X - CLIFF_X) {
    // the wall's steps, the last one at the crest
    height = stepTop(STEPS - Math.floor(inside / STEP_DEPTH));
  } else if (inside < CREST_X - TERRACE_EDGE) {
    height = TERRACE;
  } else {
    // over the terrace's edge, down to the floor within a kilometer, then the floor out to the middle
    height = TERRACE + (FLOOR - TERRACE) * smooth((inside - (CREST_X - TERRACE_EDGE)) / KM);
    if (out < PIT_RADIUS) height -= PIT_DEPTH * (1 - smooth(out / PIT_RADIUS));
    if (out < DOME_RADIUS) height += DOME_HEIGHT * (1 - (out * out) / (DOME_RADIUS * DOME_RADIUS));
  }
  // hills over all of it but near the field, and Ceres's own curve
  const near = Math.min(1, Math.max(0, (hypot(u, w) - 8 * KM) / (8 * KM)));
  const hills = HILLS * hillNoise.fractal(u / HILL_SCALE, 0.5, w / HILL_SCALE, 4) * near;
  return height + hills - (u * u + w * w) / (2 * CERES_RADIUS);
}

/** How bright the salt lies at the world's (x, z): 1 on Cerealia Facula's heart, less over Vinalia's thinner spots, 0 on the dark floor. */
export function saltAt(x: number, z: number): number {
  const u = z;
  const w = -x;
  const cerealia = 1 - smooth(hypot(u - CEREALIA_U, w - CEREALIA_W) / (6 * KM));
  const vinalia = 0.55 * (1 - smooth(hypot(u - VINALIA_U, w - VINALIA_W) / (5 * KM)));
  return Math.max(cerealia, vinalia);
}

/**
 * The capital's habitat domes, each a half sphere of plating and glass standing on the terrace
 * or on a step of the wall (its middle on the ground along the place's axes (u, y, w), its
 * radius, units), from the place's seed: the terrace's few clear of the lane from the field's
 * middle to the market, more on the steps.
 */
export interface HabitatDome {
  at: THREE.Vector3;
  radius: number;
}
export const DOMES: readonly HabitatDome[] = (() => {
  const r = new Randomizer(3003);
  const domes: HabitatDome[] = [];
  const room = (at: THREE.Vector3, radius: number) => domes.every((dome) => dome.at.distanceTo(at) > dome.radius + radius + 1600);
  // on the terrace, off the lane to the market (|w| beyond 600 m) and back from its edge
  for (let tries = 0; tries < 60 && domes.length < 6; tries++) {
    const radius = r.range(1600, 3200);
    const at = new THREE.Vector3(r.range(TERRACE_EDGE + 8000, CLIFF_X - radius - 1200), TERRACE, r.range(-1, 1) * (TERRACE_WIDTH / 2 - radius - 2000));
    if (Math.abs(at.z) > 12000 + radius && room(at, radius)) domes.push({ at, radius });
  }
  // on the steps, crowding them as terraces of a town do
  for (let k = 1; k <= STEPS; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const radius = r.range(2000, 4400);
      const at = new THREE.Vector3(r.range(stepFace(k) + radius + 1000, stepFace(k) + STEP_DEPTH - radius - 1000), stepTop(k), r.range(-1, 1) * (TERRACE_WIDTH / 2 - radius - 1000));
      if (room(at, radius)) domes.push({ at, radius });
    }
  }
  return domes;
})();

/** The market's gallery: its mouth in the face of the wall's first step, over the terrace, facing the field (u, y, w; units). */
export const MARKET_PLAN = new THREE.Vector3(CLIFF_X, TERRACE + 2400, 0);
/** The market's mouth in the world. */
export const MARKET = onPlace(MARKET_PLAN.x, MARKET_PLAN.y, MARKET_PLAN.z);
/** Where a ship holds to be taken in by the market's dock: 80 m before its mouth, in the world. */
export const MARKET_DOCK = onPlace(CLIFF_X - 1600, MARKET_PLAN.y, MARKET_PLAN.z);
/** The mouth's half width and half height (units, 60 m by 40 m). */
export const MARKET_HALF = new THREE.Vector2(1200, 800);

/**
 * The terrace's solid box, the boxes of the wall's steps above it and the domes (each the box
 * inside its half sphere), as the field's pieces of kind 'rack' they are (`first` the first of
 * their types in the yards' set, see world/yard): the terrace, steps 1 to STEPS, then one type
 * per dome (OCCATOR_BOXES).
 */
export function occatorPlacements(first: number): Placement[] {
  const level = new THREE.Quaternion();
  const base = TERRACE - 2 * TERRACE_HALF.y;
  const pieces: Placement[] = [{ kind: 'rack', type: first, scale: 1, position: onPlace((TERRACE_EDGE + CLIFF_X) / 2, TERRACE - TERRACE_HALF.y, 0), orientation: level, solid: true, ground: true }];
  for (let k = 1; k <= STEPS; k++) {
    const half = stepHalf(k);
    pieces.push({ kind: 'rack', type: first + k, scale: 1, position: onPlace(stepFace(k) + half.x, base + half.y, 0), orientation: level, solid: true, ground: true });
  }
  DOMES.forEach((dome, i) => pieces.push({ kind: 'rack', type: first + 1 + STEPS + i, scale: 1, position: onPlace(dome.at.x, dome.at.y + dome.radius * 0.275, dome.at.z), orientation: level, solid: true }));
  return pieces;
}

/** The half extents of the place's templates in occatorPlacements' order, in the world: the terrace, the steps, the box inside each dome. */
export const OCCATOR_BOXES: readonly THREE.Vector3[] = [TERRACE_HALF, ...Array.from({ length: STEPS }, (_, k) => stepHalf(k + 1)), ...DOMES.map((dome) => new THREE.Vector3(dome.radius * 0.55, dome.radius * 0.275, dome.radius * 0.55))].map(worldHalf);
