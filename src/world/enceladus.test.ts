import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GROUND_HALF, groundPlacement, groundRelief, LAND, plumeDensity, PLUME_REACH, STRIPE_NAMES, stripeAcross, STRIPE_WAY, surfaceHeight, VENTS } from './enceladus';
import { ENCELADUS_TYPE } from './yard';
import { groundField, reliefOutside } from '../test/field';
import { ARENA_LIMIT } from './arena';

/** A point `across` units off the field's middle across the stripes, on the line through it. */
const acrossAt = (across: number) => new THREE.Vector3(-STRIPE_WAY.z * across, 0, STRIPE_WAY.x * across);

describe('the Plumes at Enceladus', () => {
  it('collides as its ground, in the stripes’ troughs and on their ridges, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const points: [number, number][] = [[0, 0], [30000, -20000], [-40000, 30000], [50000, 50000]];
    for (let k = 0; k < STRIPE_NAMES.length; k++) {
      const p = acrossAt(stripeAcross(k, 0));
      points.push([p.x, p.z]);
    }
    const { misses } = groundField('enceladus-test', groundPlacement(ENCELADUS_TYPE), surfaceHeight, points);
    expect(misses).toEqual([]);
  });

  it('cuts four troughs across the field, each deeper than the plain beside it and walled by a ridge on each lip, all of them inside the arena', () => {
    for (let k = 0; k < STRIPE_NAMES.length; k++) {
      const middle = stripeAcross(k, 0);
      expect(Math.abs(middle), STRIPE_NAMES[k]).toBeLessThan(ARENA_LIMIT);
      const floor = acrossAt(middle);
      const ridge = acrossAt(middle + 3000);
      const plain = acrossAt(middle + 8000);
      expect(surfaceHeight(floor.x, floor.z), STRIPE_NAMES[k]).toBeLessThan(surfaceHeight(plain.x, plain.z) - 1500);
      expect(surfaceHeight(ridge.x, ridge.z), STRIPE_NAMES[k]).toBeGreaterThan(surfaceHeight(plain.x, plain.z) + 400);
    }
    expect(LAND).toBeLessThan(-10000);
  });

  it('raises a plume over every vent on a stripe’s floor, thickest at its foot and gone at its top and beside it', () => {
    expect(VENTS.length).toBe(20);
    for (const vent of VENTS) {
      expect(Math.sqrt(vent.x * vent.x + vent.z * vent.z)).toBeLessThan(ARENA_LIMIT);
      const foot = plumeDensity(vent.clone().setY(vent.y + 200));
      const high = plumeDensity(vent.clone().setY(vent.y + PLUME_REACH * 0.7));
      expect(foot).toBeGreaterThan(0.9);
      expect(high).toBeLessThan(foot);
      expect(plumeDensity(vent.clone().setY(vent.y + PLUME_REACH + 100))).toBe(0);
    }
    expect(plumeDensity(new THREE.Vector3(0, 30000, 0))).toBe(0);
  });
});
