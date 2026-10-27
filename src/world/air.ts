import * as THREE from 'three';
import { MAX_SPEED } from '../ship/flight';

/**
 * The air of a planet the arena dips into (Jupiter): a shell whose top, the cloud deck, is a
 * sphere of `radius` around `center` (units). Everything here is a function of where a ship is
 * and how fast it flies, the same on every browser: what the haze hides (sight, radar, lock,
 * the laser's reach), how the air brakes a ship, how it heats its hull.
 */
export interface Air {
  center: THREE.Vector3;
  radius: number;
}

/**
 * The air's density, relative to its density right under the cloud deck, grows by e every
 * SCALE_HEIGHT downwards (units, 870 m: tenfold over 2 km), as a real atmosphere's does, only
 * squeezed: the real Jupiter's scale height is some 27 km. Over the deck the air is TOP_DENSITY
 * of that and thins by e every TOP_HEIGHT (units, 100 m), a faint upper haze over the clouds.
 * Deeper than DEEPEST scale heights (26 km) nothing changes any more, which no ship ever reaches.
 */
const SCALE_HEIGHT = 17400;
const TOP_HEIGHT = 2000;
const TOP_DENSITY = 0.1;
const DEEPEST = 30;
/**
 * The cloud deck itself is a sheet the eye and the senses see through only so far: crossing it
 * adds DECK_DEPTH to a line's optical depth straight on, more the more slanted the line (as the
 * deck's sheet in the picture holds back about 78 % straight on, see world/jupiter). A ship that
 * dives through it breaks the line to a chaser above it.
 */
const DECK_DEPTH = 1.5;

/**
 * The haze's extinction at the deck (per unit): 3 / 2.5 km, so the eye sees 2.5 km there (the
 * contrast of a dark ship against the haze falls to 5 % at an optical depth of 3); at 1 km below
 * the deck 790 m, at 2 km 250 m (see SIGHT_DEPTH).
 */
export const HAZE = 3 / 50000;

/**
 * How far a sense reaches through the haze, as the optical depth of the line (dimensionless,
 * the haze's extinction summed along it): the eye and the laser SIGHT_DEPTH (the beam scatters
 * in the haze, it hits as far as the eye sees), the radar RADAR_DEPTH (twice as far), the lock
 * of a torpedo and the lock warning LOCK_DEPTH (two thirds of the eye's reach).
 */
export const SIGHT_DEPTH = 3;
export const RADAR_DEPTH = 6;
export const LOCK_DEPTH = 2;

/** One standard gravity (units/s², 1 unit = 5 cm). */
const G = 196.2;
/**
 * The air brakes a ship by its speed squared and the air's density: at the deck by DECK_DRAG at
 * the tournament's speed limit (1.5 g at 250 m/s), ten times that 2 km below it. The main drive
 * (13 g) still holds the limit down to 1.9 km below the deck; deeper its push and the drag meet
 * at less (200 m/s at 2.25 km, 105 m/s at 3.4 km, the arena's bottom).
 */
const DECK_DRAG = 1.5 * G;
const DRAG = DECK_DRAG / (MAX_SPEED * MAX_SPEED);

/**
 * The air heats the hull by the cube of the speed and the air's density (heat units per second,
 * the laser's scale: 100 locks it): DECK_HEAT at the deck at the speed limit. The radiators shed
 * 50 a second in the air (the sun hidden behind the clouds, as in a rock's shadow; see
 * ship/ship), so at the limit the hull heats up from 600 m below the deck on (see safeSpeed).
 */
const DECK_HEAT = 25;
/** Once the radiators are full, every unit of heat the air adds beyond what they shed burns this much hull (100 is a whole ship; see airBurn). */
export const AIR_BURN = 0.075;

/**
 * Puts `heat` of the air (heat units, over a step of `dt` seconds) into a hull's radiators,
 * which shed `cooling` a second and are full at `full`: while they are full, what the air adds
 * beyond what they shed stays out of them and burns the hull instead, AIR_BURN per unit; a full
 * radiator overheats the laser. Returns the hull points burnt.
 */
export function airBurn(hull: { heat: number; overheated: boolean; readonly cooling: number }, heat: number, dt: number, full: number): number {
  const filled = hull.heat + heat >= full;
  const beyond = filled ? Math.max(0, heat - hull.cooling * dt) : 0;
  hull.heat += heat - beyond;
  if (filled) hull.overheated = true;
  return beyond * AIR_BURN;
}

/** Altitude above the cloud deck (units, negative below it). */
export const altitudeIn = (air: Air, position: THREE.Vector3) => position.distanceTo(air.center) - air.radius;

/** How the density falls off at an altitude (units): its scale height, and its share at the deck. */
const TOP = { height: TOP_HEIGHT, share: TOP_DENSITY };
const BELOW = { height: SCALE_HEIGHT, share: 1 };
const layer = (altitude: number) => (altitude > 0 ? TOP : BELOW);

/** The air's density at an altitude (units), relative to the density right under the deck. */
export function density(altitude: number): number {
  const { height, share } = layer(altitude);
  return share * Math.exp(-Math.max(altitude, -DEEPEST * SCALE_HEIGHT) / height);
}

/** The density summed from the deck to an altitude (units of length times the density under the deck; negative below the deck). */
function column(altitude: number): number {
  const { height, share } = layer(altitude);
  return share * height * (1 - Math.exp(-Math.max(altitude, -DEEPEST * SCALE_HEIGHT) / height));
}

/**
 * The mean density on a line between two altitudes (units), the altitude taken to change evenly
 * along it: exact for a straight line through flat layers, and close for the arena's few
 * kilometers on a planet of 40 km.
 */
