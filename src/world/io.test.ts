import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLUX_AT, fluxStatic, GROUND_HALF, groundPlacement, groundRelief, LAND, MESA, PATERA, PATERA_RADIUS, PIT_FLOOR, surfaceHeight } from './io';
import { IO_TYPE } from './yard';
import { groundField } from '../test/field';

describe('Flux on Io', () => {
  it('collides as its ground: on the plain, in the patera, on the mesa', () => {
    const points: [number, number][] = [[40000, 30000], [PATERA.x, PATERA.z], [MESA.x, MESA.z], [0, 0], [-50000, -40000]];
    expect(groundField('io-test', groundPlacement(IO_TYPE), surfaceHeight, points).misses).toEqual([]);
  });

  it('keeps its relief inside its box over the whole square', () => {
    for (let x = -GROUND_HALF.x; x <= GROUND_HALF.x; x += 1000) {
      for (let z = -GROUND_HALF.z; z <= GROUND_HALF.z; z += 1000) {
        const top = groundRelief(x, z);
        expect(top).toBeLessThan(GROUND_HALF.y);
        expect(top).toBeGreaterThan(-GROUND_HALF.y);
      }
    }
  });

  it('levels the patera’s floor under its lava lake, sunk 150 m into the plain, and raises the mesa 300 m over it', () => {
    for (const share of [0, 0.4, 0.8]) {
      const floor = surfaceHeight(PATERA.x + share * PATERA_RADIUS * 0.9, PATERA.z);
      expect(Math.abs(floor - PIT_FLOOR)).toBeLessThan(150);
    }
    expect(PIT_FLOOR).toBeLessThan(LAND - 2500);
    expect(surfaceHeight(MESA.x, MESA.z)).toBeGreaterThan(LAND + 5000);
  });

  it('crackles the link only near the flux tube: full at its glow, nothing 1.5 km off its axis', () => {
    expect(fluxStatic(new THREE.Vector3(FLUX_AT.x, 0, FLUX_AT.z))).toBe(1);
    expect(fluxStatic(new THREE.Vector3(FLUX_AT.x + 31000, 0, FLUX_AT.z))).toBe(0);
    const half = fluxStatic(new THREE.Vector3(FLUX_AT.x + 18000, 0, FLUX_AT.z));
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
  });
});
