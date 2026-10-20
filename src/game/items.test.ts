import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { packItems, Probes, unpackItems } from './items';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';

const scheduled = (elapsed: number) => {
  const field = testField();
  field.generate(ARENAS[0].layout);
  const probes = new Probes();
  probes.schedule(1234, 3, elapsed, field);
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
    probes.schedule(1, 0, 20, field);
    probes.take(probes.list[0]);
    probes.schedule(1, 0, 30, field);
    expect(probes.list).toHaveLength(0);
    // a newcomer that learns the taken ones does not show them either
    const newcomer = new Probes();
    for (const id of probes.takenIds()) newcomer.takeId(id);
    newcomer.schedule(1, 0, 30, field);
    expect(newcomer.list).toHaveLength(0);
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
