import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { testField } from '../test/field';
import { arenaById } from './arenas';
import { EASE_SECONDS, KNOCKED, type AsteroidField } from './asteroids';
import { FieldContacts } from './contacts';
import { EASE_REACH, fieldSlice, SYNC_EVERY, SYNC_SLICES, syncField } from './fieldsync';
import { Randomizer } from '../random';
import { fieldSync } from '../net/validate';
import type { FractureSet } from './fracture';

/** Every piece's place, turn and hits at the field's clock, to compare two fields (to 5 cm and a thousandth of a radian). */
function stateOf(field: AsteroidField) {
  return [...field.asteroids.values()].map((a) => [a.id, a.hitPoints, ...a.object.position.toArray().map((x) => Math.round(x)), ...a.object.quaternion.toArray().map((x) => x.toFixed(3))].join(' ')).sort();
}

/** The lead meets its pieces, and the follower takes each knock as the game does (see Game.remoteKnock): unless it is older than the piece's own motion. */
function knock(lead: AsteroidField, follower: AsteroidField, contacts: FieldContacts) {
  for (const state of contacts.run(lead)) {
    const piece = follower.asteroids.get(state.id);
    if (piece && state.b >= piece.born - 0.002) follower.move(state);
  }
}

/** A whole cycle of the lead's slices, each a second of field time apart, taken by the follower (both fields running on). */
function cycle(lead: AsteroidField, follower: AsteroidField, contacts: FieldContacts) {
  for (let i = 0; i < SYNC_SLICES; i++) {
    for (let frame = 0; frame < 60 * SYNC_EVERY; frame++) {
      lead.update(1 / 60);
      follower.update(1 / 60);
      knock(lead, follower, contacts);
    }
    // through the wire
    syncField(follower, JSON.parse(JSON.stringify(fieldSlice(lead, i))));
  }
  // the last corrections glide in
  for (let frame = 0; frame <= 60 * EASE_SECONDS; frame++) {
    lead.update(1 / 60);
    follower.update(1 / 60);
    knock(lead, follower, contacts);
  }
}

