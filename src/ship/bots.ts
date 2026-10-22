import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { IDLE, type Controls } from '../input/input';
import type { Ship } from './ship';
import { MAIN_THRUST, RCS_THRUST } from './flight';
import { BOOST_PUSH } from '../game/race';

/** Bots notice ships within this distance (units, 3.5 km: across the whole field), when no rock is in the way, so the fight finds a Host quickly. */
const SIGHT_RANGE = 70000;
/** Bots only fire within this distance (units, 1 km). */
const FIRE_RANGE = 20000;
/** In a solar storm a bot's sensors are blind: it only sees what its own eyes see (units, 750 m). */
const STORM_SIGHT = 15000;
/** At most this many bots hunt the same ship; the others look for another target. */
const MAX_HUNTERS = 2;
/** A bot keeps its target unless another is clearly better: the current one counts this much nearer. */
const STICKY = 0.7;
/** At full ease (see Bot.ease) bots aim this much worse and react this much later (s). */
const EASE_AIM = 1.5;
const EASE_REACTION = 0.4;
/** A ship within this distance (units, 1.5 km) on a bot's tail with its nose within THREAT_ANGLE (rad) of the bot makes it defend. */
const THREAT_RANGE = 30000;
const THREAT_ANGLE = 0.3;
/** A bot fires at armor only while its laser is cooler than this (one shot heats it by 20), and only in some of its thinking spells (SNIPE_CHANCE): sparingly. */
const ARMOR_FIRE_HEAT = 10;
const SNIPE_CHANCE = 0.3;
/** Racing bots fly to the next gate at this speed (units/s, 180 m/s), below the limit, so they still turn in time; a solo round may set another class (see Bot.raceSpeed). */
export const RACE_SPEED = 3600;
/** A racer only turns its nose to a ship this close to it (rad, about 30°): one ahead on the course. */
const RACE_AIM_CONE = 0.5;
/** A racer with a ship on its tail flips to shoot back for this long (s), at most once in LOOK_BACK_PAUSE (s). */
const LOOK_BACK_SECONDS = 2.5;
const LOOK_BACK_PAUSE = 8;
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
/** A velocity error larger than this makes the bot turn and burn instead of fighting. */
const BURN_THRESHOLD = 500;
/** Angular aim error at an aim of one half (rad, about 1.1°; see aimError): at 1 km, its firing range, it scatters by about 20 m, a little more than a ship's radius (17 m). */
const AIM_ANGLE = 0.02;
/** How long a bot's sense of the target's jinking lingers (s). */
const JINK_MEMORY = 0.6;
/** Jinking (change of velocity across the line of sight) of this share of the thruster strength scatters the aim by a full ship radius. */
const JINK_SCATTER = 0.5;
/** The scatter never exceeds this many ship radii, so a jinking target is hard to hit, not impossible. */
const JINK_SCATTER_MAX = 2.5;
/** A bot attacking a battleship's part holds this far from it (units, 600 m), and fires with its nose within SIEGE_AIM of it (rad). */
const SIEGE_DISTANCE = 12000;
const SIEGE_AIM = 0.02;
/** Bots stay this far inside the arena, unless the game draws them closer in (see Bot.home). */
export const HOME_RADIUS = 50000;
/**
 * Near a massive body a bot burns away from it: within WELL_MARGIN (units, 750 m) of its
 * surface, or where its pull reaches WELL_PULL of the main drive (a black hole's grip).
 */
const WELL_MARGIN = 15000;
const WELL_PULL = 0.3;

const toTarget = new THREE.Vector3();
const desired = new THREE.Vector3();
const error = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const local = new THREE.Vector3();
const heading = new THREE.Vector3();
const jinkStep = new THREE.Vector3();
const line = new THREE.Vector3();
const swing = new THREE.Vector3();

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
export const BOT_SKILLS: Record<string, Skills> = {
  Laika: { aim: 0.1, reflexes: 0.2, daring: 0 },
  Sputnik: { aim: 0.3, reflexes: 0.1, daring: 0.2 },
  Juno: { aim: 0.2, reflexes: 0.4, daring: 0.3 },
  Ceres: { aim: 0.5, reflexes: 0.3, daring: 0.4 },
  Kessler: { aim: 0.4, reflexes: 0.5, daring: 0.6 },
  Orion: { aim: 0.7, reflexes: 0.5, daring: 0.6 },
  Vega: { aim: 0.6, reflexes: 0.9, daring: 0.6 },
  Halley: { aim: 0.9, reflexes: 0.8, daring: 0.85 },
};

