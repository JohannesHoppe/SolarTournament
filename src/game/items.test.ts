import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contents, fieldSolid, packItems, placeBucket, PROBE_THRUST, Probes, unpackItems, type Solid } from './items';
import { floorOf, pullOn, type Anchor } from './hook';
import { MASS, type Body } from '../world/bodies';
import { MAX_SPEED } from '../ship/flight';
import type { Ship } from '../ship/ship';
import { ARENAS, arenaById } from '../world/arenas';
import { driftProbes, testField } from '../test/field';

const scheduled = (elapsed: number) => {
  const field = testField();
  field.generate(ARENAS[0].layout);
  const probes = new Probes();
  probes.schedule(1234, 3, elapsed, elapsed, field);
  return probes.list.map((probe) => `${probe.id}:${probe.kind}:${probe.position.toArray().join()}`);
};

/** A square course of four gates, 1.5 km out. */
const track = [new THREE.Vector3(30000, 0, 0), new THREE.Vector3(0, 0, 30000), new THREE.Vector3(-30000, 0, 0), new THREE.Vector3(0, 0, -30000)];

/** The probes of two minutes of a race on `track`. */
const raced = () => {
  const field = testField();
  field.generate(ARENAS[0].layout);
  const probes = new Probes();
  probes.schedule(1234, 3, 120, 120, field, track);
  return probes;
};

