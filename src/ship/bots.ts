import * as THREE from 'three';
import { raySphere, type Asteroid, type AsteroidField, type RayHit } from '../world/asteroids';
import { IDLE, type Controls } from '../input/input';
import { detectable, LASER_RANGE, noseOn, type Ship } from './ship';
import { MAIN_THRUST, MAX_SPEED, OVERDRIVE_PUSH, RCS_THRUST } from './flight';
import { BOOST_HEAT, BURNOUT_HEAT } from './driveheat';
import { BOOST_PUSH } from '../game/race';
import { escapeLoad } from '../game/alarms';
import { devlog } from '../devlog';
import { ringRim } from '../world/gates';
import { onCore, plugMass, type JunkBuild } from '../world/junk';
import { RAM_SAFE, SAFE_IMPACT, sheetDamage } from './impact';
import { groundBlow } from '../world/hover';
import { altitudeIn, heatInto, heatSpeed, LOCK_DEPTH, REACTOR_WASTE, RADAR_DEPTH, SIGHT_DEPTH, throughAir } from '../world/air';

/** A bot's flight through the air (see world/air throughAir). */
const airFlow = new THREE.Vector3();
import { plumeStrength } from './plume';
import { atan, exp, hypot, tan } from '../detmath';
import { CAMERA_FOV, CHASE_DISTANCE, CHASE_HEIGHT } from '../view/chase';

/** Bots notice ships within this distance (units, 3.5 km: across the whole field), when no rock is in the way, so the fight finds a Host quickly. */
const SIGHT_RANGE = 70000;
/**
 * What a bot sees as a Host sees its screen (see Bot.inView): the chase camera's picture,
 * CAMERA_FOV high and at 16:9 about 102° wide, from where the camera hangs behind and above the
 * ship (CHASE_DISTANCE, CHASE_HEIGHT; a ship beside the hull at a shove's reach still shows),
 * widened by VIEW_MARGIN (rad, 15°) on every side: the picture widens by up to 17° with speed
 * and a full burn (see Game.updateCamera), and the eye catches what moves just past the screen's
 * edge. Within it the bot sees ship by ship, past rock or not; outside it only what its last
 * glance at the radar and the arrows at the screen's edge showed (see GLANCE_SLOW).
 */
const VIEW_MARGIN = (15 * Math.PI) / 180;
const VIEW_ASPECT = 16 / 9;
const VIEW_HALF = (CAMERA_FOV * Math.PI) / 360;
/** The view's half height and half width as slopes (tangents of the half angles with the margin). */
const VIEW_UP = tan(VIEW_HALF + VIEW_MARGIN);
const VIEW_SIDE = tan(atan(tan(VIEW_HALF) * VIEW_ASPECT) + VIEW_MARGIN);
/**
 * A bot glances at the radar and the arrows at the screen's edge (see Bot.glance) every
 * GLANCE_SLOW seconds at reflexes 0 down to GLANCE_FAST at reflexes 1, each gap GLANCE_JITTER
 * longer or shorter by chance: a pilot's eyes are on the picture, and the corner of the screen
 * gets a look now and then. What it shows a Host it shows the bot: the ships in line of sight,
 * within the radar's reach (RADAR_RANGE, units, 2.5 km) through the radar's haze, beyond it
 * through the eye's, where they are at that moment.
 */
const GLANCE_SLOW = 3;
const GLANCE_FAST = 1;
const GLANCE_JITTER = 0.25;
const RADAR_RANGE = 50000;
/**
 * Bots think in turns (see Turns): one a step in a fixed rotation, and more only where that
 * would leave a bot longer than TURN_GAP (s of game time, about a quick human's reaction) without
 * one: with seven bots a step of a sixtieth of a second gives each a turn about every 0.12 s, a
 * step of a thirtieth (30 frames a second, a time-lapse) every 0.23 s.
 */
export const TURN_GAP = 0.25;

/**
 * The rotation of the bots' turns (see Bot.think): `deal` gives each step's turns to the next
 * bots in a fixed order, whatever happens (a hit, a lock, a torpedo, a rock ahead are answered
 * in the bot's next turn, so many bots struck at once think no sooner); a bot whose clone is
 * gone lets its turn pass. A step gives one turn, or more where the bots are so many or the
 * step so long that one would wait longer than TURN_GAP: `bots` times the step over TURN_GAP,
 * the fraction carried over to the next step, never more than one each.
 */
export class Turns {
  private next = 0;
  private owed = 0;
  private readonly dealt = new Set<Bot>();

  deal(bots: readonly Bot[], dt: number) {
    this.dealt.clear();
    const count = bots.length;
    if (!count) return;
    this.owed = Math.min(count, this.owed + Math.max(1, (count * dt) / TURN_GAP));
    while (this.owed >= 1) {
      this.owed--;
      this.next %= count;
      this.dealt.add(bots[this.next++]);
    }
  }

  /** Whether `bot` has its turn this step. */
  has(bot: Bot): boolean {
    return this.dealt.has(bot);
  }
}
/** Bots only fire within this distance (units, 1 km). */
const FIRE_RANGE = 20000;
/** In a solar storm a bot's sensors are blind: it only sees what its own eyes see (units, 750 m). */
const STORM_SIGHT = 15000;
/** At most this many bots hunt the same ship; the others look for another target. */
const MAX_HUNTERS = 2;
/** A bot keeps its target unless another is clearly better: the current one counts this much nearer. */
const STICKY = 0.7;
/**
 * How skill shows in a fight, steep enough that the better pilot visibly wins more often. A bot
 * pulls the trigger once its target has been in its sights for REACTION_SLOW seconds at reflexes
 * 0, REACTION_PER_REFLEX less per unit of reflexes, never sooner than REACTION_MIN (about a
 * quick human's). Its aim misses by up to AIM_SPREAD ship radii at aim 0 and nothing at aim 1, and
 * wanders by up to twice AIM_ANGLE at aim 0 down to nothing; skills above AIM_BEST count as
 * AIM_BEST, so no bot aims like a machine.
 */
const REACTION_SLOW = 0.55;
const REACTION_PER_REFLEX = 0.5;
const REACTION_MIN = 0.15;
const AIM_SPREAD = 1.8;
const AIM_BEST = 0.8;
/** How long a bot of these reflexes holds its target in its sights before it fires (s), at ease and unstrained. */
export const reactionOf = (reflexes: number) => Math.max(REACTION_MIN, REACTION_SLOW - REACTION_PER_REFLEX * reflexes);
/** How far a bot of this aim misses, as a share of the misses at aim 0 (see aimError). */
export const missOf = (aim: number) => 1 - Math.min(aim, AIM_BEST);
/** At full ease (see Bot.ease) bots aim this much worse and react this much later (s). */
const EASE_AIM = 1.5;
const EASE_REACTION = 0.4;
/** At the full bite of extreme g (see strainPenalty) bots aim this much worse and react this much later (s), as a Host's hands are late and unsteady (see ship/strainhand). */
const STRAIN_AIM = 0.5;
const STRAIN_REACTION = 0.15;
/** How hard g costs a clone its aim and reflexes (0..1): only extreme g, past what a seasoned clone flies through (see ship/strainhand, extremeAfter), the same onset a Host's hands have. */
const strainPenalty = (ship: Ship) => ship.extreme;
/**
 * A bot flies its clone's strain as a pilot does: it spends it where it matters (out of danger,
 * away from a nova, jinking under attack, the moment it fires, on a race's line) and otherwise eases off once the
 * strain reaches its hold, STRAIN_HOLD at daring 0 and STRAIN_HOLD_DARING more at daring 1 (the
 * daring push it further): then it lets the drive rest and the thrusters push at most
 * EASY_PUSH of their strength (about 2.5 g, under the 3 g a clone recovers below), until the
 * strain has fallen STRAIN_RECOVER below the hold (a second and a bit at the clone's recovery).
 */
const STRAIN_HOLD = 0.45;
const STRAIN_HOLD_DARING = 0.35;
const STRAIN_RECOVER = 0.35;
const EASY_PUSH = 0.25;
/** The strain at which a bot of this daring eases off (see STRAIN_HOLD). */
export const strainHold = (daring: number) => STRAIN_HOLD + STRAIN_HOLD_DARING * daring;
/** Whether a bot flies gently now: at or past its hold it does, until the strain has fallen STRAIN_RECOVER below it (see STRAIN_HOLD). */
export function easesOff(recovering: boolean, strain: number, daring: number): boolean {
  const hold = strainHold(daring);
  return strain >= hold || (recovering && strain > hold - STRAIN_RECOVER);
}
/** Eases the drive and the thrusters of `controls` so the clone recovers (see STRAIN_HOLD). */
export function flyGently(controls: Controls) {
  controls.thrust = 0;
  const push = hypot(controls.strafeX, controls.strafeY, controls.strafeZ);
  if (push > EASY_PUSH) {
    const share = EASY_PUSH / push;
    controls.strafeX *= share;
    controls.strafeY *= share;
    controls.strafeZ *= share;
  }
}
/** A bot sees another ship hunting a third (see huntersOf) when its nose lies within HUNT_ANGLE (rad, about 17°) of it, within FIRE_RANGE. */
const HUNT_ANGLE = 0.3;
/**
 * Friendly fire (see allyInLine): a bot keeps its finger off the trigger while a ship of its own
 * side passes within ALLY_CLEARANCE of its line of fire (units, 17 m, a hull's radius more: its
 * aim scatters), and launches no torpedo while one lies within TORPEDO_CLEARANCE (units, 50 m)
 * of the line to the lock (the torpedo flies a curve onto it).
 */
const ALLY_CLEARANCE = 340;
export const TORPEDO_CLEARANCE = 1000;
/** A ship that hit a bot's drive makes it defend for this long (s), from however far it fired. */
const STRUCK_MEMORY = 3;
/** A bot fires at armor only while its laser is cooler than this (one shot heats it by 20), and only in some of its thinking spells (SNIPE_CHANCE): sparingly. */
const ARMOR_FIRE_HEAT = 10;
const SNIPE_CHANCE = 0.3;
/**
 * Racing bots fly from gate to gate at a speed of their own, by how good they are (see
 * raceSpeedOf): RACE_SPEED_SLOW (units/s, 140 m/s) for the worst, RACE_SPEED_FAST (220 m/s,
 * below the limit, so they still turn in time) for the best, RACE_SPEED (180 m/s) for a bot of
 * middling skill.
 */
