import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { DISTANT_DETAIL } from './rocks';
import { HULL_BOXES } from './shapes';
import { ARENAS, arenaById, type ArenaProfile } from './arenas';
import { depthBetween, FieldContacts, ringFixture } from './contacts';
import { ringRim } from './gates';
import { KNOCKED, type AsteroidField } from './asteroids';
import { massOf } from './bodies';
import { Randomizer } from '../random';
import { knockShare } from '../net/plausible';
import { makeComet, roundComets, runDown, cometStart, cometEnd } from '../game/comet';

/** A round's length (s). */
const ROUND = 300;

/** The rocks broken in a round: one every fifteen seconds, each picked by the arena's seed. */
function breaksOf(): number[] {
  return Array.from({ length: ROUND / 15 }, (_, i) => 7.5 + i * 15);
}

/**
 * Plays a round of an arena's field: the given frame times, a rock broken at each of `breaks`
 * (at that very field time, whenever the frame falls), the round's comets running down what
 * stands in their way, the contacts met after every frame. `check` looks at the field once a
 * second.
 */
function play(arena: ArenaProfile, frames: () => number, until = ROUND, check?: (field: AsteroidField, contacts: FieldContacts) => void, field = fieldOf(arena), contacts = new FieldContacts()) {
  const r = new Randomizer(arena.layout.seed + 1);
  const comets = roundComets(arena.layout.seed, 1, field.well, false);
  const breaks = breaksOf();
  let next = 0;
  while (next < breaks.length && breaks[next] <= field.clock) {
    r.nextInt();
    next++;
  }
  let second = Math.floor(field.clock);
  while (field.clock < until) {
    field.update(Math.min(frames(), until - field.clock));
    while (next < breaks.length && breaks[next] <= field.clock) {
      const ids = [...field.asteroids.values()].filter((a) => !a.solid).map((a) => a.id).sort();
      const pick = r.nextInt();
      if (ids.length) field.shatter(ids[pick % ids.length], breaks[next]);
      next++;
    }
    for (const comet of comets) if (field.clock >= cometStart(comet) && field.clock <= cometEnd(comet)) runDown(comet, field, field.clock, () => {});
    contacts.run(field);
    if (check && Math.floor(field.clock) > second) {
      second = Math.floor(field.clock);
      check(field, contacts);
    }
  }
  return { field, contacts };
}

function fieldOf(arena: ArenaProfile) {
  const field = testField(DISTANT_DETAIL, HULL_BOXES);
  field.generate(arena.layout);
  return field;
}

/** Every piece's place and drift at the field's clock, for comparing two fields: to a millimeter and a millimeter a second (a snapshot rebuilds the fragments by other sums, alike to the last digits). */
function stateOf(field: AsteroidField) {
  return [...field.asteroids.values()].map((a) => [a.id, ...[...a.object.position.toArray(), ...a.velocity.toArray()].map((x) => (x / 50).toFixed(3))].join(' ')).sort();
}