function meanDensity(from: number, to: number): number {
  const rise = to - from;
  return Math.abs(rise) < 10 ? density((from + to) / 2) : (column(to) - column(from)) / rise;
}

/**
 * The optical depth between two points (see SIGHT_DEPTH): the haze's, which the shaders' fog
 * computes alike (see view/haze), and the deck's where the line crosses it (see DECK_DEPTH),
 * which the deck's sheet draws.
 */
export function opticalDepth(air: Air, from: THREE.Vector3, to: THREE.Vector3): number {
  const length = from.distanceTo(to);
  const a = altitudeIn(air, from);
  const b = altitudeIn(air, to);
  const haze = HAZE * length * meanDensity(a, b);
  if (a > 0 === b > 0 || length < 1e-6) return haze;
  deckCrossing(air, from, line.subVectors(to, from).divideScalar(length));
  return haze + DECK_DEPTH * slant;
}

const line = new THREE.Vector3();
const fromCenter = new THREE.Vector3();
/** How slanted the last ray crossed the deck (see deckCrossing): one over the cosine of its angle to the deck's normal. */
let slant = 1;

/** How far along a ray from `origin` along `direction` (unit length) it crosses the cloud deck (units; Infinity for never), and how slanted, in `slant`. */
function deckCrossing(air: Air, origin: THREE.Vector3, direction: THREE.Vector3): number {
  fromCenter.subVectors(origin, air.center);
  const along = direction.dot(fromCenter);
  const outside = fromCenter.lengthSq() - air.radius * air.radius;
  const disc = along * along - outside;
  if (disc < 0) return Infinity;
  const distance = outside > 0 ? -along - Math.sqrt(disc) : -along + Math.sqrt(disc);
  if (distance < 0) return Infinity;
  // the cosine at the crossing: the ray's direction against the sphere's normal there
  slant = Math.min(air.radius / Math.max(Math.abs(along + distance), 1e-9), MAX_SLANT);
  return distance;
}
/** A ray that grazes the deck crosses it at no more than this slant (a cosine of 1/1000). */
const MAX_SLANT = 1000;

/**
 * How far a ray from `origin` along `direction` (unit length) reaches before the haze and the
 * deck it crosses sum up to `depth` (units), at most `max` (and REACH_SEARCH for no limit): the
 * line's optical depth (see opticalDepth), which grows along the ray, searched by halving to a
 * REACH_STEPS-th of a share, so a beam ends where the senses stop seeing.
 */
export function reachIn(air: Air, origin: THREE.Vector3, direction: THREE.Vector3, depth: number, max: number): number {
  const far = Math.min(max, REACH_SEARCH);
  if (opticalDepth(air, origin, end.copy(origin).addScaledVector(direction, far)) <= depth) return max;
  let near = 0;
  let beyond = far;
  for (let i = 0; i < REACH_STEPS; i++) {
    const middle = (near + beyond) / 2;
    if (opticalDepth(air, origin, end.copy(origin).addScaledVector(direction, middle)) <= depth) near = middle;
    else beyond = middle;
  }
  return near;
}
/** reachIn looks this far at most (units, 50 km, beyond the camera's reach), and halves its bounds this often (to a fraction of a millimeter over that). */
const REACH_SEARCH = 1000000;
const REACH_STEPS = 40;
const end = new THREE.Vector3();

/**
 * Adds the air's drag on a ship flying at `velocity` (units/s) to `acceleration` (units/s²), for
 * a step of `dt` seconds: the speed the step takes is that of dv/dt = -k v|v| solved over the
 * step, so a slow frame never brakes a ship past standstill.
 */
export function dragOn(air: Air, position: THREE.Vector3, velocity: THREE.Vector3, dt: number, acceleration: THREE.Vector3): THREE.Vector3 {
  const speed = velocity.length();
  const k = DRAG * density(altitudeIn(air, position));
  if (speed < 1e-6 || dt <= 0 || k * speed < 1e-9) return acceleration;
  const lost = speed - speed / (1 + k * speed * dt);
  return acceleration.addScaledVector(velocity, -lost / (speed * dt));
}

/** How far a sense reaching `depth` (see SIGHT_DEPTH) sees through level haze at an altitude under the deck (units), the planet's curve left out: for the docs. */
export const reachAt = (altitude: number, depth: number) => depth / (HAZE * density(altitude));

/** The air's drag at a place and speed (units/s²), for the readouts and the docs. */
export const dragAt = (altitude: number, speed: number) => DRAG * density(altitude) * speed * speed;

/** Heat the air puts into a hull per second at an altitude (units) and speed (units/s). */
export const airHeat = (altitude: number, speed: number) => DECK_HEAT * density(altitude) * (speed / MAX_SPEED) ** 3;

/**
 * The fastest a ship flies at an altitude without the air heating its hull beyond what its
 * radiators shed (`cooling`, heat units per second; units/s): above 600 m below the deck the
 * tournament's limit; 214 m/s at 1 km, 146 m/s at 2 km, 87 m/s at the arena's bottom.
 */
export const safeSpeed = (altitude: number, cooling: number) => Math.min(MAX_SPEED, MAX_SPEED * Math.cbrt(cooling / (DECK_HEAT * density(altitude))));

/** The haze's numbers for the shaders (see view/haze): extinction, scale heights, the clamp of the depth. */
export const HAZE_SHAPE = { haze: HAZE, scale: SCALE_HEIGHT, top: TOP_HEIGHT, topDensity: TOP_DENSITY, deepest: DEEPEST, deck: DECK_DEPTH };
