import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from './arenas';
import type { FieldLayout } from './asteroids';
import { testField } from '../test/field';

const positions = (field: ReturnType<typeof testField>) => [...field.asteroids.values()].map((a) => `${a.id}:${a.object.position.toArray().map((v) => v.toFixed(3)).join(',')}`);

describe('the field of an arena', () => {
  it('is the same for the same layout, on every browser', () => {
    for (const arena of ARENAS.filter((a) => a.layout.kind !== 'hull' && a.layout.count > 0)) {
      const a = testField();
      const b = testField();
      a.generate(arena.layout);
      b.generate(arena.layout);
      a.setClock(37.5);
      b.setClock(37.5);
      expect(positions(a)).toEqual(positions(b));
    }
  });

  it('rebuilds a field from its snapshot: broken rocks, fragments, hits and field time', () => {
    const belt = ARENAS.find((a) => a.id === 'belt')!.layout;
    const lead = testField();
    lead.generate(belt);
    lead.setClock(12);
    // break one rock (and some of its fragments), and hit another once
    const [first, second] = [...lead.asteroids.keys()];
    while (lead.asteroids.has(first)) lead.hit(first, 12);
    lead.hit(`${first}.0`, 20);
    lead.hit(second, 21);
    lead.setClock(30);
    const newcomer = testField();
    newcomer.generate(belt);
    newcomer.restore(lead.snapshot(), belt);
    expect(positions(newcomer)).toEqual(positions(lead));
    expect(newcomer.asteroids.get(second)!.hitPoints).toBe(lead.asteroids.get(second)!.hitPoints);
  });

  it('carries circling rocks along their orbits', () => {
    const kessler = ARENAS.find((a) => a.id === 'kessler')!.layout;
    const field = testField();
    field.generate(kessler);
    const rock = field.asteroids.get('0')!;
    const start = rock.object.position.length();
    field.setClock(60);
    // an orbit keeps its distance from the center
    expect(rock.object.position.length()).toBeCloseTo(start, 0);
    expect(rock.object.position.distanceTo(rock.basePosition)).toBeGreaterThan(1000);
  });
});

describe('collision with a box piece', () => {
  const layout: FieldLayout = {
    key: 'test',
    seed: 1,
    kind: 'rock',
    count: 0,
    minScale: 1,
    maxScale: 1,
    radius: 1,
    inner: 0,
    spin: 0,
    toughness: 800,
    placements: [{ kind: 'hull', type: 0, scale: 1, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), solid: true }],
  };

  it('pushes a sphere out through the nearest face', () => {
    const field = testField();
    field.generate(layout);
    const center = new THREE.Vector3(0, 0, 150);
    const piece = field.overlap(center, 100)!;
    expect(piece).not.toBeNull();
    const normal = field.resolve(piece, center, 100)!;
    expect(normal.z).toBeCloseTo(1);
    // the box reaches 200 units out, the sphere's radius 100 more
    expect(center.z).toBeCloseTo(301);
  });

  it('stops a ray on the box face and misses beside it', () => {
    const field = testField();
    field.generate(layout);
    const hit = field.raycast(new THREE.Vector3(0, 0, 5000), new THREE.Vector3(0, 0, -1), 10000);
    expect(hit?.distance).toBeCloseTo(4800);
    expect(field.raycast(new THREE.Vector3(0, 300, 5000), new THREE.Vector3(0, 0, -1), 10000)).toBeNull();
  });

  it('never breaks a solid piece', () => {
    const field = testField();
    field.generate(layout);
    for (let i = 0; i < 2000; i++) field.hit('h0');
    expect(field.asteroids.has('h0')).toBe(true);
  });
});

describe('a massive body', () => {
  it('pulls, blocks the line of sight and kills', () => {
    const hole = ARENAS.find((a) => a.id === 'hole')!.layout;
    const field = testField();
    field.generate(hole);
    const near = field.gravity(new THREE.Vector3(10000, 0, 0)).length();
    const far = field.gravity(new THREE.Vector3(40000, 0, 0)).length();
    expect(near).toBeGreaterThan(far * 10);
    expect(field.lineOfSight(new THREE.Vector3(-20000, 0, 0), new THREE.Vector3(20000, 0, 0))).toBe(false);
    expect(field.insideWell(new THREE.Vector3(3000, 0, 0), 100)).toBe(true);
  });
});