const RACE_SPEED_SLOW = 2800;
const RACE_SPEED_FAST = 4400;
export const RACE_SPEED = (RACE_SPEED_SLOW + RACE_SPEED_FAST) / 2;
/** A bot's racing speed: the better it flies on average (aim, reflexes, daring), the faster. */
export const raceSpeedOf = (skills: Skills) => RACE_SPEED_SLOW + (RACE_SPEED_FAST - RACE_SPEED_SLOW) * meanSkill(skills);
/** At a branch of a track (see Course.branches in game/race) a bot of this daring and more takes the shorter, riskier way, one of less the longer, safer one. */
export const RISKY_DARING = 0.5;
/**
 * A race's boost (the overdrive, see ship/driveheat): a racing bot shoves only on a straight, its
 * nose within BOOST_NOSE (rad, about 3°) of its flight and of the line ahead, while that line
 * bends nowhere tighter than BOOST_BEND (units, 1.5 km) for the next BOOST_LOOK seconds at the
 * boost's top speed; only below BOOST_BELOW of the limit (already fast, a shove gains little);
 * and only while the shove leaves the drive's gauge BOOST_MARGIN under its limit, less the more
 * daring the bot (20 at daring 0, none at 1). It keeps what the boost gave it for BOOST_KEEP (s).
 */
export const BOOST_NOSE = 0.05;
export const BOOST_BEND = 30000;
export const BOOST_LOOK = 5;
const BOOST_BELOW = 1.1;
const BOOST_MARGIN = 20;
export const BOOST_KEEP = 4;

/** Whether a racing bot of `daring` boosts now: the line ahead straight enough (`straight`), its nose on its flight and the line (`aligned`), at `speed`, with the drive's gauge at `heat` (see BOOST_NOSE). */
export function wantsBoost(daring: number, straight: boolean, aligned: boolean, speed: number, heat: number): boolean {
  return straight && aligned && speed < MAX_SPEED * BOOST_BELOW && heat + BOOST_HEAT <= BURNOUT_HEAT - BOOST_MARGIN * (1 - daring);
}

/** A ring of the round as a bot sees it: where it is, which way it faces (unit length), the radius of its opening. */
export interface Ring {
  center: THREE.Vector3;
  facing: THREE.Vector3;
  radius: number;
}

/** A bot's skill in one number: the mean of aim, reflexes and daring. */
export const meanSkill = (skills: Skills) => (skills.aim + skills.reflexes + skills.daring) / 3;
/** A racer only turns its nose to a ship this close to it (rad, about 30°): one ahead on the course. */
const RACE_AIM_CONE = 0.5;
/** A racer with a ship on its tail flips to shoot back for this long (s), at most once in LOOK_BACK_PAUSE (s). */
const LOOK_BACK_SECONDS = 2.5;
const LOOK_BACK_PAUSE = 8;
/**
 * At a race's start a bot lights its drive as a Host does, by its own timing: aiming at BURN!,
 * it misses by up to START_SPREAD_SLOW seconds either way at reflexes 0 and START_SPREAD_FAST at
 * reflexes 1. The game judges the moment by the Host's rules (a perfect start, a stall, or late).
 */
const START_SPREAD_SLOW = 0.9;
const START_SPREAD_FAST = 0.3;
/** When a bot lights its drive at a race's start (s after BURN!, negative before), for a `random` number 0..1. */
export const startTiming = (reflexes: number, random: number) => (random * 2 - 1) * (START_SPREAD_SLOW - (START_SPREAD_SLOW - START_SPREAD_FAST) * reflexes);
/** Bots close in with up to this speed and hold position near their target. */
const CRUISE_SPEED = 2500;
const HOLD_DISTANCE = 4000;
/** A fighter circles its target sideways at this speed (units/s, 60 m/s) on its way behind it: dogfights are wide drifting arcs, not jousts. */
const ORBIT_SPEED = 1200;
/** A bot's hand eases its commands in over this time (s): HAND_TIME_SLOW at reflexes 0, HAND_TIME_FAST at reflexes 1 (see Bot.byHand). */
const HAND_TIME_SLOW = 0.35;
const HAND_TIME_FAST = 0.12;
/** A pause between two thoughts longer than this (s) means the bot was gone (dead, not yet printed): the next thought starts afresh. A frame, even in a time-lapse, is shorter. */
const RESPAWN_GAP = 1;
/** Seconds ahead a bot checks its flight path for asteroids. */
const AVOID_HORIZON = 5;
/** The way a bot checks is a tube this many ship radii wide around its line of flight (about 50 m): its hull's sweep with room to spare. */
const AVOID_TUBE = 3;
/**
 * A piece of the field moving faster than INCOMING_SPEED (units/s, 50 m/s) is watched as it comes
 * (the Event Horizon's rocks circle at 116 to 167 m/s, their fragments and a rammed piece faster):
 * one whose way past the bot, as the two move, comes within its reach and AVOID_TUBE ship radii
 * within INCOMING_SECONDS sends the bot off sideways, out of its way, as a Host sees a rock coming
 * and pulls aside. A slower piece leaves the bot time enough with its look along its own flight
 * (see wayAhead): swerving from the Satellite Junkyard's debris crossing at 25 m/s cost the
 * middling bot some 200 points a deathmatch and spared it nothing (measured in its balance runs).
 */
const INCOMING_SPEED = 1000;
const INCOMING_SECONDS = 4;
/**
 * A sheet of junk whose plug would dent the hull this much at the bot's speed (hull points, see
 * sheetDamage: a stage's tank walls at speed, never a wing's panels) is worth flying round, while
 * it lies at least SHEET_ROOM seconds ahead, where a turn round it costs little; closer, the bot
 * punches through it.
 */
const COSTLY_SHEET = 15;
const SHEET_ROOM = 1.5;

/** Whether a bot flying at `speed` (units/s) flies round a sheet of junk built as `build` lying `distance` ahead (units): its plug would dent the hull COSTLY_SHEET points or more, and it lies SHEET_ROOM seconds or more ahead. */
export function flyRound(build: JunkBuild, speed: number, distance: number): boolean {
  return sheetDamage(plugMass(build), speed) >= COSTLY_SHEET && distance >= speed * SHEET_ROOM;
}
/** A velocity error larger than this makes the bot turn and burn instead of fighting. */
const BURN_THRESHOLD = 500;
/** Angular aim error at an aim of one half (rad, about 1.1°; see aimError): at 1 km, its firing range, it scatters by about 20 m, a little more than a ship's radius (17 m). */
const AIM_ANGLE = 0.02;
/** How long a bot's sense of the target's jinking lingers (s). */
export const JINK_MEMORY = 0.6;
/** Jinking (change of velocity across the line of sight) of this share of the thruster strength scatters the aim by a full ship radius. */
export const JINK_SCATTER = 0.5;
/** The scatter never exceeds this many ship radii, so a jinking target is hard to hit, not impossible. */
export const JINK_SCATTER_MAX = 2.5;
/**
 * A bot under attack jinks with this share of its thrusters (4 g of their 10 g): enough to throw a
 * chaser's aim off, while a Host of middling skill still lands its hits; the rest stays a Host's
 * edge.
 */
const JINK_PUSH = 0.4;
/** A bot attacking a battleship's part holds this far from it (units, 600 m), and fires with its nose within SIEGE_AIM of it (rad). */
export const SIEGE_DISTANCE = 12000;
const SIEGE_AIM = 0.02;
/** Bots stay this far inside the arena, unless the game draws them closer in (see Bot.home). */
export const HOME_RADIUS = 50000;
/** Under an arena's ceiling (see Bot.roof) a bot turns down within ROOF_MARGIN of it (units, 80 m), and roams ROAM_UNDER under it (520 m: over Valhalla 30 m over the plain, the cruiser's height), low over the world below. */
const ROOF_MARGIN = 1600;
const ROAM_UNDER = 10400;
/**
 * Near a massive body a bot burns away from it: within WELL_MARGIN (units, 750 m) of its
 * surface, or once its escape gauge reads WELL_PULL (a black hole's grip: the pull, and the
 * braking its fall towards the body would take; see escapeLoad). The gauge counts what a shot
 * drive has left only while the bot falls towards the body: over a planet, whose pull fills the
 * arena, a bot with a weak drive would otherwise burn away from it for the rest of the round
 * instead of flying.
 */
const WELL_MARGIN = 15000;
const WELL_PULL = 0.3;
/**
 * In a planet's air (see Bot.air): a bot wants no more than AIR_MARGIN of the speed at which the
 * air heats its hull as fast as it cools at its depth (see heatSpeed; not of the tournament's
 * limit, which is no heat), dodging rock and escaping a well included, and climbs straight out
 * once its hull is hotter than AIR_HOT (the laser's heat; 100 locks it) while the air still heats
 * it, until it has cooled below AIR_COOL. Fights belong over the clouds, where a Host sees them:
 * a bot that is not racing keeps AIR_ABOVE over the deck (units, 200 m), rising when it is under
 * that by up to AIR_RISE (units/s, 80 m/s), in full from AIR_RISE_SPAN under it (units, 500 m),
 * and never sinks under it of its own wish, after a rival or a probe neither: it waits above. Over
 * it, it sinks no faster than it could stop at it braking with AIR_BRAKE (units/s², 1.5 g: its
 * thrusters' 10 g, less the planet's pull of 2.5 g, with room to spare). Three exceptions:
 * under attack it may shake the chaser off in the clouds, drifting down at AIR_DIVE (units/s,
 * 40 m/s) to AIR_DIVE_DEPTH under the deck (units, 300 m), for AIR_HIDE (s) after the last blow;
 * a bot of AIR_DARING and more follows its target down into them; and one heading home from
 * beyond its reach goes home first. None of them stays once the clouds have clogged its radiators
 * past AIR_CLOG, and AIR_CLOG_DARING more for every point of daring (see world/air, clogging):
 * then it hides and chases no more, and the floor brings it up.
 */
