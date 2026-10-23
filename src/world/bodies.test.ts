import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contact, IMMOVABLE, MASS, massOf, rope, share, type Body } from './bodies';

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
