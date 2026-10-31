import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FlightModel, MAIN_THRUST, MAX_SPEED, OVERDRIVE_PUSH } from '../ship/flight';
import { aimHook, HOOK_PULL, HOOK_RANGE, keepsHold, pullOn } from './hook';
import type { Ship } from '../ship/ship';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { SAFE_IMPACT } from '../ship/impact';
import { IMMOVABLE, MASS, type Body } from '../world/bodies';

const DT = 1 / 120;
/** An anchor at the origin, at rest: a rock, far too heavy to move (never changed by the tests). */
const ROCK: Body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: IMMOVABLE };
/** A ship's flight as a body. */
const body = (flight: FlightModel): Body => ({ position: flight.position, velocity: flight.velocity, mass: MASS.ship });

/** A ship 200 m from the anchor at the origin, passing it sideways at `speed`. */
function passing(speed: number) {
  const flight = new FlightModel();
  flight.position.set(4000, 0, 0);
  flight.velocity.set(0, 0, speed);
  return flight;
}

/** Flies `seconds` on the cable: the cable pulls, the ship moves on its velocity. */
function fly(flight: FlightModel, seconds: number, reeling: boolean, floor = 0) {
  let length: number | null = flight.position.length();
  for (let t = 0; t < seconds && length !== null; t += DT) {
    length = pullOn(body(flight), ROCK, length, reeling, floor, MAX_SPEED, DT);
    flight.position.addScaledVector(flight.velocity, DT);
  }
  return length;
}

describe('the hook', () => {
  it('swings a passing ship around the rock, at the cable length and the same speed', () => {
    const flight = passing(2000);
    fly(flight, 3, false);
    expect(flight.position.length()).toBeCloseTo(4000, -2);
    expect(flight.velocity.length()).toBeCloseTo(2000, -2);
    // a quarter turn and more: the cable bent the course
    expect(flight.position.x).toBeLessThan(4000);
  });

  it('reels a ship in, and the swing gets faster as the cable gets shorter', () => {
    const flight = passing(1000);
    const length = fly(flight, 2, true, 1000)!;
    expect(length).toBeLessThan(4000);
    expect(flight.velocity.length()).toBeGreaterThan(1000);
  });

  it('pulls a ship at rest towards the anchor with the winch, and stops short of the rock', () => {
    const flight = passing(0);
    fly(flight, 0.5, true, 1000);
    expect(flight.velocity.x).toBeCloseTo(-HOOK_PULL * 0.5, -1);
    fly(flight, 20, true, 3000);
    expect(flight.position.length()).toBeGreaterThan(2500);
  });

  it('lets a ship go: no pull without reeling and a slack cable', () => {
    const flight = passing(0);
    flight.velocity.set(-500, 0, 0);
    fly(flight, 1, false);
    expect(flight.velocity.x).toBe(-500);
  });

  it('snaps far beyond its range', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE * 2, 0, 0);
    expect(pullOn(body(flight), ROCK, HOOK_RANGE, true, 0, MAX_SPEED, DT)).toBeNull();
  });

  it('never reels a ship at rest into its rock: from the full range it comes to rest at the floor', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE, 0, 0);
    let closest = Infinity;
    let length: number | null = HOOK_RANGE;
    for (let t = 0; t < 20 && length !== null; t += DT) {
      length = pullOn(body(flight), ROCK, length, true, 3000, MAX_SPEED, DT);
      flight.position.addScaledVector(flight.velocity, DT);
      closest = Math.min(closest, flight.position.length());
    }
    // within two meters of the floor, 70 m off the rock in the game, and at rest there
    expect(closest).toBeGreaterThan(3000 - 40);
    expect(flight.velocity.length()).toBeLessThan(SAFE_IMPACT);
  });

  it('keeps the speed of a ship let go before the floor: a jump', () => {
    const flight = new FlightModel();
    flight.position.set(HOOK_RANGE, 0, 0);
    fly(flight, 1.2, true, 3000);
    const speed = flight.velocity.length();
    expect(speed).toBeGreaterThan(HOOK_PULL);
    fly(flight, 1, false);
    expect(flight.velocity.length()).toBeCloseTo(speed);
  });

  it('pulls two ships flying side by side as it pulls two at rest, and never slams them together', () => {
    const run = (cruise: number) => {
      const a = new FlightModel();
      const b = new FlightModel();
      a.position.set(-3000, 0, 0);
      b.position.set(3000, 0, 0);
      a.velocity.set(0, 0, cruise);
      b.velocity.set(0, 0, cruise);
      let length: number | null = 6000;
      let closest = Infinity;
      for (let t = 0; t < 4 && length !== null; t += DT) {
        length = pullOn(body(a), body(b), length, true, 1360, MAX_SPEED, DT, 'moved');
        a.position.addScaledVector(a.velocity, DT);
        b.position.addScaledVector(b.velocity, DT);
        closest = Math.min(closest, a.position.distanceTo(b.position));
      }
      return { a: a.velocity.clone(), b: b.velocity.clone(), closest };
    };
    const still = run(0);
    const cruising = run(3000);
    // the same pull on both, whatever they fly at together
    expect(cruising.a.x).toBeCloseTo(still.a.x, 0);
    expect(cruising.b.x).toBeCloseTo(still.b.x, 0);
    // and alike on both
    expect(Math.abs(cruising.a.x + cruising.b.x)).toBeLessThan(1);
    // two hulls (17 m each) never touch
    expect(cruising.closest).toBeGreaterThan(680);
  });

  describe('a tug of war between two ships on the rope', () => {
    /** Two ships 70 m apart on a held cable (at the winch's floor), burning away from each other with `a` and `b` of the main drive (units/s²) for `seconds`, `kick` added to a's speed at the start (an overdrive); their velocities along the rope after. */
    function tug(a: number, b: number, seconds: number, kick = 0) {
      const one = new FlightModel();
      const two = new FlightModel();
      one.position.set(-700, 0, 0);
      two.position.set(700, 0, 0);
      one.velocity.x = -kick;
      let length: number | null = 1400;
      for (let t = 0; t < seconds && length !== null; t += DT) {
        one.velocity.x -= a * DT;
        two.velocity.x += b * DT;
        length = pullOn(body(one), body(two), length, true, 1400, MAX_SPEED, DT, 'moved');
        one.position.addScaledVector(one.velocity, DT);
        two.position.addScaledVector(two.velocity, DT);
      }
      return { one: one.velocity.x, two: two.velocity.x, apart: one.position.distanceTo(two.position), middle: (one.position.x + two.position.x) / 2 };
    }

    it('ends in a stalemate between two equal drives: neither moves, the rope holds', () => {
      const pull = tug(MAIN_THRUST, MAIN_THRUST, 3);
      // (each frame's burn pulls them apart by a frame's thrust, which the rope takes back)
      expect(Math.abs(pull.one)).toBeLessThanOrEqual(MAIN_THRUST * DT + 1);
      expect(pull.one + pull.two).toBeCloseTo(0);
      expect(Math.abs(pull.middle)).toBeLessThan(1);
      expect(pull.apart).toBeLessThan(1401);
    });

    it('goes to the stronger drive: both drift its way at half the difference', () => {
      // a drive at four fifths (damaged, or not upgraded) against a full one
      const pull = tug(MAIN_THRUST, MAIN_THRUST * 0.8, 2);
      expect(pull.one).toBeCloseTo(-MAIN_THRUST * 0.1 * 2, -1);
      expect(pull.two).toBeCloseTo(pull.one, 0);
    });

    it("lets the overdrive yank the other ship along: the shove's momentum is split by mass", () => {
      const pull = tug(0, 0, 0.5, OVERDRIVE_PUSH);
      expect(pull.one).toBeCloseTo(-OVERDRIVE_PUSH / 2, -1);
      expect(pull.two).toBeCloseTo(-OVERDRIVE_PUSH / 2, -1);
    });
  });
});

