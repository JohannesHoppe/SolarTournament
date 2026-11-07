import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_HEIGHT, BOTTLE_HEIGHT, DECK, hallAt, HALL_HALF, HALLS, PLATFORM_HALF_SIDE, PLATFORM_THICK, PLATFORM_TOP, VENUS_AIR } from './venus';
import { testField } from '../test/field';
import { arenaById } from './arenas';
import { DETAIL } from './rocks';
import { altitudeIn } from './air';
import { cos, sin } from '../detmath';

describe('Highball over Venus', () => {
  const field = testField(DETAIL);
  field.generate(arenaById('venus')!.layout);

  it('floats the city over the acid clouds’ deck, the field’s middle over it', () => {
    expect(altitudeIn(VENUS_AIR, new THREE.Vector3(0, 0, 0))).toBeCloseTo(-DECK, 0);
    expect(PLATFORM_TOP - PLATFORM_THICK).toBeGreaterThan(DECK);
  });

  it('collides as the square its platform is: solid out to near each corner and each flank, open just beyond them', () => {
    const middle = PLATFORM_TOP - PLATFORM_THICK / 2;
    for (let k = 0; k < 8; k++) {
      // the flanks' middles on the axes, the corners on the diagonals
      const angle = (k / 8) * Math.PI * 2;
      const reach = k % 2 === 0 ? PLATFORM_HALF_SIDE : PLATFORM_HALF_SIDE * Math.SQRT2;
      const at = (share: number) => new THREE.Vector3(cos(angle) * reach * share, middle, sin(angle) * reach * share);
      expect(field.overlap(at(0.97), 50), `${k}`).not.toBeNull();
      expect(field.overlap(at(1.03), 50), `${k}`).toBeNull();
    }
  });

  it('stands its halls and the bottle solid on it, and the air over the bottle’s cap free', () => {
    for (let k = 0; k < HALLS; k++) expect(field.overlap(hallAt(k), 100)).not.toBeNull();
    expect(field.overlap(new THREE.Vector3(0, PLATFORM_TOP + BODY_HEIGHT / 2, 0), 100)).not.toBeNull();
    expect(field.overlap(new THREE.Vector3(0, PLATFORM_TOP + BOTTLE_HEIGHT - 400, 0), 100)).not.toBeNull();
    expect(field.overlap(new THREE.Vector3(0, PLATFORM_TOP + BOTTLE_HEIGHT + 1500, 0), 100)).toBeNull();
    expect(field.overlap(hallAt(0).add(new THREE.Vector3(0, HALL_HALF.y + 1000, 0)), 100)).toBeNull();
  });
});
