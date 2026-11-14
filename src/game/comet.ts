import * as THREE from 'three';
import { cos, pow, sin } from '../detmath';
import { setRotation } from '../detthree';
import { Randomizer } from '../random';
import { hash } from '../music/songs';
import { radialTexture } from '../view/textures';
import { ARENA_LIMIT } from '../world/arena';
import { blowSpin, MAX_GENERATION, type Asteroid, type AsteroidField, type Obstacle, type Well } from '../world/asteroids';
import { share } from '../world/bodies';
import { anchored } from '../world/contacts';
import { nucleusGeometry, nucleusMaterial, nucleusVents, type Vent } from '../world/nucleus';
import { dustStreaks, SUN_DIRECTION } from '../world/space';

/**
 * Comets: now and then a comet crosses the arena, its glowing head first, a wide swarm of grit
 * (its shower) after it, its two harmless tails of gas and dust streaming away from the sun.
 * The head keeps its route, bent only by the arena's massive body: it runs down ships and what
 * is lighter than itself, and bursts on the first rock or hull heavier than itself, which takes
 * its momentum (a rock breaking under the blow). The shower is the real danger, a storm of
 * grit that strikes a ship like lasers, as hard as its energy: the armor takes it, the drive
 * does not. A nova core close by breaks the head into blocks. A black hole or Jupiter's depths
 * swallow a comet, its shower after it.
 *
 * Everything about a comet follows from the room's seed, the round and the field time, which
 * every browser shares: when it comes, from where, how gravity bends it, where each piece of
 * its shower flies. So every browser sees the same comet without a word sent.
 */

/** A round sees a comet in each of these windows of field time (s) with its chance: a first one after the opening minute, a second one late. */
export const COMET_WINDOWS: readonly { from: number; to: number; chance: number }[] = [
  { from: 75, to: 135, chance: 0.75 },
  { from: 175, to: 235, chance: 0.4 },
];
/**
 * The head flies this fast (units/s, 600 m/s) where it passes the field's center; a well's
 * gravity changes that elsewhere. It crosses the arena (6.75 km) in about 11 s: far slower
 * than a real comet (5 to 25 km/s past a planet, through the arena in under a second), slow
 * enough to be watched coming and dodged, fast enough not to keep the Host waiting.
 */
export const COMET_SPEED = 12000;
/**
 * The head starts this far before the point of its route nearest the field's center (units,
 * 10.8 km), 7.4 km beyond the arena's edge, and flies as far beyond it: at COMET_SPEED it shows
 * 12 s before it reaches the edge, as the warning sounds (see COMET_WARNING), and is in view
 * about 28 s until its shower has left the arena (12 s coming, 11 s across, 5 s of shower).
 */
export const COMET_REACH = 216000;
/** The route passes the field's center within this much (units, 800 m), so it crosses the thick of the field. */
const COMET_MISS = 16000;
/** The route lies within this angle (rad, 35°) of the arena's horizon plane, where the field is. */
const COMET_TILT = 0.6;
/** A massive body in the field's middle (the black hole) is aimed at: the route passes it within this many of its radii, close enough to be caught: at COMET_SPEED the hole's pull bends a route aimed 1.27 radii off into its body. */
const CAPTURE = 1.05;
/** Towards a massive body outside the field (Jupiter) the route dives at an angle of this range (rad, 26° to 43°) as it crosses the center: steep enough that it comes from above its cloud deck, so the body's pull bends it down through it into its depths. */
const DIVE: readonly [number, number] = [0.45, 0.75];
/** Radius of the solid head (units, 70 m). */
export const HEAD_RADIUS = 1400;
/**
 * The flight computer warns this many seconds before the head reaches the arena's edge (s): at
 * COMET_SPEED the head is 7.2 km beyond the edge then, and it crosses from the edge to the
 * center in another 5.6 s: time enough to see where it comes from and get out of its way.
 */
export const COMET_WARNING = 12;
/**
 * The shower: SHOWER_PIECES knots of grit from SHOWER_GAP (units, 60 m) behind the head back to
 * SHOWER_LENGTH (3 km, 5 s at COMET_SPEED) behind it, the swarm widening from SHOWER_NARROW
 * (200 m) to SHOWER_WIDE (700 m) around the route, denser near the head: a band 1.4 km across
 * through the arena's middle, wide enough that the ships fighting there are caught in it unless
 * they get out of its way. Each knot follows the head's route a little later, so the swarm bends
 * with it.
 */
export const SHOWER_PIECES = 2000;
const SHOWER_GAP = 1200;
export const SHOWER_LENGTH = 60000;
const SHOWER_NARROW = 4000;
export const SHOWER_WIDE = 14000;
/**
 * A knot of the shower is grit, grains of ice and rock of a few centimeters (a comet sheds
 * nothing larger in a swarm), KNOT_MASS (kg) of it spread over a cloud PIECE_RADIUS (units, 12 m)
 * across its middle: a ship within its own radius plus this is struck by the knot. At the head's
 * 600 m/s each kilogram brings 180 kJ, so a knot strikes by its energy in the ship's frame (see
 * knotWeight): grit that strips armor and punches through a drive bell, the way a laser does.
 */
export const PIECE_RADIUS = 240;
/** The mass of grit in a knot (kg): at 600 m/s some 4.5 MJ, a solid blow (see knotWeight). */
export const KNOT_MASS = 25;
/** Meters per world unit. */
const METERS = 0.05;
/**
 * How many laser hits a knot of grit weighs, by its kinetic energy at `closing` (units/s, the
 * speed between knot and ship): a laser hit for every KNOT_JOULES (J), the same 0.75 MJ a hull
 * point takes from a sheet of junk torn out at speed (see ship/impact, sheetDamage), two hull
 * points a laser hit. Head-on at 600 m/s about 3 laser hits (6 hull on the armor, 0.6 of the
 * thrust in a drive struck from behind); flying with the swarm, far less.
 */
export const KNOT_JOULES = 1.5e6;
export function knotWeight(closing: number): number {
  const v = closing * METERS;
  return (0.5 * KNOT_MASS * v * v) / KNOT_JOULES;
}
/** The route is kept as the head's position every PATH_STEP seconds of field time, flown in SUBSTEPS steps each. */
const PATH_STEP = 0.1;
const SUBSTEPS = 10;
/** Rounds of raising the aim against the pull of a well outside the field (see makeComet). */
const AIMING = 5;
/** Over the last SQUEEZE seconds before a piece reaches the well, the swarm draws together onto the head's route. */
const SQUEEZE = 3;
/** Over the last STRETCH seconds before the well swallows it, the head is drawn out along its course; FLASH seconds of light mark where it went. */
const STRETCH = 2;
const FLASH = 1.5;
/**
 * The head's mass (kg): a ball of HEAD_RADIUS of dust and ice as loosely packed as real comets'
 * nuclei (500 kg/m³), some 0.7 million tonnes. A solid piece it breaks up on takes its momentum
 * (see strikeWall) and turns at up to SHOVE_SPIN (rad/s) more.
 */
export const HEAD_MASS = (4 / 3) * Math.PI * pow(HEAD_RADIUS / 20, 3) * 500;
const SHOVE_SPIN = 0.12;

/**
 * The tails, pure looks that harm nothing: gas and dust the sun boils off the head, blown
 * straight away from the sun whichever way the comet flies, as real comets' are. The ion tail
 * (ionized gas, cold blue) runs straight down the sun's line, ION_TAIL long (units, 25 km), its
 * half width from ION_WIDTH[0] (200 m) at the head to ION_WIDTH[1] (1.2 km); the dust tail
 * (white-yellow, sunlight on dust) is broader, DUST_WIDTH from 400 m to 4 km, DUST_TAIL long
 * (22 km), and its far end lags DUST_LAG of its length back along the route, curved, since the
 * heavier dust is pushed away more slowly than the gas. Both open out from the head (the half
 * width grows with the way along to the power TAIL_OPENING), brighten over the first TAIL_RISE
 * of their length out of the coma and fade out towards their end. Drawn in by a well, they
 * shrink in width with their length.
 */
