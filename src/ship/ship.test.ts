import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel } from './flight';
import { Ship } from './ship';
import { STOCK } from '../game/hangar';
import { shipState } from '../net/validate';

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
  it('fires no thrusters for what pulls and brakes it from outside, only for its own push', () => {
    const owner = ship('p:a');
    const seen = ship('p:a');
    seen.applyState(shipState(owner.toState(0, true))!, 0);
    // falling at 400 units/s² towards a black hole, its thrusters idle, over a tenth of a second
    seen.pull.set(0, -400, 0);
    owner.flight.velocity.set(0, -40, 0);
    seen.applyState(shipState(owner.toState(0.1))!, 0.1);
    expect(seen.flight.rcs.length()).toBe(0);
    // the same change of velocity with nothing pulling is its thrusters' push
    seen.pull.set(0, 0, 0);
    owner.flight.velocity.set(0, -80, 0);
    seen.applyState(shipState(owner.toState(0.2))!, 0.2);
    expect(seen.flight.rcs.length()).toBeGreaterThan(0.3);
  });
});
