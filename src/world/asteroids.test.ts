import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS, RING_SHEET } from './arenas';
import { ARENA_LIMIT } from './arena';
import { impostorDistance, IMPOSTOR_MIN, KNOCKED, SPIN_RATE, type AsteroidField, type FieldLayout } from './asteroids';
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

  it("lays the Rings' small chunks within the layer of grains and the ring's sheet, its large ones in the open space above and below", () => {
    const rings = ARENAS.find((a) => a.id === 'rings')!;
    const { layout } = rings;
    const field = testField();
    field.generate(layout);
    const pieces = [...field.asteroids.values()];
    expect(pieces).toHaveLength(layout.count + layout.open!.count);
    for (const piece of pieces) {
      const height = Math.abs(piece.object.position.y);
      if (Number(piece.id) < layout.count) {
        expect(height).toBeLessThanOrEqual(rings.grains!);
        // between the faces of the ring's sheet, however it is turned, so the sheet never cuts it
        expect(height + piece.radius).toBeLessThan(RING_SHEET);
      } else {
        expect(height).toBeGreaterThanOrEqual(layout.open!.from);
        expect(height).toBeLessThanOrEqual(layout.open!.to);
        // clear of the layer and beyond the sheet, however it is turned
        expect(height - piece.radius).toBeGreaterThan(rings.grains!);
        expect(height - piece.radius).toBeGreaterThan(RING_SHEET);
      }
    }
    // either side of it
    const open = pieces.filter((piece) => Number(piece.id) >= layout.count);
    expect(open.some((piece) => piece.object.position.y > 0) && open.some((piece) => piece.object.position.y < 0)).toBe(true);
  });

  it('carries circling rocks along their orbits', () => {
    const junkyard = ARENAS.find((a) => a.id === 'junkyard')!.layout;
    const field = testField();
    field.generate(junkyard);
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

describe('a rock that breaks', () => {
  /** A spinning rock alone, turned, as a field of its own in the detail the game measures collisions at; the points of its surface a sample of rays from all around finds. */
  const lone = (type: number) => {
    const field = testField(DETAIL);
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, -1.3, 0.4));
    field.generate({ key: `lone${type}`, seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: SPIN_RATE, toughness: 800, placements: [{ kind: 'rock', type, scale: 4, position: new THREE.Vector3(1000, -2000, 500), orientation, solid: false }] });
    field.setClock(20);
    const rock = field.asteroids.get('h0')!;
    const center = rock.object.position.clone();
    const points: THREE.Vector3[] = [];
    for (let k = 0; k < 300; k++) {
      // a spiral of directions over the sphere
      const y = 1 - (2 * (k + 0.5)) / 300, r = Math.sqrt(1 - y * y), a = k * 2.399963;
      const direction = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const origin = center.clone().addScaledVector(direction, rock.radius * 2);
      const hit = field.raycast(origin, direction.clone().negate(), rock.radius * 2);
      if (hit) points.push(origin.addScaledVector(direction, -hit.distance));
    }
    return { field, rock, center, points };
  };
  /** The share of points, moved towards or away from the center by `scale`, that some piece of the field touches. */
  const touched = (field: AsteroidField, center: THREE.Vector3, points: THREE.Vector3[], scale: number) => points.filter((p) => field.overlap(p.clone().sub(center).multiplyScalar(scale).add(center), 1)).length / points.length;

  it('breaks where its motion starts when the break is dated before a knock it took, never where it would have been before it', () => {
    const field = testField();
    field.generate({ key: 'knocked', seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: 0, toughness: 800, placements: [{ kind: 'rock', type: 3, scale: 2, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), solid: false }] });
    const rock = field.asteroids.get('h0')!;
    // knocked at field time 10 from 5 km away, drifting at 150 m/s
    field.move({ id: 'h0', b: 10, p: [100000, 0, 0], v: [3000, 0, 0], q: [0, 0, 0, 1], s: [0, 1, 0, 0], c: KNOCKED });
    field.setClock(10.5);
    field.shatter('h0', 8);
    expect(field.brokeAt('h0')).toBe(10);
    for (const piece of field.asteroids.values()) expect(piece.basePosition.distanceTo(new THREE.Vector3(100000, 0, 0))).toBeLessThan(rock.radius);
  });

  it('splits into pieces of itself that start where they lay: together they fill the rock, and nothing more', () => {
    for (const type of [1, 8, 14]) {
      const { field, rock, center, points } = lone(type);
      expect(points.length).toBeGreaterThan(280);
      const mass = rock.meanRadius ** 3;
      field.shatter('h0', 20);
      const pieces = [...field.asteroids.values()];
      expect(pieces.map((p) => p.id)).toEqual(['h0.0', 'h0.1', 'h0.2']);
      // just inside the rock's surface is a piece, a little outside none
      expect(touched(field, center, points, 0.96), `${type}`).toBeGreaterThan(0.95);
      expect(touched(field, center, points, 1.08), `${type}`).toBeLessThan(0.05);
      // a piece's mass from its share of the rock's volume: the pieces weigh what the rock did
      expect(pieces.reduce((sum, p) => sum + p.meanRadius ** 3, 0) / mass).toBeCloseTo(1, 2);
      // they fly apart from the rock's center, at a few meters a second over what its drift and spin gave them
      for (const piece of pieces) {
        const own = field.surfaceVelocity(rock, piece.object.position);
        const push = piece.velocity.clone().sub(own);
        expect(push.length()).toBeGreaterThan(80);
        expect(push.length()).toBeLessThan(220);
        expect(push.dot(piece.object.position.clone().sub(center))).toBeGreaterThan(0);
      }
    }
  });

  it('breaks again into pieces of the piece, which break no more', () => {
    const { field, center, points } = lone(5);
    field.shatter('h0', 20);
    field.shatter('h0.1', 20);
    const ids = [...field.asteroids.keys()];
    expect(ids.filter((id) => id.startsWith('h0.1.')).length).toBeGreaterThanOrEqual(2);
    expect(field.asteroids.get('h0.1.0')!.generation).toBe(2);
    // at the moment of the second break the pieces still fill the rock
    expect(touched(field, center, points, 0.96)).toBeGreaterThan(0.95);
    expect(touched(field, center, points, 1.08)).toBeLessThan(0.05);
    field.shatter('h0.1.0', 20);
    expect([...field.asteroids.keys()].some((id) => id.startsWith('h0.1.0.'))).toBe(false);
  });

  it('breaks into the same pieces in the same places on every browser, and a newcomer gets them from the snapshot', () => {
    const belt = ARENAS.find((a) => a.id === 'belt')!.layout;
    const lead = testField();
    const other = testField();
    for (const field of [lead, other]) {
      field.generate(belt);
      field.setClock(12);
      field.shatter('3', 12);
      field.setClock(15);
      field.shatter('3.2', 15);
      field.setClock(25);
    }
    expect(positions(other)).toEqual(positions(lead));
    const newcomer = testField();
    newcomer.generate(belt);
    newcomer.restore(lead.snapshot(), belt);
    expect(positions(newcomer)).toEqual(positions(lead));
    const quaternions = (f: AsteroidField) => [...f.asteroids.values()].map((a) => a.object.quaternion.toArray().map((v) => v.toFixed(5)).join(','));
    expect(quaternions(newcomer)).toEqual(quaternions(lead));
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
        // the piece, a piece of it and a piece of that (each at least a ninth of its parent's volume, see fracture.test)
        for (const share of [1, Math.cbrt(1 / 9), Math.cbrt(1 / 81)]) expect(impostorDistance(piece.meanRadius * share)).toBeGreaterThan(across);
      }
    }
    // a large rock keeps its billboard farther out yet, in proportion to its size
    expect(impostorDistance(IMPOSTOR_MIN)).toBeGreaterThan(IMPOSTOR_MIN * 10);
  });
});