const AIR_MARGIN = 0.85;
const AIR_HOT = 60;
const AIR_COOL = 30;
const AIR_ABOVE = 4000;
const AIR_RISE = 1600;
const AIR_RISE_SPAN = 10000;
const AIR_BRAKE = 294;
const AIR_DIVE = 800;
const AIR_DIVE_DEPTH = 6000;
const AIR_HIDE = 8;
const AIR_DARING = 0.5;
const AIR_CLOG = 0.3;
const AIR_CLOG_DARING = 0.4;
/**
 * Bots do not ram by accident. They look KEEP_CLEAR_AHEAD seconds ahead: another ship whose way
 * comes closer to theirs than KEEP_CLEAR ship radii (about 85 m) within that time (a racer a
 * coil throws onto the one ahead, two fighters circling each other) pushes the bot's wanted
 * velocity off the point where they would meet, up to KEEP_CLEAR_PUSH (units/s, 40 m/s) for a
 * dead-center meeting; a ship already that close and closing pushes it straight away. Gentle
 * enough that a racer stays near its line, clear of the rock beside it. For a racer a way into
 * the other's hull (closer than KEEP_CLEAR_INTO times the two hit radii, a margin for the swing
 * out), however far ahead they would meet, is no way past it: it closes on it no faster than it
 * would reach that hull in KEEP_CLEAR_BRAKE (s; a slow hand's lag, the drive spooling down and the
 * thrusters' braking fit in it), nor faster than a bump (RAM_SAFE) at the last, so a racer behind
 * a slow one on a track's grid holds back while it swings out instead of ramming it from behind,
 * and one that cannot get round nudges past rather than trailing in its line of fire. A fighter's closing in is left to its attack:
 * held back so, it would never get a rival in range.
 */
const KEEP_CLEAR = 5;
const KEEP_CLEAR_AHEAD = 1;
const KEEP_CLEAR_PUSH = 800;
const KEEP_CLEAR_BRAKE = 3;
const KEEP_CLEAR_INTO = 1.5;
/** A bot in a burning drive's plume stronger than this (see ship/plume, plumeStrength: a twentieth of its full heat, some 450 m behind a full burn) steers sideways out of it. */
const PLUME_SHRUG = 0.05;
const plumeBack = new THREE.Vector3();
/**
 * Bots do not fly into a ring's housings (a race's gate, a base of Capture the Flag). Where
 * their way would cross a ring's plane within RING_HORIZON seconds on its housings or struts,
 * or within RING_MARGIN ship radii of them, the wanted velocity is pushed sideways, up to
 * CRUISE_SPEED the nearer the crossing: into the opening when the way meets the inner half of
 * the housings, else out past them.
 */
const RING_HORIZON = 2;
const RING_MARGIN = 1.5;
/**
 * Bots shove on purpose. A rival beside the bot, its center within SHOVE_REACH ship radii (about
 * 50 m) and drifting against it slower than SHOVE_DRIFT (units/s, 15 m/s), with rock or a hull
 * within SHOVE_TARGET (units, 120 m) beyond it, gets the dodge's kick into its flank, for a
 * knockout. A daring bot takes the chance more often; any bot at most once every SHOVE_PAUSE
 * seconds, and its thrusters leave the drift alone for SHOVE_DRIFT_SECONDS so the kick lands.
 */
const SHOVE_REACH = 3;
const SHOVE_DRIFT = 300;
const SHOVE_TARGET = 2400;
const SHOVE_PAUSE = 8;
const SHOVE_DRIFT_SECONDS = 0.6;

const toTarget = new THREE.Vector3();
const desired = new THREE.Vector3();
const error = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const local = new THREE.Vector3();
const allyOffset = new THREE.Vector3();
const heading = new THREE.Vector3();
const jinkStep = new THREE.Vector3();
const line = new THREE.Vector3();
const towardShip = new THREE.Vector3();
const swing = new THREE.Vector3();
const hunt = new THREE.Vector3();
const across = new THREE.Vector3();
const across2 = new THREE.Vector3();
const wayOrigin = new THREE.Vector3();
/** The bot's view (see Bot.inView): its axes and the line to what it looks at. */
const viewForward = new THREE.Vector3();
const viewUp = new THREE.Vector3();
const viewSide = new THREE.Vector3();
const viewLine = new THREE.Vector3();
/** The rays of wayAhead (and the shove's check): each cast's hit, and the nearest of them, reused every step. */
const wayHit: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };
const wayBest: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };
/** The pieces wayAhead's tube may meet (see AsteroidField.piecesAlong), gathered anew every look. */
const wayPieces: Asteroid[] = [];
/** Where a ray of wayAhead met a piece of junk, in the piece's frame (see world/junk, onCore). */
const wayPoint = new THREE.Vector3();
const groundNormal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** Up from a planet's center through the bot (see Bot.air). */
const up = new THREE.Vector3();
const SIDE = new THREE.Vector3(1, 0, 0);
/** A moving piece's velocity, where it is from the bot, how the two close, where it passes (see Bot.incoming). */
const pieceVelocity = new THREE.Vector3();
const offset = new THREE.Vector3();
const closing = new THREE.Vector3();
const passing = new THREE.Vector3();

export { BOT_NAMES } from '../music/lines';

/**
 * What a bot can, each 0..1: `aim`, how close its aim comes; `reflexes`, how fast it reacts,
 * how quick its hand is (see Bot.byHand) and how well it starts a race; `daring`, how hot it runs
 * its laser and how often it takes the hook.
 */
export interface Skills {
  aim: number;
  reflexes: number;
  daring: number;
}

/**
 * Every bot has skills of its own, which the menu shows as scales, so a Host knows whom it
 * picks; on average they run from Laika (0.1) to Halley (0.85). The first three, who fill a
 * tournament first, average 0.4; Kessler is the middling one (0.5), whom the balance runs watch.
 */
const BOT_SKILLS: Record<string, Skills> = {
  Laika: { aim: 0.1, reflexes: 0.2, daring: 0 },
  Sputnik: { aim: 0.3, reflexes: 0.1, daring: 0.2 },
  Juno: { aim: 0.2, reflexes: 0.4, daring: 0.3 },
  Ceres: { aim: 0.4, reflexes: 0.4, daring: 0.4 },
  Kessler: { aim: 0.5, reflexes: 0.5, daring: 0.5 },
  Orion: { aim: 0.7, reflexes: 0.5, daring: 0.6 },
  Vega: { aim: 0.6, reflexes: 0.9, daring: 0.6 },
  Halley: { aim: 0.9, reflexes: 0.8, daring: 0.85 },
};

/** Skills that are all the same, for a bot of a name without its own (0.4) or one the flight school sets. */
export const evenSkills = (skill: number): Skills => ({ aim: skill, reflexes: skill, daring: skill });
/** A bot's skills as a mission names them: one number for all three, or each of its own (Spare's, see campaign/campaign, spareSkills). */
export type Skill = number | Skills;
export const skillsFrom = (skill: Skill): Skills => (typeof skill === 'number' ? evenSkills(skill) : skill);

/** A bot's skills by its name; only the table's own entries count, never what every object inherits (a name another browser sends may be "constructor"). */
export const skillsOf = (name: string) => (Object.hasOwn(BOT_SKILLS, name) ? BOT_SKILLS[name] : evenSkills(0.4));

/**
 * Whether a ship of the shooter's own side is in its line of fire, as a Host sees it: alive, in
 * sight, ahead of `origin`, its hull widened by `clearance` on the line from `origin` along
 * `direction` (unit length) before the first rival hull the line strikes, or within `reach`
 * when it strikes none.
 * A beam ends at the first hull and hurts whoever's it is (friendly fire), so a bot holds fire.
 */
export function allyInLine(shooter: Ship, ships: readonly Ship[], field: AsteroidField, origin: THREE.Vector3, direction: THREE.Vector3, reach: number, clearance: number): boolean {
  let open = reach;
  for (const ship of ships) {
    if (ship === shooter || !ship.alive || ship.allyOf(shooter)) continue;
    const distance = raySphere(origin, direction, ship.flight.position, ship.radius);
    if (distance !== null && distance < open) open = distance;
  }
  for (const ship of ships) {
    if (!ship.alive || !ship.allyOf(shooter)) continue;
    // one behind the origin is out of the line however close: beam and torpedo leave forward
    if (allyOffset.subVectors(ship.flight.position, origin).dot(direction) < 0) continue;
    const distance = raySphere(origin, direction, ship.flight.position, ship.radius + clearance);
    if (distance !== null && distance < open && field.lineOfSight(origin, ship.flight.position)) return true;
  }
  return false;
}

/** A bot sets off a nova core (see novaWorth) among at least this many rivals. */
const NOVA_CROWD = 2;
/**
 * A fight of several against one Host (a mission's raiders): only PRESSING of them press it with
 * their own skills, the nearest to the Host when a place falls free, kept while they live; the
 * others fight on at HELD_BACK of their skills (a wider aim, a slower trigger, less daring). Each
 * one shot down lets the next press, so the fight stays one a Host can win and is hardest at its
 * end.
 */
export const PRESSING = 2;
export const HELD_BACK = 0.5;

/** Chooses who of `bots` presses the fight on `prey` this step (see PRESSING). */
export function pressOn(bots: readonly Bot[], prey: Ship) {
  let pressing = 0;
  for (const bot of bots) {
    if (bot.pressing && !bot.ship.alive) bot.press(false);
    if (bot.pressing) pressing++;
  }
  while (pressing < PRESSING) {
    let next: Bot | null = null;
    let nearest = Infinity;
    for (const bot of bots) {
      if (bot.pressing || !bot.ship.alive) continue;
      const distance = bot.ship.flight.position.distanceToSquared(prey.flight.position);
      if (distance < nearest) {
        nearest = distance;
        next = bot;
      }
    }
    if (!next) break;
    next.press(true);
    pressing++;
  }
  for (const bot of bots) if (!bot.pressing && bot.skills === bot.own) bot.press(false);
}

/**
 * A nova core is worth setting off at the President's battleship once it takes this many hits
 * of its parts (three torpedoes' worth): a battery within about 700 m, the distance a bot
 * attacking one holds (see SIEGE_DISTANCE) and some more.
 */
export const NOVA_SIEGE = 30;
/**
 * A bot that has held its core NOVA_PATIENCE seconds sets it off on a single rival inside the
 * blast (a double kill all the same): rivals flee a holder, and a crowd may never come. One that
 * has held it NOVA_SHED seconds sets it off anywhere, for the next shot is the core and its
 * laser stays silent until then; the reprint it earns costs nothing.
 */
