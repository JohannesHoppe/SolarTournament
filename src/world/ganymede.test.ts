import { describe, expect, it } from 'vitest';
import { GROUND_HALF, groundPlacement, groundRelief, LAND, surfaceHeight } from './ganymede';
import { GANYMEDE_TYPE } from './yard';
import { groundField, reliefOutside, testField } from '../test/field';
import { arenaById } from './arenas';
import { DETAIL } from './rocks';

describe('the Tug Yards over Ganymede', () => {
  it('collides as its ground far below, in the grooves of the bright terrain and on the dark, its relief inside its box over the whole square', () => {
    expect(reliefOutside(groundRelief, GROUND_HALF, 1000)).toEqual([]);
    const { misses } = groundField('ganymede-test', groundPlacement(GANYMEDE_TYPE), surfaceHeight, [[0, 0], [30000, -20000], [-40000, 30000], [50000, 50000], [-60000, -10000]]);
    expect(misses).toEqual([]);
  });

  it('floats every block of ice of the yard free over the ground, 500 m deep below the field’s middle', () => {
    const field = testField(DETAIL);
    field.generate(arenaById('ganymede')!.layout);
    let blocks = 0;
    for (const piece of field.asteroids.values()) {
      if (piece.solid) continue;
      blocks++;
      const p = piece.object.position;
      expect(p.y - piece.radius, piece.id).toBeGreaterThan(surfaceHeight(p.x, p.z) + 2000);
    }
    expect(blocks).toBeGreaterThan(20);
    expect(LAND).toBeLessThan(-10000);
  });
});
