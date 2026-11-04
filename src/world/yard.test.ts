import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { arenaById, ARENAS, PLACES } from './arenas';
import { BAY_BACK, BAY_HALF_HEIGHT, BAY_HALF_WIDTH, BAY_MOUTH, DEPOT_LAYOUT, PAD, RACK_BOXES } from './yard';

describe('the Boneyard on Psyche', () => {
  const place = arenaById('boneyard')!;

  it('is a place of the campaign, never in a tournament’s order of arenas', () => {
    expect(PLACES).toContain(place);
    expect(ARENAS).not.toContain(place);
  });

  it('stands its racks solid in rows, the lane to the yard office open, and prints the clone in it', () => {
    const field = testField();
    field.generate(place.layout);
    const racks = [...field.asteroids.values()].filter((piece) => piece.kind === 'rack');
    expect(racks.length).toBe(place.layout.placements!.length);
    expect(racks.every((rack) => rack.solid)).toBe(true);
    // the lane along the middle, from the start to the depot's bay, runs clear of every rack
    const start = new THREE.Vector3(...place.start!.at);
    const mouth = new THREE.Vector3(BAY_MOUTH - RACK_BOXES[0].y, 0, 0);
    const half = RACK_BOXES[0];
    for (let k = 0; k <= 40; k++) expect(field.overlap(new THREE.Vector3().lerpVectors(start, mouth, k / 40), half.y), `${k}/40 along the lane`).toBeNull();
  });

  it('opens the depot’s bay to the lane, a ship fitting in it from the mouth to the pad, walled all round', () => {
    const field = testField();
    field.generate(place.layout);
    // a ship's size (35 m long): its sphere clear of every wall all the way in, and set down on the pad
    const ship = 350;
    const above = PAD.clone().setY(PAD.y + ship + 40);
    for (let k = 0; k <= 20; k++) {
      const at = new THREE.Vector3(BAY_MOUTH - 2000, above.y, 0).lerp(above, k / 20);
      expect(field.overlap(at, ship), `${k}/20 into the bay`).toBeNull();
    }
    // the floor under the pad, the ceiling, the side walls and the back wall are solid
    for (const solid of [PAD.clone().setY(PAD.y - 100), new THREE.Vector3(PAD.x, BAY_HALF_HEIGHT + 100, 0), new THREE.Vector3(PAD.x, 0, BAY_HALF_WIDTH + 100), new THREE.Vector3(PAD.x, 0, -BAY_HALF_WIDTH - 100), new THREE.Vector3(BAY_BACK + 100, 0, 0)])
      expect(field.overlap(solid, 10), `solid at ${solid.toArray()}`).not.toBeNull();
    expect(PAD.distanceTo(DEPOT_LAYOUT.floor.center)).toBeLessThan(DEPOT_LAYOUT.floor.half.length());
  });
});