describe('probes', () => {
  it('show up alike on every browser for the same room, round and clock', () => {
    expect(scheduled(80)).toEqual(scheduled(80));
    // the first at 20 s, then every 25 s
    expect(scheduled(19)).toHaveLength(0);
    expect(scheduled(70)).toHaveLength(3);
  });

  it('lie on the track in a race', () => {
    const probes = raced();
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
      driftProbes(running, 5, t, field);
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

  it('lie at the same places on browsers whose field clocks differ by a jitter', () => {
    const places = (offset: number) => {
      const field = testField();
      field.generate(arenaById('junkyard')!.layout);
      const probes = new Probes();
      const list: string[] = [];
      for (let seed = 0; seed < 400; seed++) {
        probes.reset();
        field.setClock(95 + offset);
        probes.schedule(seed, 1, 95, 95, field);
        list.push(...probes.list.map((probe) => probe.position.toArray().join()));
      }
      return list;
    };
    expect(places(0.4)).toEqual(places(0));
  });

  it('keep their slots alike on every browser, whatever else this one sees them bounce off', () => {
    const field = testField();
    field.generate(arenaById('junkyard')!.layout);
    const browsers = [new Probes(), new Probes()];
    for (const probes of browsers) {
      probes.drop('p:abc', 0, ['repair'], new THREE.Vector3(0, 60000, 0), new THREE.Vector3(0, 0, 0), 0);
      probes.list[0].until = Infinity;
      probes.list[0].velocity.set(400, 0, 0);
      probes.list[0].slotVelocity.set(400, 0, 0);
    }
    // a core in tow only one of them has, grazing the probe's way 60 m along it
    const core = new THREE.Vector3(1200, 60450, 0);
    const towed: Solid = (position, radius, normal, moving) => {
      if (position.distanceTo(core) >= radius + 300) return false;
      normal.subVectors(position, core).normalize();
      position.copy(core).addScaledVector(normal, radius + 300);
      moving.set(0, 0, 0);
      return true;
    };
    const shared = [fieldSolid(field)];
    for (let t = 0; t < 10; t += DT) {
      browsers[0].update(DT, t, field, [...shared, towed], shared);
      browsers[1].update(DT, t, field, shared, shared);
    }
    const [here, there] = browsers.map((probes) => probes.list[0]);
    expect(here.slot.toArray()).toEqual(there.slot.toArray());
    // the one that bounced off flew back to its slot
    expect(here.astray).toBe(false);
    expect(here.position.distanceTo(there.position)).toBeLessThan(1);
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
    const probes = raced();
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

/** A ship's radius, and a ship at rest at `x` on the x axis, as a body and as the hook's owner. */
const RADIUS = 340;
const shipAt = (id: string, x = 0) => {
  const body: Body = { position: new THREE.Vector3(x, 0, 0), velocity: new THREE.Vector3(), mass: MASS.ship };
  return { body, ship: { id, radius: RADIUS } as unknown as Ship };
};
const DT = 1 / 120;
const LIMIT = MAX_SPEED * 2;

/** A probe 400 m off the origin, at rest on its slot, bitten by `hooker`'s hook. */
function hooked(hooker: Ship) {
  const field = testField();
  const probes = new Probes();
  probes.drop('x', 0, ['repair'], new THREE.Vector3(8000, 0, 0), new THREE.Vector3(), 0);
  const probe = probes.list[0];
  probes.park(probe, probe.position);
  probe.until = Infinity;
  probes.hook(probe, hooker);
  const anchor: Anchor = { rock: null, local: null, ship: null, mark: { team: -1, probe, position: probe.position } };
  return { field, probes, probe, floor: floorOf(hooker, anchor) };
}

/** One frame on the hooker's browser: the cable pulls ship and probe, the ship flies on, the probes move. Returns the cable's length. */
function reel(state: ReturnType<typeof hooked>, ship: Body, length: number, t: number) {
  const next = pullOn(ship, state.probe, length, true, state.floor, LIMIT, DT, 'moved');
  ship.position.addScaledVector(ship.velocity, DT);
  driftProbes(state.probes, DT, t, state.field);
  return next;
}

describe('a probe on the hook', () => {
  it('is reeled in to the ship over time and taken only when it arrives', () => {
    const { body, ship } = shipAt('a');
    const state = hooked(ship);
    let length: number | null = 8000;
    let arrived = -1;
    for (let t = 0; t < 5 && arrived < 0; t += DT) {
      length = reel(state, body, length!, t);
      expect(length).not.toBeNull();
      if (state.probes.touching(body.position, RADIUS)) arrived = t;
    }
    // not at once: half a tonne on 400 m of cable at 32 g, braked to arrive gently, takes some two and a half seconds
    expect(arrived).toBeGreaterThan(1);
    expect(arrived).toBeLessThan(3);
    // the ship hardly moved for it: half a tonne against sixty
    expect(body.position.length()).toBeLessThan(100);
  });

  it('goes to another ship that touches it on the way first', () => {
    const { body, ship } = shipAt('a');
    const thief = shipAt('b', 4000);
    thief.body.position.y = 200;
    const state = hooked(ship);
    let length: number | null = 8000;
    let first: string | null = null;
    for (let t = 0; t < 5 && !first; t += DT) {
      length = reel(state, body, length!, t);
      if (state.probes.touching(thief.body.position, RADIUS)) first = 'thief';
      else if (state.probes.touching(body.position, RADIUS)) first = 'hooker';
    }
    expect(first).toBe('thief');
  });

  it('is pulled alike on a browser that only hears of the hooker', () => {
    const { body, ship } = shipAt('a');
    const here = hooked(ship);
    const there = hooked(ship);
    // there, the hooker's ship is where its states put it: here's, a frame late
    const told: Body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: MASS.ship };
    let length: number | null = 8000;
    let lengthThere: number | null = 8000;
    let gap = 0;
    for (let t = 0; t < 1.2; t += DT) {
      told.position.copy(body.position);
      told.velocity.copy(body.velocity);
      length = reel(here, body, length!, t);
      lengthThere = pullOn(there.probe, told, lengthThere!, true, there.floor, LIMIT, DT, 'elsewhere');
      driftProbes(there.probes, DT, t, there.field);
      gap = Math.max(gap, here.probe.position.distanceTo(there.probe.position));
    }
    // within a few meters all the way in
    expect(gap).toBeLessThan(100);
  });

  it('drifts on when its hooker dies, then flies back to its slot', () => {
    const { body, ship } = shipAt('a');
    const state = hooked(ship);
    let length: number | null = 8000;
    let t = 0;
    for (; t < 0.6; t += DT) length = reel(state, body, length!, t);
    const { probe, probes, field } = state;
    const speed = probe.velocity.clone();
    expect(speed.length()).toBeGreaterThan(1000);
    // the hooker is shot: the cable is gone, the probe keeps its speed for the moment
    probes.letGo(probe, ship);
    driftProbes(probes, DT, (t += DT), field);
    expect(probe.velocity.distanceTo(speed)).toBeLessThan(PROBE_THRUST * DT * 1.01);
    expect(probe.astray).toBe(true);
    // then its thrusters bring it back to its slot, where every browser has it
    for (const end = t + 20; t < end && probe.astray; t += DT) driftProbes(probes, DT, t, field);
    expect(probe.astray).toBe(false);
    expect(probe.position.toArray()).toEqual([8000, 0, 0]);
    expect(probe.velocity.length()).toBe(0);
  });
});
