import * as THREE from 'three';
import { MAX_SPEED } from '../ship/flight';
import { cbrt, exp, pow } from '../detmath';

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
 * which shed `cooling` a second and are full at `full`: the air fills them up to full, and what
 * it adds beyond that and beyond what they shed over the step stays out of them and burns the
 * hull instead, AIR_BURN per unit; so a hull that burns has full radiators (the alarm's CRITICAL,
 * the burning on screen), and radiators the laser filled past full burn only what the air adds
 * beyond what they shed. A full radiator overheats the laser. Returns the hull points burnt.
 */
export function airBurn(hull: { heat: number; overheated: boolean; readonly cooling: number }, heat: number, dt: number, full: number): number {
  const room = Math.max(0, full - hull.heat);
  const beyond = Math.max(0, heat - Math.max(room, hull.cooling * dt));
  hull.heat += heat - beyond;
  if (heat >= room) {
    // what goes in is at least the room left, so the radiators are full (kept exact against rounding)
    hull.heat = Math.max(hull.heat, full);
    hull.overheated = true;
  }
  return beyond * AIR_BURN;
}

/**
 * Under the deck the clouds' ammonia and sulfur crust over the radiators: CLOG_SECONDS (s) to
 * clog them through just under the deck, faster the deeper, twice as fast from CLOG_DEPTH (units,
 * 300 m) down, so a ship deep down still has the time to climb out; over the deck the crust boils
 * off in UNCLOG_SECONDS (s), quickly, so a ship that made it out is not burnt over the clouds. Clogged through, they shed
 * CLOG_LOSS less (see Ship.cooling), and the reactor's waste heat, REACTOR_WASTE (heat units per
 * second) at full clog, which clean radiators shed without a trace, builds up in them: the laser
 * locks within seconds, and what the radiators cannot hold burns the hull (see airBurn). The
 * clouds are a place to shake a chaser off, not to stay in.
 */
export const CLOG_SECONDS = 40;
export const CLOG_DEPTH = 6000;
export const UNCLOG_SECONDS = 4;
export const CLOG_LOSS = 0.9;
export const REACTOR_WASTE = 20;

/** The radiators' clog (0 clean, 1 through) after `dt` seconds at an altitude (units) over the deck. */
export function clogging(clog: number, altitude: number, dt: number): number {
  if (altitude >= 0) return Math.max(0, clog - dt / UNCLOG_SECONDS);
  return Math.min(1, clog + ((1 + Math.min(1, -altitude / CLOG_DEPTH)) * dt) / CLOG_SECONDS);
}

/** All the heat going into a hull's radiators in the air per second: the air's at an altitude (units) and speed (units/s), and the reactor's waste heat that a `clog` holds in. */
export const heatInto = (altitude: number, speed: number, clog: number) => airHeat(altitude, speed) + REACTOR_WASTE * clog;

/** Altitude above the cloud deck (units, negative below it). */
export const altitudeIn = (air: Air, position: THREE.Vector3) => position.distanceTo(air.center) - air.radius;

/**
 * Up in a planet's air: away from its center, wherever the arena's own axes point (writes into
 * `target`). The flight computer's aids in the air (the horizon, the climb) refer to it.
 */
export const upIn = (air: Air, position: THREE.Vector3, target: THREE.Vector3) => target.subVectors(position, air.center).normalize();

/**
 * A ship counts as in the air, for the flight computer's aids, below IN_AIR_TOP over the cloud
 * deck (units, 500 m): under the deck, in its clouds and in the upper haze over them, where the
 * eye loses the planet's horizon.
 */
export const IN_AIR_TOP = 10000;

/** The planet's air a ship at `position` is in (see IN_AIR_TOP), or null. */
export const airAround = (air: Air | null, position: THREE.Vector3): Air | null => (air && altitudeIn(air, position) < IN_AIR_TOP ? air : null);

/** How the density falls off at an altitude (units): its scale height, and its share at the deck. */
const TOP = { height: TOP_HEIGHT, share: TOP_DENSITY };
const BELOW = { height: SCALE_HEIGHT, share: 1 };
const layer = (altitude: number) => (altitude > 0 ? TOP : BELOW);

/** The air's density at an altitude (units), relative to the density right under the deck. */
export function density(altitude: number): number {
  const { height, share } = layer(altitude);
  return share * exp(-Math.max(altitude, -DEEPEST * SCALE_HEIGHT) / height);
}

