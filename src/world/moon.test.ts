import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DOME_HEIGHT, GROUND_HALF, groundPlacement, groundRelief, surfaceHeight } from './moon';
import { MOON_TYPE } from './yard';
import { groundField, reliefOutside, testField } from '../test/field';
import { arenaById } from './arenas';
import { DETAIL } from './rocks';

describe('the Ballroom on the Moon', () => {
  it('collides as its ground, plain and craters, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const { misses } = groundField('moon-test', groundPlacement(MOON_TYPE), surfaceHeight, [[20000, 20000], [-40000, 30000], [50000, -50000], [-60000, -10000]]);
    expect(misses).toEqual([]);
  });

  it('stands the Ballroom’s dome solid at the field’s middle, on the plain', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('ballroom')!.layout);
    const crown = new THREE.Vector3(0, surfaceHeight(0, 0) + DOME_HEIGHT / 2, 0);
    expect(field.overlap(crown, 200)).not.toBeNull();
    expect(field.overlap(crown.clone().setY(surfaceHeight(0, 0) + DOME_HEIGHT + 3000), 200)).toBeNull();
  });
});