describe("the lead's sync of the field", () => {
  it('brings a follower whose field drifted (a knock it missed, a break out of order, one it never heard) back to the lead within a cycle', () => {
    const arena = arenaById('rings')!;
    const lead = testField();
    const follower = testField();
    for (const field of [lead, follower]) field.generate(arena.layout);
    const contacts = new FieldContacts();
    // both run 20 s alike
    for (let t = 0; t < 20 * 60; t++) {
      lead.update(1 / 60);
      follower.update(1 / 60);
      knock(lead, follower, contacts);
    }
    const ids = [...lead.asteroids.values()].filter((a) => !a.solid).map((a) => a.id).sort();
    const r = new Randomizer(4);
    const pick = () => ids.splice(r.nextInt() % ids.length, 1)[0];
    // a knock only the lead took, 30 m off
    const knocked = pick();
    const piece = lead.asteroids.get(knocked)!;
    lead.move({ id: knocked, b: lead.clock, p: piece.object.position.clone().add(new THREE.Vector3(600, 0, 0)).toArray(), v: [300, 0, 0], q: piece.object.quaternion.toArray(), s: [0, 1, 0, 0.1], c: KNOCKED });
    // a break only the lead heard of, and one each browser dated differently
    lead.shatter(pick(), lead.clock - 5);
    const late = pick();
    lead.shatter(late, lead.clock - 4);
    follower.shatter(late, follower.clock - 3);
    // a break only the follower made, the lead never heard of
    follower.shatter(pick(), follower.clock - 6);
    expect(stateOf(follower)).not.toEqual(stateOf(lead));
    cycle(lead, follower, contacts);
    expect(stateOf(follower)).toEqual(stateOf(lead));
    // and they play on alike
    cycle(lead, follower, contacts);
    expect(stateOf(follower)).toEqual(stateOf(lead));
  }, 60000);

  it("leaves a newcomer's families whole whose pieces are not cut yet, never cutting them in the restore, and builds them from the lead's sync once they are", () => {
    const layout = arenaById('rings')!.layout;
    const lead = testField();
    lead.generate(layout);
    lead.setClock(30);
    const broken = [...lead.asteroids.values()].filter((a) => !a.solid).slice(0, 6).map((a) => a.id);
    for (const id of broken) lead.shatter(id, 10);
    for (const id of broken) lead.shatter(`${id}.1`, 20);
    const newcomer = testField();
    // the worker has cut nothing yet
    const fractures = (newcomer as unknown as { fractures: Record<string, FractureSet> }).fractures;
    let cut = false;
    const ready = vi.fn(() => cut);
    fractures.ice = { ...fractures.ice!, ready };
    const later = newcomer.restore(JSON.parse(JSON.stringify(lead.snapshot())), layout);
    expect([...later].sort()).toEqual([...broken].sort());
    for (const id of broken) expect(newcomer.familyOf(id).alive.map((a) => a.id)).toEqual([id]);
    // a sync while they are still being cut leaves them
    syncField(newcomer, fieldSlice(lead, lead.roots.indexOf(broken[0]) % SYNC_SLICES));
    expect(newcomer.familyOf(broken[0]).alive.map((a) => a.id)).toEqual([broken[0]]);
    // cut: a cycle of the lead's sync builds them as the lead has them
    cut = true;
    cycle(lead, newcomer, new FieldContacts());
    expect(stateOf(newcomer)).toEqual(stateOf(lead));
  }, 60000);

  it('eases a small correction in, and sets a large one at once', () => {
    const layout = arenaById('belt')!.layout;
    const [lead, follower] = [testField(), testField()];
    for (const field of [lead, follower]) field.generate(layout);
    const [near, far] = [...lead.asteroids.values()].filter((a) => !a.solid).map((a) => a.id);
    for (const [id, offset] of [
      [near, EASE_REACH / 2],
      [far, EASE_REACH * 3],
    ] as const) {
      const a = lead.asteroids.get(id)!;
      lead.move({ id, b: 0, p: a.basePosition.clone().add(new THREE.Vector3(0, offset, 0)).toArray(), v: [0, 0, 0], q: a.baseOrientation.toArray(), s: [...a.spinAxis.toArray(), a.spinRate], c: KNOCKED });
    }
    const index = (id: string) => lead.roots.indexOf(id) % SYNC_SLICES;
    const seen = follower.asteroids.get(near)!.object.position.clone();
    const result = syncField(follower, fieldSlice(lead, index(near)));
    const there = follower.asteroids.get(near)!;
    expect(result.eased).toBeGreaterThan(0);
    // still where it was seen, gliding over a second to where the lead has it
    expect(there.object.position.distanceTo(seen)).toBeLessThan(1);
    follower.update(0.5);
    lead.update(0.5);
    expect(there.object.position.distanceTo(lead.asteroids.get(near)!.object.position)).toBeCloseTo(EASE_REACH / 4, -1);
    follower.update(0.6);
    lead.update(0.6);
    expect(there.object.position.distanceTo(lead.asteroids.get(near)!.object.position)).toBeLessThan(1);
    const before = follower.revision;
    expect(syncField(follower, fieldSlice(lead, index(far))).set).toBeGreaterThan(0);
    expect(follower.asteroids.get(far)!.appeared).toBeGreaterThan(before);
  });

  it('sends a slice of a heavily broken Rings round well under the 64 KB a message may hold', () => {
    const field = testField();
    field.generate(arenaById('rings')!.layout);
    // every piece broken twice over and every piece left knocked
    for (let pass = 0; pass < 2; pass++) for (const a of [...field.asteroids.values()]) if (!a.solid) field.shatter(a.id, 10 + pass);
    for (const a of field.asteroids.values()) a.shovedBy = KNOCKED;
    let largest = 0;
    for (let i = 0; i < SYNC_SLICES; i++) largest = Math.max(largest, JSON.stringify({ s: fieldSlice(field, i), n: 3, h: [null, 120.5] }).length);
    console.log('largest slice', largest);
    expect(largest).toBeLessThan(32 * 1024);
    // and the check takes it
    expect(fieldSync(JSON.parse(JSON.stringify(fieldSlice(field, 0))))).not.toBeNull();
  });

  it('is refused by the check when forged or out of bounds', () => {
    const field = testField();
    field.generate(arenaById('belt')!.layout);
    const good = fieldSlice(field, 1);
    expect(fieldSync(good)).not.toBeNull();
    const forged = (change: (slice: ReturnType<typeof fieldSlice>) => void) => {
      const slice = JSON.parse(JSON.stringify(good));
      change(slice);
      return fieldSync(slice);
    };
    expect(forged((s) => (s.i = SYNC_SLICES))).toBeNull();
    expect(forged((s) => (s.f[0].r = 'x y'))).toBeNull();
    // a piece of another family, a hit count past any rock's
    expect(forged((s) => (s.f[0].a = [[`${s.f[1].r}.0`, 3]]))).toBeNull();
    expect(forged((s) => (s.f[0].a[0][1] = 5000))).toBeNull();
    expect(forged((s) => (s.f[0].m = [{ id: s.f[0].r, b: 1, p: [0, 0, 0], v: [1e9, 0, 0], q: [0, 0, 0, 1], s: [0, 1, 0, 0], c: KNOCKED }]))).toBeNull();
    expect(forged((s) => (s.f = Array.from({ length: 500 }, () => s.f[0])))).toBeNull();
  });
});
