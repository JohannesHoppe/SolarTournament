import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaById } from './arenas';
import { FACE_TOLERANCE, planMining } from './mining';
import { testField } from '../test/field';
import { DETAIL } from './rocks';

const belt = arenaById('belt')!.layout;

function plan() {
  const field = testField();
  field.generate(belt);
  return { field, plan: planMining(field) };
}

/** Every corner of a rig's or buoy's boxes lies within its rock's reach, from where the broad phases center the rock. */
function expectWithinReach(parts: readonly { half: THREE.Vector3; matrix: THREE.Matrix4 }[], rock: { object: THREE.Object3D; radius: number }) {
  for (const part of parts) {
    for (let k = 0; k < 8; k++) {
      const corner = new THREE.Vector3(k & 1 ? 1 : -1, k & 2 ? 1 : -1, k & 4 ? 1 : -1).multiply(part.half).applyMatrix4(part.matrix).applyMatrix4(rock.object.matrixWorld);
      expect(corner.distanceTo(rock.object.position)).toBeLessThanOrEqual(rock.radius + 1);
    }
  }
}

describe("the Rockborn's mining in the Belt", () => {
  it('stands on the same rocks in the same places on every browser', () => {
    const a = plan().plan;
    const b = plan().plan;
    expect(a.ids).toEqual(b.ids);
    expect(a.ids.length).toBeGreaterThan(0);
    for (const kit of ['steel', 'stone', 'glow', 'lights', 'beams', 'motes'] as const) {
      expect([...a[kit].attributes.get('position')!.values]).toEqual([...b[kit].attributes.get('position')!.values]);
    }
    expect(a.clouds).toEqual(b.clouds);
  });

  it('stands solid: a ship on a deck is pushed off it, a beam down a derrick ends on it, a rock reaches as far as its rig', () => {
    const { field, plan: p } = plan();
    const rigs = p.solids.filter((list) => list?.length);
    expect(rigs.length).toBeGreaterThan(5);
    const rock = field.asteroids.get(p.ids[0])!;
    // the deck: its middle in the world, and the way up out of it
    const deck = p.solids[0][0];
    const middle = new THREE.Vector3().applyMatrix4(deck.matrix).applyMatrix4(rock.object.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(deck.matrix).transformDirection(rock.object.matrixWorld);
    expect(field.overlap(middle, 340)).toBe(rock);
    const ship = middle.clone();
    // pushed out of the deck, and of the rock beneath it, over a few frames as a ship is
    expect(field.resolve(rock, ship, 340)).not.toBeNull();
    for (let frame = 0; frame < 4 && field.overlap(ship, 340); frame++) field.resolve(rock, ship, 340);
    expect(field.overlap(ship, 330)).toBeNull();
    expect(ship.distanceTo(middle)).toBeLessThan(2000);
    // from 500 m above the deck straight down: the derrick (46 m tall) stops the beam first
    const from = middle.clone().addScaledVector(up, 10000);
    const hit = field.raycast(from, up.clone().negate(), 20000)!;
    expect(hit.asteroid).toBe(rock);
    expect(hit.distance).toBeLessThan(10000 - 40 * 20);
    // nothing of the rig lies beyond the rock's reach
    expectWithinReach(p.solids[0], rock);
  });

  it("keeps every rig and buoy within its rock's reach from where the broad phases center it, at the collisions' detail", () => {
    const field = testField(DETAIL);
    field.generate(belt);
    const p = planMining(field);
    p.solids.forEach((parts, slot) => {
      expectWithinReach(parts ?? [], field.asteroids.get(p.ids[slot])!);
    });
  });

  it('claims whole rocks only, and every slot of the shaders at most once', () => {
    const { field, plan: p } = plan();
    expect(new Set(p.ids).size).toBe(p.ids.length);
    expect(p.ids.length).toBeLessThanOrEqual(12);
    for (const id of p.ids) expect(field.asteroids.get(id)!.generation).toBe(0);
  });

  it('cuts faces that never stand out of the rock by more than the tolerance', () => {
    const { field, plan: p } = plan();
    expect(p.faces.length).toBeGreaterThan(0);
    const direction = new THREE.Vector3();
    for (const face of p.faces) {
      const rock = field.asteroids.get(face.id)!;
      const mean = rock.meanRadius / rock.object.scale.x;
      const middle = rock.center.clone().addScaledVector(face.normal, face.height);
      for (const point of [middle, ...face.outline]) {
        direction.subVectors(point, rock.center);
        const out = direction.length() - rock.surface!.radius(direction);
        expect(out).toBeLessThanOrEqual(FACE_TOLERANCE * mean * 1.05);
      }
    }
  });

  it('drills its holes into the rock surface', () => {
    const { field, plan: p } = plan();
    expect(p.holes.length).toBeGreaterThan(0);
    for (const hole of p.holes) {
      const rock = field.asteroids.get(p.ids[hole.slot])!;
      const direction = hole.at.clone().sub(rock.center);
      expect(direction.length()).toBeCloseTo(rock.surface!.radius(direction), 3);
    }
  });

  it('keeps its dust clouds clear of the rocks', () => {
    const { field, plan: p } = plan();
    for (let i = 0; i < p.clouds.length; i += 8) {
      const at = new THREE.Vector3(p.clouds[i], p.clouds[i + 1], p.clouds[i + 2]);
      // a cloud's core (a third of its size) meets no rock's measured surface and no rig or buoy standing on one
      expect(field.overlap(at, p.clouds[i + 3] * 0.3), `cloud ${i / 8}`).toBeNull();
    }
  });
});