describe('the field meets itself', () => {
  for (const arena of ARENAS) {
    it(`lets no two pieces of ${arena.id} lie in each other over a round, with its fragments and comets`, () => {
      // a pair is held to it once it was seen apart: siblings of a break and pieces the layout
      // left touching start in each other
      const apart = new Set<string>();
      let deepest = 0;
      let worst = '';
      const { contacts } = play(
        arena,
        () => 1 / 60,
        ROUND,
        (field) => {
          const pieces = [...field.asteroids.values()];
          for (let i = 0; i < pieces.length; i++) {
            for (let j = i + 1; j < pieces.length; j++) {
              const a = pieces[i];
              const b = pieces[j];
              const key = `${a.id}|${b.id}`;
              if (a.object.position.distanceTo(b.object.position) > a.radius + b.radius) {
                apart.add(key);
                continue;
              }
              const depth = depthBetween(field, a, b);
              if (depth <= 0) apart.add(key);
              else if (apart.has(key)) {
                const share = depth / Math.min(a.meanRadius, b.meanRadius);
                if (share > deepest) {
                  deepest = share;
                  worst = `${key} ${depth.toFixed(0)}`;
                }
              }
            }
          }
        },
      );
      console.log(arena.id, 'contacts', contacts.contacts, 'deepest', deepest.toFixed(3), worst);
      expect(deepest).toBeLessThan(0.1);
    }, 120000);
  }

  it('meets the same contacts at the same field times however the frames fall', () => {
    const arena = arenaById('junkyard')!;
    const steady = play(arena, () => 1 / 60);
    const random = new Randomizer(5);
    const ragged = play(arena, () => 1 / 144 + random.nextFloat() * (1 / 20 - 1 / 144));
    expect(steady.contacts.contacts).toBeGreaterThan(10);
    expect(ragged.contacts.contacts).toBe(steady.contacts.contacts);
    // both at the round's end
    steady.field.setClock(ROUND);
    ragged.field.setClock(ROUND);
    expect(stateOf(ragged.field)).toEqual(stateOf(steady.field));
  }, 120000);

  it('plays on alike after a snapshot taken halfway', () => {
    const arena = arenaById('belt')!;
    const whole = play(arena, () => 1 / 60);
    const half = play(arena, () => 1 / 60, ROUND / 2);
    const late = testField(DISTANT_DETAIL, HULL_BOXES);
    late.restore(JSON.parse(JSON.stringify(half.field.snapshot())), arena.layout);
    const rest = play(arena, () => 1 / 60, ROUND, undefined, late);
    expect(half.contacts.contacts).toBeGreaterThan(0);
    whole.field.setClock(ROUND);
    rest.field.setClock(ROUND);
    expect(stateOf(rest.field)).toEqual(stateOf(whole.field));
  }, 120000);
});

describe("the world ship's halves", () => {
  it('meet as two bodies when a comet sends one into the other, never sinking into each other', () => {
    const arena = arenaById('derelict')!;
    const field = fieldOf(arena);
    const pieces = [...field.asteroids.values()];
    const key = (a: { id: string }, b: { id: string }) => `${a.id}|${b.id}`;
    // the sections of a half overlap where they are joined: only how much deeper counts
    const joined = new Map<string, number>();
    for (const a of pieces) for (const b of pieces) if (a.id < b.id) joined.set(key(a, b), depthBetween(field, a, b));
    // a comet along x into the bow's middle, towards the stern
    const bow = field.asteroids.get('h1')!;
    const comet = makeComet(40, new THREE.Vector3(1, 0, 0), bow.object.position.clone(), 3);
    const contacts = new FieldContacts();
    let deepest = 0;
    while (field.clock < 240) {
      field.update(1 / 60);
      runDown(comet, field, field.clock, () => {});
      contacts.run(field);
      if (Math.round(field.clock * 60) % 30) continue;
      for (const a of pieces) for (const b of pieces) if (a.id < b.id && a.weld !== b.weld) deepest = Math.max(deepest, depthBetween(field, a, b) - joined.get(key(a, b))!);
    }
    const stern = field.asteroids.get('h5')!;
    expect(comet.broken).toBeLessThan(40);
    // the stern took its share of the blow, and neither half lies in the other
    expect(stern.velocity.x).toBeGreaterThan(0);
    expect(contacts.contacts).toBeGreaterThan(0);
    expect(deepest).toBeLessThan(200);
  }, 120000);
});

