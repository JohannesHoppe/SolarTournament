import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contents, packItems, placeBucket, Probes, unpackItems } from './items';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';

const scheduled = (elapsed: number) => {
  const field = testField();
  field.generate(ARENAS[0].layout);
  const probes = new Probes();
  probes.schedule(1234, 3, elapsed, elapsed, field);
  return probes.list.map((probe) => `${probe.id}:${probe.kind}:${probe.position.toArray().join()}`);
};

describe('probes', () => {
  it('show up alike on every browser for the same room, round and clock', () => {
    expect(scheduled(80)).toEqual(scheduled(80));
    // the first at 20 s, then every 25 s
    expect(scheduled(19)).toHaveLength(0);
    expect(scheduled(70)).toHaveLength(3);
  });

  it('lie on the track in a race', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const track = [new THREE.Vector3(30000, 0, 0), new THREE.Vector3(0, 0, 30000), new THREE.Vector3(-30000, 0, 0), new THREE.Vector3(0, 0, -30000)];
    const probes = new Probes();
    probes.schedule(1234, 3, 120, 120, field, track);
    expect(probes.list.length).toBeGreaterThan(0);
    const along = new THREE.Line3();
    const closest = new THREE.Vector3();
    for (const probe of probes.list) {
      const near = track.some((gate, i) => along.set(gate, track[(i + 1) % track.length]).closestPointToPoint(probe.position, true, closest).distanceTo(probe.position) < 800 * Math.sqrt(3) + 1);
      expect(near).toBe(true);
    }
  });

  it('do not come back once taken', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const probes = new Probes();
    probes.schedule(1, 0, 20, 20, field);
    probes.take(probes.list[0]);
    probes.schedule(1, 0, 30, 30, field);
    expect(probes.list).toHaveLength(0);
    // a newcomer that learns the taken ones does not show them either
    const newcomer = new Probes();
    for (const id of probes.takenIds()) newcomer.takeId(id);
    newcomer.schedule(1, 0, 30, 30, field);
    expect(newcomer.list).toHaveLength(0);
  });

  it('are the same for a browser that ran the whole round and one that joins late', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const running = new Probes();
    for (let t = 0; t <= 200; t += 5) {
      running.schedule(7, 1, t, t, field);
      running.update(5, t, field);
      // at most four at once, however few are taken
      expect(running.list.length).toBeLessThanOrEqual(4);
      if (t === 130) running.take(running.list[0]);
    }
    const newcomer = new Probes();
    for (const id of running.takenIds()) newcomer.takeId(id);
    newcomer.schedule(7, 1, 200, 200, field);
    const ids = (probes: Probes) => probes.list.map((probe) => probe.id).sort();
    expect(ids(newcomer)).toEqual(ids(running));
  });

  it('pass to a newcomer as they are, and take no invented ids', () => {
    const lead = new Probes();
    lead.drop('p:abc', 2, ['nova'], new THREE.Vector3(5, 0, 0), new THREE.Vector3(0, 0, 0), 10);
    const newcomer = new Probes();
    newcomer.restore(lead.snapshot(12), 12);
    expect(newcomer.list.map((probe) => `${probe.id}:${probe.kind}:${probe.until}`)).toEqual(lead.list.map((probe) => `${probe.id}:${probe.kind}:${probe.until}`));
    const deaths = (ship: string) => (ship === 'p:abc' ? 2 : null);
    expect(newcomer.plausible('p:abc.2.0', 0, deaths)).toBe(true);
    expect(newcomer.plausible('p:abc.3.1', 0, deaths)).toBe(true);
    expect(newcomer.plausible('p:abc.9.0', 0, deaths)).toBe(false);
    expect(newcomer.plausible('p:xyz.1.0', 0, deaths)).toBe(false);
    expect(newcomer.plausible('r0.0', 0, deaths)).toBe(true);
    expect(newcomer.plausible('r0.7', 0, deaths)).toBe(false);
    expect(newcomer.plausible('r5.0', 0, deaths)).toBe(false);
  });

  it('fly out of a dead clone alike on every browser', () => {
    const drop = () => {
      const probes = new Probes();
      probes.drop('p:abc', 3, ['twin', 'plating'], new THREE.Vector3(100, 0, 0), new THREE.Vector3(0, 50, 0), 10);
      return probes.list.map((probe) => `${probe.id}:${probe.kind}:${probe.velocity.toArray().join()}`);
    };
    expect(drop()).toEqual(drop());
    expect(drop()).toHaveLength(2);
  });

  it('are sealed in a race, and give the last more than the leaders', () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    const track = [new THREE.Vector3(30000, 0, 0), new THREE.Vector3(0, 0, 30000), new THREE.Vector3(-30000, 0, 0), new THREE.Vector3(0, 0, -30000)];
    const probes = new Probes();
    probes.schedule(1234, 3, 120, 120, field, track);
    expect(probes.list.every((probe) => probe.luck !== null)).toBe(true);
    // a sealed probe passes to a newcomer sealed
    const newcomer = new Probes();
    newcomer.restore(probes.snapshot(120), 120);
    expect(newcomer.list.map((probe) => probe.luck)).toEqual(probes.list.map((probe) => probe.luck));
    // over many probes: the leaders never find a nova core, the last third does
    const sealed = (luck: number) => ({ ...probes.list[0], luck });
    const kinds = (bucket: number) => new Set(Array.from({ length: 200 }, (_, luck) => contents(sealed(luck * 7919), bucket)));
    expect(kinds(0).has('nova')).toBe(false);
    expect(kinds(2).has('nova')).toBe(true);
    // an open probe gives what it shows, whatever the place
    const open = { ...probes.list[0], luck: null, kind: 'twin' as const };
    expect([0, 1, 2].map((bucket) => contents(open, bucket))).toEqual(['twin', 'twin', 'twin']);
  });

  it('split a race into thirds by place', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((place) => placeBucket(place, 8))).toEqual([0, 0, 0, 1, 1, 2, 2, 2]);
    expect(placeBucket(0, 1)).toBe(1);
    expect([placeBucket(0, 2), placeBucket(1, 2)]).toEqual([0, 2]);
  });

  it('pack the items a clone holds into its state and back', () => {
    for (const twin of [false, true]) for (const plating of [0, 1, 2]) for (const nova of [false, true]) expect(unpackItems(packItems(twin, plating, nova))).toEqual({ twin, plating, nova });
  });
});
