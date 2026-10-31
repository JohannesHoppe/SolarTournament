import { describe, expect, it } from 'vitest';
import { cleanName, fieldState, flagsState, fleetState, ids, shipState, shovedState, wreckStates } from './validate';
import { KNOCKED, RAMMED } from '../world/asteroids';
import { TINTS } from '../ship/tints';
import { MAX_LOOKS } from '../game/hangar';

const ship = {
  id: 'p:abc',
  p: [1, 2, 3],
  v: [0, 0, 0],
  q: [0, 0, 0, 1],
  w: [0, 0, 0],
  th: 0.5,
  a: true,
  h: 80,
  dr: 1,
  tr: 1,
  pr: 0,
};
const slow = { n: 'Nova', k: 'alien', s: 500, ki: 1, de: 2, g: 3, fi: -1, it: 3, lo: 6, co: 2, to: 4 };

describe('messages from other browsers', () => {
  it('take a valid ship state, with or without its slow part', () => {
    expect(shipState(ship)).not.toBeNull();
    expect(shipState({ ...ship, ...slow })?.n).toBe('Nova');
  });

  it('take kills and score below zero, which novas can bring about', () => {
    expect(shipState({ ...ship, ...slow, ki: -3, s: -1500 })?.ki).toBe(-3);
  });

  it('drop a ship state with only part of its slow part, a number that is not finite, or a broken quaternion', () => {
    expect(shipState({ ...ship, n: 'Nova' })).toBeNull();
    expect(shipState({ ...ship, h: Number.NaN })).toBeNull();
    expect(shipState({ ...ship, p: [1, 2, Infinity] })).toBeNull();
    expect(shipState({ ...ship, q: [0, 0, 0, 0] })).toBeNull();
    expect(shipState({ ...ship, ...slow, it: 16 })).toBeNull();
    // the looks and the radiators within what the hangar sells online
    expect(shipState({ ...ship, ...slow, lo: MAX_LOOKS })?.lo).toBe(MAX_LOOKS);
    expect(shipState({ ...ship, ...slow, lo: MAX_LOOKS + 1 })).toBeNull();
  });

  it('take the torpedoes a clone has left with the slow part, a whole number within a load, and drop a slow part without them', () => {
    expect(shipState({ ...ship, ...slow })?.to).toBe(4);
    for (const to of [-1, 100, 2.5, '3', null]) expect(shipState({ ...ship, ...slow, to })).toBeNull();
    const without: Record<string, unknown> = { ...slow };
    delete without.to;
    expect(shipState({ ...ship, ...without })).toBeNull();
  });

  it("take a Host's tint only as an entry of the palette, never as a color of its own", () => {
    expect(shipState({ ...ship, ...slow, co: TINTS.length - 1 })?.co).toBe(TINTS.length - 1);
    for (const co of [-1, TINTS.length, 1.5, '#000000', null]) expect(shipState({ ...ship, ...slow, co })).toBeNull();
  });

  it('drop a field snapshot without its arena', () => {
    const field = { k: 'belt', t: 3, a: [{ id: '0', hp: 5, b: 0 }], x: [] };
    expect(fieldState(field)).not.toBeNull();
    expect(fieldState({ ...field, k: undefined })).toBeNull();
  });

  it('drop oversized lists', () => {
    expect(ids(Array.from({ length: 201 }, (_, i) => `r0.${i}`))).toBeNull();
    expect(ids(['r0.1', 'p:abc.2.0'])).toEqual(['r0.1', 'p:abc.2.0']);
    expect(wreckStates(Array.from({ length: 101 }, () => ({ id: 'a.1.0', p: [0, 0, 0], v: [0, 0, 0], g: 0 })))).toBeNull();
  });

  it('take the sides and cores of Capture the Flag, and drop them broken', () => {
    const flags = { t: [['p:abc', 'b:abc:0'], ['b:abc:1']], c: [1, 0], f: ['b:abc:1', [1, 2, 3, 0, 0, 0]], w: [[4, 5, 6, -100, 0, 0], null], e: [[4, 2, 'p:abc', 1], [5, 1, null, 0]] };
    expect(flagsState(flags)).toEqual(flags);
    expect(flagsState({ ...flags, f: ['b:abc:1', 'p:x y'] })).toBeNull();
    expect(flagsState({ ...flags, w: [[4, 5, 6], null] })).toBeNull();
    expect(flagsState({ ...flags, c: [0.5, 0] })).toBeNull();
    expect(flagsState({ ...flags, e: [[4, 7, 'p:abc', 1]] })).toBeNull();
    expect(flagsState({ ...flags, t: [['p:abc']] })).toBeNull();
  });

  it("take the President's battleship, and drop it broken", () => {
    const fleet = { d: 0, h: [3, 0, 30, 0, 0, 0, 0, 0, 0], p: [1, 2, 3], v: [600, 0, 0], q: [0, 0, 0, 1], t: 'p:abc', u: 1 };
    expect(fleetState(fleet)).toEqual(fleet);
    expect(fleetState({ ...fleet, t: null })?.t).toBeNull();
    expect(fleetState({ ...fleet, d: 2 })).toBeNull();
    expect(fleetState({ ...fleet, h: [1.5] })).toBeNull();
    expect(fleetState({ ...fleet, q: [0, 0, 0, 0] })).toBeNull();
    // the field time a comet broke up on its hull, once one did
    expect(fleetState({ ...fleet, c: 98.4 })?.c).toBe(98.4);
    for (const c of [-1, 'soon', null, Infinity]) expect(fleetState({ ...fleet, c })).toBeNull();
  });

  it('take a piece of the field shoved by a comet, rammed by the battleship or knocked by another piece, and drop it broken', () => {
    const shoved = { id: '12.0', b: 40.5, p: [1, 2, 3], v: [100, 0, -50], q: [0, 0, 0, 1], s: [0, 1, 0, 0.1], c: RAMMED };
    expect(shovedState(shoved)).toEqual(shoved);
    expect(shovedState({ ...shoved, c: 4049 })?.c).toBe(4049);
    expect(shovedState({ ...shoved, c: KNOCKED })?.c).toBe(KNOCKED);
    expect(fieldState({ k: 'rings', t: 41, a: [{ id: '12.0', hp: 5, b: 0 }], x: [], m: [shoved] })?.m).toEqual([shoved]);
    for (const broken of [{ c: -3 }, { c: 0.5 }, { id: 'a b' }, { q: [0, 0, 0, 0] }, { v: [1, 2] }, { s: [0, 1, 0, 1e9] }, { b: -1 }]) expect(shovedState({ ...shoved, ...broken })).toBeNull();
  });

  it('clean callsigns of control and invisible format characters', () => {
    expect(cleanName('  No​va\u0007  ')).toBe('Nova');
    expect(cleanName('​​')).toBe('');
  });
});
