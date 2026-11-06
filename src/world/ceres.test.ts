import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaById } from './arenas';
import { CLIFF_X, MARKET_DOCK, occatorPlacements, onPlace, STEPS, stepFace, stepTop, TERRACE } from './ceres';
import { OCCATOR_TYPE, RACK_BOXES } from './yard';
import { DETAIL } from './rocks';
import { testField } from '../test/field';
import { SHIP_RADIUS } from '../test/pilot';

describe('Occator on Ceres', () => {
  it('stands its solid boxes as its ground is laid out: the terrace and the top of every step, each face where its step begins', () => {
    const pieces = occatorPlacements(OCCATOR_TYPE);
    const top = (k: number) => pieces[k].position.y + RACK_BOXES[pieces[k].type].y;
    expect(top(0)).toBeCloseTo(TERRACE);
    for (let k = 1; k <= STEPS; k++) {
      expect(top(k)).toBeCloseTo(stepTop(k));
      // the face along u is world z: the box begins where the step does
      expect(pieces[k].position.z - RACK_BOXES[pieces[k].type].z).toBeCloseTo(stepFace(k));
    }
  });

  it('leaves the way from where the clone starts to the market dock clear, and room to hold there', () => {
    const field = testField(DETAIL);
    const place = arenaById('occator')!;
    field.generate(place.layout);
    const start = new THREE.Vector3(...place.start!.at);
    const way = MARKET_DOCK.clone().sub(start);
    expect(field.raycast(start, way.clone().normalize(), way.length())).toBeNull();
    expect(field.overlap(MARKET_DOCK, SHIP_RADIUS * 2)).toBeNull();
    expect(field.overlap(start, SHIP_RADIUS * 2)).toBeNull();
    // the dock lies before the market's mouth, over the terrace
    expect(MARKET_DOCK.y).toBeGreaterThan(TERRACE + SHIP_RADIUS);
    expect(MARKET_DOCK.z).toBeLessThan(onPlace(CLIFF_X, 0, 0).z);
  });
});
