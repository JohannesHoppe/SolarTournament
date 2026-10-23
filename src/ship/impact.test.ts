import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ram, ramDamage, RAM_SAFE } from './impact';

/** m/s in units/s (1 unit = 5 cm). */
const ms = (speed: number) => speed * 20;

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
    // 60 m/s into a drive takes all its thrust: its reactor goes
    expect(ramDamage(ms(60), 'drive').drive).toBeGreaterThanOrEqual(1);
  });

  it('wreck both noses meeting at full speed, but leave an overdrive rammer alive', () => {
    expect(ramDamage(ms(220), 'nose').hull).toBeGreaterThanOrEqual(100);
    const rammer = ramDamage(ms(150), 'nose').hull;
    expect(rammer).toBeGreaterThan(50);
    expect(rammer).toBeLessThan(100);
    expect(ramDamage(ms(150), 'drive').drive).toBeGreaterThanOrEqual(1);
  });

  it('push both ships apart alike, as two bodies of equal mass, keeping the sum of their momentum', () => {
    const a = new THREE.Vector3(1000, 0, 0);
    const b = new THREE.Vector3(-1000, 0, 0);
    const apart = new THREE.Vector3(1, 0, 0);
    const closing = ram(a, b, apart, true, true);
    expect(closing).toBe(2000);
    expect(a.x + b.x).toBeCloseTo(0);
    expect(a.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThan(0);
  });

  it('change only the velocity of the ship this browser runs, the other by its own browser alike', () => {
    const a = new THREE.Vector3(1000, 0, 0);
    const b = new THREE.Vector3(0, 0, 0);
    const before = b.clone();
    ram(a, b, new THREE.Vector3(1, 0, 0), true, false);
    expect(b).toEqual(before);
    expect(a.x).toBeLessThan(1000);
  });

  it('leave ships alone that already move apart', () => {
    const a = new THREE.Vector3(-500, 0, 0);
    const b = new THREE.Vector3(500, 0, 0);
    expect(ram(a, b, new THREE.Vector3(1, 0, 0), true, true)).toBe(0);
    expect(a.x).toBe(-500);
  });
});
