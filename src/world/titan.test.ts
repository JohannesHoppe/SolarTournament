import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SEA, SEA_HALF, seaHeight, seaPlacement, seaRelief, TITAN_AIR } from './titan';
import { TITAN_TYPE } from './yard';
import { groundField, reliefOutside } from '../test/field';
import { altitudeIn, reachAt, SIGHT_DEPTH, RADAR_DEPTH } from './air';
import { arenaById } from './arenas';

describe('Kraken Mare on Titan', () => {
  it('collides as its sea, still and level but for Titan’s curve, inside its box', () => {
    expect(reliefOutside(seaRelief, SEA_HALF, 2000)).toEqual([]);
    const { misses } = groundField('titan-test', seaPlacement(TITAN_TYPE), seaHeight, [[0, 0], [40000, -30000], [-60000, 50000]]);
    expect(misses).toEqual([]);
  });

  it('runs the haze’s deck through the field’s middle, the sea 2 km under it, and gives the place its air', () => {
    expect(Math.abs(altitudeIn(TITAN_AIR, new THREE.Vector3(0, 0, 0)))).toBeLessThan(1);
    expect(altitudeIn(TITAN_AIR, new THREE.Vector3(0, SEA, 0))).toBeCloseTo(SEA, -1);
    expect(arenaById('titan')!.layout.air).toBe(TITAN_AIR);
  });

  it('hides as Jupiter’s air does: the eye sees some 600 m and the radar twice that 1.25 km under the deck, and little over the sea', () => {
    const eye = reachAt(-25000, SIGHT_DEPTH) / 20;
    expect(eye).toBeGreaterThan(550);
    expect(eye).toBeLessThan(650);
    expect(reachAt(-25000, RADAR_DEPTH) / reachAt(-25000, SIGHT_DEPTH)).toBeCloseTo(2, 5);
    expect(reachAt(SEA + 2000, SIGHT_DEPTH) / 20).toBeLessThan(300);
  });
});