const ION_TAIL = 500000;
const ION_WIDTH: readonly [number, number] = [4000, 24000];
const DUST_TAIL = 440000;
const DUST_WIDTH: readonly [number, number] = [8000, 80000];
const DUST_LAG = 0.3;
const TAIL_OPENING = 0.7;
const TAIL_RISE = 0.04;
/** Segments of each tail's ribbon, closer together near the head (the k-th of them at (k / TAIL_SEGMENTS) ** TAIL_SPACING of the length), where the tail opens out: enough for the curve and the rise to look smooth. */
const TAIL_SEGMENTS = 32;
const TAIL_SPACING = 1.8;
/** The tails fade in over this many seconds as the comet comes into view (s), so they do not pop up. */
const TAIL_FADE_IN = 2;
/** The tails fade out within this distance of the camera (units, from 150 m to 1.5 km): from inside a tail the dust is too thin to see, it is felt instead (see Game.cometTail). */
const TAIL_NEAR: readonly [number, number] = [3000, 30000];
/** Each piece of the shower glints in the sunlight this large (units, 20 m across), at least GLINT_PIXELS on screen however far off, so the swarm shows as the danger it is. */
const GLINT = 400;
const GLINT_PIXELS = 3;
/** A knot of the shower drawn up close as a bright clot this large (units, 2 m), and drawn out behind it as a streak of STREAK seconds of its flight (s, 60 m at the head's speed). */
const KNOT_DRAWN = 40;
const STREAK = 0.1;
/** Inside a tail, the dust the ship flies through: MOTES of it in a cube of MOTE_BOX (units, 600 m) around the camera, drawn as streaks MOTE_SECONDS (s) of their flight past the ship long. */
const MOTES = 400;
const MOTE_BOX = 12000;
const MOTE_SECONDS = 0.08;
/** The dust and gas stream away from the sun this fast besides the head's motion (units/s, 50 m/s). */
const OUTFLOW = 1000;

/**
 * The nucleus (see world/nucleus) is drawn in NEAR_SUBDIVISIONS (20 · 21² ≈ 8800 triangles)
 * with the rocks' detail tile within NEAR_RANGE (units, 2 km) of the camera, times the share
 * of the rocks' relief the picture's quality keeps (see setDetail), else in FAR_SUBDIVISIONS
 * (20 · 10² = 2000 triangles, as a rock up close): its fine relief lies in its relief map, not
 * in triangles.
 */
const NEAR_SUBDIVISIONS = 20;
const FAR_SUBDIVISIONS = 9;
const NEAR_RANGE = 40000;
/** The nucleus tumbles slowly (rad/s about its own axes, x, y and z in turn): mostly about its shortest axis, as a body of its shape spins, and wobbling, a turn in a little over a minute. */
const TUMBLE: readonly [number, number, number] = [0.021, 0.033, 0.087];
/**
 * The jets: from each vent the sun shines into (see world/nucleus, nucleusVents) a narrow
 * stream of gas and dust, up to JET_LENGTH long (units, 1 km; each vent's own share of it, from
 * JET_REACH[0] to 1), its half width from JET_WIDTH[0] (3 m) at the vent to JET_WIDTH[1] (70 m),
 * fanning out; it leaves the vent along the ground's normal
 * turned JET_SUNWARD towards the sun, and the sun's light pushes it back by JET_BEND of its length
 * (growing with the square of the way out), so it rises towards the sun, turns and streams back
 * into the coma. A vent wakes as the sun climbs over it (JET_WAKE, the sine of the sun's height
 * there) and each breathes slowly (JET_BREATH rad/s); the jets are pure looks.
 */
const JET_LENGTH = 20000;
const JET_REACH = 0.45;
const JET_WIDTH: readonly [number, number] = [60, 1400];
const JET_SUNWARD = 0.6;
const JET_BEND = 0.9;
const JET_WAKE: readonly [number, number] = [0, 0.45];
const JET_BREATH = 0.6;
const JET_SEGMENTS = 16;
/** How bright a jet is at its vent, and its color: sunlight on dust, white with a little warmth. */
const JET_BRIGHT = 0.3;
const JET_TINT = new THREE.Color(1, 0.94, 0.84);
/** A jet fades out within this distance of the camera (units, 40 m to 250 m), as a tail does (see TAIL_NEAR). */
const JET_NEAR: readonly [number, number] = [800, 5000];
/** A jet is never drawn narrower than this share of its distance (rad, about 2 pixels across on a phone): thinner, it would break into flickering pixels; its light is spread over the width it gains, so it only grows fainter. */
const JET_LEAST = 0.002;
/**
 * The coma around the head dims as the camera comes close (units, from 6 km in to 1 km), to
 * COMA_FLOOR of its light: its gas is far too thin to see from within, and its glow would
 * otherwise wash the dark nucleus out.
 */
const COMA_NEAR: readonly [number, number] = [20000, 120000];
const COMA_FLOOR = 0.08;
/** The coma's sprite stands this far behind the head's center (units, 120 m), beyond the nucleus's far side (it reaches at most 1.6 head radii out, see world/nucleus). */
const COMA_BEHIND = 2400;

/** One comet of a round: when and where it passes nearest the field's center, its route as gravity bends it, and the seed of its shower. */
export interface Comet {
  /** Field time at which the head passes the point of its route nearest the field's center. */
  readonly at: number;
  /** The direction it flies there (unit length). */
  readonly direction: THREE.Vector3;
  /** The point of its route nearest the field's center. */
  readonly nearest: THREE.Vector3;
  readonly seed: number;
  /** The head's position (x, y, z) every PATH_STEP seconds of field time from `from` on. */
  readonly path: Float64Array;
  readonly from: number;
  /** Field time at which the head starts out, COMET_REACH from the field's center. */
  readonly start: number;
  /** Field time at which the head reaches the arena's edge. */
  readonly edge: number;
  /** Field time at which a well swallows the head; Infinity when it meets none. */
  readonly swallowed: number;
  /**
   * Field time at which the head broke up, Infinity while it has not: on the President's
   * battleship (a body of ice and dust some 140 m across meeting a hull of over a million tonnes
   * at 600 m/s bursts: each kilogram of it brings 180 kJ, far more than holds a loose body
   * together; its shards spray off the armor and are gone in the flash, and the battleship goes
   * down, see Game.playComet), on a piece of the field heavier than itself (see runDown), or in a
   * nova core's blast (see breakHead). Its shower flies on, each piece stopped by what it meets.
   */
  broken: number;
  /** Where and when a nova core broke the head into its blocks (see breakHead, Shower.blockAt); null while no nova did. */
  burst: { readonly at: number; readonly point: THREE.Vector3 } | null;
}

/**
 * A nova core going off near the head breaks it apart. The game's reckoning, as plausible as a
 * game needs: a nova kills a fighter at 800 m (see items, NOVA_RADIUS), which takes some
 * NOVA_FLUENCE (J/m²) on its hull, so it sets free about NOVA_FLUENCE · 4π (800 m)² ≈ 8e13 J
 * (some 19 kt of TNT). The head, 70 m in radius, catches R² / (4 d²) of it at a distance d, and
 * NOVA_COUPLING of what it catches goes into tearing it apart (the rest flashes its surface off);
 * a loose body of dust and ice that size comes apart at HEAD_STRENGTH (J/kg). So it breaks
 * within NOVA_BREAK of the core's center: about 475 m.
 */
const NOVA_FLUENCE = 1e7;
const NOVA_COUPLING = 0.1;
const HEAD_STRENGTH = 60;
const NOVA_ENERGY = NOVA_FLUENCE * 4 * Math.PI * 800 * 800;
/** Within this distance of a nova core (units, about 475 m) the head breaks apart (see above). */
export const NOVA_BREAK = Math.sqrt((NOVA_ENERGY * NOVA_COUPLING * pow(HEAD_RADIUS / 20, 2)) / (4 * HEAD_STRENGTH * HEAD_MASS)) * 20;

/**
 * A nova core goes off at `point` at field time `at`: when the head is still whole then and
 * within NOVA_BREAK of it, it breaks into its blocks there (see Shower.blockAt), which fly on
 * along its course at its speed; true then. Every browser hears of the nova with its field time
 * and place, so every browser breaks it alike.
 */
