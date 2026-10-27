import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from './arenas';
import { ARENA_LIMIT } from './arena';
import { impostorDistance, IMPOSTOR_MIN, type FieldLayout } from './asteroids';
import { testField } from '../test/field';
import { DETAIL } from './rocks';

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

  it("lays the Rings' small chunks within the layer of grains, its large ones in the open space above and below", () => {
    const rings = ARENAS.find((a) => a.id === 'rings')!;
    const { layout } = rings;
    const field = testField();
    field.generate(layout);
    const pieces = [...field.asteroids.values()];
    expect(pieces).toHaveLength(layout.count + layout.open!.count);
    for (const piece of pieces) {
      const height = Math.abs(piece.object.position.y);
      if (Number(piece.id) < layout.count) expect(height).toBeLessThanOrEqual(rings.grains!);
      else {
        expect(height).toBeGreaterThanOrEqual(layout.open!.from);
        expect(height).toBeLessThanOrEqual(layout.open!.to);
        // clear of the layer, however it is turned
        expect(height - piece.radius).toBeGreaterThan(rings.grains!);
      }
    }
    // either side of it
    const open = pieces.filter((piece) => Number(piece.id) >= layout.count);
    expect(open.some((piece) => piece.object.position.y > 0) && open.some((piece) => piece.object.position.y < 0)).toBe(true);
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

describe('collision with a rock', () => {
  /** Four rock shapes alone in a field, each at the center, unturned, in the detail the game builds; a sample of the points of their surface. */
  const rocks = [0, 3, 9, 13].map((type) => {
    const field = testField(DETAIL);
    field.generate({ key: `rock${type}`, seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: 0, toughness: 800, placements: [{ kind: 'rock', type, scale: 1, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), solid: false }] });
    const rock = [...field.asteroids.values()][0];
    const mesh = rock.object as THREE.Mesh;
    const corners = mesh.geometry.getAttribute('position');
    const points = Array.from({ length: Math.floor(corners.count / 23) }, (_, k) => new THREE.Vector3().fromBufferAttribute(corners, k * 23).applyMatrix4(mesh.matrixWorld));
    return { field, rock, mesh, points };
  });

  it('touches where it is seen: just inside its surface is rock, a little outside is not', () => {
    for (const { field, rock, points } of rocks) {
      const center = rock.object.position;
      const share = (scale: number) => points.filter((p) => field.overlap(p.clone().sub(center).multiplyScalar(scale).add(center), 1)).length / points.length;
      expect(share(0.97), rock.id).toBeGreaterThan(0.97);
      expect(share(1.1), rock.id).toBeLessThan(0.05);
    }
  });

  it('stops a ray on its surface: never deep inside, rarely early', () => {
    const caster = new THREE.Raycaster();
    for (const { field, mesh, points } of rocks) {
      // a ray through the full mesh is slow: every fifth point of the sample
      const errors = points.filter((_, k) => k % 5 === 0).map((p) => {
        const direction = p.clone().normalize().negate();
        const origin = p.clone().addScaledVector(direction, -20000);
        caster.set(origin, direction);
        const seen = caster.intersectObject(mesh)[0].distance;
        return (field.raycast(origin, direction, 40000)!.distance - seen) / p.length();
      });
      expect(Math.max(...errors)).toBeLessThan(0.03);
      expect(errors.filter((e) => e > -0.05).length / errors.length).toBeGreaterThan(0.9);
    }
  });

  it('pushes a ship out onto its surface, and bounces it off along the slope', () => {
    for (const { field, rock, points } of rocks) {
      const center = rock.object.position;
      const inside = points[0].clone().sub(center).multiplyScalar(0.9).add(center);
      const normal = field.resolve(rock, inside, 300)!;
      expect(normal).not.toBeNull();
      // outward, and the ship now just touches the surface from outside
      expect(normal.dot(inside.clone().sub(center).normalize())).toBeGreaterThan(0.2);
      expect(field.overlap(inside.clone().addScaledVector(normal, 50), 300)).toBeNull();
    }
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

describe('a ray into the field', () => {
  it('writes its hit into the one it is given, the same hit as a fresh one', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const rock = [...field.asteroids.values()][0];
    const origin = rock.object.position.clone().add(new THREE.Vector3(0, 0, 40000));
    const direction = new THREE.Vector3(0, 0, -1);
    const fresh = field.raycast(origin, direction, 80000)!;
    const into = { asteroid: null, distance: 0, center: new THREE.Vector3() };
    const reused = field.raycast(origin, direction, 80000, false, into)!;
    expect(reused).toBe(into);
    expect(reused.asteroid).toBe(fresh.asteroid);
    expect(reused.distance).toBe(fresh.distance);
    expect(reused.center).toBe(fresh.center);
    expect(field.raycast(origin, direction.negate(), 1, false, into)).toBeNull();
  });
});

describe('the billboards of the field', () => {
  it('take over from no piece, however small, within the arena across', () => {
    const field = testField();
    const across = ARENA_LIMIT * 2;
    for (const arena of ARENAS) {
      field.generate(arena.layout);
      for (const piece of field.asteroids.values()) {
        // the piece, a fragment of it and a fragment of that (each 0.55 of its parent)
        for (const share of [1, 0.55, 0.55 * 0.55]) expect(impostorDistance(piece.meanRadius * share)).toBeGreaterThan(across);
      }
    }
    // a large rock keeps its billboard farther out yet, in proportion to its size
    expect(impostorDistance(IMPOSTOR_MIN)).toBeGreaterThan(IMPOSTOR_MIN * 10);
  });
});