export const NOVA_PATIENCE = 20;
export const NOVA_SHED = 60;

/**
 * Whether a bot's nova core is worth setting off where it is, never with a ship of its own side
 * within the blast's `radius` (units), for a nova spares nobody: NOVA_CROWD rivals or more within
 * four fifths of it, or `siege` hits on the battleship's parts of NOVA_SIEGE or more (see
 * Fleet.novaDamage); having held it `held` seconds, one rival within it after NOVA_PATIENCE,
 * anything after NOVA_SHED. The target drone, which nobody flies, does not count.
 */
export function novaWorth(holder: Ship, ships: readonly Ship[], radius: number, held = 0, siege = 0): boolean {
  let crowd = 0;
  let inside = 0;
  for (const other of ships) {
    if (other === holder || !other.alive || other.kind === null) continue;
    const distance = other.flight.position.distanceTo(holder.flight.position);
    if (distance >= radius) continue;
    if (other.allyOf(holder)) return false;
    inside++;
    if (distance < radius * 0.8) crowd++;
  }
  return crowd >= NOVA_CROWD || siege >= NOVA_SIEGE || (held >= NOVA_PATIENCE && inside > 0) || held >= NOVA_SHED;
}

/**
 * Newtonian pursuit AI, perceiving and deciding as a pilot does: a clone with a human mind sits in
 * the cockpit, and a mind needs its time. It thinks in turns (see Turns), sees fully only what
 * lies in its view (see inView), and knows of the ships outside it what a glance at the radar and
 * the screen's edge shows (see glance). It works out the velocity it wants (close in on its target,
 * hold distance, avoid rocks, stay in the arena) and corrects large differences by turning
 * the main drive into the error and burning. Small differences are trimmed with the
 * maneuvering thrusters while the nose stays on the target. The armor makes it a dogfight:
 * a bot works its way behind its target, where the drive is open, fires at the drive and only
 * snipes at armor, and turns its own armored nose to a ship on its tail.
 */
export class Bot {
  private readonly aimOffset = new THREE.Vector3();
  /** Scatter of the aim caused by the target's jinking, rolled anew every few tenths of a second. */
  private readonly jinkOffset = new THREE.Vector3();
  private nextJinkRoll = 0;
  /** How hard the current target jinks (units/s²), smoothed over JINK_MEMORY. */
  private jink = 0;
  private lastTarget: Ship | null = null;
  private readonly lastTargetVelocity = new THREE.Vector3();
  private nextRethink = 0;
  /** Seconds the target has been in the sights; bots need a moment before they pull the trigger. */
  private onTargetFor = 0;
  private lastThink = 0;
  private readonly wanderTarget = new THREE.Vector3();
  /** What the bot wants this thought, and what its hand gives the ship: the same, eased in (see HAND_TIME). */
  private readonly controls: Controls = { ...IDLE };
  private readonly hand: Controls = { ...IDLE };
  /** Whether this clone has had a turn yet; its hand rests until it has (see think). */
  private decided = false;
  /** What the last turn decided, which the hand flies until the next (see fly): the velocity it wants; whether it burns for it whatever (danger), or once it is far off; whether it aims at the target or fires at a battleship's part (`siegeAt`), else where it looks (`look`). */
  private readonly want = new THREE.Vector3();
  private mustBurn = false;
  private mayBurn = false;
  private aiming = false;
  private sieging = false;
  private readonly siegeAt = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private defending = false;
  private lookingBack = false;
  private racing = false;
  /** The last turn's reasons to spend the clone's strain (see STRAIN_HOLD): danger, a nova, an attacker, a race. */
  private spending = false;
  /** Whether the target is in sight to fire at, and whether the bot follows it as it is (in view, or by its sensors: a lock, a hit, the HUD's mark of a prey) or only knows where its glance showed it (`seenAt`). */
  private inSight = false;
  private tracked = false;
  private readonly seenAt = new THREE.Vector3();
  /** Where the bot last saw each ship (in view or at a glance), and which glance that was in (see glance): only what it saw since its last glance counts. */
  private readonly memory = new Map<Ship, { at: THREE.Vector3; glance: number }>();
  private glances = 0;
  private nextGlance = 0;
  /** The axis the bot circles its target about, and the target it was chosen for (see ORBIT_SPEED). */
  private readonly orbitAxis = new THREE.Vector3(0, 1, 0);
  private orbiting: Ship | null = null;

  /** The ship this bot hunts; other bots read it, so no more than MAX_HUNTERS chase the same one. */
  target: Ship | null = null;
  /** Set by the game during a solar storm: the sensors are blind (see STORM_SIGHT). */
  blind = false;
  /**
   * Set by the game in a race (the point on the line it flies for) and in Capture the Flag (a
   * core to fetch or take, or the own base with a core in tow): the bot races there and how fast
   * (units/s), as a racer does, shooting only what lies ahead and turning only on a chaser, and
   * never takes the hook on the way.
   */
  waypoint: THREE.Vector3 | null = null;
  raceSpeed: number;
  /** Set by the game: the rings of the round, whose housings the bot steers clear of (see RING_HORIZON). */
  rings: readonly Ring[] = [];
  /** Set by the game in a race: the ring the racer flies through next, which it comes at on its own way (see Game.approach); its housings only push the bot into the opening. */
  through: Ring | null = null;
  /** Set by the game: the nearest probe, which an idle bot goes for. */
  lure: THREE.Vector3 | null = null;
  /** Set by the game: a ship the bot hunts wherever it is, seen or not. */
  prey: Ship | null = null;
  /**
   * Set by the game: a part of a battleship, which a bot with no ship to fight attacks; where it
   * holds for that, on the side the part shows itself (see Fleet.siegeFrom); and whether the
   * part is in its sight, not behind the hull or a rock.
   */
  siege: THREE.Vector3 | null = null;
  readonly siegeHold = new THREE.Vector3();
  siegeClear = false;
  /** Set by the game: a ship with a nova core close by, which the bot gets away from first. */
  flee: THREE.Vector3 | null = null;
  /** Set by the game: where a rock's shadow lies, while sunlight its radiators cannot shed heats the bot's hull (the Corona's, see Ship.sunExcess): it flies there, as a Host would. */
  shade: THREE.Vector3 | null = null;
  /** What the bot flees, for the development log: a nova, the battleship, a comet. */
  fleeFrom = '';
  /** Kept by the game: since when (s) its clone holds a nova core, Infinity while it holds none (see novaWorth). */
  novaSince = Infinity;
  /** Set by the game: the bot turns back beyond this distance (units) from `homeAt`, the field's center or a solar flare's safe pocket. */
  home = HOME_RADIUS;
  homeAt: THREE.Vector3 | null = null;
  /** Set by the game: an arena's edge of its own over a world (see world/arena, Bounds): `home` reckoned across the ground alone, and its ceiling at `roof` (units, a height), which the bot keeps under. */
  flat = false;
  roof = Infinity;
  /** Set by the game: the bot keeps the speed its boost gave it until then (s, see BOOST_KEEP). */
  boostUntil = 0;
  /** Set by the game: over a world fought over, the bot takes its ground for no danger, as a racer does (the hover field and its glide carry the hull over it and along its walls), and dives into its hollows and over its ridges with its target. */
  glide = false;
  /** Set by the game: the bot's hook holds until then, and is ready again from then on (s). */
  hookUntil = 0;
  hookReadyAt = 0;
  /** A racer looks back at a ship on its tail until then, and may again from then on (s). */
  private lookBackUntil = 0;
  private nextLookBack = 0;
  /** The clone's strain reached the bot's hold (see strainHold): it flies gently until the strain has fallen STRAIN_RECOVER below it. */
  private recovering = false;
  /**
   * How much the bots go easy on the Host, 0..1: a solo round raises it when the Host dies
   * again and again, and lets it fade (see Game). It widens their aim and slows their trigger.
   */
  ease = 0;
  /** An unarmed bot (a flight school sparring partner) never shoots and runs from a chaser instead of turning on it. */
  armed = true;
  /** In this thinking spell the bot takes single shots at armor too (see SNIPE_CHANCE). */
  private snipe = false;
  /** The side the bot jinks to while it defends, and when it switches. */
  private dodge = 1;
  private nextDodge = 0;
  /** The kick the bot gives its thrusters this thought, sideways and up in its own frame, to shove a rival (see SHOVE_REACH); the game fires it. */
  shove: { x: number; y: number } | null = null;
  private readonly shoveKick = { x: 0, y: 0 };
  private nextShove = 0;
  private shoveDriftUntil = 0;
  /** The bot climbs out of a planet's air to cool its hull (see air). */
  private climbing = false;
  /** Until when the bot may hide in a planet's clouds after a blow (see AIR_HIDE). */
  private hidingUntil = -Infinity;
  /** The fastest the bot wants to fly in a planet's air (units/s; Infinity without one; see air). */
  private airLimit = Infinity;
  /** The ship that last hit the drive, and until when the bot defends against it (see STRUCK_MEMORY). */
  private struckBy: Ship | null = null;
  private struckUntil = 0;

  /** A shot into the drive: the bot turns its armor to the shooter, however far off it is. */
  struck(shooter: Ship, now: number) {
    this.struckBy = shooter;
    this.struckUntil = now + STRUCK_MEMORY;
  }

  /** The skills it flies with: its own, or HELD_BACK of them while others press the fight (see pressOn). */
  skills: Skills;
  /** Its own skills held back (see pressOn). */
  private readonly held: Skills;
  /** Whether it is one of those who press a fight of several against one (see pressOn). */
  pressing = false;

  constructor(
    readonly ship: Ship,
    readonly own: Skills,
  ) {
    this.skills = own;
    this.held = { aim: own.aim * HELD_BACK, reflexes: own.reflexes * HELD_BACK, daring: own.daring * HELD_BACK };
    this.raceSpeed = raceSpeedOf(own);
  }

  /** Flies with its own skills while it presses the fight, else held back (see pressOn). */
  press(on: boolean) {
    this.pressing = on;
    this.skills = on ? this.own : this.held;
  }

