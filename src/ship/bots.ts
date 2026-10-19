import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { IDLE, type Controls } from '../input/input';
import type { Ship } from './ship';
import { RCS_THRUST } from './flight';

const SIGHT_RANGE = 50000;
const FIRE_RANGE = 30000;
/** Bots close in with up to this speed and hold position near their target. */
const CRUISE_SPEED = 2500;
const HOLD_DISTANCE = 4000;
/** Seconds ahead a bot checks its flight path for asteroids. */
const AVOID_HORIZON = 5;
/** A velocity error larger than this makes the bot turn and burn instead of fighting. */
const BURN_THRESHOLD = 500;
/** Angular aim error of an average bot (rad, about 1.1°): at 1 km it scatters by about one ship radius (20 m), at its firing range of 1.5 km by one and a half. */
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

export const BOT_NAMES = ['Ingmar', 'Nova', 'Kessler', 'Vega', 'Orion', 'Sputnik', 'Halley', 'Laika'];

/**
 * Newtonian pursuit AI. Bots only see ships they have a line of sight to. It works out the velocity it wants (close in on the nearest ship,
 * hold distance, avoid rocks, stay in the arena) and corrects large differences by turning
 * the main drive into the error and burning. Small differences are trimmed with the
 * maneuvering thrusters while the nose stays on the target.
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

  constructor(readonly ship: Ship, private readonly skill: number) {}

  think(now: number, ships: Ship[], field: AsteroidField): Controls {
    const me = this.ship.flight;
    // one controls object per bot, cleared each thought, so thinking allocates nothing
    const controls = Object.assign(this.controls, IDLE);
    // the first thought after a (re)spawn must not count the time the bot was gone as reaction time
    const dt = Math.min(now - this.lastThink, 0.1);
    this.lastThink = now;

    if (now >= this.nextRethink) {
      this.nextRethink = now + 0.4 + Math.random() * 0.6;
      // the aim wanders around the target; better pilots aim closer to the center
      // a direction and a share of the full error; how far that is depends on the distance (see aimError)
      this.aimOffset.randomDirection().multiplyScalar(Math.random());
      if (Math.random() < 0.2) this.wanderTarget.randomDirection().multiplyScalar(Math.random() * 30000);
    }

    let target: Ship | null = null;
    let targetDistance = SIGHT_RANGE;
    for (const ship of ships) {
      // a freshly printed clone is left alone until its spawn protection runs out
      if (ship === this.ship || !ship.alive || now < ship.protectedUntil) continue;
      const distance = ship.flight.position.distanceTo(me.position);
      if (distance < targetDistance && field.lineOfSight(me.position, ship.flight.position)) {
        target = ship;
        targetDistance = distance;
      }
    }

    if (target) {
      toTarget.subVectors(target.flight.position, me.position);
      this.senseJink(target, dt, now);
      const approach = THREE.MathUtils.clamp((targetDistance - HOLD_DISTANCE) * 0.3, -CRUISE_SPEED * 0.3, CRUISE_SPEED);
      desired.copy(toTarget).normalize().multiplyScalar(approach).add(target.flight.velocity);
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
    const burning = danger || error.length() > BURN_THRESHOLD && !(target && targetDistance < FIRE_RANGE && !this.ship.overheated);
    if (burning) {
      me.steer(error, 2.5, controls);
      controls.thrust = me.angleTo(error) < 0.25 ? 1 : 0;
    } else if (target) {
      aimPoint.copy(target.flight.position).addScaledVector(this.aimOffset, this.aimError(targetDistance)).add(this.jinkOffset);
      me.steer(aimPoint.sub(me.position), 3, controls);
      const angularSize = (target.radius * 0.8) / Math.max(targetDistance, 1);
      const onTarget = me.angleTo(aimPoint) < angularSize + this.ship.radius / Math.max(targetDistance, 1);
      this.onTargetFor = onTarget ? this.onTargetFor + dt : 0;
      const reaction = 0.45 - 0.3 * this.skill;
      controls.fire = this.onTargetFor > reaction && targetDistance < FIRE_RANGE && !this.ship.overheated && this.ship.heat < 40 + 50 * this.skill;
    } else {
      me.steer(toTarget, 2.5, controls);
    }

    // trim the remaining velocity error with the maneuvering thrusters
    inverse.copy(me.orientation).invert();
    local.copy(error).applyQuaternion(inverse).divideScalar(RCS_THRUST * 0.3);
    controls.strafeX = THREE.MathUtils.clamp(local.x, -1, 1);
    controls.strafeY = THREE.MathUtils.clamp(local.y, -1, 1);
    controls.strafeZ = THREE.MathUtils.clamp(-local.z, -1, 1);
    return controls;
  }

  /**
   * How far the aim may wander from the target (units): a fixed part (better pilots aim
   * closer to the center) plus an angular part that grows with the distance, so a far
   * target is hard to hit, as it would be for any eye.
   */
  private aimError(distance: number) {
    return this.ship.radius * (1.6 - 1.4 * this.skill) + distance * AIM_ANGLE * (1.5 - this.skill);
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
