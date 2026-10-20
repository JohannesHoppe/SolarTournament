import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { IDLE, type Controls } from '../input/input';
import type { Ship } from './ship';
import { RCS_THRUST } from './flight';

/** Bots notice ships within this distance (units, 2.5 km), when no rock is in the way. */
const SIGHT_RANGE = 50000;
/** Bots only fire within this distance (units, 1 km). */
const FIRE_RANGE = 20000;
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
/** Bots close in with up to this speed and hold position near their target. */
const CRUISE_SPEED = 5000;
const HOLD_DISTANCE = 4000;
/** Seconds ahead a bot checks its flight path for asteroids. */
const AVOID_HORIZON = 5;
/** A velocity error larger than this makes the bot turn and burn instead of fighting. */
const BURN_THRESHOLD = 500;
/** Angular aim error of an average bot (rad, about 1.1°): at 1 km, its firing range, it scatters by about one ship radius (20 m). */
const AIM_ANGLE = 0.02;
/** How long a bot's sense of the target's jinking lingers (s). */
const JINK_MEMORY = 0.6;
/** Jinking (change of velocity across the line of sight) of this share of the thruster strength scatters the aim by a full ship radius. */
const JINK_SCATTER = 0.5;
/** The scatter never exceeds this many ship radii, so a jinking target is hard to hit, not impossible. */
const JINK_SCATTER_MAX = 2.5;
/** Bots stay this far inside the arena. */
const HOME_RADIUS = 50000;

const toTarget = new THREE.Vector3();
const desired = new THREE.Vector3();
const error = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const local = new THREE.Vector3();
const heading = new THREE.Vector3();
const jinkStep = new THREE.Vector3();
const line = new THREE.Vector3();