export function breakHead(comet: Comet, at: number, point: THREE.Vector3): boolean {
  if (at >= headEnd(comet) || at < comet.start || headAt(comet, at, head).distanceTo(point) > NOVA_BREAK) return false;
  comet.broken = at;
  comet.burst = { at, point: point.clone() };
  return true;
}

/** Field time at which a comet's head is gone: swallowed by a well or broken up on the battleship. */
export const headEnd = (comet: Comet) => Math.min(comet.swallowed, comet.broken);

/** Field time at which a comet's head starts out. */
export const cometStart = (comet: Comet) => comet.start;
/** Field time at which the last of its shower has flown COMET_REACH past its nearest point, or has followed the head into the well. */
export const cometEnd = (comet: Comet) => Math.min(comet.at + (COMET_REACH + SHOWER_LENGTH) / COMET_SPEED, comet.swallowed + SHOWER_LENGTH / COMET_SPEED + FLASH);

const pull = new THREE.Vector3();
const position = new THREE.Vector3();
const velocity = new THREE.Vector3();

/** A well's pull at a point (units/s²), as the field's gravity has it. */
function wellPull(well: Well | null, point: THREE.Vector3, target: THREE.Vector3) {
  if (!well) return target.set(0, 0, 0);
  target.subVectors(well.position, point);
  const distance = Math.max(target.length(), well.radius);
  return target.setLength((well.surfaceGravity * well.radius * well.radius) / (distance * distance));
}

/**
 * Flies the head through the samples of `path`, from `position` at COMET_SPEED along
 * `direction`, in the well's gravity (leapfrog); returns the index of the first sample inside
 * the well, or -1.
 */
function fly(path: Float64Array, direction: THREE.Vector3, well: Well | null): number {
  const h = PATH_STEP / SUBSTEPS;
  velocity.copy(direction).multiplyScalar(COMET_SPEED);
  position.toArray(path, 0);
  for (let i = 1; i < path.length / 3; i++) {
    for (let s = 0; s < SUBSTEPS; s++) {
      velocity.addScaledVector(wellPull(well, position, pull), h / 2);
      position.addScaledVector(velocity, h);
      velocity.addScaledVector(wellPull(well, position, pull), h / 2);
    }
    position.toArray(path, i * 3);
    if (well && position.distanceTo(well.position) < well.radius) return i;
  }
  return -1;
}

/** The sample of `path` nearest `point`, up to sample `end` (all of them when it is -1). */
function nearestSample(path: Float64Array, point: THREE.Vector3, end: number): number {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i <= (end < 0 ? path.length / 3 - 1 : end); i++) {
    const d = position.fromArray(path, i * 3).distanceToSquared(point);
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

/**
 * A comet passing `nearest` about field time `at` in `direction` at COMET_SPEED, seeded
 * `seed`, with its route through the well's gravity, flown from far off: aimed straight at it,
 * a well in the field draws it in; for a well outside the field, it is sent off from twice as
 * far, its aim raised against the pull (AIMING rounds, each by what the last one missed
 * `nearest` by), and its route timed so that it passes `nearest` at `at`, however much the pull
 * sped it up on the way. A well swallows the head where it reaches its body; the route stands
 * still there.
 */
export function makeComet(at: number, direction: THREE.Vector3, nearest: THREE.Vector3, seed: number, well: Well | null = null): Comet {
  const outside = !!well && well.position.length() >= ARENA_LIMIT;
  const launch = (COMET_REACH + SHOWER_LENGTH) * (outside ? 2 : 1);
  let from = at - launch / COMET_SPEED;
  const count = Math.ceil((launch + COMET_REACH) / COMET_SPEED / PATH_STEP) + 2;
  const path = new Float64Array(count * 3);
  const aim = nearest.clone();
  let inside = -1;
  for (let round = outside ? AIMING : 1; round > 0; round--) {
    position.copy(aim).addScaledVector(direction, -launch);
    inside = fly(path, direction, well);
    if (!outside) break;
    const passed = nearestSample(path, nearest, inside);
    if (round > 1) aim.add(nearest).sub(position.fromArray(path, passed * 3));
    else from = at - passed * PATH_STEP;
  }
  if (inside >= 0) for (let i = inside + 1; i < count; i++) path.copyWithin(i * 3, inside * 3, inside * 3 + 3);
  // it starts out the last time it is COMET_REACH from the center before its nearest point
  let start = Math.round((at - from) / PATH_STEP);
  while (start > 0 && position.fromArray(path, start * 3).length() < COMET_REACH) start--;
  let edge = start;
  while (edge < count - 1 && position.fromArray(path, edge * 3).length() > ARENA_LIMIT) edge++;
  return {
    at,
    direction,
    nearest,
    seed,
    path,
    from,
    start: Math.max(from + start * PATH_STEP, from + SHOWER_LENGTH / COMET_SPEED),
    edge: from + edge * PATH_STEP,
    swallowed: inside >= 0 ? from + inside * PATH_STEP : Infinity,
    broken: Infinity,
    burst: null,
  };
}

/**
 * The comets of round `round` of a room (or solo round) of `seed`: in each window, with its
 * chance, one; it arrives at the arena's edge about a time of the window, from a direction
 * close to the horizon plane, passing the center within COMET_MISS. A massive body in the
 * field draws it in; one beneath the field it dives towards.
 */
export function cometsOf(seed: number, round: number, well: Well | null = null): Comet[] {
  const comets: Comet[] = [];
  COMET_WINDOWS.forEach((window, n) => {
    const r = new Randomizer((hash(seed, round, 4049, n) % 2147483000) + 1);
    if (r.nextFloat() >= window.chance) return;
    const edge = r.range(window.from, window.to);
    const heading = r.range(0, Math.PI * 2);
    const tilt = r.range(-COMET_TILT, COMET_TILT);
    const direction = new THREE.Vector3(cos(heading) * cos(tilt), sin(tilt), sin(heading) * cos(tilt));
    const dive = r.range(DIVE[0], DIVE[1]);
    // a miss square to the course: around the course by an angle, out by a distance
    const across = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, across);
    const turn = r.range(0, Math.PI * 2);
    const miss = r.range(0, 1);
    const nearest = new THREE.Vector3();
    if (well && well.position.length() < ARENA_LIMIT) {
      // a body in the field: aimed close by it, where its pull catches the head
      nearest.copy(across).multiplyScalar(cos(turn)).addScaledVector(up, sin(turn)).multiplyScalar(miss * well.radius * CAPTURE).add(well.position);
    } else {
      nearest.copy(across).multiplyScalar(cos(turn) * miss * COMET_MISS).addScaledVector(up, sin(turn) * miss * COMET_MISS);
      if (well) {
        // a body beneath the field: the course turned down towards it by the dive
        const down = pull.subVectors(well.position, nearest).normalize();
        direction.addScaledVector(down, -direction.dot(down)).normalize().multiplyScalar(cos(dive)).addScaledVector(down, sin(dive));
      }
    }
    // the head reaches the arena's edge (as far before the nearest point as the field's edge) about `edge`
    comets.push(makeComet(edge + ARENA_LIMIT / COMET_SPEED, direction, nearest, r.nextInt(), well));
  });
  return comets;
}

/**
 * The comets a venue brings: in a round (`round` 0 or more) those of cometsOf; none where it is
 * `calm` (the flight school, and a world raced or fought over, whose ground a head's route would plough
 * through) and none outside a round, so nothing there ever warns of one.
 */
export function roundComets(seed: number, round: number, well: Well | null, calm: boolean): Comet[] {
  return calm || round < 0 ? [] : cometsOf(seed, round, well);
}

/** The comet a browser follows at field time `clock`: the last of `comets` from COMET_WARNING before it starts out to its shower's end; null between them. */
export function cometAt(comets: readonly Comet[], clock: number): Comet | null {
  let comet: Comet | null = null;
  for (const next of comets) if (clock >= cometStart(next) - COMET_WARNING && clock <= cometEnd(next)) comet = next;
  return comet;
}

const sample = new THREE.Vector3();

/** Where a comet's head is at a field time: on its route, beyond its ends straight on. */
export function headAt(comet: Comet, time: number, target: THREE.Vector3): THREE.Vector3 {
  const last = comet.path.length / 3 - 1;
  const s = (time - comet.from) / PATH_STEP;
  const i = Math.min(Math.max(Math.floor(s), 0), last - 1);
  target.fromArray(comet.path, i * 3);
  return target.lerp(sample.fromArray(comet.path, i * 3 + 3), s - i);
}

