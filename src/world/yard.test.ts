import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { arenaById, ARENAS, PLACES } from './arenas';
import { BAY_BACK, BAY_HALF_WIDTH, BAY_HEIGHT, BAY_MOUTH, GROUND, PAD, PSYCHE_FALL, RACK_BOXES } from './yard';

describe('the Boneyard on Psyche', () => {
  const place = arenaById('boneyard')!;

  it('is a place of the campaign, never in a tournament’s order of arenas', () => {
    expect(PLACES).toContain(place);
    expect(ARENAS).not.toContain(place);
  });

  it('stands its racks solid on the crater floor in rows, the lane to the depot open, and prints the clone in it', () => {
    const field = testField();
    field.generate(place.layout);
    const racks = [...field.asteroids.values()].filter((piece) => piece.kind === 'rack');
    expect(racks.length).toBe(place.layout.placements!.length);
    expect(racks.every((rack) => rack.solid)).toBe(true);
    // the racks stand on the ground, and the ground is solid under them
    for (const rack of racks.slice(0, 56)) expect(rack.object.position.y - RACK_BOXES[0].y).toBeCloseTo(GROUND, 0);
    expect(field.overlap(new THREE.Vector3(0, GROUND - 100, 0), 10)).not.toBeNull();
    expect(field.overlap(new THREE.Vector3(0, GROUND + 100, 0), 10)).toBeNull();
    // the lane along the middle, from the start to the hangar hall's door, runs clear of every rack and mast
    const start = new THREE.Vector3(...place.start!.at);
    const door = new THREE.Vector3(BAY_MOUTH - 1000, start.y, 0);
    for (let k = 0; k <= 40; k++) expect(field.overlap(new THREE.Vector3().lerpVectors(start, door, k / 40), 300), `${k}/40 along the lane`).toBeNull();
  });

  it('pulls a ship straight down with Psyche\'s gravity alone, the same all over the yard', () => {
    const field = testField();
    field.generate(place.layout);
    const start = new THREE.Vector3(...place.start!.at);
    // in the lane, at the hall's door, over the pad: Psyche's 0.144 m/s², about 0.015 g, and nothing of the racks or the depot
    for (const at of [start, new THREE.Vector3(BAY_MOUTH - 1000, start.y, 0), PAD.clone().setY(PAD.y + 400)]) expect(field.gravity(at).toArray(), `at ${at.toArray()}`).toEqual([0, -PSYCHE_FALL, 0]);
  });

  it('leaves the spoil on the yard’s edge just over the ground, clear of the racks and the depot', () => {
    const field = testField();
    field.generate(place.layout);
    for (const rock of [...field.asteroids.values()].filter((piece) => piece.kind === 'rock')) {
      expect(rock.object.position.y - rock.radius, rock.id).toBeGreaterThan(GROUND);
      // nothing solid within its reach but itself
      for (const piece of field.asteroids.values()) if (piece.kind === 'rack') expect(piece.object.position.distanceTo(rock.object.position) > rock.radius + piece.semiAxes.length() || field.overlap(rock.object.position, rock.radius) !== piece, rock.id).toBe(true);
    }
  });

  it('opens the hangar hall to the lane, a ship fitting in it from the door to the pad, walled all round', () => {
    const field = testField();
    field.generate(place.layout);
    // a ship's size (35 m long): its sphere clear of every wall all the way in, and set down on the pad
    const ship = 350;
    const above = PAD.clone().setY(PAD.y + ship + 40);
    for (let k = 0; k <= 20; k++) {
      const at = new THREE.Vector3(BAY_MOUTH - 2000, above.y, 0).lerp(above, k / 20);
      expect(field.overlap(at, ship), `${k}/20 into the hall`).toBeNull();
    }
    // the ground under the pad, the roof, the side walls and the back wall are solid
    for (const solid of [PAD.clone().setY(GROUND - 100), new THREE.Vector3(PAD.x, GROUND + BAY_HEIGHT + 100, 0), new THREE.Vector3(PAD.x, GROUND + 400, BAY_HALF_WIDTH + 100), new THREE.Vector3(PAD.x, GROUND + 400, -BAY_HALF_WIDTH - 100), new THREE.Vector3(BAY_BACK + 100, GROUND + 400, 0)])
      expect(field.overlap(solid, 10), `solid at ${solid.toArray()}`).not.toBeNull();
  });
});