  /**
   * Whether the bot sees `ship` (see AsteroidField.lineOfSight, `haze` the reach through an air):
   * the line from its own ship is cast once a turn, since one turn asks it of the same
   * ship again and again (as a target, a hunter of another, a chaser, a ship to keep clear of)
   * while nothing moves.
   */
  private sees(field: AsteroidField, ship: Ship, haze = SIGHT_DEPTH): boolean {
    const from = this.ship.flight.position;
    const to = ship.flight.position;
    if (from.distanceTo(to) < 1) return true;
    if (!field.clearAir(from, to, haze)) return false;
    let clear = this.sightLines.get(ship);
    if (clear === undefined) {
      clear = field.clearLine(from, to);
      this.sightLines.set(ship, clear);
    }
    return clear;
  }

  /** The lines of sight cast in this thought (see sees). */
  private readonly sightLines = new Map<Ship, boolean>();

  /**
   * One step of the bot: on its `turn` (see Turns) it looks and decides (see decide), and every
   * step its hand flies what its last turn decided (see fly). A fresh clone's hand rests until
   * its first turn.
   */
  think(now: number, ships: Ship[], field: AsteroidField, turn = true): Controls {
    // the first step after a (re)spawn must not count the time the bot was gone as reaction
    // time, and a new clone's hand starts at rest, knowing nothing yet; any shorter step counts
    // in full (a time-lapse takes long ones)
    let dt = now - this.lastThink;
    this.lastThink = now;
    if (dt > RESPAWN_GAP) {
      dt = 0;
      Object.assign(this.hand, IDLE);
      this.decided = false;
      this.nextGlance = now;
    }
    this.shove = null;
    if (turn) this.decide(now, ships, field);
    return this.fly(now, ships, field, dt);
  }

  /**
   * Whether `position` lies in the bot's view (see VIEW_MARGIN): seen from where the chase
   * camera hangs, within its picture and the margin, by dot products with the ship's own axes.
   */
  inView(position: THREE.Vector3): boolean {
    const me = this.ship.flight;
    const forward = me.forward(viewForward);
    const above = me.up(viewUp);
    const radius = this.ship.radius;
    viewLine.subVectors(position, me.position).addScaledVector(forward, CHASE_DISTANCE * radius).addScaledVector(above, -CHASE_HEIGHT * radius);
    const ahead = viewLine.dot(forward);
    if (ahead <= 0) return false;
    if (Math.abs(viewLine.dot(above)) > ahead * VIEW_UP) return false;
    return Math.abs(viewLine.dot(viewSide.crossVectors(forward, above))) <= ahead * VIEW_SIDE;
  }

  /**
   * A glance at the radar and the arrows at the screen's edge (see GLANCE_SLOW): every ship
   * outside the view they show (in line of sight, the radar's haze within its reach and the
   * eye's beyond, a ship running silent only up close) is remembered where it is now. A solar
   * storm blanks both, and the bot sees only what its eyes do.
   */
  private glance(now: number, ships: readonly Ship[], field: AsteroidField) {
    this.glances++;
    const reflexes = this.skills.reflexes;
    this.nextGlance = now + (GLANCE_SLOW - (GLANCE_SLOW - GLANCE_FAST) * reflexes) * (1 - GLANCE_JITTER + 2 * GLANCE_JITTER * Math.random());
    if (this.blind) return;
    const eye = this.ship.flight.position;
    for (const ship of ships) {
      if (ship === this.ship || !ship.alive || this.inView(ship.flight.position)) continue;
      const distance = ship.flight.position.distanceTo(eye);
      if (distance >= SIGHT_RANGE || !detectable(ship, eye, now)) continue;
      if (field.lineOfSight(eye, ship.flight.position, distance < RADAR_RANGE ? RADAR_DEPTH : SIGHT_DEPTH)) this.remember(ship);
    }
  }

  /** Keeps where `ship` is now, as seen this glance (see recalled). */
  private remember(ship: Ship) {
    let kept = this.memory.get(ship);
    if (!kept) this.memory.set(ship, (kept = { at: new THREE.Vector3(), glance: 0 }));
    kept.at.copy(ship.flight.position);
    kept.glance = this.glances;
  }

  /** Where the bot last saw `ship`, in view or at its last glance, if it has since that glance; else null. */
  private recalled(ship: Ship): THREE.Vector3 | null {
    const kept = this.memory.get(ship);
    return kept && kept.glance === this.glances ? kept.at : null;
  }