/** Skills that are all the same, for a bot of a name without its own (0.4) or one the flight school sets. */
export const evenSkills = (skill: number): Skills => ({ aim: skill, reflexes: skill, daring: skill });

export const skillsOf = (name: string) => BOT_SKILLS[name] ?? evenSkills(0.4);

/**
 * Newtonian pursuit AI. Bots only see ships they have a line of sight to. It works out the velocity it wants (close in on its target,
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
  raceSpeed = RACE_SPEED;
  /** Set by the game: the nearest probe, which an idle bot goes for. */
  lure: THREE.Vector3 | null = null;
  /** Set by the game: a ship the bot hunts wherever it is, seen or not. */
  prey: Ship | null = null;
  /** Set by the game: a part of a battleship, which a bot with no ship to fight attacks. */
  siege: THREE.Vector3 | null = null;
  /** Set by the game: a ship with a nova core close by, which the bot gets away from first. */
  flee: THREE.Vector3 | null = null;
  /** Set by the game: the bot turns back towards the center beyond this distance (units), inside a solar flare's shell. */
  home = HOME_RADIUS;
  /** Set by the game: the bot's hook holds until then, and is ready again from then on (s). */
  hookUntil = 0;
  hookReadyAt = 0;
  /** A racer looks back at a ship on its tail until then, and may again from then on (s). */
  private lookBackUntil = 0;
  private nextLookBack = 0;
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

  constructor(
    readonly ship: Ship,
    readonly skills: Skills,
  ) {}

  think(now: number, ships: Ship[], field: AsteroidField, bots: readonly Bot[]): Controls {
    const me = this.ship.flight;
    // one controls object per bot, cleared each thought, so thinking allocates nothing
    const controls = Object.assign(this.controls, IDLE);
    // the first thought after a (re)spawn must not count the time the bot was gone as reaction
    // time, and a new clone's hand starts at rest; any shorter step counts in full (a time-lapse
    // takes long ones)
    let dt = now - this.lastThink;
    this.lastThink = now;
    if (dt > RESPAWN_GAP) {
      dt = 0;
      Object.assign(this.hand, IDLE);
    }

    if (now >= this.nextRethink) {
      this.nextRethink = now + 0.4 + Math.random() * 0.6;
      // the aim wanders around the target: a direction and a share of the full error (see aimError)
      this.aimOffset.randomDirection().multiplyScalar(Math.random());
      this.snipe = Math.random() < SNIPE_CHANCE;
      if (Math.random() < 0.2) this.wanderTarget.randomDirection().multiplyScalar(Math.random() * 30000);
    }

    // the nearest ship in sight, but one that other bots already hunt counts as farther, and a
    // ship hunted by MAX_HUNTERS is left to them: the bots fight each other too, not only the Host
    let target: Ship | null = null;
    const sight = this.blind ? STORM_SIGHT : SIGHT_RANGE;
    let targetDistance = sight;
    let best = Infinity;
    for (const ship of ships) {
      // a freshly printed clone is left alone until its spawn protection runs out, and the own side always
      if (ship === this.ship || !ship.alive || now < ship.protectedUntil || ship.allyOf(this.ship)) continue;
      const distance = ship.flight.position.distanceTo(me.position);
      if (distance >= sight) continue;
      let hunters = 0;
      for (const bot of bots) if (bot !== this && bot.ship.alive && bot.target === ship) hunters++;
      if (hunters >= MAX_HUNTERS) continue;
      const cost = distance * (1 + hunters) * (ship === this.target ? STICKY : 1);
      if (cost < best && field.lineOfSight(me.position, ship.flight.position)) {
        best = cost;
        target = ship;
        targetDistance = distance;
      }
    }
    // a ship the game names as prey (the thief of the own side's core) is hunted wherever it is
    if (this.prey?.alive) {
      target = this.prey;
      targetDistance = this.prey.flight.position.distanceTo(me.position);
    }
    // a ship on the own tail with its nose on the bot comes first: the bot turns its armor to
    // it and jinks, because from behind the drive is open
    let defending = false;
    let chaser: Ship | null = null;
    for (const ship of ships) {
      // as with targets: a fresh clone cannot hurt, nor can the own side, and a storm blinds the sensors beyond sight
      if (ship === this.ship || !ship.alive || now < ship.protectedUntil || ship.allyOf(this.ship)) continue;
      const line = toTarget.subVectors(me.position, ship.flight.position);
      const distance = line.length();
      if (distance < Math.min(THREAT_RANGE, sight) && this.ship.tailToward(line) && ship.flight.angleTo(line) < THREAT_ANGLE && field.lineOfSight(me.position, ship.flight.position)) {
        chaser = ship;
        // a racer does not turn around for it: it races on
        if (this.armed && !this.waypoint) {
          target = ship;
          targetDistance = distance;
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
    }
    this.target = target;

    if (chaser && !this.armed) {
      toTarget.subVectors(me.position, chaser.flight.position);
      desired.copy(toTarget).normalize().multiplyScalar(CRUISE_SPEED * 0.6);
    } else if (racing) {
      // through the next gate, at speed; what a gate's coil gave it, it keeps
      toTarget.subVectors(this.waypoint!, me.position);
      desired.copy(toTarget).normalize().multiplyScalar(Math.max(this.raceSpeed, Math.min(me.velocity.length(), this.raceSpeed + BOOST_PUSH)));
      if (target) this.senseJink(target, dt, now);
    } else if (target) {
      toTarget.subVectors(target.flight.position, me.position);
      this.senseJink(target, dt, now);
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
      // no ship to fight, but a battleship's part: close in to SIEGE_DISTANCE and hold there
      toTarget.subVectors(this.siege, me.position);
      const approach = THREE.MathUtils.clamp((toTarget.length() - SIEGE_DISTANCE) * 0.3, -CRUISE_SPEED * 0.5, CRUISE_SPEED);
      desired.copy(toTarget).normalize().multiplyScalar(approach);
    } else {
      // nothing to fight: a probe in sight is worth the trip, else the bot roams
      toTarget.subVectors(this.lure ?? this.wanderTarget, me.position);
      desired.copy(toTarget).normalize().multiplyScalar(Math.min(CRUISE_SPEED * 0.6, toTarget.length() * 0.2));
    }
    // a nova core close by: away from it, at full speed, with the main drive (see burning)
    if (this.flee) desired.copy(local.subVectors(me.position, this.flee).normalize()).multiplyScalar(CRUISE_SPEED * 2);
    if (me.position.length() > this.home) desired.addScaledVector(me.position, -CRUISE_SPEED / me.position.length());
    // a massive body pulls: near it, away from it comes first
    const well = field.well;
    let falling = false;
    if (well) {
      const away = local.subVectors(me.position, well.position);
      const distance = away.length();
      const escape = Math.max(well.radius + WELL_MARGIN, Math.sqrt((well.surfaceGravity * well.radius * well.radius) / (WELL_PULL * MAIN_THRUST)));
      if (distance < escape) {
        falling = true;
        desired.addScaledVector(away.divideScalar(Math.max(distance, 1)), CRUISE_SPEED * 2);
      }
    }

    // rocks in the flight path: aim the velocity past them
    const speed = me.velocity.length();
    let danger = falling;
    if (speed > 50) {
      heading.copy(me.velocity).divideScalar(speed);
      const hit = field.raycast(me.position, heading, speed * AVOID_HORIZON + this.ship.radius * 4);
      if (hit) {
        danger ||= hit.distance < speed * AVOID_HORIZON * 0.6;
        const away = local.subVectors(me.position, hit.asteroid?.object.position ?? well!.position);
        away.addScaledVector(heading, -away.dot(heading));
        if (away.lengthSq() < 1) away.set(0, 1, 0);
        desired.addScaledVector(away.normalize(), CRUISE_SPEED).addScaledVector(heading, -speed * 0.5);
      }
    }

    error.subVectors(desired, me.velocity);
    // near the target the nose stays on it and the thrusters carry the bot around it; a bot
    // under attack never turns its tail to burn
    // a racer burns for the gate; a fighter only when no target is in range
    const sieging = !target && !!this.siege && toTarget.length() < FIRE_RANGE;
    const burning = danger || !!this.flee || (!defending && !lookingBack && error.length() > BURN_THRESHOLD && (racing || !(((target && targetDistance < FIRE_RANGE) || sieging) && !this.ship.overheated)));
    if (burning) {
      me.steer(error, 2.5, controls);
      controls.thrust = me.angleTo(error) < 0.25 ? 1 : 0;
    } else if (target && (!racing || lookingBack || me.angleTo(line.subVectors(target.flight.position, me.position)) < RACE_AIM_CONE)) {
      aimPoint.copy(target.flight.position).addScaledVector(this.aimOffset, this.aimError(targetDistance)).add(this.jinkOffset);
      me.steer(aimPoint.sub(me.position), 3, controls);
      const angularSize = (target.radius * 0.8) / Math.max(targetDistance, 1);
      const onTarget = me.angleTo(aimPoint) < angularSize + this.ship.radius / Math.max(targetDistance, 1);
      this.onTargetFor = onTarget ? this.onTargetFor + dt : 0;
      const reaction = 0.45 - 0.3 * this.skills.reflexes + EASE_REACTION * this.ease;
      // a shot into the drive is worth the heat; at the armor a bot only snipes now and then,
      // single shots from a nearly cool laser, so it keeps the heat for the drive
      const open = target.tailToward(line.subVectors(target.flight.position, me.position));
      // a racer flies first: single shots only, even at an open drive, unless it looks back
      const heatLimit = open && (!racing || lookingBack) ? 40 + 50 * this.skills.daring : ARMOR_FIRE_HEAT;
      controls.fire = (open || this.snipe) && this.onTargetFor > reaction && targetDistance < FIRE_RANGE && !this.ship.overheated && this.ship.heat < heatLimit;
    } else if (sieging) {
      // a part of a battleship holds still: the nose on it, and fire while the laser allows
      me.steer(toTarget, 3, controls);
      controls.fire = me.angleTo(toTarget) < SIEGE_AIM && !this.ship.overheated && this.ship.heat < 40 + 50 * this.skills.daring;
    } else {
      me.steer(toTarget, 2.5, controls);
    }

    // trim the remaining velocity error with the maneuvering thrusters
    me.toLocalDirection(error, local).divideScalar(RCS_THRUST * 0.3);
    controls.strafeX = THREE.MathUtils.clamp(local.x, -1, 1);
    controls.strafeY = THREE.MathUtils.clamp(local.y, -1, 1);
    controls.strafeZ = THREE.MathUtils.clamp(-local.z, -1, 1);
    // under attack the bot jinks left and right, so the attacker's aim cannot settle
    if (defending) {
      if (now >= this.nextDodge) {
        this.dodge = -this.dodge;
        this.nextDodge = now + 0.4 + Math.random() * 0.4;
      }
      controls.strafeX = this.dodge;
    }
    return this.byHand(controls, dt);
  }

  /**
   * A pilot's hand: what the bot wants reaches the stick, the drive and the thrusters eased in
   * over HAND_TIME (shorter for better pilots), as a hand on a mouse or a stick moves: it
   * gathers speed, sweeps and settles, and overshoots a little. Only the trigger is instant.
   */
  private byHand(wanted: Controls, dt: number): Controls {
    const hand = this.hand;
    const k = 1 - Math.exp(-dt / (HAND_TIME_SLOW - (HAND_TIME_SLOW - HAND_TIME_FAST) * this.skills.reflexes));
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
    const aim = this.skills.aim;
    return (this.ship.radius * (1.6 - 1.4 * aim) + distance * AIM_ANGLE * (1.5 - aim)) * (1 + EASE_AIM * this.ease);
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
    this.jink += (jinkStep.length() / dt - this.jink) * (1 - Math.exp(-dt / JINK_MEMORY));
    if (now < this.nextJinkRoll) return;
    this.nextJinkRoll = now + 0.2 + Math.random() * 0.2;
    const scatter = Math.min(JINK_SCATTER_MAX, this.jink / (RCS_THRUST * JINK_SCATTER));
    this.jinkOffset.randomDirection().multiplyScalar(target.radius * scatter * Math.random());
  }
}
