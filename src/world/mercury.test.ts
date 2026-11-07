import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMP_AT, GROUND_HALF, groundPlacement, groundRelief, LAND, ridgeNorth, surfaceHeight } from './mercury';
import { MERCURY_TYPE } from './yard';
import { POST_HALF } from './callisto';
import { groundField, reliefOutside, testField } from '../test/field';
import { arenaById } from './arenas';
import { DETAIL } from './rocks';

describe('Caloris on Mercury', () => {
  it('collides as its ground, plain, ridges and craters, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const { misses } = groundField('mercury-test', groundPlacement(MERCURY_TYPE), surfaceHeight, [[20000, 20000], [-40000, 30000], [50000, -50000], [-60000, -10000], [0, ridgeNorth(0)]]);
    expect(misses).toEqual([]);
  });

  it('raises its wrinkle ridge over the plain beside it', () => {
    const crest = surfaceHeight(10000, ridgeNorth(10000));
    const plain = surfaceHeight(10000, ridgeNorth(10000) - 60000);
    // some 170 m over the plain at its crest, a few craters and hummocks aside
    expect(crest - plain).toBeGreaterThan(2400);
    expect(crest - LAND).toBeLessThan(5000);
  });

  it('stands the sun miners’ camp solid at the field’s middle, on the plain', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('mercury')!.layout);
    const roof = new THREE.Vector3(0, CAMP_AT.y + 200, 0);
    expect(field.overlap(roof, 100)).not.toBeNull();
    expect(field.overlap(roof.clone().setY(CAMP_AT.y + 2 * POST_HALF.y + 2000), 100)).toBeNull();
  });
});
