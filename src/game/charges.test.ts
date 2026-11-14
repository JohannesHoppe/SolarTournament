import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pow } from '../detmath';
import { ARENAS } from '../world/arenas';
import { CHARGE_CRACKS } from '../world/asteroids';
import { testField } from '../test/field';
import { blastOn, CHARGE_BLAST, CHARGE_FUSE, CHARGE_HOLD, CHARGE_HURT, CHARGE_REACH, Charges } from './charges';

const belt = ARENAS.find((a) => a.id === 'belt')!.layout;
const RADIUS = 300;

function field() {
  const f = testField();
  f.generate(belt);
  return f;
}

describe("the Rockborn's mining charges", () => {
  it('a rock up to the size one cracks breaks at once; a bigger one takes more, by its volume', () => {
    const f = field();
    const rocks = [...f.asteroids.values()].filter((rock) => !rock.solid && !rock.ground);
    for (const rock of rocks) {
      const needed = f.chargesFor(rock);
      expect(needed).toBeGreaterThanOrEqual(rock.meanRadius <= CHARGE_CRACKS ? 1 : 2);
      expect(needed).toBeLessThanOrEqual(Math.max(1, Math.ceil(pow(rock.meanRadius / CHARGE_CRACKS, 3))) + 1);
      for (let i = 1; i < needed; i++) expect(f.charge(rock.id)).toBeUndefined();
      expect(f.charge(rock.id)?.id).toBe(rock.id);
      expect(f.asteroids.has(rock.id)).toBe(false);
    }
  });

  it('is set close to a rock with the button held, goes off on its fuse and breaks it', () => {
    const f = field();
    const rock = [...f.asteroids.values()].filter((r) => !r.solid && !r.ground).sort((p, q) => p.meanRadius - q.meanRadius)[0];
    // worn down to its last charge
    while (f.chargesFor(rock) > 1) f.charge(rock.id);
    const charges = new Charges();
    charges.arm(2);
    const out = new THREE.Vector3(1, 0, 0);
    const near = rock.object.position.clone().addScaledVector(out, rock.radius + RADIUS + CHARGE_REACH * 0.5);
    const far = rock.object.position.clone().addScaledVector(out, rock.radius + RADIUS + CHARGE_REACH * 4);
    // too far off, or not held long enough: nothing
    expect(charges.update(0, CHARGE_HOLD * 2, true, far, RADIUS, f).placed).toBeNull();
    expect(charges.update(0, CHARGE_HOLD / 2, true, near, RADIUS, f).placed).toBeNull();
    expect(charges.update(0.1, CHARGE_HOLD / 2, false, near, RADIUS, f).placed).toBeNull();
    // held long enough close by: set, one charge less
    charges.update(1, CHARGE_HOLD * 0.6, true, near, RADIUS, f);
    const placed = charges.update(1.1, CHARGE_HOLD * 0.6, true, near, RADIUS, f).placed;
    expect(placed?.rock).toBe(rock.id);
    expect(charges.carried).toBe(1);
    // it goes off on its fuse, near the rock's surface
    expect(charges.update(1 + CHARGE_FUSE * 0.5, 0.1, false, far, RADIUS, f).blasts).toEqual([]);
    const blasts = charges.update(1.2 + CHARGE_FUSE, 0.1, false, far, RADIUS, f).blasts;
    expect(blasts).toHaveLength(1);
    expect(blasts[0].broken?.id).toBe(rock.id);
    expect(blasts[0].position.distanceTo(rock.object.position)).toBeLessThanOrEqual(rock.radius + 1);
    expect(charges.set).toHaveLength(0);
  });

  it('its blast hurts a hull too close, less the farther, and nothing beyond its reach', () => {
    expect(blastOn(0).hurt).toBe(CHARGE_HURT);
    expect(blastOn(CHARGE_BLAST * 0.5).hurt).toBeLessThan(CHARGE_HURT / 2);
    expect(blastOn(CHARGE_BLAST * 0.5).shove).toBeGreaterThan(0);
    expect(blastOn(CHARGE_BLAST)).toEqual({ hurt: 0, shove: 0 });
    // a full hull lives through a charge going off against it
    expect(CHARGE_HURT).toBeLessThan(100);
  });
});