/** The direction a comet's head flies at a field time (unit length), up to the moment a well swallows it. */
export function courseAt(comet: Comet, time: number, target: THREE.Vector3): THREE.Vector3 {
  const s = Math.min(time, comet.swallowed - PATH_STEP);
  headAt(comet, s, target);
  target.subVectors(headAt(comet, s + PATH_STEP, sample), target);
  return target.lengthSq() > 1e-6 ? target.normalize() : target.copy(comet.direction);
}

const start = new THREE.Vector3();
const segment = new THREE.Vector3();
const toPoint = new THREE.Vector3();

/**
 * The point of a comet's route between field times `from` and `to` (and before the well
 * swallows it) nearest `point`, into `target`; returns the field time the head is there.
 */
export function routeNearest(comet: Comet, point: THREE.Vector3, from: number, to: number, target: THREE.Vector3): number {
  to = Math.min(to, comet.swallowed);
  let best = Infinity;
  let when = from;
  headAt(comet, from, start);
  target.copy(start);
  for (let time = from; time < to; ) {
    const next = Math.min(to, time + PATH_STEP * 5);
    segment.subVectors(headAt(comet, next, sample), start);
    const length = segment.lengthSq();
    const f = length > 0 ? Math.min(1, Math.max(0, toPoint.subVectors(point, start).dot(segment) / length)) : 0;
    toPoint.copy(start).addScaledVector(segment, f);
    const distance = toPoint.distanceToSquared(point);
    if (distance < best) {
      best = distance;
      when = time + (next - time) * f;
      target.copy(toPoint);
    }
    start.copy(sample);
    time = next;
  }
  return when;
}

/**
 * The pieces of a comet's shower, laid out once from its seed: each a distance behind the head
 * and an offset square to the route, which it keeps (the swarm flies with the head, along its
 * route) until the swarm draws together into a well.
 */
export class Shower {
  /** Distance behind the head (units) and offset square to the route (x, y in the route's frame) of each piece. */
  readonly behind = new Float32Array(SHOWER_PIECES);
  readonly offsets = new Float32Array(SHOWER_PIECES * 2);
  readonly across = new THREE.Vector3();
  readonly up = new THREE.Vector3();

  constructor(readonly comet: Comet) {
    const r = new Randomizer((comet.seed % 2147483000) + 1);
    this.across.set(0, 1, 0).cross(comet.direction).normalize();
    this.up.crossVectors(comet.direction, this.across);
    for (let i = 0; i < SHOWER_PIECES; i++) {
      // denser near the head, thinning out towards the end of the tail
      const along = pow(r.nextFloat(), 1.6);
      const width = SHOWER_NARROW + (SHOWER_WIDE - SHOWER_NARROW) * along;
      const angle = r.range(0, Math.PI * 2);
      const out = Math.sqrt(r.nextFloat()) * width;
      this.behind[i] = SHOWER_GAP + along * (SHOWER_LENGTH - SHOWER_GAP);
      this.offsets[i * 2] = cos(angle) * out;
      this.offsets[i * 2 + 1] = sin(angle) * out;
    }
    this.layBlocks();
  }

  /** Where piece `i` is at a field time: where the head was as long ago as it trails it, off to its side. */
  pieceAt(i: number, time: number, target: THREE.Vector3): THREE.Vector3 {
    const lag = time - this.behind[i] / COMET_SPEED;
    const squeeze = Math.min(1, Math.max(0, (this.comet.swallowed - lag) / SQUEEZE));
    return headAt(this.comet, lag, target)
      .addScaledVector(this.across, this.offsets[i * 2] * squeeze)
      .addScaledVector(this.up, this.offsets[i * 2 + 1] * squeeze);
  }

  /** Piece `i` has followed the head into the well, or burst on the battleship's hull (see stop). */
  gone(i: number, time: number): boolean {
    return this.stopped[i] === 1 || time - this.behind[i] / COMET_SPEED >= this.comet.swallowed;
  }

  /** The pieces that burst on the battleship's hull, as this browser saw it (see Game.playComet): a piece of rock and ice at 600 m/s goes to dust on armor. */
  readonly stopped = new Uint8Array(SHOWER_PIECES);

  /** Piece `i` burst on the battleship's hull. */
  stop(i: number) {
    this.stopped[i] = 1;
  }

  /**
   * The blocks a nova core broke the head into (see breakHead): each flies on with the head's
   * course and speed (the blast's push on the whole of it is a few centimeters a second, nothing
   * to see), spread out from where the head was by up to BLOCK_SPREAD (units/s, 25 m/s) in a
   * direction of its own, laid out from the comet's seed. Each a block of BLOCK_RADIUS: a ship in
   * the way of one is run down as by the head.
   */
  readonly spread = new Float32Array(BLOCKS * 3);
  readonly blockStopped = new Uint8Array(BLOCKS);

  private layBlocks() {
    const r = new Randomizer(((this.comet.seed + 7) % 2147483000) + 1);
    for (let i = 0; i < BLOCKS; i++) {
      const z = r.range(-1, 1);
      const angle = r.range(0, Math.PI * 2);
      const ring = Math.sqrt(1 - z * z);
      const speed = BLOCK_SPREAD * r.range(0.3, 1);
      this.spread[i * 3] = cos(angle) * ring * speed;
      this.spread[i * 3 + 1] = z * speed;
      this.spread[i * 3 + 2] = sin(angle) * ring * speed;
    }
  }

  /** Where block `i` is at a field time, or null while the head is whole, before it broke or once the block burst (see blockStop). */
  blockAt(i: number, time: number, target: THREE.Vector3): THREE.Vector3 | null {
    const burst = this.comet.burst;
    if (!burst || time < burst.at || this.blockStopped[i] === 1 || time >= this.comet.swallowed) return null;
    const since = time - burst.at;
    return headAt(this.comet, time, target).add(blockOffset.set(this.spread[i * 3], this.spread[i * 3 + 1], this.spread[i * 3 + 2]).multiplyScalar(since));
  }

  /** Block `i` burst on what it met. */
  blockStop(i: number) {
    this.blockStopped[i] = 1;
  }
}

/** The blocks of a head a nova broke (see Shower.blockAt), their radius (units, 12 m) and how fast the blast spread them (units/s, 25 m/s at most). */
export const BLOCKS = 36;
export const BLOCK_RADIUS = 240;
const BLOCK_SPREAD = 500;
const blockOffset = new THREE.Vector3();

const head = new THREE.Vector3();
const piece = new THREE.Vector3();
const dummy = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);
const stone = new THREE.Vector3();
const course = new THREE.Vector3();
const kick = new THREE.Vector3();
const axis = new THREE.Vector3();

/** The grid of field time a comet strikes rock and hull on (s), and how far back it looks for the first touch (s). */
export const BREAK_STEP = 0.1;
const LOOK_BACK = 3;

/**
 * The head runs down what stands in its way: a piece it touches is struck at the first moment of
 * a grid of BREAK_STEP (s) of field time at which it touched it (looked for up to LOOK_BACK
 * back), so every browser strikes it at the same field time, however its frames fell. A piece
 * lighter than the head is run down: a whole rock breaks (its fragments, deterministic from the
 * rock and that time, fly alike everywhere), a piece of one (a fragment, broken junk) goes to
 * dust without pieces, and so do the fragments born in the head's way; `broke` hears of each. On
 * the first piece heavier than it (most of the field's rock and ice: a rock of 110 m outweighs
 * it fifteen times) or solid (a hull section, the junkyard's hub) that its own shape meets, the
 * head breaks up, as on the battleship's hull: each kilogram of it brings 180 kJ, far more than
 * holds a loose body together, and the piece takes its momentum (see strikeWall), unless it
 * stands for good (a world's ground, see world/contacts anchored); what lies beyond it is never
 * reached. Once the well swallowed the head, or it broke up, it strikes nothing.
 */
