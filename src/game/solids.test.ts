import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HEAD_RADIUS } from './comet';
import { CORE_REACH } from './flags';
import { PROBE_RADIUS } from './items';
import { BEAM_STOPS, PROBE_BOUNCES, pushesOf, rayOf, SHOWER_BURSTS, solidTable, TORPEDO_FUSE, touchOf, WRECK_GRINDS, type SolidKindName, type SolidSources } from './solids';
import { TORPEDO_RADIUS } from './torpedoes';

const v = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A ring's housing as a slab 10 units thick about the plane x = 0, far away unless placed. */
function world(place: Partial<Record<SolidKindName, THREE.Vector3>>) {
  const shooter = { name: 'salvo' };
  const sources: SolidSources = {
    rings: {
      touch(position, radius, normal) {
        const ring = place.ring;
        if (!ring || Math.abs(position.x - ring.x) >= 10 + radius) return false;
        const side = position.x >= ring.x ? 1 : -1;
        normal.set(side, 0, 0);
        position.x = ring.x + side * (10 + radius);
        return true;
      },
      ray(origin, direction, max) {
        const ring = place.ring;
        if (!ring || direction.x <= 0) return null;
        const distance = (ring.x - 10 - origin.x) / direction.x;
        return distance >= 0 && distance < max ? distance : null;
      },
    },
    cores: () => (place.core ? [{ position: place.core, velocity: v(0, 5) }] : []),
    wreck: (position, radius) => (place.wreck && place.wreck.distanceTo(position) < 50 + radius ? { mesh: { position: place.wreck }, radius: 50, velocity: v(0, 0, 7) } : null),
    probes: () => (place.probe ? [{ position: place.probe }] : []),
    torpedoes: () => (place.torpedo ? [{ position: place.torpedo, shooter }] : []),
    head: (out) => (place.head ? out.copy(place.head) : null),
  };
  return { table: solidTable(sources), shooter };
}

const USES = { PROBE_BOUNCES, BEAM_STOPS, WRECK_GRINDS, TORPEDO_FUSE, SHOWER_BURSTS };
const KINDS: SolidKindName[] = ['ring', 'core', 'wreck', 'probe', 'torpedo', 'head'];

