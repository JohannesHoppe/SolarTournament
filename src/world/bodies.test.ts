import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contact, IMMOVABLE, MASS, massOf, rope, ropeFrom, share, type Body } from './bodies';

const body = (mass: number, x: number, vx = 0): Body => ({ position: new THREE.Vector3(x, 0, 0), velocity: new THREE.Vector3(vx, 0, 0), mass });
const momentum = (...bodies: Body[]) => bodies.reduce((sum, b) => sum + b.mass * b.velocity.x, 0);

describe('bodies', () => {
  it('weigh a rock of the belt millions of times a ship, ice less than rock', () => {
    const rock = massOf({ meanRadius: 2000, kind: 'rock' });
    expect(rock / MASS.ship).toBeGreaterThan(1e5);
    expect(massOf({ meanRadius: 2000, kind: 'ice' })).toBeLessThan(rock);
  });

  it('share an impulse by inverse mass; an immovable body takes none', () => {
    expect(share(MASS.ship, MASS.ship)).toBe(0.5);
    expect(share(MASS.core, MASS.ship)).toBeCloseTo(0.8);
    expect(share(MASS.ship, IMMOVABLE)).toBe(1);
    expect(share(IMMOVABLE, MASS.ship)).toBe(0);
  });

  describe('on a rope', () => {
    it('only pull: a slack rope, or one whose ends close in, does nothing', () => {
      const a = body(MASS.ship, 0, -500);
      const b = body(MASS.ship, 1000, 500);
      expect(rope(a, b, 2000)).toBe(false);
      expect(a.velocity.x).toBe(-500);
      // beyond its length but closing: drawn back to its length, the closing speed kept
      b.position.x = 3000;
      b.velocity.x = -500;
      a.velocity.x = 500;
      expect(rope(a, b, 2000)).toBe(true);
      expect(a.velocity.x).toBe(500);
      expect(b.velocity.x).toBe(-500);
      expect(b.position.x - a.position.x).toBeCloseTo(2000);
    });

    it('hold their length and split the jerk by mass, momentum kept', () => {
      const ship = body(MASS.ship, 0, -1000);
      const core = body(MASS.core, 1600, 0);
      const before = momentum(ship, core);
      rope(ship, core, 1500);
      expect(core.position.x - ship.position.x).toBeCloseTo(1500);
      expect(ship.velocity.x).toBeCloseTo(core.velocity.x);
      expect(momentum(ship, core)).toBeCloseTo(before);
      // the light core takes four fifths of the speed apart, the ship one fifth
      expect(core.velocity.x).toBeCloseTo(-800);
    });

    it('never move an immovable anchor: the body takes all of it', () => {
      const ring = body(IMMOVABLE, 0);
      const ship = body(MASS.ship, 1200, 300);
      rope(ship, ring, 1000);
      expect(ring.position.x).toBe(0);
      expect(ring.velocity.x).toBe(0);
      expect(ship.position.x).toBeCloseTo(1000);
      expect(ship.velocity.x).toBeCloseTo(0);
    });

    it('move only the ends this browser runs, each by its own share', () => {
      const a = body(MASS.ship, 0, -400);
      const b = body(MASS.ship, 1100, 400);
      rope(a, b, 1000, true, false);
      expect(a.velocity.x).toBeCloseTo(0);
      expect(b.velocity.x).toBe(400);
    });
  });

  describe('on a rope between two browsers', () => {
    /**
     * Two ships 70 m apart on a rope, each run by its own browser at its own frame rate and
     * pulled there from the other's last told state, burning away from each other with `a` and
     * `b` (units/s²) for 3 s; where their middle went.
     */
    function tug(a: number, b: number, rateA: number, rateB: number) {
      const one = body(MASS.ship, -700);
      const two = body(MASS.ship, 700);
      // what each browser last heard of the other (15 times a second), moved on with the
      // velocity it was told of, as a remote ship is shown
      const told = { one: body(MASS.ship, -700), two: body(MASS.ship, 700) };
      const heard = { one: body(MASS.ship, -700), two: body(MASS.ship, 700) };
      for (let t = 0, nextA = 0, nextB = 0, tell = 0, toldAt = 0; t < 3; t += 1 / 1200) {
        if (t >= tell) {
          told.one.position.copy(one.position);
          told.one.velocity.copy(one.velocity);
          told.two.position.copy(two.position);
          told.two.velocity.copy(two.velocity);
          toldAt = t;
          tell += 1 / 15;
        }
        for (const end of ['one', 'two'] as const) {
          heard[end].position.copy(told[end].position).addScaledVector(told[end].velocity, t - toldAt);
          heard[end].velocity.copy(told[end].velocity);
        }
        if (t >= nextA) {
          one.velocity.x -= a / rateA;
          ropeFrom(one, heard.two, 1400, 1 / rateA);
          one.position.addScaledVector(one.velocity, 1 / rateA);
          nextA += 1 / rateA;
        }
        if (t >= nextB) {
          two.velocity.x += b / rateB;
          ropeFrom(two, heard.one, 1400, 1 / rateB);
          two.position.addScaledVector(two.velocity, 1 / rateB);
          nextB += 1 / rateB;
        }
      }
      return { middle: (one.position.x + two.position.x) / 2, apart: two.position.x - one.position.x };
    }

    it('holds a stalemate between equal drives, whatever the frame rates', () => {
      // a few meters at equal frame rates, a few dozen with one browser at 120 frames a second
      // and the other at 20; the rope about its length
      for (const [rateA, rateB, drift] of [
        [60, 60, 100],
        [120, 20, 1000],
        [20, 120, 1000],
      ]) {
        const pull = tug(2550, 2550, rateA, rateB);
        expect(Math.abs(pull.middle)).toBeLessThan(drift);
        expect(pull.apart).toBeLessThan(1400 + 100);
      }
    });

    it('goes to the stronger drive, whichever browser runs it faster', () => {
      // a drive at 60 % against a full one: half the difference, about 115 m in 3 s
      expect(tug(2550, 1530, 120, 20).middle).toBeLessThan(-1500);
      expect(tug(2550, 1530, 20, 120).middle).toBeLessThan(-1500);
    });
  });

  describe('in a contact', () => {
    it('bounce with their restitution and keep their momentum', () => {
      // a core flying into a ship at rest, the normal from the ship to the core
      const core = body(MASS.core, -400, 1000);
      const ship = body(MASS.ship, 0, 0);
      const normal = new THREE.Vector3(-1, 0, 0);
      const before = momentum(core, ship);
      expect(contact(core, ship, normal, 0.6, 0)).toBe(1000);
      expect(momentum(core, ship)).toBeCloseTo(before);
      // they part at 60 % of the speed they met with
      expect(ship.velocity.x - core.velocity.x).toBeCloseTo(600);
      expect(ship.velocity.x).toBeCloseTo((1000 * 1.6) / 5);
    });

    it('leave an immovable body where it is, and do nothing to bodies parting', () => {
      const ship = body(MASS.ship, 0, 500);
      const ring = body(IMMOVABLE, 100);
      const normal = new THREE.Vector3(-1, 0, 0);
      expect(contact(ship, ring, normal, 0.3, 0)).toBe(500);
      expect(ship.velocity.x).toBeCloseTo(-150);
      expect(ring.velocity.x).toBe(0);
      expect(contact(ship, ring, normal, 0.3, 0)).toBe(0);
    });
  });
});
