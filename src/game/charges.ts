import * as THREE from 'three';
import type { Asteroid, AsteroidField } from '../world/asteroids';

/**
 * The Rockborn's mining charges: a few hundred kilograms of blasting gel in a borehole, the way
 * their crews break rock. A clone that carries them (only in the campaign's mining jobs, never
 * in the Games: the Games' rock is the sponsors') holds the charge's button close to a rock
 * (within CHARGE_REACH of its surface, for CHARGE_HOLD) and a charge is set where the hull is
 * nearest the rock; CHARGE_FUSE later it goes off. A rock up to CHARGE_CRACKS (see
 * world/asteroids) breaks into its pieces at once, a bigger one takes more charges by its volume
 * (AsteroidField.charge). The blast hurts a hull too close: up to CHARGE_HURT hull points at the
 * charge, nothing beyond CHARGE_BLAST, and shoves it away by up to CHARGE_SHOVE. Only the
 * browser that flies the clone runs them: the campaign is flown alone.
 */

/** How close to a rock's surface (units, 60 m) a charge can be set. */
export const CHARGE_REACH = 1200;
/** How long the button is held to set one (s): a borehole is drilled, the gel pressed in. */
export const CHARGE_HOLD = 0.6;
/** How long after it is set it goes off (s): time to fly clear. */
export const CHARGE_FUSE = 6;
/** How far its blast reaches (units, 150 m) and what it does at the charge: hull points and a shove (units/s, 15 m/s), both falling off with the distance. */
export const CHARGE_BLAST = 3000;
export const CHARGE_HURT = 60;
export const CHARGE_SHOVE = 300;

/** A charge set on a rock: which, where on it (in the rock's own frame, so it rides with it) and when it goes off. */
export interface Charge {
  rock: string;
  local: THREE.Vector3;
  at: number;
}

/** A charge that went off: where, and the rock it broke (null when the rock stood or was gone). */
export interface Blast {
  position: THREE.Vector3;
  broken: Asteroid | null;
}

/** What a blast `distance` (units) from a hull does to it: hull points and a shove (units/s). */
export function blastOn(distance: number): { hurt: number; shove: number } {
  if (distance >= CHARGE_BLAST) return { hurt: 0, shove: 0 };
  const near = 1 - distance / CHARGE_BLAST;
  return { hurt: CHARGE_HURT * near * near, shove: CHARGE_SHOVE * near };
}

const toRock = new THREE.Vector3();
const scratch = new THREE.Vector3();

export class Charges {
  /** Charges the clone still carries. */
  carried = 0;
  /** Charges set and not gone off yet. */
  readonly set: Charge[] = [];
  /** How long the button has been held close to a rock (s). */
  private held = 0;

  /** The clone is handed `count` charges, and nothing set is left over. */
  arm(count: number) {
    this.carried = count;
    this.set.length = 0;
    this.held = 0;
  }

  /** The rock a hull at `position` (its hit radius `radius`) could set a charge on now, if any. */
  rockFor(field: AsteroidField, position: THREE.Vector3, radius: number): Asteroid | null {
    // the nearest surface of a rock that breaks, along the line to its middle (a world's ground
    // or a rack beside it never hides it)
    let best: Asteroid | null = null;
    let nearest = radius + CHARGE_REACH;
    for (const rock of field.asteroids.values()) {
      if (rock.solid || rock.ground) continue;
      const distance = rock.object.position.distanceTo(position);
      if (distance - rock.radius > nearest) continue;
      if (distance < 1) return rock;
      toRock.subVectors(rock.object.position, position).divideScalar(distance);
      const into = field.rayInto(rock, position, toRock);
      const gap = into === null ? distance - rock.meanRadius : into;
      if (gap < nearest) {
        nearest = gap;
        best = rock;
      }
    }
    return best;
  }

  /**
   * One step: with the button `holding` close to a rock long enough, a charge is set (returned
   * as `placed`); every charge whose fuse ran out goes off on its rock (`blasts`).
   */
  update(now: number, dt: number, holding: boolean, position: THREE.Vector3, radius: number, field: AsteroidField): { placed: Charge | null; blasts: Blast[] } {
    let placed: Charge | null = null;
    const rock = holding && this.carried > 0 ? this.rockFor(field, position, radius) : null;
    if (rock) {
      this.held += dt;
      if (this.held >= CHARGE_HOLD) {
        // set on its surface where the hull is nearest it, in its own frame
        toRock.subVectors(position, rock.object.position).setLength(Math.min(rock.meanRadius, position.distanceTo(rock.object.position)));
        rock.object.updateMatrixWorld();
        const local = rock.object.worldToLocal(scratch.copy(rock.object.position).add(toRock)).clone();
        placed = { rock: rock.id, local, at: now + CHARGE_FUSE };
        this.set.push(placed);
        this.carried--;
        this.held = 0;
      }
    } else this.held = 0;
    const blasts: Blast[] = [];
    for (let i = this.set.length - 1; i >= 0; i--) {
      const charge = this.set[i];
      if (now < charge.at) continue;
      this.set.splice(i, 1);
      const where = this.positionOf(charge, field, new THREE.Vector3());
      if (!where) continue;
      blasts.push({ position: where, broken: field.charge(charge.rock, field.clock) ?? null });
    }
    return { placed, blasts };
  }

  /** Where a charge set is now (its rock may have moved or broken: then null). */
  positionOf(charge: Charge, field: AsteroidField, into: THREE.Vector3): THREE.Vector3 | null {
    const rock = field.asteroids.get(charge.rock);
    if (!rock) return null;
    rock.object.updateMatrixWorld();
    return rock.object.localToWorld(into.copy(charge.local));
  }
}