/** The density summed from the deck to an altitude (units of length times the density under the deck; negative below the deck). */
function column(altitude: number): number {
  const { height, share } = layer(altitude);
  return share * height * (1 - exp(-Math.max(altitude, -DEEPEST * SCALE_HEIGHT) / height));
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
 * which the deck's sheet draws. A line between two points over the deck crosses it twice where
 * it dips under the curved deck between them (a shallow look down from just over it), at the
 * same slant going in and coming out.
 */
export function opticalDepth(air: Air, from: THREE.Vector3, to: THREE.Vector3): number {
  const length = from.distanceTo(to);
  const a = altitudeIn(air, from);
  const b = altitudeIn(air, to);
  const haze = HAZE * length * meanDensity(a, b);
  if (length < 1e-6 || (a <= 0 && b <= 0)) return haze;
  const crossing = deckCrossing(air, from, line.subVectors(to, from).divideScalar(length));
  if (a > 0 !== b > 0) return haze + DECK_DEPTH * slant;
  return crossing < length ? haze + 2 * DECK_DEPTH * slant : haze;
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
 * step, so a slow frame never brakes a ship past standstill. A body that loses less to the air per
 * unit of its mass than a ship (a torpedo, see TORPEDO_DRAG) passes its `share` of a ship's drag.
 */
export function dragOn(air: Air, position: THREE.Vector3, velocity: THREE.Vector3, dt: number, acceleration: THREE.Vector3, share = 1): THREE.Vector3 {
  const speed = velocity.length();
  const k = DRAG * share * density(altitudeIn(air, position));
  if (speed < 1e-6 || dt <= 0 || k * speed < 1e-9) return acceleration;
  const lost = speed - speed / (1 + k * speed * dt);
  return acceleration.addScaledVector(velocity, -lost / (speed * dt));
}

/** How far a sense reaching `depth` (see SIGHT_DEPTH) sees through level haze at an altitude under the deck (units), the planet's curve left out: for the docs. */
export const reachAt = (altitude: number, depth: number) => depth / (HAZE * density(altitude));

/** The air's drag at a place and speed (units/s²), for the readouts and the docs. */
export const dragAt = (altitude: number, speed: number) => DRAG * density(altitude) * speed * speed;

/** Heat the air puts into a hull per second at an altitude (units) and speed (units/s). */
export const airHeat = (altitude: number, speed: number) => DECK_HEAT * density(altitude) * pow(speed / MAX_SPEED, 3);

/**
 * The speed at which the air heats a hull at an altitude (units) exactly as fast as its radiators
 * shed (`cooling`, heat units per second; units/s), past the tournament's limit too: how far a
 * coil's boost may go before the air heats the hull.
 */
export const heatSpeed = (altitude: number, cooling: number) => MAX_SPEED * cbrt(cooling / (DECK_HEAT * density(altitude)));

/**
 * The fastest a ship flies at an altitude without the air heating its hull beyond what its
 * radiators shed (units/s, see heatSpeed): above 600 m below the deck the tournament's limit;
 * 214 m/s at 1 km, 146 m/s at 2 km, 87 m/s at the arena's bottom.
 */
export const safeSpeed = (altitude: number, cooling: number) => Math.min(MAX_SPEED, heatSpeed(altitude, cooling));

/** The fins every ship of the Games carries: two, on the struts aft. */
export const FINS = 2;
/**
 * In air the fins keep a ship on its course, as a weathervane does: a hull short of one (the
 * campaign's scrap) is dragged towards the side that keeps its fin, harder by the dynamic
 * pressure (density times speed squared). FIN_YAW is the yaw (and FIN_ROLL the roll) it is
 * turned with (rad/s²) for a missing fin right under the deck at the tournament's limit: at
 * 100 m/s under the deck some 16 rad/s², more than the scrap's thrusters (about 12) turn
 * against, so it cannot be steered there; at 50 m/s a quarter of that, which they hold. Over
 * the deck, in its thin top, hardly anything.
 */
export const FIN_YAW = 100;
export const FIN_ROLL = 40;

/** The turn the air forces on a ship with `fins` at an altitude (units) and speed (units/s), as a spin of its own (pitch, yaw, roll in rad/s²) into `target`. */
export function finSpin(altitude: number, speed: number, fins: number, target: THREE.Vector3): THREE.Vector3 {
  const missing = Math.max(0, FINS - fins);
  if (missing === 0) return target.set(0, 0, 0);
  const share = speed / MAX_SPEED;
  const pressure = density(altitude) * share * share * missing;
  return target.set(0, -FIN_YAW * pressure, FIN_ROLL * pressure);
}

/** The haze's numbers for the shaders (see view/haze): extinction, scale heights, the clamp of the depth. */
export const HAZE_SHAPE = { haze: HAZE, scale: SCALE_HEIGHT, top: TOP_HEIGHT, topDensity: TOP_DENSITY, deepest: DEEPEST, deck: DECK_DEPTH };

/** What of a ship one step in an air reads and writes (see airStep): its flight, its fins, its radiators. */
export interface AirHull {
  readonly flight: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 };
  readonly perks: { readonly fins: number };
  readonly finSpin: THREE.Vector3;
  clog: number;
  heat: number;
  overheated: boolean;
  readonly cooling: number;
}

/**
 * A step of `dt` seconds of a ship in an air (see Game.friction): the turn the air forces on a
 * hull short of a fin (into its finSpin), the clouds clogging its radiators, the air's heat and
 * the clog's waste heat into them; returns the hull points burnt (see airBurn), `full` the
 * radiators' limit.
 */
export function airStep(ship: AirHull, air: Air, dt: number, full: number): number {
  const altitude = altitudeIn(air, ship.flight.position);
  // a hull short of a fin cannot hold its course in air
  finSpin(altitude, ship.flight.velocity.length(), ship.perks.fins, ship.finSpin);
  ship.clog = clogging(ship.clog, altitude, dt);
  const heat = heatInto(altitude, ship.flight.velocity.length(), ship.clog) * dt;
  return heat < 1e-4 ? 0 : airBurn(ship, heat, dt, full);
}
