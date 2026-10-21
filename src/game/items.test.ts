import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { packItems, Probes, unpackItems } from './items';
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

  it('pack the items a clone holds into its state and back', () => {
    for (const twin of [false, true]) for (const plating of [0, 1, 2]) for (const nova of [false, true]) expect(unpackItems(packItems(twin, plating, nova))).toEqual({ twin, plating, nova });
  });
});