export function runDown(comet: Comet, field: AsteroidField, time: number, broke: (rock: Asteroid) => void, shoved: (piece: Asteroid, point: THREE.Vector3) => void = () => {}) {
  if (time >= headEnd(comet)) return;
  // a piece it shoved already (a browser that took the field from a snapshot after the head
  // broke up on it): the head broke up when that piece took its motion, and never strikes it twice
  for (const rock of field.asteroids.values()) if (rock.shovedBy === comet.seed && rock.born < comet.broken) comet.broken = rock.born;
  if (time >= headEnd(comet)) return;
  headAt(comet, time, head);
  // the solid piece the head meets first, if it meets one: there it breaks up
  let wall: Asteroid | null = null;
  let wallAt = Infinity;
  for (const rock of field.asteroids.values()) {
    if (!stops(field, rock) || rock.object.position.distanceTo(head) > HEAD_RADIUS + rock.radius + COMET_SPEED * LOOK_BACK) continue;
    const at = firstTouch(comet, field, rock, time, meets);
    if (at !== null && (at < wallAt || (at === wallAt && wall !== null && rock.id < wall.id))) {
      wall = rock;
      wallAt = at;
    }
  }
  for (const rock of field.asteroids.values()) {
    if (stops(field, rock) || rock.object.position.distanceTo(head) > HEAD_RADIUS + rock.radius + COMET_SPEED * LOOK_BACK) continue;
    const at = firstTouch(comet, field, rock, time, touches);
    // what lies beyond where it broke up, it never reaches
    if (at === null || at >= wallAt) continue;
    // a whole rock breaks into its fragments, a piece of one goes to dust
    const broken = rock.generation === 0 ? field.shatter(rock.id, at) : field.pulverize(rock.id, at);
    if (broken) broke(broken);
  }
  if (wall) strikeWall(comet, field, wall, wallAt, broke, shoved);
}

/** Whether the head breaks up on a piece (see runDown): a solid one, or one heavier than the head. */
function stops(field: AsteroidField, rock: Asteroid): boolean {
  return rock.solid || field.bodyMass(rock) > HEAD_MASS;
}

/** The first moment of the grid of BREAK_STEP the head touched a piece (`touching` says how), looked for up to LOOK_BACK back from `time` while it touches now; null when it does not. */
function firstTouch(comet: Comet, field: AsteroidField, rock: Asteroid, time: number, touching: typeof touches): number | null {
  let step = Math.floor(time / BREAK_STEP);
  if (!touching(comet, field, rock, step * BREAK_STEP)) return null;
  const first = Math.max(rock.born - 1e-6, time - LOOK_BACK);
  while ((step - 1) * BREAK_STEP >= first && touching(comet, field, rock, (step - 1) * BREAK_STEP)) step--;
  return step * BREAK_STEP;
}

/**
 * The head breaks up on a piece at field time `at` (see Comet.broken): its rubble stays with the
 * piece, so the piece takes the head's momentum, the two moving on together at the speed that
 * keeps it (see world/bodies, share: HEAD_MASS against the piece's, or its whole structure's when
 * welded), and the off-center blow sets it tumbling about its center (2/5 m r², as a ball), at
 * most SHOVE_SPIN more. A rock or ice piece that can still break (not solid, not of the last
 * generation) breaks under the blow: some 11 kJ for each kilogram of a 110 m rock, far beyond
 * what holds it together; `broke` hears of it, and each of its fragments takes the same added
 * speed, so the momentum stays. `shoved` hears of what moved with the point struck.
 */
function strikeWall(comet: Comet, field: AsteroidField, wall: Asteroid, at: number, broke: (rock: Asteroid) => void, shoved: (piece: Asteroid, point: THREE.Vector3) => void) {
  comet.broken = at;
  courseAt(comet, at, course);
  field.positionOf(wall, at, stone);
  // where it struck: the head moved out onto the hull, then its radius back in
  meets(comet, field, wall, at);
  piece.copy(struck).addScaledVector(struckNormal, -HEAD_RADIUS);
  // a world's ground and what stands on it for good take no motion: the head breaks up on them
  if (anchored(wall)) {
    shoved(wall, piece);
    return;
  }
  kick.copy(course).multiplyScalar(COMET_SPEED * share(field.bodyMass(wall), HEAD_MASS));
  // a rock that breaks under the blow: its fragments fly on with the head's momentum shared among them
  if (!wall.solid && wall.generation < MAX_GENERATION) {
    const prefix = `${wall.id}.`;
    const broken = field.shatter(wall.id, at);
    if (broken) {
      broke(broken);
      for (const fragment of [...field.asteroids.values()]) {
        if (!fragment.id.startsWith(prefix) || fragment.generation !== wall.generation + 1) continue;
        field.shove(fragment.id, at, kick, fragment.spinAxis, fragment.spinRate, comet.seed);
      }
      shoved(wall, piece);
      return;
    }
  }
  blowSpin(wall, stone.subVectors(piece, stone), kick, SHOVE_SPIN, axis);
  const rate = axis.length();
  if (rate > 1e-9) axis.divideScalar(rate);
  else axis.copy(wall.spinAxis);
  field.shove(wall.id, at, kick, axis, rate, comet.seed);
  field.posed(wall);
  shoved(wall, piece);
}

const struck = new THREE.Vector3();
const struckNormal = new THREE.Vector3();
const burstAt = new THREE.Vector3();

/**
 * The shower meets what stands in the field besides the battleship (rock, ice, junk, hull,
 * wreckage, the rings, the sponsor cores) at field time `time`, `since` seconds after it last
 * did: each piece that met something on its way since bursts there, as on the battleship's armor
 * (see meetObstacle). `hit` says whether the way from `from` to `to` meets something, writing
 * where into `at`; `burst` hears of each piece with where it burst.
 */
export function meetSolids(shower: Shower, time: number, since: number, hit: (from: THREE.Vector3, to: THREE.Vector3, at: THREE.Vector3) => boolean, burst: (point: THREE.Vector3) => void) {
  for (let i = 0; i < SHOWER_PIECES; i++) {
    if (shower.gone(i, time)) continue;
    shower.pieceAt(i, time, piece);
    shower.pieceAt(i, time - since, stone);
    if (!hit(stone, piece, burstAt)) continue;
    shower.stop(i);
    burst(burstAt);
  }
}

/** Whether the head touches a solid piece's own shape (its box, its measured surface) at a field time; where it touched in `struck` (the head moved out onto it) and `struckNormal`. */
function meets(comet: Comet, field: AsteroidField, rock: Asteroid, time: number): boolean {
  if (field.positionOf(rock, time, stone).distanceTo(headAt(comet, time, struck)) >= HEAD_RADIUS + rock.radius) return false;
  field.pose(rock, time);
  const touching = field.resolve(rock, struck, HEAD_RADIUS, struckNormal) !== null;
  field.posed(rock);
  return touching;
}

/**
 * The comet meets what else stands in the field (the President's battleship, see Comet.broken)
 * at field time `time`, `since` seconds after it last did: its head breaks up where it touches it
 * (true then, the head's end set to `time`), and each piece of its `shower` that touches it, or
 * met it on its way since (a piece flies 10 m in a frame at 60 frames a second, as far as a
 * battery's barrels are thick), bursts there (`burst` hears of each, with where), so the hull is
 * cover from the swarm. Only the browser that `decides` (the lead browser, or a solo round) ends
 * the head on its own view of the obstacle; the others take its word (see Fleet.rammedAt).
 */
export function meetObstacle(comet: Comet, shower: Shower | null, obstacle: Obstacle, time: number, since: number, burst: (point: THREE.Vector3) => void = () => {}, decides = true): boolean {
  const broke = decides && time < headEnd(comet) && obstacle.touches(headAt(comet, time, head), HEAD_RADIUS);
  if (broke) comet.broken = time;
  // the swarm trails the head by up to its length, as wide as it spreads
  if (!shower || headAt(comet, time, head).distanceTo(obstacle.position) > SHOWER_LENGTH + SHOWER_WIDE + OBSTACLE_REACH) return broke;
  for (let i = 0; i < SHOWER_PIECES; i++) {
    if (shower.gone(i, time)) continue;
    shower.pieceAt(i, time, piece);
    if (piece.distanceTo(obstacle.position) > OBSTACLE_REACH + COMET_SPEED * since * 2) continue;
    if (!obstacle.touches(piece, PIECE_RADIUS)) {
      // its way since: from where it was, as far as it came
      const way = shower.pieceAt(i, time - since, stone).distanceTo(piece);
      if (way < 1) continue;
      const hit = obstacle.ray(stone, course.subVectors(piece, stone).divideScalar(way), way);
      if (hit === null) continue;
      piece.copy(stone).addScaledVector(course, hit);
    }
    shower.stop(i);
    burst(piece);
  }
  return broke;
}

