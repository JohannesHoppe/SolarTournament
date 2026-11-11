import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel, RCS_THRUST } from './flight';
import { NANO_SECONDS, NANO_WAIT, Ship } from './ship';
import { STOCK } from '../game/hangar';
import { shipState } from '../net/validate';
import { Plausibility } from '../net/plausible';
import { ONLINE_LOAD } from '../game/torpedoes';

/** A ship with the state it sends and takes, but no model: what travels over the network and what an adopted bot keeps. */
function ship(id: string): Ship {
  const s = Object.create(Ship.prototype) as Ship;
  Object.assign(s, {
    id,
    name: 'Kessler',
    type: 'human',
    score: 0,
    kills: 0,
    deaths: 0,
    gates: 0,
    finish: -1,
    twin: false,
    plating: 0,
    nova: false,
    wish: 0,
    torpedoes: 3,
    hull: 100,
    drive: 1,
    thrusters: 1,
    protectedUntil: 0,
    alive: true,
    holes: [],
    perks: STOCK,
    slowSent: '',
    slowSentAt: -Infinity,
    root: { visible: true },
    flight: new FlightModel(),
    pull: new THREE.Vector3(),
    remote: { position: new THREE.Vector3(), velocity: new THREE.Vector3(), orientation: new THREE.Quaternion(), spin: new THREE.Vector3(), at: 0, alive: true },
    syncTransform: () => {},
  });
  return s;
}

describe('a bot adopted by a new lead browser', () => {
  it('flies on with the torpedoes its clone had left, as its last state told them', () => {
    const before = ship('b:old:0');
    before.torpedoes = 1;
    const seen = ship('b:old:0');
    seen.applyState(shipState(before.toState(0, true))!, 0);
    expect(seen.torpedoes).toBe(1);
    const heir = ship('b:new:0');
    heir.adopt(seen, 0);
    expect(heir.torpedoes).toBe(1);
  });

  it('keeps no more than a fresh load, which the other browsers allow a ship they never saw', () => {
    const seen = ship('b:old:0');
    // three probes of torpedoes taken by its clone
    seen.torpedoes = ONLINE_LOAD + 6;
    const heir = ship('b:new:0');
    heir.adopt(seen, 0);
    expect(heir.torpedoes).toBe(ONLINE_LOAD);
    const check = new Plausibility();
    for (let i = 0; i < heir.torpedoes; i++) expect(check.torpedo(heir.id, 1 + i)).toBeNull();
  });

  it('sends its torpedoes along when their count changes, not only every second', () => {
    const s = ship('b:old:0');
    expect(s.toState(0).to).toBe(3);
    expect(s.toState(0.1).to).toBeUndefined();
    s.torpedoes = 2;
    expect(s.toState(0.2).to).toBe(2);
  });
});

describe('a fresh clone', () => {
  it('starts with cold radiators, whatever glow the old clone died with', () => {
    const owner = ship('p:a');
    const seen = ship('p:a');
    const hot = seen as unknown as { glow: number };
    owner.alive = false;
    seen.applyState(shipState(owner.toState(0, true))!, 0);
    hot.glow = 0.9;
    owner.alive = true;
    seen.applyState(shipState(owner.toState(1, true))!, 1);
    expect(seen.alive).toBe(true);
    expect(hot.glow).toBe(0);
  });
});