  /**
   * The bot's turn: what it sees and knows (target, chaser, threats, the way ahead, the ships
   * to keep clear of), and what it wants from it: the velocity, and whether to burn for it, aim
   * at the target, fire at a battleship's part or only look where it goes. Its hand flies that
   * until the next turn (see fly).
   */
  private decide(now: number, ships: Ship[], field: AsteroidField) {
    this.sightLines.clear();
    this.decided = true;
    const me = this.ship.flight;
    if (now >= this.nextGlance) this.glance(now, ships, field);

    if (now >= this.nextRethink) {
      this.nextRethink = now + 0.4 + Math.random() * 0.6;
      // the aim wanders around the target: a direction and a share of the full error (see aimError)
      this.aimOffset.randomDirection().multiplyScalar(Math.random());
      this.snipe = Math.random() < SNIPE_CHANCE;
      if (Math.random() < 0.2) this.wanderTarget.randomDirection().multiplyScalar(Math.random() * (this.flat ? this.home : 30000));
      if (this.flat) this.wanderTarget.y = this.roof - ROAM_UNDER;
    }

    // the nearest ship in sight, but one that others already hunt (as the bot sees them: their
    // noses on it) counts as farther, and a ship hunted by MAX_HUNTERS is left to them: the bots
    // fight each other too, not only the Host
    // in view it sees every ship as it is; outside it, only where its last glance showed one,
    // which it turns to and fights once it has it in view
    let target: Ship | null = null;
    const sight = this.blind ? STORM_SIGHT : SIGHT_RANGE;
    let targetDistance = sight;
    let tracked = false;
    let best = Infinity;
    for (const ship of ships) {
      if (!this.rival(ship, now)) continue;
      if (!this.inView(ship.flight.position)) {
        const kept = this.recalled(ship);
        const distance = kept ? kept.distanceTo(me.position) : Infinity;
        if (distance >= sight) continue;
        const cost = distance * (ship === this.target ? STICKY : 1);
        if (cost < best) {
          best = cost;
          target = ship;
          targetDistance = distance;
          tracked = false;
        }
        continue;
      }
      const distance = ship.flight.position.distanceTo(me.position);
      if (distance >= sight) continue;
      // a ship running silent its sensors find only up close, as a Host's (see Ship.silent)
      if (!detectable(ship, me.position, now)) continue;
      const hunters = this.huntersOf(ship, ships, field, sight);
      if (hunters >= MAX_HUNTERS) continue;
      const cost = distance * (1 + hunters) * (ship === this.target ? STICKY : 1);
      // in a planet's haze the radar finds it farther off than the eye sees (see world/air)
      if (cost < best && this.sees(field, ship, RADAR_DEPTH)) {
        this.remember(ship);
        best = cost;
        target = ship;
        targetDistance = distance;
        tracked = true;
      }
    }
    if (target && !tracked) this.seenAt.copy(this.recalled(target)!);
    // a ship the game names as prey (the thief of the own side's core, which a Host's HUD marks
    // wherever it is) is chased wherever it is, but only fired at in sight; in a planet's haze
    // so is a ship the radar shows, as the laser reaches no farther than the eye
    let inSight = tracked && (!field.air || this.sees(field, target!));
    if (this.prey?.alive) {
      target = this.prey;
      tracked = true;
      targetDistance = this.prey.flight.position.distanceTo(me.position);
      inSight = targetDistance < sight && this.sees(field, this.prey);
    }
    // a ship on the own tail with its nose on the bot comes first: the bot turns its armor to
    // it and jinks, because from behind the drive is open
    let defending = false;
    let chaser: Ship | null = null;
    // a ship that just hit the drive is the first to turn to, wherever it fired from (its beam
    // shows where: in a planet's haze as far as the eye sees); out of sight, any other ship on
    // the tail still counts. That one the bot knows as a Host does, from the lock warning: a nose
    // tracking it from behind, within the sensors' reach and in sight, and nothing while a solar
    // storm blinds the sensors. Either is in sight, so the bot fires back at it
    const struck = this.struckBy && now < this.struckUntil && this.struckBy.alive ? this.struckBy : null;
    for (let i = struck ? -1 : 0; i < (this.blind ? 0 : ships.length); i++) {
      const ship = i < 0 ? struck! : ships[i];
      // as with targets: a fresh clone cannot hurt, nor can the own side
      if (!this.rival(ship, now)) continue;
      const line = toTarget.subVectors(me.position, ship.flight.position);
      const distance = line.length();
      const threat = i < 0 || (this.ship.tailToward(line) && noseOn(ship.flight, me.position, this.ship.radius) > 0);
      if (threat && this.sees(field, ship, i < 0 ? SIGHT_DEPTH : LOCK_DEPTH)) {
        chaser = ship;
        // a racer does not turn around for it: it races on
        if (this.armed && !this.waypoint) {
          target = ship;
          targetDistance = distance;
          inSight = true;
          tracked = true;
          defending = true;
        }
        break;
      }
    }
    // an unarmed bot does not fight back: it runs, and its drive stays open to the chaser
    if (chaser && !this.armed) target = null;
    // a racer never gives up the race: it flies the course and shoots whoever is ahead of it.
    // A ship on its tail it answers with a flip: its drift carries it on along the course while
    // its nose turns back for a few shots, then it turns forward again
    const racing = !!this.waypoint;
    if (racing && chaser && this.armed && now >= this.nextLookBack && !this.ship.overheated && chaser.flight.position.distanceTo(me.position) < FIRE_RANGE) {
      this.lookBackUntil = now + LOOK_BACK_SECONDS;
      this.nextLookBack = now + LOOK_BACK_PAUSE;
    }
    const lookingBack = racing && !!chaser && now < this.lookBackUntil;
    if (lookingBack) {
      target = chaser;
      targetDistance = chaser!.flight.position.distanceTo(me.position);
      inSight = true;
      tracked = true;
    }
    this.target = target;
    this.tracked = tracked;
    this.inSight = inSight;

    if (chaser && !this.armed) {
      toTarget.subVectors(me.position, chaser.flight.position);
      desired.copy(toTarget).normalize().multiplyScalar(CRUISE_SPEED * 0.6);
    } else if (racing) {
      // through the next gate, at speed; what a gate's coil gave it, it keeps, and what its boost
      // gave it on a straight for a while (see BOOST_KEEP)
      toTarget.subVectors(this.waypoint!, me.position);
      const keep = now < this.boostUntil ? OVERDRIVE_PUSH : BOOST_PUSH;
      desired.copy(toTarget).normalize().multiplyScalar(Math.max(this.raceSpeed, Math.min(me.velocity.length(), this.raceSpeed + keep)));
    } else if (target && !tracked) {
      // a ship its last glance showed outside the view: it turns to where it was and closes in
      toTarget.subVectors(this.seenAt, me.position);
      desired.copy(toTarget).normalize().multiplyScalar(Math.min(toTarget.length() * 0.3, CRUISE_SPEED));
    } else if (target) {
      toTarget.subVectors(target.flight.position, me.position);
      if (defending) {
        // hold the distance and face the attacker; the jink below makes it miss
        const approach = THREE.MathUtils.clamp((targetDistance - HOLD_DISTANCE) * 0.3, -CRUISE_SPEED * 0.3, CRUISE_SPEED);
        desired.copy(toTarget).normalize().multiplyScalar(approach).add(target.flight.velocity);
      } else {
        // the place to be is behind the target, where its drive is open; the way there is a
        // wide arc around it, drifting sideways with the nose on it, never straight at it
        const goal = local.copy(target.flight.position).addScaledVector(target.flight.forward(heading), -HOLD_DISTANCE).sub(me.position);
        const approach = Math.min(goal.length() * 0.3, CRUISE_SPEED);
        desired.copy(goal).normalize().multiplyScalar(approach).add(target.flight.velocity);
        if (target !== this.orbiting) {
          this.orbiting = target;
          this.orbitAxis.randomDirection();
        }
        // behind it, where the drive is open, the arc is done: the bot settles there and fires
        if (!target.tailToward(toTarget)) {
          swing.crossVectors(this.orbitAxis, toTarget);
          if (swing.lengthSq() < 1) swing.crossVectors(heading.set(0, 1, 0), toTarget);
          desired.addScaledVector(swing.normalize(), ORBIT_SPEED);
        }
      }
    } else if (this.siege) {
      // no ship to fight, but a battleship's part: fly to where it shows itself, SIEGE_DISTANCE
      // off it, and hold there with the nose on it
      toTarget.subVectors(this.siegeHold, me.position);
      desired.copy(toTarget).normalize().multiplyScalar(Math.min(toTarget.length() * 0.3, CRUISE_SPEED));
      toTarget.subVectors(this.siege, me.position);
    } else {
      // nothing to fight: a probe in sight is worth the trip, else the bot roams
      toTarget.subVectors(this.lure ?? this.wanderTarget, me.position);
      desired.copy(toTarget).normalize().multiplyScalar(Math.min(CRUISE_SPEED * 0.6, toTarget.length() * 0.2));
    }
    // a nova core close by: away from it, at full speed, with the main drive (see burning)
    if (this.flee) desired.copy(local.subVectors(me.position, this.flee).normalize()).multiplyScalar(CRUISE_SPEED * 2);
    // out of a sun that burns the hull: into a rock's shadow, slowing as it arrives (it fights on from there)
    else if (this.shade) {
      const toShade = local.subVectors(this.shade, me.position);
      desired.copy(toShade).normalize().multiplyScalar(Math.min(CRUISE_SPEED, toShade.length() * 0.5));
    }
    const fromHome = this.homeAt ? local.subVectors(me.position, this.homeAt) : local.copy(me.position);
    if (this.flat) fromHome.y = 0;
    const homeDistance = fromHome.length();
    if (homeDistance > this.home) desired.addScaledVector(fromHome, -CRUISE_SPEED / homeDistance);
    const overRoof = me.position.y - (this.roof - ROOF_MARGIN);
    if (overRoof > 0) desired.y -= CRUISE_SPEED * Math.min(1, overRoof / ROOF_MARGIN);
    const givingWay = this.keepClear(ships, field, racing);
    const hot = this.air(field, racing, defending, !!target, homeDistance > this.home, now);
    // a massive body pulls: near it, away from it comes first
    const well = field.well;
    let falling = false;
    if (well) {
      const away = local.subVectors(me.position, well.position);
      const distance = away.length();
      const thrust = me.velocity.dot(away) < 0 ? MAIN_THRUST * Math.max(this.ship.drive, 0.01) : MAIN_THRUST;
      if (distance < well.radius + WELL_MARGIN || escapeLoad(well, me.position, me.velocity, thrust) >= WELL_PULL) {
        falling = true;
        desired.addScaledVector(away.divideScalar(Math.max(distance, 1)), CRUISE_SPEED * 2);
      }
    }

    // rocks, the well's body or the battleship's hull in the flight path: aim the velocity past them
    const speed = me.velocity.length();
    let danger = falling || hot;
    if (speed > 50) {
      heading.copy(me.velocity).divideScalar(speed);
      const hit = this.wayAhead(field, heading, speed * AVOID_HORIZON + this.ship.radius * 4, racing || this.glide);
      if (hit) {
        danger ||= hit.distance < speed * AVOID_HORIZON * 0.6;
        const away = local.subVectors(me.position, hit.center);
        away.addScaledVector(heading, -away.dot(heading));
        if (away.lengthSq() < 1) away.set(0, 1, 0);
        desired.addScaledVector(away.normalize(), CRUISE_SPEED).addScaledVector(heading, -speed * 0.5);
      }
      for (const ring of this.rings) this.clearRing(ring, speed, ring === this.through);
    }
    // a piece moving into its way, however still the bot holds: out of it sideways
    if (this.incoming(field, local)) {
      danger = true;
      desired.addScaledVector(local, CRUISE_SPEED * 2);
    }
    // in a planet's air no way out of danger is worth burning the hull (see air)
    if (desired.lengthSq() > this.airLimit * this.airLimit) desired.setLength(this.airLimit);

    this.want.copy(desired);
    // near the target the nose stays on it and the thrusters carry the bot around it; a bot
    // under attack never turns its tail to burn
    // a racer burns for the gate; a fighter only when no target is in range
    // a part of a battleship is fought within range and in sight; behind the hull the bot burns round to it
    const sieging = !target && !!this.siege && this.siegeClear && toTarget.length() < FIRE_RANGE;
    this.mustBurn = danger || !!this.flee;
    this.mayBurn = !defending && !lookingBack && (racing || !(((target && targetDistance < FIRE_RANGE) || sieging) && !this.ship.overheated));
    this.aiming = !!target && (!racing || lookingBack || me.noseAngleTo(line.subVectors(tracked ? target.flight.position : this.seenAt, me.position)) < RACE_AIM_CONE);
    this.sieging = sieging;
    if (this.siege) this.siegeAt.copy(this.siege);
    this.look.copy(toTarget);
    this.defending = defending;
    this.lookingBack = lookingBack;
    this.racing = racing;
    this.spending = danger || !!this.flee || defending || racing;
    this.shove = this.armed && now >= this.nextShove ? this.shoveAt(ships, field, now) : null;
    if (devlog) {
      // what the bot does, the first that holds: running from danger, then its task
      const doing = this.flee ? 'flee' : falling ? 'escape well' : hot ? 'climb out of the heat' : chaser && !this.armed ? 'run' : lookingBack ? 'look back' : racing ? 'race' : defending ? 'defend' : target ? 'attack' : this.siege ? 'siege' : this.lure ? 'probe' : 'roam';
      const about = this.flee ? this.fleeFrom : chaser && (!this.armed || lookingBack || defending) ? chaser.name : target ? target.name : '';
      const extra = `${danger && !falling ? ' +avoid rock' : ''}${homeDistance > this.home ? ' +home' : ''}${givingWay ? ` +give way to ${givingWay.name}` : ''}`;
      devlog.decide(now, this.ship.name, meanSkill(this.skills), doing + extra, about);
    }
  }

  /**
   * The bot's hand, every step: it flies what the last turn decided (see decide) against the
   * ship as it moves now, burning for the wanted velocity while it is far off, keeping the nose
   * on the target it chose (on where its glance showed it, until it has it in view) and pulling
   * the trigger by its reaction time, trimming with the thrusters, jinking under attack and
   * easing off its clone's strain; all of it eased in by hand (see byHand).
   */
  private fly(now: number, ships: Ship[], field: AsteroidField, dt: number): Controls {
    const me = this.ship.flight;
    // one controls object per bot, cleared each step, so flying allocates nothing
    const controls = Object.assign(this.controls, IDLE);
    if (!this.decided) return this.byHand(controls, dt);
    const target = this.target?.alive ? this.target : null;
    error.subVectors(this.want, me.velocity);
    const burning = this.mustBurn || (this.mayBurn && error.length() > BURN_THRESHOLD);
    if (target && this.tracked) this.senseJink(target, dt, now);
    if (burning) {
      me.steer(error, 2.5, controls);
      controls.thrust = me.noseAngleTo(error) < 0.25 ? 1 : 0;
    } else if (target && this.aiming) {
      const where = this.tracked ? target.flight.position : this.seenAt;
      const targetDistance = where.distanceTo(me.position);
      aimPoint.copy(where).addScaledVector(this.aimOffset, this.aimError(targetDistance)).add(this.jinkOffset);
      me.steer(aimPoint.sub(me.position), 3, controls);
      const angularSize = (target.radius * 0.8) / Math.max(targetDistance, 1);
      const onTarget = me.noseAngleTo(aimPoint) < angularSize + this.ship.radius / Math.max(targetDistance, 1);
      this.onTargetFor = onTarget ? this.onTargetFor + dt : 0;
      const reaction = reactionOf(this.skills.reflexes) + EASE_REACTION * this.ease + STRAIN_REACTION * strainPenalty(this.ship);
      // a shot into the drive is worth the heat; at the armor a bot only snipes now and then,
      // single shots from a nearly cool laser, so it keeps the heat for the drive
      const open = this.tracked && target.tailToward(line.subVectors(target.flight.position, me.position));
      // a racer flies first: single shots only, even at an open drive, and only now and then
      // (in its sniping spells), unless it looks back; the pack is a race, not a shooting gallery;
      // so does a raider held back while two others press the fight (see pressOn)
      const flying = (this.racing && !this.lookingBack) || this.skills === this.held;
      const heatLimit = open && !flying ? this.hotHeat : ARMOR_FIRE_HEAT;
      controls.fire = this.inSight && ((open && !flying) || this.snipe) && this.onTargetFor > reaction && targetDistance < FIRE_RANGE && !this.ship.overheated && this.ship.heat < heatLimit;
    } else if (this.sieging) {
      // a part of a battleship holds still: the nose on it, and fire while the laser allows
      toTarget.subVectors(this.siegeAt, me.position);
      me.steer(toTarget, 3, controls);
      controls.fire = me.noseAngleTo(toTarget) < SIEGE_AIM && !this.ship.overheated && this.ship.heat < this.hotHeat;
    } else {
      me.steer(this.look, 2.5, controls);
    }

    // trim the remaining velocity error with the maneuvering thrusters
    me.toLocalDirection(error, local).divideScalar(RCS_THRUST * 0.3);
    controls.strafeX = THREE.MathUtils.clamp(local.x, -1, 1);
    controls.strafeY = THREE.MathUtils.clamp(local.y, -1, 1);
    controls.strafeZ = THREE.MathUtils.clamp(-local.z, -1, 1);
    // under attack the bot jinks left and right, so the attacker's aim cannot settle
    if (this.defending) {
      if (now >= this.nextDodge) {
        this.dodge = -this.dodge;
        this.nextDodge = now + 0.4 + Math.random() * 0.4;
      }
      controls.strafeX = this.dodge * JINK_PUSH;
    }
    if (now < this.shoveDriftUntil) controls.strafeX = controls.strafeY = 0;
    // the clone's strain: spent out of danger, away from a nova, jinking under attack, on the shot
    // and on a race's line, where the gates' housings punish a slack hand; else the bot eases off
    // at its hold until it has recovered (see STRAIN_HOLD)
    this.recovering = easesOff(this.recovering, this.ship.strain, this.skills.daring);
    if (this.recovering && !this.spending && !controls.fire) flyGently(controls);
    // the beam would end on a ship of the own side: no shot (friendly fire hurts)
    if (controls.fire && allyInLine(this.ship, ships, field, me.position, me.forward(heading), LASER_RANGE, ALLY_CLEARANCE)) controls.fire = false;
    // a trigger the ship ignores until let go (a fresh clone's): let go of it first, as a Host does, then press again
    if (controls.fire && this.ship.mustRelease) controls.fire = false;
    return this.byHand(controls, dt);
  }