/** Nothing standing in the field reaches farther from its center than this (units, 1 km): the battleship's 640 m with room. */
const OBSTACLE_REACH = 20000;

function touches(comet: Comet, field: AsteroidField, rock: Asteroid, time: number): boolean {
  return field.positionOf(rock, time, stone).distanceTo(headAt(comet, time, piece)) < HEAD_RADIUS + rock.radius;
}

/**
 * A tail as a ribbon that faces the camera, turned about the tail's axis: each vertex sits on
 * the axis (`position`) and is pushed out `edge` (-1 or 1) half widths to the side, square to
 * the axis and to the line of sight. Across, it is brightest on the axis, as a glowing column
 * is; it fades out close to the camera (`near`, see TAIL_NEAR), where it is seen along its axis
 * and where the camera comes within a few of its widths of the axis. It is never narrower than
 * `least` of its distance (see JET_LEAST), its light spread over what it gains.
 */
const ribbonVertex = /* glsl */ `
  uniform float least;
  attribute vec3 axis;
  attribute float edge;
  attribute float width;
  attribute float bright;
  attribute vec3 tint;
  varying vec3 vColor;
  varying float vEdge;
  varying vec3 vWorld;
  void main() {
    vec3 side = cross(axis, cameraPosition - position);
    float l = length(side);
    side = l > 1.0 ? side / l : normalize(cross(axis, vec3(0.0, 1.0, 0.1)));
    float seen = max(length(cameraPosition - position), 1.0);
    float drawn = max(width, seen * least);
    vWorld = position + side * edge * drawn;
    // seen along its axis, or from within a few widths of it, a flat ribbon turns edge-on, twists
    // or fills the view with its edges: it fades out there
    float edgeOn = smoothstep(0.1, 0.35, l / seen);
    float within = smoothstep(drawn * 1.2, drawn * 3.0, l);
    vColor = tint * bright * edgeOn * within * width / drawn;
    vEdge = edge;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const ribbonFragment = /* glsl */ `
  uniform vec2 near;
  varying vec3 vColor;
  varying float vEdge;
  varying vec3 vWorld;
  void main() {
    float across = 1.0 - vEdge * vEdge;
    float fade = smoothstep(near.x, near.y, distance(vWorld, cameraPosition));
    gl_FragColor = vec4(vColor * across * across * fade, 1.0);
  }