describe('two hooks on one probe or torpedo', () => {
  it('leave it with exactly one ship on every browser: each browser keeps or yields it alike', () => {
    const ships = ['p:a1', 'p:zz', 'b:lead:0', 'b:lead:3'];
    for (const mine of ships) {
      for (const theirs of ships) {
        if (mine === theirs) continue;
        // here the own ship holds it and the other claims it; there the other way round
        expect(keepsHold(mine, theirs)).not.toBe(keepsHold(theirs, mine));
      }
    }
  });
});

describe("the harpoon's aim", () => {
  /** A ship of the test: its nose at its center, flying along `forward` from `at`. */
  const ship = (at: THREE.Vector3, forward = new THREE.Vector3(0, 0, -1)) => {
    const flight = new FlightModel();
    flight.position.copy(at);
    flight.orientation.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
    return { flight, radius: 200, alive: true, nose: (out = new THREE.Vector3()) => out.copy(flight.position) } as unknown as Ship;
  };

  it("takes a core or a ship on the nose's line before a rock nearer beside it", () => {
    const field = testField();
    field.generate(ARENAS[0].layout);
    // a rock, and a line past it 5 m clear of its bounding sphere: the line misses it, but its
    // surface comes within the harpoon's aim of the line 200 m short of where the line passes it
    const rock = [...field.asteroids.values()].find((asteroid) => asteroid.kind === 'rock' || asteroid.kind === 'ice')!;
    const across = new THREE.Vector3(1, 0, 0);
    const along = new THREE.Vector3(0, 0, -1);
    const passing = rock.object.position.clone().addScaledVector(across, rock.radius + 100);
    const owner = ship(passing.clone().addScaledVector(along, -4000), along);
    // nothing else on the line: the rock beside it is bitten
    const alone = aimHook(owner, field, [owner], []);
    expect(alone?.anchor.rock).toBe(rock);
    // a core 400 m out on the line is bitten instead, and so is a ship there
    const core = { team: 0, position: passing.clone().addScaledVector(along, 4000) };
    expect(aimHook(owner, field, [owner], [core])?.anchor.mark).toBe(core);
    const rival = ship(core.position);
    expect(aimHook(owner, field, [owner, rival], [])?.anchor.ship).toBe(rival);
  });
});