describe('solids besides the field', () => {
  it('lets each use meet the kinds it names and no other', () => {
    const at = v(0);
    for (const kind of KINDS) {
      // a sphere of 5 units right at one solid of the kind
      const { table } = world({ [kind]: v(0) });
      expect(touchOf(table, TORPEDO_FUSE)(v(0), 5, at), kind).toBe(true);
      expect(touchOf(table, WRECK_GRINDS)(v(0), 5, at), kind).toBe(WRECK_GRINDS.includes(kind));
      expect(touchOf(table, SHOWER_BURSTS)(v(0), 5, at), kind).toBe(SHOWER_BURSTS.includes(kind));
    }
    // what the README lists for each
    expect([...PROBE_BOUNCES].sort()).toEqual(['core', 'ring', 'wreck']);
    expect([...BEAM_STOPS].sort()).toEqual(['core', 'head', 'probe', 'ring']);
    expect([...WRECK_GRINDS].sort()).toEqual(['core', 'head', 'ring']);
    expect([...TORPEDO_FUSE].sort()).toEqual([...KINDS].sort());
    expect([...SHOWER_BURSTS].sort()).toEqual(['core', 'ring', 'wreck']);
  });

  it('builds every use from the kinds that have its operation', () => {
    const { table } = world({});
    expect(() => pushesOf(table, PROBE_BOUNCES)).not.toThrow();
    expect(() => rayOf(table, BEAM_STOPS)).not.toThrow();
    for (const use of Object.values(USES)) expect(() => touchOf(table, use)).not.toThrow();
    // a torpedo has no push: a use naming it for one is a mistake
    expect(() => pushesOf(table, ['torpedo'])).toThrow();
  });

  it('touches a ball only within its reach plus the sphere, and leaves the sphere where it is', () => {
    const fuse = touchOf(world({ core: v(0), probe: v(10_000), head: v(-10_000) }).table, TORPEDO_FUSE);
    const position = v(CORE_REACH + 5 - 0.01);
    expect(fuse(position, 5)).toBe(true);
    expect(position.x).toBeCloseTo(CORE_REACH + 5 - 0.01);
    expect(fuse(v(CORE_REACH + 5), 5)).toBe(false);
    expect(fuse(v(10_000 + PROBE_RADIUS + 4.99), 5)).toBe(true);
    expect(fuse(v(-10_000 - HEAD_RADIUS - 4.99), 5)).toBe(true);
    expect(fuse(v(-10_000 - HEAD_RADIUS - 5), 5)).toBe(false);
  });

  it('passes a torpedo of the ignored shooter through, and sets off on another', () => {
    const { table, shooter } = world({ torpedo: v(0) });
    const fuse = touchOf(table, TORPEDO_FUSE);
    expect(fuse(v(TORPEDO_RADIUS), 1)).toBe(true);
    expect(fuse(v(TORPEDO_RADIUS), 1, undefined, shooter)).toBe(false);
    expect(fuse(v(TORPEDO_RADIUS), 1, undefined, { name: 'other' })).toBe(true);
  });

  it('says where a shower piece bursts: moved out of a ring, where it is at a ball', () => {
    const at = v(0);
    expect(touchOf(world({ ring: v(0) }).table, SHOWER_BURSTS)(v(3), 2, at)).toBe(true);
    expect(at.x).toBe(12);
    expect(touchOf(world({ core: v(0) }).table, SHOWER_BURSTS)(v(3), 2, at)).toBe(true);
    expect(at.x).toBe(3);
    // the head leads its own shower
    expect(touchOf(world({ head: v(0) }).table, SHOWER_BURSTS)(v(3), 2, at)).toBe(false);
  });

  it('stops a beam at the nearest solid it names within its reach', () => {
    const origin = v(-10_000);
    const along = v(1);
    const ray = rayOf(world({ ring: v(5000), core: v(0), probe: v(-5000), head: v(-2000) }).table, BEAM_STOPS);
    expect(ray(origin, along, 50_000)).toBeCloseTo(5000 - PROBE_RADIUS);
    expect(ray(origin, along, 1000)).toBe(null);
    expect(rayOf(world({ ring: v(5000), core: v(0), head: v(-2000) }).table, BEAM_STOPS)(origin, along, 50_000)).toBeCloseTo(8000 - HEAD_RADIUS);
    expect(rayOf(world({ ring: v(5000), core: v(0) }).table, BEAM_STOPS)(origin, along, 50_000)).toBeCloseTo(10_000 - CORE_REACH);
    expect(rayOf(world({ ring: v(5000) }).table, BEAM_STOPS)(origin, along, 50_000)).toBeCloseTo(14_990);
    expect(rayOf(world({ ring: v(5000) }).table, BEAM_STOPS)(origin, along, 14_990)).toBe(null);
  });

  it('pushes a probe out of a ring, wreckage and a core, with the speed of their surfaces', () => {
    const out = v(0);
    const moving = v(0);
    const pushes = (kind: SolidKindName, position: THREE.Vector3) => pushesOf(world({ [kind]: v(0) }).table, PROBE_BOUNCES).some((push) => push(position, PROBE_RADIUS, out, moving));
    const position = v(1);
    expect(pushes('ring', position)).toBe(true);
    expect(position.x).toBe(10 + PROBE_RADIUS);
    expect(moving.length()).toBe(0);
    position.set(1, 0, 0);
    expect(pushes('core', position)).toBe(true);
    expect(position.x).toBeCloseTo(CORE_REACH + PROBE_RADIUS);
    expect(out.toArray()).toEqual([1, 0, 0]);
    expect(moving.y).toBe(5);
    position.set(1, 0, 0);
    expect(pushes('wreck', position)).toBe(true);
    expect(position.x).toBeCloseTo(50 + PROBE_RADIUS);
    expect(moving.z).toBe(7);
    // a probe passes the comet's head (see PROBE_BOUNCES)
    position.set(1, 0, 0);
    expect(pushes('head', position)).toBe(false);
  });
});
