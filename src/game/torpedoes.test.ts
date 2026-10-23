import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { creditOf, FLING_CREDIT, fused, Torpedoes, type Homing, type Torpedo } from './torpedoes';
import { pullOn } from './hook';
import { MAIN_THRUST, MAX_SPEED } from '../ship/flight';
import { MASS, type Body } from '../world/bodies';
import type { AsteroidField } from '../world/asteroids';
import type { Effects } from '../view/effects';
import type { Ship } from '../ship/ship';

const DT = 1 / 120;
/** Open space: nothing in the way, nothing to strike. */
const SPACE = { lineOfSight: () => true, obstacle: null, overlap: () => null, insideWell: () => false } as unknown as AsteroidField;
const EFFECTS = { puff: () => {} } as unknown as Effects;

/** A ship as the torpedoes see it, `id` at `x`, of no side but its own. */
function ship(id: string, x: number): Ship & { body: Body } {
  const position = new THREE.Vector3(x, 0, 0);
  const velocity = new THREE.Vector3();
  const flight = { position, velocity };
  return { id, name: id, alive: true, radius: 340, flight, body: { position, velocity, mass: MASS.ship }, allyOf: () => false } as unknown as Ship & { body: Body };
}

/** A torpedo of `shooter` at the origin, at rest, homing on a mark far out along x; `age` seconds old. */
function torpedo(shooter: Ship, age = 0) {
  const torpedoes = new Torpedoes(EFFECTS);
  const target: Homing = { id: 'mark', name: 'mark', alive: true, radius: 340, flight: { position: new THREE.Vector3(1e6, 0, 0), velocity: new THREE.Vector3() } };
  torpedoes.launch('s.0', shooter, target, new THREE.Vector3(), new THREE.Vector3(), -age, true);
  return { torpedoes, torpedo: torpedoes.list[0] };
}

/**
 * A torpedo on the rope of `holder` (70 m off, the winch's floor), for `seconds`: the holder
 * burns its drive away from the torpedo's target with `drive` (units/s²), the torpedo pushes
 * for its target while its motor burns, the rope pulls both by their masses.
 */
function tug(holder: Ship & { body: Body }, held: Torpedo, torpedoes: Torpedoes, drive: number, seconds: number) {
  held.holder = holder;
  let detonated = false;
  let length: number | null = 1400;
  for (let t = 0; t < seconds; t += DT) {
    holder.flight.velocity.x -= drive * DT;
    holder.flight.position.addScaledVector(holder.flight.velocity, DT);
    torpedoes.update(DT, t, SPACE, [holder], () => (detonated = true));
    length = pullOn(holder.body, held, length ?? 1400, true, 1400, MAX_SPEED, DT, true);
  }
  return detonated;
}

describe('a torpedo on the hook', () => {
  it('weighs a tonne against a ship of sixty: a drifting ship is tugged only a little towards its target', () => {
    const holder = ship('h', -1400);
    const { torpedoes, torpedo: held } = torpedo(ship('s', 50000));
    tug(holder, held, torpedoes, 0, 2);
    // the 6 g motor pulls both, a sixty-first of it on the ship: about 0.1 g
    expect(holder.flight.velocity.x).toBeGreaterThan(10);
    expect(holder.flight.velocity.x).toBeLessThan(100);
    expect(held.velocity.x).toBeCloseTo(holder.flight.velocity.x, -1);
  });

  it('loses the tug of war against a ship that burns away: the drive drags it off its course', () => {
    const holder = ship('h', -1400);
    const { torpedoes, torpedo: held } = torpedo(ship('s', 50000));
    tug(holder, held, torpedoes, MAIN_THRUST, 2);
    expect(held.velocity.x).toBeLessThan(-MAIN_THRUST);
    expect(held.position.x).toBeLessThan(0);
  });

  it('is towed without resistance once its motor has burnt out, and stays on the rope', () => {
    const holder = ship('h', -1400);
    const { torpedoes, torpedo: held } = torpedo(ship('s', 50000), 13);
    const detonated = tug(holder, held, torpedoes, MAIN_THRUST, 1);
    expect(detonated).toBe(false);
    expect(torpedoes.list).toContain(held);
    // both go at the drive's pace, a sixty-first slower for the mass in tow
    expect(held.velocity.x).toBeCloseTo((-MAIN_THRUST * 60) / 61, -2);
    expect(holder.flight.velocity.x).toBeCloseTo(held.velocity.x, -2);
  });

  it('keeps its fuse live on a string for every ship, its shooter and its holder too', () => {
    const shooter = ship('s', 300);
    const { torpedo: held } = torpedo(shooter);
    // free, it never goes off on its own shooter
    expect(fused(held, [shooter], 0)).toBeNull();
    held.holder = ship('h', -1400);
    expect(fused(held, [shooter], 0)).toBe(shooter);
    const holder = held.holder;
    holder.flight.position.set(200, 0, 0);
    expect(fused(held, [holder], 0)).toBe(holder);
  });

  it("gives the kill to whoever holds it, or flung it within the last seconds, else to its shooter", () => {
    const shooter = ship('s', 300);
    const holder = ship('h', -1400);
    const { torpedo: held } = torpedo(shooter);
    expect(creditOf(held, 0)).toBe(shooter);
    held.holder = holder;
    expect(creditOf(held, 1)).toBe(holder);
    // let go at 2 s: still the flinger's for FLING_CREDIT seconds
    held.holder = null;
    held.flinger = holder;
    held.releasedAt = 2;
    expect(creditOf(held, 2 + FLING_CREDIT - 0.1)).toBe(holder);
    expect(creditOf(held, 2 + FLING_CREDIT + 0.1)).toBe(shooter);
  });
});