  /**
   * In a planet's air the bot reads what a Host's HUD shows (see Game.airAlarm): the speed at its
   * depth where the air heats the hull as fast as it cools, AIR_MARGIN of which is the most it
   * wants (`airLimit`, set here and held in think after every other wish), and the hull heat
   * alarm, on which it climbs out of the air with its drive (returns true then). Unless it races
   * (a course runs along the deck), it keeps over the clouds (see AIR_ABOVE): rising out of them,
   * and never sinking into them of its own wish.
   */
  private air(field: AsteroidField, racing: boolean, defending: boolean, hunting: boolean, homeward: boolean, now: number): boolean {
    const air = field.air;
    this.airLimit = Infinity;
    if (!air) return false;
    const me = this.ship.flight;
    const altitude = altitudeIn(air, me.position);
    const cooling = this.ship.cooling;
    up.subVectors(me.position, air.center).normalize();
    // its radiators clogged as far as it dares (AIR_CLOG), it gets out of the clouds whatever it is doing
    const choking = this.ship.clog > AIR_CLOG + AIR_CLOG_DARING * this.skills.daring;
    // under attack it may shake the chaser off in the clouds for a while (AIR_HIDE), slipping
    // down to AIR_DIVE_DEPTH under the deck
    if (defending && !choking) this.hidingUntil = now + AIR_HIDE;
    const hiding = now < this.hidingUntil && !choking;
    if (hiding && altitude > -AIR_DIVE_DEPTH) desired.addScaledVector(up, -AIR_DIVE);
    // a daring bot follows its target into the clouds; any bot heading home goes home first
    const chasing = hunting && this.skills.daring >= AIR_DARING && !choking;
    if (!racing && !hiding && !chasing && !homeward) {
      // over the floor it sinks no faster than it can stop at it (AIR_BRAKE); under it, no wish
      // downwards at all, and up the deeper it is
      const sinking = -desired.dot(up);
      const allowed = Math.sqrt(2 * AIR_BRAKE * Math.max(0, altitude - AIR_ABOVE));
      if (sinking > allowed) desired.addScaledVector(up, sinking - allowed);
      if (altitude < AIR_ABOVE) desired.addScaledVector(up, AIR_RISE * Math.min(1, (AIR_ABOVE - altitude) / AIR_RISE_SPAN));
    }
    // what the radiators shed beyond the reactor's waste heat a clog holds in is what the air may add
    const safe = heatSpeed(air, altitude, Math.max(0, cooling - REACTOR_WASTE * this.ship.clog)) * AIR_MARGIN;
    // the alarm: the air heats the hull faster than it cools, and the heat is up; the bot climbs
    // until the hull has cooled again; and choking under the deck, it climbs out at once
    if (this.ship.heat > AIR_HOT && heatInto(air, altitude, throughAir(air, me.position, me.velocity, airFlow).length(), this.ship.clog) > cooling) this.climbing = true;
    else if (this.ship.heat < AIR_COOL) this.climbing = false;
    const out = this.climbing || (choking && altitude < 0);
    // on the way out the waste heat comes whatever the speed, so the quicker out the better: as
    // fast as the air alone allows (AIR_RISE at least), not the speed that would stay cool
    const escape = Math.max(heatSpeed(air, altitude, cooling) * AIR_MARGIN, AIR_RISE);
    this.airLimit = out ? escape : Math.max(safe, AIR_RISE);
    if (out) desired.copy(up).multiplyScalar(Math.min(escape, CRUISE_SPEED));
    return out;
  }

  /** A rival to shove into the rock beside it (see SHOVE_REACH): the kick, or null. */
  private shoveAt(ships: readonly Ship[], field: AsteroidField, now: number): { x: number; y: number } | null {
    const me = this.ship.flight;
    for (const ship of ships) {
      if (!this.rival(ship, now)) continue;
      // a rival beside the hull it sees: within a shove's reach the view takes it in
      if (!this.inView(ship.flight.position)) continue;
      const away = local.subVectors(ship.flight.position, me.position);
      const distance = away.length();
      if (distance > this.ship.radius * SHOVE_REACH || line.subVectors(ship.flight.velocity, me.velocity).lengthSq() > SHOVE_DRIFT * SHOVE_DRIFT) continue;
      away.divideScalar(distance);
      if (!field.raycast(ship.flight.position, away, SHOVE_TARGET, true, wayHit)) continue;
      // the thrusters kick sideways and up and down: a rival ahead or behind is out of reach
      me.toLocalDirection(away, away);
      if (hypot(away.x, away.y) < 0.7) continue;
      this.nextShove = now + SHOVE_PAUSE;
      if (Math.random() > this.skills.daring) return null;
      this.shoveDriftUntil = now + SHOVE_DRIFT_SECONDS;
      devlog?.add({ kind: 'act', t: now, ship: this.ship.name, act: 'shove', detail: ship.name });
      this.shoveKick.x = away.x;
      this.shoveKick.y = away.y;
      return this.shoveKick;
    }
    return null;
  }

  /**
   * The way out of the moving piece of the field that comes soonest within reach of the hull as
   * the two move (see INCOMING_SPEED), into `away` (unit length: from where it would pass closest
   * towards where the bot would be then); false when none comes.
   */
  private incoming(field: AsteroidField, away: THREE.Vector3): boolean {
    const me = this.ship.flight;
    let soonest = INCOMING_SECONDS;
    let found = false;
    for (const piece of field.asteroids.values()) {
      if (piece.solid) continue;
      const moving = field.surfaceVelocity(piece, piece.object.position, pieceVelocity);
      if (moving.lengthSq() < INCOMING_SPEED * INCOMING_SPEED) continue;
      // the piece as the bot sees it: where it is from the bot, and how the two close
      offset.subVectors(me.position, piece.object.position);
      closing.subVectors(me.velocity, moving);
      const rate = closing.lengthSq();
      if (rate < 1) continue;
      const when = -offset.dot(closing) / rate;
      if (when <= 0 || when >= soonest) continue;
      passing.copy(offset).addScaledVector(closing, when);
      if (passing.length() > piece.radius + this.ship.radius * AVOID_TUBE) continue;
      soonest = when;
      found = true;
      // square to how they close, on the side the bot passes (straight across when dead on)
      away.copy(passing).addScaledVector(closing, -passing.dot(closing) / rate);
      if (away.lengthSq() < 1) away.crossVectors(closing, Math.abs(closing.y) < 0.9 * Math.sqrt(rate) ? UP : SIDE);
      away.normalize();
    }
    return found;
  }

  /**
   * The nearest rock, well or hull the way along `direction` (unit length) meets within `length`:
   * the way as the hull sweeps it, a tube of AVOID_TUBE ship radii around the line of flight
   * (its center line and four lines along its wall), so a rock the line itself only grazes counts.
   * In one of the battleship's hangars the tube is wider than the tunnel: there a line along the
   * wall that starts inside the hull is left out, and the way on is what the tunnel leaves open.
   */
  private wayAhead(field: AsteroidField, direction: THREE.Vector3, length: number, overGround = false): { distance: number; center: THREE.Vector3 } | null {
    const position = this.ship.flight.position;
    const wall = this.ship.radius * AVOID_TUBE;
    // two directions across the flight
    across.crossVectors(direction, Math.abs(direction.y) < 0.9 ? UP : SIDE).normalize();
    across2.crossVectors(direction, across);
    let best: RayHit | null = null;
    const inside = !!field.obstacle?.within(position);
    // the pieces the tube may meet, gathered once along its center line: each of its five lines meets only those
    const pieces = field.piecesAlong(position, direction, length, wall, wayPieces);
    for (let i = 0; i < 5; i++) {
      wayOrigin.copy(position);
      if (i > 0) wayOrigin.addScaledVector(i < 3 ? across : across2, i % 2 ? wall : -wall);
      if (i > 0 && inside && field.obstacle!.touches(wayOrigin, 1)) continue;
      const hit = field.raycastAmong(pieces, wayOrigin, direction, best ? best.distance : length, true, wayHit);
      // a racer, and a bot over a world fought over, takes a world's ground for no danger (`overGround`) where it would meet it within the hover field's cushion: its glide carries the hull over it and along its walls; met steeply, it strikes as rock does
      if (!hit || (overGround && hit.asteroid?.ground && !this.groundStrikes(field, direction, hit.distance))) continue;
      // a sheet of junk (a wing's panels, a fairing, a stage's tank) is none either: the hull punches through it (see world/junk)
      const junk = hit.asteroid?.junk;
      if (junk && !onCore(junk.build, wayPoint.copy(wayOrigin).addScaledVector(direction, hit.distance).applyMatrix4(hit.asteroid!.inverse)) && !this.roundSheet(junk.build, hit.distance)) continue;
      if (!best || hit.distance < best.distance) best = Object.assign(wayBest, hit);
    }
    return best;
  }

