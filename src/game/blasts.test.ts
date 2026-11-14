import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../world/arenas';
import { NOVA_RADIUS } from './items';
import { SELF_DESTRUCT_RADIUS } from './hangar';
import { SINK_BLAST } from './fleet';
import { testField } from '../test/field';
import { blastBreaks, blastEnergy, blastTime, breakReach } from './blasts';

/** Meters to units (1 unit = 5 cm). */
const m = (meters: number) => meters * 20;

describe('big blasts by their energy', () => {
  it('take their energy from how far they kill: a nova some 8e13 J, the battleship more, a self-destruct far less', () => {
    expect(blastEnergy(NOVA_RADIUS)).toBeGreaterThan(7e13);
    expect(blastEnergy(NOVA_RADIUS)).toBeLessThan(9e13);
    expect(blastEnergy(SINK_BLAST)).toBeGreaterThan(blastEnergy(NOVA_RADIUS));
    expect(blastEnergy(SELF_DESTRUCT_RADIUS) * 100).toBeLessThan(blastEnergy(NOVA_RADIUS));
  });

  it('break a 110 m rock within some 300 m of a nova, a small piece farther out, a big rock only close by, ice farther than rock', () => {
    const nova = blastEnergy(NOVA_RADIUS);
    expect(breakReach(nova, m(110), 'rock')).toBeGreaterThan(m(250));
    expect(breakReach(nova, m(110), 'rock')).toBeLessThan(m(350));
    expect(breakReach(nova, m(20), 'rock')).toBeGreaterThan(m(600));
    expect(breakReach(nova, m(350), 'rock')).toBeLessThan(m(200));
    expect(breakReach(nova, m(110), 'ice')).toBeGreaterThan(breakReach(nova, m(110), 'rock'));
    // a self-destruct breaks nothing of a belt rock's size
    expect(breakReach(blastEnergy(SELF_DESTRUCT_RADIUS), m(110), 'rock')).toBeLessThan(m(110));
  });

  it('breaks the same pieces at the same field time on every browser, and none shielded or out of reach', () => {
    const belt = ARENAS.find((a) => a.id === 'belt')!.layout;
    const a = testField();
    const b = testField();
    for (const f of [a, b]) {
      f.generate(belt);
      f.setClock(40);
    }
    // a nova right beside the smallest rock of the field
    const rock = [...a.asteroids.values()].filter((r) => !r.solid && !r.ground).sort((p, q) => p.meanRadius - q.meanRadius)[0];
    const at = blastTime(40.04);
    expect(at).toBeCloseTo(40, 6);
    const center = rock.object.position.clone().add(new THREE.Vector3(rock.radius + m(60), 0, 0));
    const one = blastBreaks(a, center, blastEnergy(NOVA_RADIUS), at).map((r) => r.id);
    const two = blastBreaks(b, center, blastEnergy(NOVA_RADIUS), at).map((r) => r.id);
    expect(one).toContain(rock.id);
    expect(two).toEqual(one);
    expect([...a.asteroids.keys()].sort()).toEqual([...b.asteroids.keys()].sort());
    // nothing beyond its reach broke
    for (const id of one) expect(a.brokeAt(id)).toBe(at);
    expect(blastBreaks(a, new THREE.Vector3(0, 1e7, 0), blastEnergy(NOVA_RADIUS), at)).toEqual([]);
  });
});
