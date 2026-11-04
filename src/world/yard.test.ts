import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { arenaById, ARENAS, PLACES } from './arenas';
import { RACK_BOXES } from './yard';

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
    // the lane along the middle, from the start to the office, runs clear of every rack
    const start = new THREE.Vector3(...place.start!.at);
    const office = new THREE.Vector3(...place.start!.toward);
    const half = RACK_BOXES[0];
    for (let k = 0; k <= 40; k++) expect(field.overlap(new THREE.Vector3().lerpVectors(start, office, k / 40), half.y), `${k}/40 along the lane`).toBeNull();
  });
});
