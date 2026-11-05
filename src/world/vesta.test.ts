import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { arenaById, ARENAS, PLACES } from './arenas';
import { outline } from './asteroids';
import { planMining, standClaims } from './mining';
import { RISE, SLOPE, SUMMIT, surfaceHeight, VESTA_GROUND } from './vesta';

describe('Rheasilvia on Vesta', () => {
  const place = arenaById('rheasilvia')!;
  const flank = (x: number) => VESTA_GROUND + RISE * x;

  it('is a place of the campaign, never in a tournament’s order of arenas', () => {
    expect(PLACES).toContain(place);
    expect(ARENAS).not.toContain(place);
  });

  it('leans its flank about 13° up towards the summit, which stands above the claims, the basin far below', () => {
    expect((SLOPE * 180) / Math.PI).toBeGreaterThan(12);
    expect((SLOPE * 180) / Math.PI).toBeLessThan(14);
    expect(SUMMIT.y).toBeGreaterThan(VESTA_GROUND + 20000);
    // the surface as the scenery draws it meets the flank's plane under the claims
    for (const [x, z] of [[0, 0], [20000, 0], [-20000, 0], [0, 20000]]) expect(Math.abs(surfaceHeight(x, z) - flank(x)), `${x}, ${z}`).toBeLessThan(400);
    // 100 km down the flank the basin's floor lies some 10 km and more below the claims
    expect(surfaceHeight(-2_000_000, 0)).toBeLessThan(VESTA_GROUND - 200000);
  });

  it('lays every boulder of the claims on the flank, none in it and none afloat, and the flank solid beneath them', () => {
    const field = testField();
    field.generate(place.layout);
    const rocks = [...field.asteroids.values()].filter((piece) => piece.kind === 'rock');
    expect(rocks.length).toBe(place.layout.count);
    const point = new THREE.Vector3();
    for (const rock of rocks) {
      const points = outline(rock);
      let low = Infinity;
      for (let k = 0; k < points.length; k += 3) {
        rock.object.localToWorld(point.set(points[k], points[k + 1], points[k + 2]));
        low = Math.min(low, point.y - flank(point.x));
      }
      // its lowest point a meter over the flank
      expect(low, rock.id).toBeGreaterThan(0);
      expect(low, rock.id).toBeLessThan(40);
    }
    // the flank is solid: under it a piece is found, over it none, along the slope
    for (const x of [-30000, 0, 30000]) {
      expect(field.overlap(new THREE.Vector3(x, flank(x) - 200, -40000), 10), `${x} under`).not.toBeNull();
      expect(field.overlap(new THREE.Vector3(x, flank(x) + 200, -40000), 10), `${x} over`).toBeNull();
    }
  });

  it('tells a ray that meets a claim’s buoy from one that meets its rock', () => {
    const field = testField();
    field.generate(place.layout);
    const plan = planMining(field);
    standClaims(field, plan);
    const { slot, at } = plan.buoys[0];
    const rock = field.asteroids.get(plan.ids[slot])!;
    rock.object.updateWorldMatrix(true, false);
    const can = at.clone().applyMatrix4(rock.object.matrixWorld);
    // from straight above the can, down onto it
    const hit = field.raycast(can.clone().add(new THREE.Vector3(0, 4000, 0)), new THREE.Vector3(0, -1, 0), 8000);
    expect(hit?.asteroid).toBe(rock);
    expect(hit?.part).toBe(true);
    // from the far side of the rock, at its middle, onto the rock itself
    const away = rock.object.position.clone().sub(can).setY(0).normalize();
    const bare = field.raycast(rock.object.position.clone().addScaledVector(away, rock.radius * 3), away.clone().negate(), rock.radius * 3);
    expect(bare?.asteroid).toBe(rock);
    expect(bare?.part).toBe(false);
  });

  it('prints the clone over the flank, clear of every piece', () => {
    const field = testField();
    field.generate(place.layout);
    const start = new THREE.Vector3(...place.start!.at);
    expect(start.y).toBeGreaterThan(flank(start.x) + 4000);
    expect(field.overlap(start, 500)).toBeNull();
  });
});