`;

/** The shower's glints: a warm core in an orange halo, at least GLINT_PIXELS wide, turning slowly brighter and dimmer as a piece tumbles (a few seconds a cycle, never a strobe). */
const glintVertex = /* glsl */ `
  uniform float time;
  uniform float pixels;
  attribute float phase;
  varying float vLight;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float size = ${GLINT.toFixed(1)} * projectionMatrix[1][1] * pixels / max(-mv.z, 1.0);
    gl_PointSize = clamp(size, ${GLINT_PIXELS.toFixed(1)}, 40.0);
    vLight = (0.65 + 0.35 * sin(time * 1.3 + phase)) * clamp(size / ${GLINT_PIXELS.toFixed(1)}, 0.6, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const glintFragment = /* glsl */ `
  varying float vLight;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r = dot(c, c);
    if (r > 1.0) discard;
    vec3 color = vec3(1.0, 0.5, 0.0) * (1.0 - r) * (1.0 - r) + vec3(1.0, 0.75, 0.4) * exp(-r * 40.0) * 0.8;
    gl_FragColor = vec4(color * vLight, 1.0);
  }
`;

/** The two tails: how long, how wide at the head and at the end, how far their end lags back along the route, how bright at the head, and their color. */
const TAILS: readonly { length: number; width: readonly [number, number]; lag: number; bright: number; tint: THREE.Color }[] = [
  { length: ION_TAIL, width: ION_WIDTH, lag: 0, bright: 0.9, tint: new THREE.Color(0.35, 0.62, 1) },
  { length: DUST_TAIL, width: DUST_WIDTH, lag: DUST_LAG, bright: 0.32, tint: new THREE.Color(1, 0.9, 0.7) },
];
/** Vertices of one tail's ribbon, and of one jet's. */
const TAIL_VERTICES = (TAIL_SEGMENTS + 1) * 2;
const JET_VERTICES = (JET_SEGMENTS + 1) * 2;

/**
 * Ribbons facing the camera (see ribbonVertex), one draw call: `tints.length` of them, each of
 * `segments` segments in its tint, laid out anew every frame (see setRibbon); faded out within
 * `near` of the camera, never narrower than `least` of their distance.
 */
function ribbons(tints: readonly THREE.Color[], segments: number, near: readonly [number, number], least: number): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const geometry = new THREE.BufferGeometry();
  const each = (segments + 1) * 2;
  const count = each * tints.length;
  const dynamic = (size: number) => new THREE.BufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', dynamic(3));
  geometry.setAttribute('axis', dynamic(3));
  geometry.setAttribute('width', dynamic(1));
  geometry.setAttribute('bright', dynamic(1));
  const edges = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const index: number[] = [];
  tints.forEach((tint, t) => {
    for (let v = 0; v < each; v++) {
      edges[t * each + v] = v % 2 ? 1 : -1;
      tint.toArray(colors, (t * each + v) * 3);
    }
    for (let k = 0; k < segments; k++) {
      const a = t * each + k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  geometry.setAttribute('edge', new THREE.BufferAttribute(edges, 1));
  geometry.setAttribute('tint', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { near: { value: new THREE.Vector2(near[0], near[1]) }, least: { value: least } },
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

/** Sets the pair of vertices of a ribbon's point `v` (the first of the pair): on its axis at `point`, the axis running along `axis` there, `half` its half width, `light` its brightness. */
function setRibbon(geometry: THREE.BufferGeometry, v: number, point: THREE.Vector3, axis: THREE.Vector3, half: number, light: number) {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const axes = geometry.getAttribute('axis') as THREE.BufferAttribute;
  const widths = geometry.getAttribute('width') as THREE.BufferAttribute;
  const lights = geometry.getAttribute('bright') as THREE.BufferAttribute;
  for (let e = v; e < v + 2; e++) {
    positions.setXYZ(e, point.x, point.y, point.z);
    axes.setXYZ(e, axis.x, axis.y, axis.z);
    widths.setX(e, half);
    lights.setX(e, light);
  }
}

/** Marks a ribbon's laid out attributes for the GPU. */
function ribbonsChanged(geometry: THREE.BufferGeometry) {
  for (const name of ['position', 'axis', 'width', 'bright']) geometry.getAttribute(name).needsUpdate = true;
}

/** Away from the sun: where the tails stream. */
const AWAY = SUN_DIRECTION.clone().negate();
const behind = new THREE.Vector3();
const lane = new THREE.Vector3();
const next = new THREE.Vector3();
const flow = new THREE.Vector3();
const along = new THREE.Vector3();

/** The way the dust tail lags for a head flying along `course`: back along it, square to the sun's line (unit length; zero when the comet flies along the sun's line). */
function lagOf(course: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  target.copy(course).addScaledVector(AWAY, -course.dot(AWAY)).negate();
  return target.lengthSq() > 1e-6 ? target.normalize() : target.set(0, 0, 0);
}

/** How far along its tail (0 at the head, 1 at the end) the k-th point of its ribbon lies. */
const shareOf = (k: number) => pow(k / TAIL_SEGMENTS, TAIL_SPACING);

/** A tail's half width (units) at share `s` of its length, `scale` of it drawn (see TAILS). */
const halfWidth = (t: number, s: number, scale: number) => (TAILS[t].width[0] + (TAILS[t].width[1] - TAILS[t].width[0]) * pow(s, TAIL_OPENING)) * scale;

/** The point of tail `t` at share `s` of its length, `scale` of it drawn, for a head at `head` whose dust lags along `lag` (see lagOf). */
function tailAt(t: number, s: number, head: THREE.Vector3, lag: THREE.Vector3, scale: number, target: THREE.Vector3): THREE.Vector3 {
  const length = TAILS[t].length * scale;
  return target.copy(head).addScaledVector(AWAY, s * length).addScaledVector(lag, TAILS[t].lag * s * s * length);
}

/**
 * How deep `point` lies in the deeper of a comet's two tails, its head at `head` flying along
 * `course` and `scale` of their length drawn: 0 outside, 1 on the axis at the head, falling off
 * to the edge and towards the end. Pure looks and feel: nothing in a tail harms a ship.
 */
export function tailDepth(head: THREE.Vector3, course: THREE.Vector3, scale: number, point: THREE.Vector3): number {
  lagOf(course, behind);
  let deepest = 0;
  for (let t = 0; t < TAILS.length; t++) {
    tailAt(t, 0, head, behind, scale, lane);
    for (let k = 0; k < TAIL_SEGMENTS; k++) {
      const s0 = shareOf(k);
      const s1 = shareOf(k + 1);
      tailAt(t, s1, head, behind, scale, next);
      along.subVectors(next, lane);
      const span = along.lengthSq();
      const f = span > 0 ? Math.min(1, Math.max(0, flow.subVectors(point, lane).dot(along) / span)) : 0;
      const s = s0 + (s1 - s0) * f;
      const half = halfWidth(t, s, scale);
      const off = flow.copy(lane).addScaledVector(along, f).distanceTo(point);
      if (off < half) deepest = Math.max(deepest, (1 - off / half) * (1 - s));
      lane.copy(next);
    }
  }
  return deepest;
}

/**
 * The comet of the round as the scene shows it: its head and coma, its two tails streaming
 * away from the sun, its shower glinting along the route; near a well the head drawn out, then
 * a flash where it went, its tails and shower drawn in after. Inside a tail, the dust streaks
 * past the camera.
 */
export class CometView {
  readonly root = new THREE.Group();
  /** The head's frame along its course, which draws it out near a well. */
  private readonly body = new THREE.Group();
  /** The nucleus, tumbling in the head's frame, drawn near or far (see NEAR_RANGE); its vents (see world/nucleus). */
  private readonly nucleus = new THREE.Group();
  private readonly near: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly far: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly vents: readonly Vent[];
  /** The jets of the vents in one draw call. */
  private readonly jets: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** How far the near nucleus is drawn (units), by the picture's quality (see setDetail). */
  private nearRange = NEAR_RANGE;
  private readonly coma: THREE.Sprite;
  private readonly flash: THREE.Sprite;
  /** Both tails in one draw call. */
  private readonly tails: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pieces: THREE.InstancedMesh;
  private readonly glints: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly streaks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** The head's blocks once a nova broke it: lumps of its crust in the nucleus's own dark dust and ice. */
  private readonly blocks: THREE.InstancedMesh;
  private readonly motes: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** How strongly the tails show now (0..1): faded in as the comet comes, drawn in after a well swallowed it. */
  private strength = 0;
  /** The dust's velocity in the tails (units/s): the head's, and away from the sun. */
  private readonly dustVelocity = new THREE.Vector3();
  /** A streak behind a knot of the shower, back along its flight (see STREAK). */
  private readonly streakFlight = new THREE.Vector3();
  /** Where the head is and flies, and how much of the tails' length is drawn (see update). */
  private readonly head = new THREE.Vector3();
  private readonly course = new THREE.Vector3();
  private scale = 1;
  private shower: Shower | null = null;

  constructor() {
    const r = new Randomizer(7919);
    // the head: the nucleus, a dark body of two lobes, its fine relief in its relief map
    this.near = new THREE.Mesh(nucleusGeometry(NEAR_SUBDIVISIONS, HEAD_RADIUS), nucleusMaterial(true));
    this.far = new THREE.Mesh(nucleusGeometry(FAR_SUBDIVISIONS, HEAD_RADIUS), nucleusMaterial(false));
    for (const mesh of [this.near, this.far]) {
      // it throws a shadow as it crosses the field, and onto itself between its lobes
      mesh.castShadow = mesh.receiveShadow = true;
      this.nucleus.add(mesh);
    }
    this.vents = nucleusVents(HEAD_RADIUS);
    this.body.add(this.nucleus);
    this.jets = ribbons(this.vents.map(() => JET_TINT), JET_SEGMENTS, JET_NEAR, JET_LEAST);
    // the coma: a cold blue-white glow around the head, seen from far off; the same light flares where a well swallows it
    const glow = new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.12, 'rgba(210,238,255,0.9)'],
        [0.4, 'rgba(120,195,255,0.35)'],
        [1, 'rgba(60,120,255,0)'],
      ]),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.coma = new THREE.Sprite(glow);
    this.flash = new THREE.Sprite(glow.clone());
    // the tails: two ribbons, laid out anew every frame (see layTail), in one geometry
    this.tails = ribbons(TAILS.map((tail) => tail.tint), TAIL_SEGMENTS, TAIL_NEAR, 0);
    // the shower: bright knots of grit, each glinting in a halo of the orange of what hits, so the danger does not read as the tails' harmless blue and white
    this.pieces = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(KNOT_DRAWN, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.45).multiplyScalar(1.2), toneMapped: false }), SHOWER_PIECES);
    this.pieces.frustumCulled = false;
    const glints = new THREE.BufferGeometry();
    glints.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHOWER_PIECES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const phases = new Float32Array(SHOWER_PIECES);
    for (let i = 0; i < SHOWER_PIECES; i++) phases[i] = r.range(0, Math.PI * 2);
    glints.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.glints = new THREE.Points(
      glints,
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, pixels: { value: 360 } },
        vertexShader: glintVertex,
        fragmentShader: glintFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glints.frustumCulled = false;
    // each knot drawn out along its flight, so the swarm reads as a storm rushing by
    const streaks = new THREE.BufferGeometry();
    streaks.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHOWER_PIECES * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.streaks = new THREE.LineSegments(streaks, new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.62, 0.3), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.streaks.frustumCulled = false;
    this.blocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(BLOCK_RADIUS, 1), nucleusMaterial(false), BLOCKS);
    this.blocks.frustumCulled = false;
    this.blocks.castShadow = true;
    const motes = new Float32Array(MOTES * 3);
    for (let i = 0; i < motes.length; i++) motes[i] = r.nextFloat() * MOTE_BOX;
    this.motes = dustStreaks(motes, MOTE_BOX, new THREE.Color(0.85, 0.85, 0.8));
    this.root.add(this.body, this.coma, this.flash, this.tails, this.jets, this.pieces, this.glints, this.streaks, this.blocks, this.motes);
    this.root.visible = false;
  }

  /** The picture's quality: the share of the rocks' relief it keeps (see view/quality, Look.rocks) sets how far the near nucleus is drawn, none at 0. */
  setDetail(share: number) {
    this.nearRange = NEAR_RANGE * share;
  }

  /** The glints keep their size in the world on a picture `heightPx` device pixels high. */
  setViewport(heightPx: number) {
    this.glints.material.uniforms.pixels.value = heightPx / 2;
  }

  /** Shows a comet's shower at a field time, or nothing, for a camera at `camera`. */
  update(shower: Shower | null, time: number, camera: THREE.Vector3) {
    this.shower = shower;
    if (!shower) {
      this.root.visible = false;
      this.strength = 0;
      return;
    }
    const comet = shower.comet;
    this.root.visible = true;
    // the head flies until a well swallows it or it breaks up on the battleship, and flashes there
    const end = headEnd(comet);
    const left = end - time;
    const flying = left > 0;
    headAt(comet, Math.min(time, end), head);
    courseAt(comet, Math.min(time, end), course);
    this.body.visible = this.coma.visible = flying;
    this.body.position.copy(head);
    this.body.quaternion.setFromUnitVectors(UP, course);
    // only a well draws it out
    const drawn = Math.max(0, 1 - (comet.swallowed - time) / STRETCH);
    this.body.scale.set(1 / (1 + drawn), 1 + 3 * drawn, 1 / (1 + drawn));
    setRotation(this.nucleus, time * TUMBLE[0], time * TUMBLE[1], time * TUMBLE[2]);
    const seen = camera.distanceTo(head);
    this.near.visible = seen < this.nearRange;
    this.far.visible = !this.near.visible;
    // the coma's sprite stands behind the nucleus as the camera sees it, so the body hides it
    // whole instead of cutting it off along its limb, and larger by as much, so it looks as large
    this.coma.position.subVectors(head, camera).setLength(COMA_BEHIND).add(head);
    this.coma.scale.setScalar(HEAD_RADIUS * (14 + 6 * drawn) * (1 + COMA_BEHIND / Math.max(seen, 1)));
    this.coma.material.opacity = COMA_FLOOR + (1 - COMA_FLOOR) * THREE.MathUtils.smoothstep(seen, COMA_NEAR[0], COMA_NEAR[1]);
    this.jets.visible = flying;
    if (flying) this.layJets(time);
    this.flash.visible = !flying && -left < FLASH;
    if (this.flash.visible) {
      const fade = -left / FLASH;
      this.flash.position.copy(head);
      this.flash.scale.setScalar(HEAD_RADIUS * (12 + 30 * fade));
      this.flash.material.opacity = 1 - fade;
    }
    // after the head, its tails are drawn in as the shower follows it
    const drawnIn = flying ? 1 : Math.max(0, 1 + (left * COMET_SPEED) / SHOWER_LENGTH);
    this.strength = Math.min(1, Math.max(0, (time - comet.start) / TAIL_FADE_IN)) * drawnIn;
    this.tails.visible = this.strength > 0;
    this.scale = Math.max(drawnIn, 0.01);
    this.head.copy(head);
    this.course.copy(course);
    for (let t = 0; t < TAILS.length; t++) this.layTail(t);
    ribbonsChanged(this.tails.geometry);
    // the dust in the tails flies on with the head, pushed away from the sun
    this.dustVelocity.subVectors(headAt(comet, time + 0.5, piece), headAt(comet, time - 0.5, stone)).addScaledVector(AWAY, OUTFLOW);
    const glints = this.glints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const streaks = this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
    // the pieces fly as fast as the head, the streak STREAK seconds of it long
    this.streakFlight.copy(this.dustVelocity).addScaledVector(AWAY, -OUTFLOW).multiplyScalar(-STREAK);
    for (let i = 0; i < SHOWER_PIECES; i++) {
      if (shower.gone(i, time)) {
        dummy.scale.setScalar(0);
        // far beyond what the camera draws
        glints.setXYZ(i, 0, 1e9, 0);
        streaks.setXYZ(i * 2, 0, 1e9, 0);
        streaks.setXYZ(i * 2 + 1, 0, 1e9, 0);
      } else {
        dummy.scale.setScalar(1);
        shower.pieceAt(i, time, dummy.position);
        setRotation(dummy, i + time * 1.3, i * 0.7 + time, 0);
        glints.setXYZ(i, dummy.position.x, dummy.position.y, dummy.position.z);
        streaks.setXYZ(i * 2, dummy.position.x, dummy.position.y, dummy.position.z);
        streaks.setXYZ(i * 2 + 1, dummy.position.x + this.streakFlight.x, dummy.position.y + this.streakFlight.y, dummy.position.z + this.streakFlight.z);
      }
      dummy.updateMatrix();
      this.pieces.setMatrixAt(i, dummy.matrix);
    }
    this.pieces.instanceMatrix.needsUpdate = true;
    // the blocks of a head a nova broke, tumbling as they fly
    this.blocks.visible = !!comet.burst;
    if (comet.burst) {
      for (let i = 0; i < BLOCKS; i++) {
        if (shower.blockAt(i, time, dummy.position)) dummy.scale.setScalar(0.4 + (i % 5) * 0.15);
        else dummy.scale.setScalar(0);
        setRotation(dummy, i * 1.7 + time * 0.4, i * 0.9 + time * 0.3, i);
        dummy.updateMatrix();
        this.blocks.setMatrixAt(i, dummy.matrix);
      }
      this.blocks.instanceMatrix.needsUpdate = true;
    }
    glints.needsUpdate = true;
    streaks.needsUpdate = true;
    this.glints.material.uniforms.time.value = time;
  }

  /** Lays out the ribbon of tail `t` for the head as update left it: its points (see tailAt), the way it runs there, its half width, and its light, rising out of the coma and fading towards the end. */
  private layTail(t: number) {
    lagOf(this.course, behind);
    for (let k = 0; k <= TAIL_SEGMENTS; k++) {
      const s = shareOf(k);
      tailAt(t, s, this.head, behind, this.scale, lane);
      along.copy(AWAY).addScaledVector(behind, 2 * TAILS[t].lag * s).normalize();
      const light = TAILS[t].bright * this.strength * Math.min(1, s / TAIL_RISE) * pow(1 - s, 1.5);
      setRibbon(this.tails.geometry, t * TAIL_VERTICES + k * 2, lane, along, halfWidth(t, s, this.scale), light);
    }
  }

  /**
   * Lays out the jets for the nucleus as update turned it at field time `time`: from each vent
   * the sun shines into, out along the ground turned towards the sun, bent back by its light
   * (see JET_LENGTH), widening and fading out; a vent in the dark lies dormant.
   */
  private layJets(time: number) {
    const geometry = this.jets.geometry;
    this.nucleus.updateWorldMatrix(true, false);
    const frame = this.nucleus.matrixWorld;
    this.vents.forEach((vent, j) => {
      start.copy(vent.point).applyMatrix4(frame);
      flow.copy(vent.normal).transformDirection(frame);
      const wake = THREE.MathUtils.smoothstep(flow.dot(SUN_DIRECTION), JET_WAKE[0], JET_WAKE[1]);
      const strength = wake * (0.75 + 0.25 * sin(time * JET_BREATH + j * 2.1));
      flow.addScaledVector(SUN_DIRECTION, JET_SUNWARD).normalize();
      // each vent's own reach, spread evenly by the golden ratio
      const length = JET_LENGTH * (JET_REACH + (1 - JET_REACH) * ((j * 0.618034) % 1));
      for (let k = 0; k <= JET_SEGMENTS; k++) {
        const s = k / JET_SEGMENTS;
        lane.copy(start).addScaledVector(flow, length * s).addScaledVector(AWAY, length * JET_BEND * s * s);
        along.copy(flow).addScaledVector(AWAY, 2 * JET_BEND * s).normalize();
        const half = JET_WIDTH[0] + (JET_WIDTH[1] - JET_WIDTH[0]) * pow(s, 0.7);
        const light = JET_BRIGHT * strength * Math.min(1, s * 12) * (1 - s) * (1 - s);
        setRibbon(geometry, j * JET_VERTICES + k * 2, lane, along, half, light);
      }
    });
    ribbonsChanged(geometry);
  }

  /**
   * How deep `point` lies in a tail (0 outside, 1 on the axis at the head), as the tails are
   * laid out now; and, for the camera riding with `velocity`, the dust streaking past as deep
   * in it.
   */
  feel(point: THREE.Vector3 | null, velocity: THREE.Vector3 | null): number {
    const depth = point && this.root.visible && this.tails.visible ? tailDepth(this.head, this.course, this.scale, point) * this.strength : 0;
    const motes = this.motes;
    motes.visible = depth > 0 && velocity !== null;
    if (!motes.visible || !velocity) return depth;
    const uniforms = motes.material.uniforms;
    uniforms.strength.value = Math.min(1, depth * 3);
    // where the motes have flown with the dust, and the way they seem to come from the ship
    const clock = this.glints.material.uniforms.time.value as number;
    flow.copy(this.dustVelocity).multiplyScalar(clock);
    uniforms.drift.value.set(flow.x % MOTE_BOX, flow.y % MOTE_BOX, flow.z % MOTE_BOX);
    uniforms.velocity.value.subVectors(velocity, this.dustVelocity).multiplyScalar(MOTE_SECONDS);
    return depth;
  }

  get current(): Shower | null {
    return this.shower;
  }

  dispose() {
    for (const mesh of [this.near, this.far, this.tails, this.jets, this.pieces, this.glints, this.streaks, this.blocks, this.motes]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.coma.material.map?.dispose();
    this.coma.material.dispose();
    this.flash.material.dispose();
  }
}
