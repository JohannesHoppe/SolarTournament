import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../world/arenas';
import { NOVA_RADIUS } from './items';
import { SELF_DESTRUCT_RADIUS } from './hangar';
import { SINK_BLAST } from './fleet';
import { testField } from '../test/field';
import { BLAST_STEP, blastBreaks, blastClock, blastEnergy, blastTime, breakReach } from './blasts';
import { BREAK_STEP } from './comet';

/** Meters to units (1 unit = 5 cm). */
const m = (meters: number) => meters * 20;

describe('big blasts by their energy', () => {
  it("break rock on the comet's grid of field time", () => {
    expect(BLAST_STEP).toBe(BREAK_STEP);
  });

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

  it('breaks the same pieces at the field time the sender names, however late a browser heard of it', () => {
    // the Event Horizon's pieces circle the hole at thousands of units a second: a lag shows at once
    const hole = ARENAS.find((a) => a.id === 'hole')!.layout;
    const sender = testField();
    const late = testField();
    sender.generate(hole);
    late.generate(hole);
    const clock = 61.2345;
    const at = blastClock(clock);
    sender.setClock(clock);
    // the message of the blast arrives half a second later
    late.setClock(clock + 0.5);
    const rock = [...sender.asteroids.values()].filter((r) => !r.solid && !r.ground && r.kind === 'rock').sort((p, q) => p.meanRadius - q.meanRadius)[0];
    // a nova just inside the smallest rock's reach of it where it is at the blast's field time, behind it on its way
    const reach = breakReach(blastEnergy(NOVA_RADIUS), rock.meanRadius, 'rock');
    const there = sender.positionOf(rock, at, new THREE.Vector3());
    const behind = there.clone().sub(sender.positionOf(rock, at + 0.5, new THREE.Vector3())).normalize();
    const center = there.clone().addScaledVector(behind, reach * 0.95);
    expect(late.positionOf(late.asteroids.get(rock.id)!, late.clock, new THREE.Vector3()).distanceTo(center)).toBeGreaterThan(reach);
    const one = blastBreaks(sender, center, blastEnergy(NOVA_RADIUS), blastTime(at)).map((r) => r.id);
    const two = blastBreaks(late, center, blastEnergy(NOVA_RADIUS), blastTime(+at.toFixed(3))).map((r) => r.id);
    expect(one).toContain(rock.id);
    expect(two).toEqual(one);
    for (const id of one) expect(late.brokeAt(id)).toBe(sender.brokeAt(id));
    expect([...late.asteroids.keys()].sort()).toEqual([...sender.asteroids.keys()].sort());
    // each piece is drawn where the field's clock puts it again
    for (const piece of late.asteroids.values()) expect(piece.object.position.distanceTo(late.positionOf(piece, late.clock, new THREE.Vector3()))).toBeLessThan(1e-6);
  });
});
