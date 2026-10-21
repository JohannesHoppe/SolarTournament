import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { ADRIFT_SECONDS, BASE_RADIUS, Flags, type Flier } from './flags';

const belt = ARENAS.find((a) => a.id === 'belt')!.layout;

/** Flags in the belt, the same on every browser. */
function flags() {
  const field = testField();
  field.generate(belt);
  return { field, flags: new Flags(field, belt.seed) };
}

type Pilot = Flier & { alive: boolean; kind: 'bot' | 'host' };
/** A pilot, high above the field, far from bases and cores until a test moves it. */
const pilot = (id: string, kind: 'bot' | 'host' = 'bot'): Pilot => ({ id, alive: true, radius: 300, kind, flight: { position: new THREE.Vector3(0, 30000, 0), velocity: new THREE.Vector3() } });

describe('capture the flag', () => {
  it('lays out its bases alike on every browser, opposite each other and clear of rock', () => {
    const a = flags();
    const b = flags();
    expect(a.flags.bases.map((p) => p.toArray())).toEqual(b.flags.bases.map((p) => p.toArray()));
    expect(a.flags.bases[0].clone().add(a.flags.bases[1]).length()).toBeLessThan(1);
    for (const base of a.flags.bases) expect(a.field.overlap(base, BASE_RADIUS)).toBeNull();
  });

  it('spreads Hosts over both sides and evens the numbers out with bots', () => {
    const { flags: f } = flags();
    const ships = [pilot('host1', 'host'), pilot('host2', 'host'), ...Array.from({ length: 6 }, (_, i) => pilot(`bot${i}`))];
    f.lead(ships, 0);
    expect(f.teamOf('host1')).not.toBe(f.teamOf('host2'));
    expect(ships.filter((s) => f.teamOf(s.id) === 0).length).toBe(4);
    // two bots leave one side: a bot of the other side moves over
    const gone = ships.filter((s) => s.kind === 'bot' && f.teamOf(s.id) === 0).slice(0, 2);
    const left = ships.filter((s) => !gone.includes(s));
    f.lead(left, 1);
    const sides = [0, 1].map((team) => left.filter((s) => f.teamOf(s.id) === team).length);
    expect(Math.abs(sides[0] - sides[1])).toBeLessThan(2);
  });

  it('takes a core in tow, drops it with its carrier, sends it home, and captures', () => {
    const { flags: f } = flags();
    const orange = pilot('o', 'host');
    const blue = pilot('b');
    f.lead([orange, blue], 0);
    expect([f.teamOf('o'), f.teamOf('b')]).toEqual([0, 1]);
    // orange flies to blue's core and takes it
    orange.flight.position.copy(f.bases[1]);
    f.lead([orange, blue], 1);
    expect(f.cores[1].carrier).toBe('o');
    // and dies on the way home: the core drifts where it was
    orange.flight.position.set(0, 0, 0);
    f.update(0.1, [orange, blue], 1.1);
    orange.alive = false;
    f.lead([orange, blue], 2);
    expect(f.cores[1].carrier).toBeNull();
    expect(f.cores[1].home).toBe(false);
    // blue touches its own core adrift: it goes home
    blue.flight.position.copy(f.cores[1].position);
    f.lead([orange, blue], 3);
    expect(f.cores[1].home).toBe(true);
    // orange's next clone takes it again and brings it home
    orange.alive = true;
    blue.flight.position.set(0, 0, 0);
    orange.flight.position.copy(f.bases[1]);
    f.lead([orange, blue], 4);
    orange.flight.position.copy(f.bases[0]);
    f.lead([orange, blue], 5);
    expect(f.captures).toEqual([1, 0]);
    expect(f.cores[1].home).toBe(true);
    expect(f.takeEvents().map((e) => e.kind)).toEqual(['grab', 'drop', 'return', 'grab', 'capture']);
  });

  it('sends a core adrift home after a while', () => {
    const { flags: f } = flags();
    const orange = pilot('o', 'host');
    const blue = pilot('b');
    f.lead([orange, blue], 0);
    orange.flight.position.copy(f.bases[1]);
    f.lead([orange, blue], 1);
    orange.alive = false;
    f.lead([orange, blue], 2);
    f.lead([orange, blue], 2 + ADRIFT_SECONDS + 0.1);
    expect(f.cores[1].home).toBe(true);
  });

  it('is followed by the other browsers as the lead sends it', () => {
    const lead = flags().flags;
    const orange = pilot('o', 'host');
    const blue = pilot('b');
    lead.lead([orange, blue], 0);
    orange.flight.position.copy(lead.bases[1]);
    lead.lead([orange, blue], 1);
    const other = flags().flags;
    other.follow(JSON.parse(JSON.stringify(lead.toState())), 1);
    expect(other.teamOf('b')).toBe(1);
    expect(other.cores[1].carrier).toBe('o');
    // a browser that just came does not hear what happened before it
    expect(other.takeEvents()).toEqual([]);
    orange.flight.position.copy(lead.bases[0]);
    lead.lead([orange, blue], 2);
    other.follow(JSON.parse(JSON.stringify(lead.toState())), 2);
    expect(other.captures).toEqual([1, 0]);
    expect(other.takeEvents().map((e) => e.kind)).toEqual(['capture']);
  });
});
