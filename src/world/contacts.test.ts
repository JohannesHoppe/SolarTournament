import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { testField } from '../test/field';
import { DISTANT_DETAIL } from './rocks';
import { HULL_BOXES } from './shapes';
import { ARENAS, arenaById, type ArenaProfile } from './arenas';
import { depthBetween, FieldContacts, ringFixture } from './contacts';
import { ringRim } from './gates';
import { KNOCKED, type Asteroid, type AsteroidField } from './asteroids';
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
    // the smallest pieces crumble after the contacts of the frame, as in the game
    field.crumble();
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

describe('a break heard late', () => {
  it("lets the pieces of a rock another Host broke a round trip ago part as they would have, never knocking them apart", () => {
    /** The knocks the pieces of 20 rocks give each other within 2 s of their breaks, each break dated `late` seconds before the lead hears of it. */
    const knocks = (late: number) => {
      const field = fieldOf(arenaById('junkyard')!);
      const contacts = new FieldContacts();
      const r = new Randomizer(8);
      let count = 0;
      for (let k = 0; k < 20; k++) {
        field.update(1);
        contacts.run(field);
        const ids = [...field.asteroids.values()].filter((a) => !a.solid && a.generation === 0).map((a) => a.id);
        const id = ids[r.nextInt() % ids.length];
        field.shatter(id, field.clock - late);
        for (let frame = 0; frame < 120; frame++) {
          field.update(1 / 60);
          for (const state of contacts.run(field)) if (state.id.startsWith(`${id}.`)) count++;
        }
      }
      return count;
    };
    const onTime = knocks(0);
    expect(knocks(0.25)).toBeLessThanOrEqual(onTime + 4);
  }, 60000);
});

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
    // pieces crumbled in the round, at the same field times
    const dust = (field: AsteroidField) => {
      const state = field.snapshot();
      return state.x.filter((x) => state.d?.includes(x.id)).map((x) => `${x.id} ${x.b}`).sort();
    };
    expect(dust(steady.field).length).toBeGreaterThan(0);
    expect(dust(ragged.field)).toEqual(dust(steady.field));
    // both at the round's end
    steady.field.setClock(ROUND);
    ragged.field.setClock(ROUND);
    expect(stateOf(ragged.field)).toEqual(stateOf(steady.field));
  }, 120000);

  it('never meets a piece once it crumbled, though the frame it crumbles in falls after that step', () => {
    /** The knocks a piece of a piece takes flying into a hull section just as it crumbles, the field run in frames of `frame` seconds. */
    const knocks = (frame: number) => {
      const field = testField();
      field.generate({ key: 'crumble', seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: 0, toughness: 800, placements: [
        { kind: 'rock', type: 0, scale: 4, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), solid: false },
        { kind: 'hull', type: 0, scale: 1, position: new THREE.Vector3(30000, 0, 0), orientation: new THREE.Quaternion(), solid: true },
      ] });
      field.shatter('h0', 10.05);
      field.shatter('h0.0', 10.05);
      const piece = field.asteroids.get('h0.0.0')!;
      for (const a of [...field.asteroids.values()]) if (a !== piece) field.pulverize(a.id, 10.05);
      // at 3 km/s, its center 30 m inside the hull's face (at 1,450 m) a tenth of a second after it crumbles, far off it a step before
      const crumbles = piece.crumbles;
      const face = 30000 - 1000;
      const speed = 60000;
      expect(piece.radius).toBeLessThan(speed * 0.1);
      field.move({ id: piece.id, b: crumbles - 1, p: [face + 600 - speed * 1.1, 0, 0], v: [speed, 0, 0], q: [0, 0, 0, 1], s: [0, 1, 0, 0], c: KNOCKED });
      const contacts = new FieldContacts();
      const states: number[] = [];
      for (let t = crumbles - 2; t < crumbles + 1; ) {
        t = Math.min(crumbles + 1, t + frame);
        field.setClock(t);
        for (const state of contacts.run(field)) if (state.id === piece.id) states.push(state.b);
        field.crumble();
      }
      expect(field.asteroids.has(piece.id)).toBe(false);
      return states;
    };
    expect(knocks(1 / 60)).toEqual([]);
    // a long frame that holds the steps on both sides of it
    expect(knocks(0.45)).toEqual([]);
  });

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
        const gap = contacts.gap(follower, piece, state.b);
        worst = Math.max(worst, knockShare(follower.positionOf(piece, state.b, at), told.fromArray(state.p), Math.hypot(...state.v), state.b - follower.clock, gap));
        checked++;
        follower.move(state);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.5);
    // a piece flung 60 m, off at 300 m/s, dated 5 s back, or 60 m clear of anything it could have struck, is not taken
    expect(knockShare(at.set(0, 0, 0), told.set(1200, 0, 0), 100, 0, 0)).toBeGreaterThan(1);
    expect(knockShare(at.set(0, 0, 0), told.set(10, 0, 0), 6000, 0, 0)).toBeGreaterThan(1);
    expect(knockShare(at.set(0, 0, 0), told.set(10, 0, 0), 100, -5, 0)).toBeGreaterThan(1);
    expect(knockShare(at.set(0, 0, 0), told.set(10, 0, 0), 100, 0, 1200)).toBeGreaterThan(1);
    // the junk lies apart: most of it flies alone, far from anything it could strike
    const gaps = [...follower.asteroids.values()].map((piece) => contacts.gap(follower, piece, follower.clock));
    expect(gaps.filter((gap) => gap > 1000).length).toBeGreaterThan(gaps.length / 2);
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
    // the whole meeting: an off-center blow sets them turning, and they may touch again a step
    // or two later before they part
    let moved = 0;
    while (field.clock < 60) {
      field.update(1 / 60);
      moved += contacts.run(field).length;
    }
    expect(moved).toBeGreaterThanOrEqual(2);
    const va = field.surfaceVelocity(a, a.object.position);
    const vb = field.surfaceVelocity(b, b.object.position);
    const after = va.clone().multiplyScalar(ma).addScaledVector(vb, mb);
    expect(after.distanceTo(before) / before.length()).toBeLessThan(1e-3);
    // they part, more slowly than they met: apart now and moving apart, or glancing off each
    // other (rock is irregular, the line they met on is rarely the line they flew on)
    expect(depthBetween(field, a, b)).toBe(0);
    const line = b.object.position.clone().sub(a.object.position).normalize();
    expect(vb.clone().sub(va).dot(line)).toBeGreaterThan(0);
    expect(vb.distanceTo(va)).toBeLessThan(400);
    expect(a.shovedBy).toBe(KNOCKED);
    expect(b.shovedBy).toBe(KNOCKED);
  });

  it('never adds energy: a spinning tip sweeping into a piece at rest leaves the two with less than they had', () => {
    /** Motion and spin together (kg·units²/s²), a piece taken as a ball of its mean radius (2/5 m r²). */
    const energy = (field: AsteroidField, pieces: Asteroid[]) =>
      pieces.reduce((sum, piece) => {
        const mass = massOf(piece);
        const speed = field.surfaceVelocity(piece, piece.object.position).length();
        return sum + 0.5 * mass * speed ** 2 + 0.5 * 0.4 * mass * piece.meanRadius ** 2 * piece.spinRate ** 2;
      }, 0);
    const random = new Randomizer(11);
    let trials = 0;
    for (let k = 0; k < 60 && trials < 8; k++) {
      const { field, a, b } = pair(0, 1, 1);
      a.spinAxis.set(random.range(-1, 1), random.range(-1, 1), random.range(-1, 1)).normalize();
      a.spinRate = 0.15;
      b.basePosition.set((a.radius + b.radius) * random.range(0.9, 0.98), 0, 0);
      field.setClock(0);
      if (depthBetween(field, a, b) > 0) continue;
      const before = energy(field, [a, b]);
      const contacts = new FieldContacts();
      let met = 0;
      // a turn and a half of the tip, and every touch on the way
      while (field.clock < 60) {
        field.update(1 / 60);
        met += contacts.run(field).length;
      }
      if (!met) continue;
      trials++;
      expect(energy(field, [a, b])).toBeLessThanOrEqual(before * 1.001);
    }
    expect(trials).toBeGreaterThan(3);
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
      // every frame's contacts, the first bounce's and those after it
      const moved = contacts.run(field).length;
      bounced ||= moved > 0;
    }
    expect(bounced).toBe(true);
    // short of the ring, closing on it at most a fifth of the speed it met it at: turned back,
    // or glancing off its rim (a blow off its center turns it as well)
    expect(a.object.position.x).toBeLessThan(center.x - ringRim(2000).inner);
    expect(field.surfaceVelocity(a, a.object.position).x).toBeLessThan(300 * 0.2);
  });
});