export { BOT_NAMES } from '../music/lines';

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
  private readonly controls: Controls = { ...IDLE };

  /** The ship this bot hunts; other bots read it, so no more than MAX_HUNTERS chase the same one. */
  target: Ship | null = null;
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

  constructor(readonly ship: Ship, private readonly skill: number) {}

  think(now: number, ships: Ship[], field: AsteroidField, bots: readonly Bot[]): Controls {
    const me = this.ship.flight;
    // one controls object per bot, cleared each thought, so thinking allocates nothing
    const controls = Object.assign(this.controls, IDLE);
    // the first thought after a (re)spawn must not count the time the bot was gone as reaction time
    const dt = Math.min(now - this.lastThink, 0.1);
    this.lastThink = now;

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
    let targetDistance = SIGHT_RANGE;
    let best = Infinity;
    for (const ship of ships) {
      // a freshly printed clone is left alone until its spawn protection runs out
      if (ship === this.ship || !ship.alive || now < ship.protectedUntil) continue;
      const distance = ship.flight.position.distanceTo(me.position);
      if (distance >= SIGHT_RANGE) continue;
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
    // a ship on the own tail with its nose on the bot comes first: the bot turns its armor to
    // it and jinks, because from behind the drive is open
    let defending = false;
    let chaser: Ship | null = null;
    for (const ship of ships) {
      if (ship === this.ship || !ship.alive) continue;
      const line = toTarget.subVectors(me.position, ship.flight.position);
      const distance = line.length();
      if (distance < THREAT_RANGE && this.ship.tailToward(line) && ship.flight.angleTo(line) < THREAT_ANGLE && field.lineOfSight(me.position, ship.flight.position)) {
        chaser = ship;
        if (this.armed) {
          target = ship;
          targetDistance = distance;
          defending = true;
        }
        break;
      }
    }
    // an unarmed bot does not fight back: it runs, and its drive stays open to the chaser
    if (chaser && !this.armed) target = null;
    this.target = target;

    if (chaser && !this.armed) {
      toTarget.subVectors(me.position, chaser.flight.position);
      desired.copy(toTarget).normalize().multiplyScalar(CRUISE_SPEED * 0.6);
    } else if (target) {
      toTarget.subVectors(target.flight.position, me.position);
      this.senseJink(target, dt, now);
      if (defending) {
        // hold the distance and face the attacker; the jink below makes it miss
        const approach = THREE.MathUtils.clamp((targetDistance - HOLD_DISTANCE) * 0.3, -CRUISE_SPEED * 0.3, CRUISE_SPEED);
        desired.copy(toTarget).normalize().multiplyScalar(approach).add(target.flight.velocity);
      } else {
        // the place to be is behind the target, where its drive is open
        const goal = local.copy(target.flight.position).addScaledVector(target.flight.forward(heading), -HOLD_DISTANCE).sub(me.position);
        const approach = Math.min(goal.length() * 0.3, CRUISE_SPEED);
        desired.copy(goal).normalize().multiplyScalar(approach).add(target.flight.velocity);
      }
    } else {
      toTarget.subVectors(this.wanderTarget, me.position);
      desired.copy(toTarget).normalize().multiplyScalar(Math.min(CRUISE_SPEED * 0.6, toTarget.length() * 0.2));
    }
    if (me.position.length() > HOME_RADIUS) desired.addScaledVector(me.position, -CRUISE_SPEED / me.position.length());

    // rocks in the flight path: aim the velocity past them
    const speed = me.velocity.length();
    let danger = false;
    if (speed > 50) {
      heading.copy(me.velocity).divideScalar(speed);
      const hit = field.raycast(me.position, heading, speed * AVOID_HORIZON + this.ship.radius * 4);
      if (hit) {
        danger = hit.distance < speed * AVOID_HORIZON * 0.6;
        const away = local.subVectors(me.position, hit.asteroid.object.position);
        away.addScaledVector(heading, -away.dot(heading));
        if (away.lengthSq() < 1) away.set(0, 1, 0);
        desired.addScaledVector(away.normalize(), CRUISE_SPEED).addScaledVector(heading, -speed * 0.5);
      }
    }

    error.subVectors(desired, me.velocity);
    // near the target the nose stays on it and the thrusters carry the bot around it; a bot
    // under attack never turns its tail to burn
    const burning = danger || (!defending && error.length() > BURN_THRESHOLD && !(target && targetDistance < FIRE_RANGE && !this.ship.overheated));
    if (burning) {
      me.steer(error, 2.5, controls);
      controls.thrust = me.angleTo(error) < 0.25 ? 1 : 0;
    } else if (target) {
      aimPoint.copy(target.flight.position).addScaledVector(this.aimOffset, this.aimError(targetDistance)).add(this.jinkOffset);
      me.steer(aimPoint.sub(me.position), 3, controls);
      const angularSize = (target.radius * 0.8) / Math.max(targetDistance, 1);
      const onTarget = me.angleTo(aimPoint) < angularSize + this.ship.radius / Math.max(targetDistance, 1);
      this.onTargetFor = onTarget ? this.onTargetFor + dt : 0;
      const reaction = 0.45 - 0.3 * this.skill + EASE_REACTION * this.ease;
      // a shot into the drive is worth the heat; at the armor a bot only snipes now and then,
      // single shots from a nearly cool laser, so it keeps the heat for the drive
      const open = target.tailToward(toTarget);
      const heatLimit = open ? 40 + 50 * this.skill : ARMOR_FIRE_HEAT;
      controls.fire = (open || this.snipe) && this.onTargetFor > reaction && targetDistance < FIRE_RANGE && !this.ship.overheated && this.ship.heat < heatLimit;
    } else {
      me.steer(toTarget, 2.5, controls);
    }

    // trim the remaining velocity error with the maneuvering thrusters
    inverse.copy(me.orientation).invert();
    local.copy(error).applyQuaternion(inverse).divideScalar(RCS_THRUST * 0.3);
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
    return controls;
  }

  /**
   * How far the aim may wander from the target (units): a fixed part (better pilots aim
   * closer to the center) plus an angular part that grows with the distance, so a far
   * target is hard to hit, as it would be for any eye.
   */
  private aimError(distance: number) {
    return (this.ship.radius * (1.6 - 1.4 * this.skill) + distance * AIM_ANGLE * (1.5 - this.skill)) * (1 + EASE_AIM * this.ease);
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
    line.copy(toTarget).normalize();
    jinkStep.addScaledVector(line, -jinkStep.dot(line));
    this.jink += (jinkStep.length() / dt - this.jink) * (1 - Math.exp(-dt / JINK_MEMORY));
    if (now < this.nextJinkRoll) return;
    this.nextJinkRoll = now + 0.2 + Math.random() * 0.2;
    const scatter = Math.min(JINK_SCATTER_MAX, this.jink / (RCS_THRUST * JINK_SCATTER));
    this.jinkOffset.randomDirection().multiplyScalar(target.radius * scatter * Math.random());
  }
}