  /** Whether the world's ground `distance` ahead along `direction` (from where the way's ray started, wayOrigin) would strike the hull at its speed: faster into it than the hover field's cushion and what rock forgives (see world/hover, groundBlow). */
  private groundStrikes(field: AsteroidField, direction: THREE.Vector3, distance: number): boolean {
    wayPoint.copy(wayOrigin).addScaledVector(direction, distance);
    if (field.groundBelow(wayPoint, groundNormal) === null) return false;
    const into = this.ship.flight.velocity.length() * Math.max(0, -direction.dot(groundNormal));
    return groundBlow(into, field.fall) >= SAFE_IMPACT;
  }

  /** Whether a sheet of junk built as `build` lying `distance` ahead (units) is worth flying round (see flyRound). */
  private roundSheet(build: JunkBuild, distance: number): boolean {
    return flyRound(build, this.ship.flight.velocity.length(), distance);
  }

  /** Off the way of any ship the bot would meet soon (see KEEP_CLEAR): the wanted velocity bends away from where they would come closest, and a racer holds back on a way into another's hull. Returns the ship it gives way to most, or null. */
  private keepClear(ships: readonly Ship[], field: AsteroidField, racing: boolean): Ship | null {
    let most: Ship | null = null;
    let least = Infinity;
    const me = this.ship.flight;
    const clear = this.ship.radius * KEEP_CLEAR;
    for (const ship of ships) {
      if (ship === this.ship || !ship.alive) continue;
      // out of a burning drive's plume it sits in (its flame is plain to see): sideways off its axis
      const backward = ship.flight.forward(plumeBack).negate();
      const grill = plumeStrength(ship.flight.position, backward, ship.flight.throttle, me.position, this.ship.radius);
      if (grill > PLUME_SHRUG) {
        local.subVectors(me.position, ship.flight.position);
        local.addScaledVector(backward, -local.dot(backward));
        if (local.lengthSq() < 1) local.set(0, 1, 0).addScaledVector(backward, -backward.y);
        desired.addScaledVector(local.normalize(), CRUISE_SPEED);
      }
      // a ship outside its view it does not see coming; a plume it sits in it feels by the heat (above)
      if (!this.inView(ship.flight.position)) continue;
      // where the other ship is, and how fast the two close, as the bot sees it
      local.subVectors(me.position, ship.flight.position);
      line.subVectors(me.velocity, ship.flight.velocity);
      const speed2 = line.lengthSq();
      // the moment they come closest: whenever it is, for a way into the other's hull, and within
      // the look ahead for the push (now, when they already part)
      const meet = speed2 > 1 ? -local.dot(line) / speed2 : 0;
      const hulls = this.ship.radius + ship.radius;
      const into = racing && meet > 0 && towardShip.copy(local).addScaledVector(line, meet).length() < hulls * KEEP_CLEAR_INTO;
      const when = THREE.MathUtils.clamp(meet, 0, KEEP_CLEAR_AHEAD);
      local.addScaledVector(line, when);
      const miss = local.length();
      // a ship behind rock the bot does not see coming
      if ((miss >= clear && !into) || !this.sees(field, ship)) continue;
      if (into) {
        towardShip.subVectors(ship.flight.position, me.position);
        const gap = towardShip.length() - hulls;
        towardShip.normalize();
        const closing = line.subVectors(desired, ship.flight.velocity).dot(towardShip);
        const allowed = Math.max(RAM_SAFE, gap / KEEP_CLEAR_BRAKE);
        if (closing > allowed) desired.addScaledVector(towardShip, allowed - closing);
      }
      if (miss >= clear) continue;
      if (miss < 1e-6) local.set(0, 1, 0);
      else local.divideScalar(miss);
      desired.addScaledVector(local, KEEP_CLEAR_PUSH * (1 - miss / clear));
      if (miss < least) {
        least = miss;
        most = ship;
      }
    }
    return most;
  }

  /**
   * Pushes the wanted velocity off a ring's housings that the way (along `heading` at `speed`)
   * would meet (see RING_HORIZON): into the opening for the ring a racer flies `through`, and for
   * any other where the way meets the inner quarter of the housings, else out past them.
   */
  private clearRing(ring: Ring, speed: number, through: boolean) {
    const me = this.ship.flight;
    const toward = heading.dot(ring.facing);
    if (Math.abs(toward) < 0.05) return;
    // when and where the way crosses the ring's plane
    const time = local.subVectors(ring.center, me.position).dot(ring.facing) / (toward * speed);
    if (time < 0 || time > RING_HORIZON) return;
    const cross = local.copy(me.position).addScaledVector(heading, speed * time).sub(ring.center);
    const out = cross.length();
    const { inner, outer } = ringRim(ring.radius);
    const margin = this.ship.radius * RING_MARGIN;
    if (out < inner - margin || out > outer + margin) return;
    const inward = through || out < inner + (outer - inner) / 4;
    desired.addScaledVector(cross.divideScalar(Math.max(out, 1)), (inward ? -1 : 1) * CRUISE_SPEED * (1 - time / RING_HORIZON));
  }

  /** A ship the bot may fight: alive, not its own, not of its side, and past its spawn protection (a freshly printed clone is left alone). */
  private rival(ship: Ship, now: number) {
    return ship !== this.ship && ship.alive && now >= ship.protectedUntil && !ship.allyOf(this.ship);
  }

  /** How hot the bot runs its laser at a target worth the heat (one shot heats it by 20): the more daring, the hotter. */
  private get hotHeat() {
    return 40 + 50 * this.skills.daring;
  }

  /**
   * A pilot's hand: what the bot wants reaches the stick, the drive and the thrusters eased in
   * over HAND_TIME (shorter for better pilots), as a hand on a mouse or a stick moves: it
   * gathers speed, sweeps and settles, and overshoots a little. Only the trigger is instant.
   */
  private byHand(wanted: Controls, dt: number): Controls {
    const hand = this.hand;
    const k = 1 - exp(-dt / (HAND_TIME_SLOW - (HAND_TIME_SLOW - HAND_TIME_FAST) * this.skills.reflexes));
    hand.yaw += (wanted.yaw - hand.yaw) * k;
    hand.pitch += (wanted.pitch - hand.pitch) * k;
    hand.roll += (wanted.roll - hand.roll) * k;
    hand.thrust += (wanted.thrust - hand.thrust) * k;
    hand.strafeX += (wanted.strafeX - hand.strafeX) * k;
    hand.strafeY += (wanted.strafeY - hand.strafeY) * k;
    hand.strafeZ += (wanted.strafeZ - hand.strafeZ) * k;
    hand.fire = wanted.fire;
    return hand;
  }

  /**
   * How far the aim may wander from the target (units): a fixed part (better pilots aim
   * closer to the center) plus an angular part that grows with the distance, so a far
   * target is hard to hit, as it would be for any eye.
   */
  private aimError(distance: number) {
    const miss = missOf(this.skills.aim);
    return (this.ship.radius * AIM_SPREAD * miss + distance * AIM_ANGLE * 2 * miss) * (1 + EASE_AIM * this.ease + STRAIN_AIM * strainPenalty(this.ship));
  }

  /**
   * How many others hunt a ship, as the bot sees them: ships in sight (within `sight` of the
   * bot, the storm's shorter reach included, and no rock between) within FIRE_RANGE of it with
   * their noses on it (see HUNT_ANGLE). Another bot's mind it cannot read.
   */
  private huntersOf(prey: Ship, ships: readonly Ship[], field: AsteroidField, sight: number) {
    let hunters = 0;
    const eye = this.ship.flight.position;
    for (const ship of ships) {
      if (ship === this.ship || ship === prey || !ship.alive || ship.allyOf(prey)) continue;
      // a nose it reads only in its view
      if (!this.inView(ship.flight.position)) continue;
      if (ship.flight.position.distanceTo(eye) >= sight) continue;
      const line = hunt.subVectors(prey.flight.position, ship.flight.position);
      if (line.length() > FIRE_RANGE || ship.flight.noseAngleTo(line) > HUNT_ANGLE || !this.sees(field, ship)) continue;
      hunters++;
    }
    return hunters;
  }

  /**
   * A target that keeps changing its sideways motion is hard to follow: the bot senses the
   * change of the target's velocity across the line of sight and scatters its aim by it.
   * Steady flight, however fast, is easy to lead; jinking left and right is what dodges.
   */
  private senseJink(target: Ship, dt: number, now: number) {
    const velocity = target.flight.velocity;
    if (target !== this.lastTarget || dt <= 0) {
      this.lastTarget = target;
      this.lastTargetVelocity.copy(velocity);
      this.jink = 0;
      this.jinkOffset.set(0, 0, 0);
      return;
    }
    jinkStep.subVectors(velocity, this.lastTargetVelocity);
    this.lastTargetVelocity.copy(velocity);
    line.subVectors(target.flight.position, this.ship.flight.position).normalize();
    jinkStep.addScaledVector(line, -jinkStep.dot(line));
    this.jink += (jinkStep.length() / dt - this.jink) * (1 - exp(-dt / JINK_MEMORY));
    if (now < this.nextJinkRoll) return;
    this.nextJinkRoll = now + 0.2 + Math.random() * 0.2;
    const scatter = Math.min(JINK_SCATTER_MAX, this.jink / (RCS_THRUST * JINK_SCATTER));
    this.jinkOffset.randomDirection().multiplyScalar(target.radius * scatter * Math.random());
  }
}