describe("the lead's word", () => {
  it('passes the check of a browser following it for every contact of a round, and fails a lie', () => {
    const arena = arenaById('junkyard')!;
    const lead = fieldOf(arena);
    const follower = fieldOf(arena);
    const contacts = new FieldContacts();
    const random = new Randomizer(3);
    const at = new THREE.Vector3();
    const told = new THREE.Vector3();
    let worst = 0;
    let checked = 0;
    while (lead.clock < ROUND) {
      lead.update(1 / 60);
      // the follower glides after the lead's field time, a frame of its own off
      follower.setClock(lead.clock - random.nextFloat() / 30);
      for (const state of contacts.run(lead)) {
        const piece = follower.asteroids.get(state.id)!;
        worst = Math.max(worst, knockShare(follower.positionOf(piece, state.b, at), told.fromArray(state.p), Math.hypot(...state.v)));
        checked++;
        follower.move(state);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.5);
    // a piece flung 60 m, or off at 300 m/s, is not taken
    expect(knockShare(at.set(0, 0, 0), told.set(1200, 0, 0), 100)).toBeGreaterThan(1);
    expect(knockShare(at.set(0, 0, 0), told.set(10, 0, 0), 6000)).toBeGreaterThan(1);
  }, 120000);
});

describe('a contact', () => {
  /** Two rocks of the Belt's shapes set up on a line, `a` drifting into `b` at `speed` (units/s). */
  function pair(speed: number, scaleA: number, scaleB: number) {
    const field = testField();
    field.generate({ key: 't', seed: 1, kind: 'rock', count: 2, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: 0, toughness: 800, placements: [] });
    const [a, b] = [...field.asteroids.values()];
    a.basePosition.set(0, 0, 0);
    b.basePosition.set(a.radius * scaleA + b.radius * scaleB + 200, 0, 0);
    a.velocity.set(speed, 0, 0);
    a.spinRate = b.spinRate = 0;
    field.setClock(0);
    return { field, a, b };
  }

  it('keeps the momentum of two pieces, and parts them at a fifth of the speed they met at', () => {
    const { field, a, b } = pair(400, 1, 1);
    const contacts = new FieldContacts();
    const ma = massOf(a);
    const mb = massOf(b);
    const before = a.velocity.clone().multiplyScalar(ma);
    let moved = 0;
    while (field.clock < 60 && moved === 0) {
      field.update(1 / 60);
      moved = contacts.run(field).length;
    }
    expect(moved).toBe(2);
    const va = field.surfaceVelocity(a, a.object.position);
    const vb = field.surfaceVelocity(b, b.object.position);
    const after = va.clone().multiplyScalar(ma).addScaledVector(vb, mb);
    expect(after.distanceTo(before) / before.length()).toBeLessThan(1e-3);
    // they part along the line they met on, more slowly than they met
    const parting = vb.x - va.x;
    expect(parting).toBeGreaterThan(0);
    expect(parting).toBeLessThan(400 * 0.5);
    expect(a.shovedBy).toBe(KNOCKED);
    expect(b.shovedBy).toBe(KNOCKED);
  });

  it("finds a piece's point in the middle of a ring's band, as in its housings", () => {
    const center = new THREE.Vector3(1000, 2000, -500);
    const ring = ringFixture(center, new THREE.Vector3(0, 0, 1), 2000);
    const rim = ringRim(2000);
    // halfway through the band's thickness, on its middle plane
    const point = center.clone().add(new THREE.Vector3(rim.inner + 100, 0, 0));
    const normal = new THREE.Vector3();
    expect(ring.touch(point, normal)).toBe(true);
    expect(normal.length()).toBeCloseTo(1);
  });

  it('bounces a ring off a piece drifting into it, never through it', () => {
    const { field, a, b } = pair(300, 1, 1);
    // the second rock out of the way, a ring standing across the first one's path, its band
    // square to it
    b.basePosition.set(0, 1e6, 0);
    const center = new THREE.Vector3(a.radius + 3000 + ringRim(2000).outer, 0, 0);
    const contacts = new FieldContacts();
    contacts.fixtures = [ringFixture(center, new THREE.Vector3(0, 0, 1), 2000)];
    field.setClock(0);
    let bounced = false;
    while (field.clock < 120) {
      field.update(1 / 60);
      bounced ||= contacts.run(field).length > 0;
    }
    expect(bounced).toBe(true);
    // turned back, and short of the ring
    expect(field.surfaceVelocity(a, a.object.position).x).toBeLessThan(0);
    expect(a.object.position.x).toBeLessThan(center.x - ringRim(2000).inner);
  });
});
