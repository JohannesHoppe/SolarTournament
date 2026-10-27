import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaById } from './arenas';
import { FACE_TOLERANCE, planMining } from './mining';
import { testField } from '../test/field';

const belt = arenaById('belt')!.layout;

function plan() {
  const field = testField();
  field.generate(belt);
  return { field, plan: planMining(field) };
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
      for (const rock of field.asteroids.values()) expect(rock.object.position.distanceTo(at)).toBeGreaterThan(rock.radius);
    }
  });
});
