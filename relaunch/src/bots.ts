import * as THREE from 'three';
import type { AsteroidField } from './asteroids';
import type { Controls } from './input';
import type { Ship } from './ship';

const SIGHT_RANGE = 16000;
const FIRE_RANGE = 14000;
const AVOID_LOOKAHEAD = 2.0;
const STEER_GAIN = 2.5;

const inverse = new THREE.Quaternion();
const local = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const ahead = new THREE.Vector3();

export const BOT_NAMES = ['Ingmar', 'Nova', 'Kessler', 'Vega', 'Orion', 'Sputnik', 'Halley', 'Laika'];

/**
 * Simple pursuit AI: hunts the nearest ship in sight, otherwise the nearest asteroid,
 * dodges asteroids in its flight path and fires when the target is close to its nose.
 */
export class Bot {
  private aimError = new THREE.Vector2();
  private nextRethink = 0;
  /** Seconds the target has been in the sights; bots need a moment before they pull the trigger. */
  private onTargetFor = 0;
  private lastThink = 0;
  private wanderTarget = new THREE.Vector3();

  constructor(readonly ship: Ship, private readonly skill: number) {}

  think(now: number, ships: Ship[], field: AsteroidField): Controls {
    const me = this.ship.flight;
    const controls: Controls = { yaw: 0, pitch: 0, boost: false, brake: false, fire: false };

    if (now >= this.nextRethink) {
      this.nextRethink = now + 0.4 + Math.random() * 0.6;
      const spread = 0.14 * (1 - this.skill);
      this.aimError.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
      if (Math.random() < 0.3) this.wanderTarget.randomDirection().multiplyScalar(Math.random() * 15000);
    }

    let target: THREE.Vector3 | null = null;
    let targetRadius = 0;
    let targetDistance = Infinity;
    for (const ship of ships) {
      if (ship === this.ship || !ship.alive) continue;
      const distance = ship.flight.position.distanceTo(me.position);
      if (distance < SIGHT_RANGE && distance < targetDistance) {
        target = ship.flight.position;
        targetRadius = ship.radius;
        targetDistance = distance;
      }
    }
    if (!target) {
      for (const asteroid of field.asteroids.values()) {
        const distance = asteroid.object.position.distanceTo(me.position);
        if (distance < targetDistance) {
          target = asteroid.object.position;
          targetRadius = asteroid.radius;
          targetDistance = distance;
        }
      }
    }
    const goal = target ?? this.wanderTarget;

    inverse.copy(me.orientation).invert();
    local.copy(toTarget.subVectors(goal, me.position).normalize()).applyQuaternion(inverse);
    // local: -Z is ahead, +X right, +Y up
    controls.yaw = THREE.MathUtils.clamp((local.x + this.aimError.x) * STEER_GAIN, -1, 1);
    controls.pitch = THREE.MathUtils.clamp((local.y + this.aimError.y) * STEER_GAIN, -1, 1);
    if (local.z > 0) controls.yaw = local.x >= 0 ? 1 : -1; // target behind: turn hard

    const onTarget = local.z < 0 && Math.hypot(local.x, local.y) < (targetRadius * 1.2) / Math.max(targetDistance, 1);
    this.onTargetFor = onTarget ? this.onTargetFor + (now - this.lastThink) : 0;
    this.lastThink = now;
    const reaction = 0.45 - 0.3 * this.skill;
    controls.fire = !!target && this.onTargetFor > reaction && targetDistance < FIRE_RANGE && this.ship.laser > 60 * (1 - this.skill);
    controls.boost = targetDistance > 8000;
    controls.brake = targetDistance < 1500 && !!target;

    const obstacle = field.overlap(ahead.copy(me.position).addScaledVector(me.velocity, AVOID_LOOKAHEAD * 0.5), this.ship.radius * 3);
    if (obstacle && obstacle.object.position !== target) {
      local.subVectors(obstacle.object.position, me.position).applyQuaternion(inverse);
      controls.yaw = local.x > 0 ? -1 : 1;
      controls.pitch = local.y > 0 ? -1 : 1;
      controls.fire = false;
    }
    return controls;
  }
}
