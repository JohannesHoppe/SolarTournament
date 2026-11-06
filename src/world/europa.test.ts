import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CRACK_DEPTH, CRACK_WIDTH, crackMiddle, GROUND_HALF, groundPlacement, groundRelief, inCrack, LAND, STATION_AT, stationPlacement, surfaceHeight } from './europa';
import { POST_HALF } from './callisto';
import { EUROPA_TYPE, STATION_TYPE } from './yard';
import { groundField } from '../test/field';
import { ARENA_LIMIT } from './arena';

describe('the Lineae on Europa', () => {
  it('collides as its ground: on the plain, on a lip of the Crack and down on its floor', () => {
    const points: [number, number][] = [[30000, 0], [crackMiddle(0) + CRACK_WIDTH / 2 + 3000, 0], [crackMiddle(0), 0], [crackMiddle(-24000), -24000], [-50000, 40000]];
    expect(groundField('europa-test', groundPlacement(EUROPA_TYPE), surfaceHeight, points).misses).toEqual([]);
  });

  it('keeps its relief inside its box over the whole square', () => {
    for (let x = -GROUND_HALF.x; x <= GROUND_HALF.x; x += 500) {
      for (let z = -GROUND_HALF.z; z <= GROUND_HALF.z; z += 2000) {
        const top = groundRelief(x, z);
        expect(top).toBeLessThan(GROUND_HALF.y);
        expect(top).toBeGreaterThan(-GROUND_HALF.y);
      }
    }
  });

  it('cuts the Crack 200 m wide and some 800 m deep, its walls nearly sheer, all through the arena', () => {
    for (let z = -ARENA_LIMIT; z <= ARENA_LIMIT; z += 5000) {
      const middle = crackMiddle(z);
      expect(surfaceHeight(middle, z)).toBeLessThan(LAND - CRACK_DEPTH * 0.9);
      // 40 m inside either wall it is still deep, 40 m outside it is the plain or its lip
      for (const side of [-1, 1]) {
        expect(inCrack(middle + side * (CRACK_WIDTH / 2 - 800), z)).toBeGreaterThan(0.9);
        expect(surfaceHeight(middle + side * (CRACK_WIDTH / 2 + 800), z)).toBeGreaterThan(LAND - 600);
      }
    }
  });

  it('stands the science station on the Crack’s floor, clear of both walls, its foot in the ground, inside the arena', () => {
    const station = stationPlacement(STATION_TYPE, POST_HALF);
    const foot = station.position.y - POST_HALF.y;
    expect(foot).toBeLessThan(surfaceHeight(STATION_AT.x, STATION_AT.z));
    expect(foot).toBeGreaterThan(surfaceHeight(STATION_AT.x, STATION_AT.z) - 1000);
    // turned along the Crack, its 50 m across stand in the 200 m between the walls
    for (const side of [-1, 1]) expect(inCrack(STATION_AT.x + side * (POST_HALF.z + 400), STATION_AT.z)).toBeGreaterThan(0.9);
    // the walls rise far over its top
    expect(station.position.y + POST_HALF.y).toBeLessThan(LAND - CRACK_DEPTH / 2);
    expect(new THREE.Vector3(STATION_AT.x, 0, STATION_AT.z).length()).toBeLessThan(ARENA_LIMIT);
  });
});
