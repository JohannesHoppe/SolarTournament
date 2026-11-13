import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blowDamage, feltBlow, impactDamage, ram, ramDamage, RAM_SAFE } from './impact';
import { IMMOVABLE, MASS } from '../world/bodies';

/** m/s in units/s (1 unit = 5 cm). */
const ms = (speed: number) => speed * 20;

/** A ship's body moving at `velocity`. */
const ship = (velocity: THREE.Vector3) => ({ position: new THREE.Vector3(), velocity, mass: MASS.ship });

describe('two ships meeting', () => {
  it('only bump below 15 m/s: no damage wherever they meet', () => {
    for (const zone of ['nose', 'flank', 'drive'] as const) expect(ramDamage(RAM_SAFE, zone).hull).toBe(0);
    expect(ramDamage(ms(10), 'drive')).toEqual({ hull: 0, drive: 0, thrusters: 0 });
  });

  it('hurt at least as much as a laser hit once it is a ram', () => {
    expect(ramDamage(ms(16), 'nose').hull).toBeGreaterThanOrEqual(2);
    expect(ramDamage(ms(16), 'drive').drive).toBeGreaterThanOrEqual(0.2);
  });

  it('spare the armored nose and crush the open drive', () => {
    const closing = ms(40);
    expect(ramDamage(closing, 'nose').hull).toBeLessThan(ramDamage(closing, 'flank').hull);
    expect(ramDamage(closing, 'flank').hull).toBeLessThan(ramDamage(closing, 'drive').hull);
    expect(ramDamage(ms(40), 'flank').thrusters).toBeGreaterThan(0);
    // 112 m/s into a drive takes all its thrust: its reactor goes
    expect(ramDamage(ms(112), 'drive').drive).toBeGreaterThanOrEqual(1);
    expect(ramDamage(ms(108), 'drive').drive).toBeLessThan(1);
  });

  it('hurt by the felt half of the closing speed, as a rock deals it: nothing below 25 m/s, a dent from a pack\'s jostle', () => {
    // two equal hulls each feel half the closing speed: below 25 m/s that is a rock's harmless 12.5
    expect(ramDamage(ms(24), 'flank').hull).toBe(2);
    expect(ramDamage(ms(40), 'flank').hull).toBeCloseTo(12.5, 5);
    expect(ramDamage(ms(60), 'flank').hull).toBeCloseTo(29.2, 1);
    expect(ramDamage(ms(60), 'drive').drive).toBeLessThan(0.5);
  });

  it('wreck both noses meeting at full speed, but leave an overdrive rammer alive', () => {
    expect(ramDamage(ms(210), 'nose').hull).toBeGreaterThanOrEqual(100);
    expect(ramDamage(ms(200), 'nose').hull).toBeLessThan(100);
    expect(ramDamage(ms(200), 'flank').hull).toBeGreaterThanOrEqual(100);
    expect(ramDamage(ms(150), 'drive').drive).toBeGreaterThanOrEqual(1);
  });

  it('push both ships apart alike, as two bodies of equal mass, keeping the sum of their momentum', () => {
    const a = new THREE.Vector3(1000, 0, 0);
    const b = new THREE.Vector3(-1000, 0, 0);
    const apart = new THREE.Vector3(1, 0, 0);
    const closing = ram(ship(a), ship(b), apart, true, true);
    expect(closing).toBe(2000);
    expect(a.x + b.x).toBeCloseTo(0);
    expect(a.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThan(0);
  });

  it('change only the velocity of the ship this browser runs, the other by its own browser alike', () => {
    const a = new THREE.Vector3(1000, 0, 0);
    const b = new THREE.Vector3(0, 0, 0);
    const before = b.clone();
    ram(ship(a), ship(b), new THREE.Vector3(1, 0, 0), true, false);
    expect(b).toEqual(before);
    expect(a.x).toBeLessThan(1000);
  });

  it('leave ships alone that already move apart', () => {
    const a = new THREE.Vector3(-500, 0, 0);
    const b = new THREE.Vector3(500, 0, 0);
    expect(ram(ship(a), ship(b), new THREE.Vector3(1, 0, 0), true, true)).toBe(0);
    expect(a.x).toBe(-500);
  });
});

describe('one rule for a hull meeting a body', () => {
  const closing = ms(100);
  it('leaves rock as it is: the whole closing speed through the rock\'s curve', () => {
    expect(feltBlow(closing, MASS.ship, IMMOVABLE)).toBe(closing);
    expect(blowDamage(closing, MASS.ship, IMMOVABLE)).toBe(impactDamage(closing));
    expect(blowDamage(ms(72.5), MASS.ship, IMMOVABLE)).toBeCloseTo(100, 6);
  });

  it('hurts more the heavier the body met, never more than rock', () => {
    // a probe, a plate of wreckage, a sponsor core, the hulk, a satellite's bus, an interceptor, a stack, rock
    const masses = [MASS.probe, 4_000, MASS.core, 24_000, 51_000, MASS.ship, 2_800_000, IMMOVABLE];
    const hurts = masses.map((mass) => blowDamage(ms(200), MASS.ship, mass));
    for (let i = 1; i < hurts.length; i++) expect(hurts[i]).toBeGreaterThanOrEqual(hurts[i - 1]);
    expect(hurts[hurts.length - 1]).toBe(impactDamage(ms(200)));
  });

  it('gives the numbers of the README at 100 m/s', () => {
    expect(blowDamage(closing, MASS.ship, IMMOVABLE)).toBeCloseTo(145.8, 1);
    // a plate of 4 t does nothing, the 24 t hulk dents, a 15 t core dents a little
    expect(blowDamage(closing, MASS.ship, 4_000)).toBe(0);
    expect(blowDamage(closing, MASS.ship, 24_000)).toBeCloseTo(26.8, 1);
    expect(blowDamage(closing, MASS.ship, MASS.core)).toBeCloseTo(12.5, 1);
    // another interceptor: half the closing speed, by where it lands
    expect(ramDamage(closing, 'flank').hull).toBeCloseTo(62.5, 1);
    expect(ramDamage(closing, 'nose').hull).toBeCloseTo(37.5, 1);
    expect(ramDamage(closing, 'drive').hull).toBeCloseTo(87.5, 1);
  });
});