describe("another browser's ship", () => {
  it('has died only once its owner says so, not while its owner is silent', () => {
    const owner = ship('p:a');
    const seen = ship('p:a');
    seen.owner = 'a';
    seen.applyState(shipState(owner.toState(0, true))!, 0);
    expect(seen.died).toBe(false);
    // its owner goes quiet: the ship leaves the screen (see online.ts)
    seen.alive = false;
    expect(seen.died).toBe(false);
    owner.alive = false;
    seen.applyState(shipState(owner.toState(1))!, 1);
    expect(seen.died).toBe(true);
    // a ship this browser runs died when it is not alive
    owner.owner = null;
    expect(owner.died).toBe(true);
  });

  it('fires no thrusters for what pulls and brakes it from outside, only for its own push', () => {
    const owner = ship('p:a');
    const seen = ship('p:a');
    seen.applyState(shipState(owner.toState(0, true))!, 0);
    // falling at 400 units/s² towards a black hole, its thrusters idle, over a tenth of a second
    seen.pull.set(0, -400, 0);
    owner.flight.velocity.set(0, -40, 0);
    seen.applyState(shipState(owner.toState(0.1))!, 0.1);
    expect(seen.flight.rcs.length()).toBe(0);
    // half the thrusters' push, with nothing pulling, is their push
    seen.pull.set(0, 0, 0);
    owner.flight.velocity.set(0, -40 - RCS_THRUST * 0.1 * 0.5, 0);
    seen.applyState(shipState(owner.toState(0.2))!, 0.2);
    expect(seen.flight.rcs.length()).toBeGreaterThan(0.3);
  });
});

describe('the nanobots', () => {
  /** A ship with a hurt drive and thrusters, mended by its nanobots step by step. */
  const hurt = () => {
    const s = Object.create(Ship.prototype) as Ship;
    Object.assign(s, { perks: { nanobots: true }, drive: 1, thrusters: 1, hull: 60, mending: false, hurtAt: -Infinity, driveBefore: 1, thrustersBefore: 1 });
    return s;
  };
  const mend = (s: Ship, from: number, to: number) => {
    for (let t = from; t < to; t += 1 / 60) (s as unknown as { nanobots(dt: number, now: number): void }).nanobots(1 / 60, t);
  };

  it(`wait ${NANO_WAIT} s after the last blow, then mend drive and thrusters whole in ${NANO_SECONDS} s, and leave the hull be`, () => {
    const s = hurt();
    mend(s, 0, 1);
    s.drive = 0.2;
    s.thrusters = 0.5;
    mend(s, 1, 1 + NANO_WAIT - 0.1);
    expect(s.drive).toBeCloseTo(0.2, 6);
    expect(s.mending).toBe(false);
    mend(s, 1 + NANO_WAIT - 0.1, 1 + NANO_WAIT + 5);
    expect(s.mending).toBe(true);
    expect(s.drive).toBeCloseTo(0.2 + 5 / NANO_SECONDS, 1);
    mend(s, 1 + NANO_WAIT + 5, 1 + NANO_WAIT + NANO_SECONDS);
    expect(s.drive).toBe(1);
    expect(s.thrusters).toBe(1);
    expect(s.mending).toBe(false);
    expect(s.hull).toBe(60);
  });

  it('stop at a new blow, and wait again', () => {
    const s = hurt();
    s.drive = 0.4;
    mend(s, 0, NANO_WAIT + 2);
    const mended = s.drive;
    expect(mended).toBeGreaterThan(0.4);
    s.drive -= 0.2;
    mend(s, NANO_WAIT + 2, NANO_WAIT * 2 + 1.9);
    expect(s.drive).toBeCloseTo(mended - 0.2, 6);
  });
});

describe('a hull without its left armor panels', () => {
  it('takes a beam into its bare left flank twice as hard, its right flank and nose as ever, and closed with panels as a stock hull', () => {
    const hit = (bareFlank: boolean, from: THREE.Vector3) => {
      const s = ship('scrap');
      s.perks = { ...STOCK, bareFlank };
      Object.assign(s, { radius: 340 });
      s.flight.position.set(0, 0, 0);
      const before = s.hull;
      s.laserHit(from, from.clone().negate().normalize(), 10);
      return before - s.hull;
    };
    // the ship's left lies along -x of its own frame: a beam from there runs towards +x
    const left = new THREE.Vector3(-5000, 0, 0);
    const right = new THREE.Vector3(5000, 0, 0);
    const nose = new THREE.Vector3(0, 0, -5000);
    expect(hit(true, left)).toBeCloseTo(2 * hit(false, left));
    expect(hit(true, right)).toBeCloseTo(hit(false, right));
    expect(hit(true, nose)).toBeCloseTo(hit(false, nose));
    expect(hit(false, left)).toBeGreaterThan(0);
  });
});
