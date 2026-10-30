import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gripAt, MAIN_THRUST, MAX_SPEED, RCS_THRUST } from '../ship/flight';
import type { Ship as GameShip } from '../ship/ship';
import type { Effects } from '../view/effects';
import type { AsteroidField } from '../world/asteroids';
import { MASS, type Body } from '../world/bodies';
import { pullOn } from './hook';
import { creditOf, FLING_CREDIT, flyTorpedo, fused, strikes, TORPEDO_LATERAL, TORPEDO_LIFETIME, TORPEDO_THRUST, TORPEDO_TOP_SPEED, Torpedoes, type Homing, type Torpedo, type TorpedoFlight } from './torpedoes';

/** The game's frames, at a fast browser's rate. */
const DT = 1 / 60;
/** A ship's hit radius (units, 17 m), as the game's hulls have it. */
const HULL = 340;
/** A tube's push (units/s, 40 m/s) and a dodge's (units/s, 40 m/s). */
const LAUNCH = 800;
const DODGE = 800;
/** A hard break across a torpedo's path (units/s², 15 g): in free drift, the nose turned 60° across the flight and the drive burning, the thrusters pushing the same way. */
const BREAK = MAIN_THRUST * Math.sin(Math.PI / 3) + RCS_THRUST;

/** How a ship flies against a torpedo: its acceleration this frame (units/s², at most BREAK), a dodge (a kick in units/s), or nothing. */
type Evasion = (state: { t: number; seconds: number; ship: Ship; torpedo: TorpedoFlight }) => { push?: THREE.Vector3; kick?: THREE.Vector3 } | null;
interface Ship {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface Chase {
  /** Seconds to the hit, or null when it burnt out. */
  hit: number | null;
  /** How close the torpedo came on its first pass (units). */
  firstPass: number;
  /** The most lateral acceleration the torpedo gave (units/s²). */
  lateral: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A ship (a point with a ship's speed limit and grip) evades a torpedo in the same flight model
 * the game flies it with, at 60 frames a second, until it is hit or the torpedo burns out.
 */
function chase(ship: Ship, torpedoAt: THREE.Vector3, torpedoVelocity: THREE.Vector3, evade: Evasion = () => null): Chase {
  const torpedo = { position: torpedoAt.clone(), velocity: torpedoVelocity.clone(), push: new THREE.Vector3(), seen: ship.velocity.clone() };
  const before = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const lastVelocity = new THREE.Vector3();
  let firstPass = Infinity;
  let passed = false;
  let lateral = 0;
  for (let t = 0; t < TORPEDO_LIFETIME; t += DT) {
    relative.subVectors(ship.position, torpedo.position);
    const distance = relative.length();
    const closing = -relative.dot(lastVelocity.subVectors(ship.velocity, torpedo.velocity)) / distance;
    const seconds = closing > 0 ? distance / closing : Infinity;
    const action = evade({ t, seconds, ship, torpedo });
    if (action?.kick) ship.velocity.add(action.kick);
    if (action?.push) {
      const speed = ship.velocity.length();
      ship.velocity.addScaledVector(action.push.clampLength(0, BREAK), DT);
      const limit = Math.max(speed, MAX_SPEED);
      if (ship.velocity.length() > limit) ship.velocity.setLength(limit);
    }
    ship.position.addScaledVector(ship.velocity, DT);
    before.copy(torpedo.position);
    lastVelocity.copy(torpedo.velocity);
    flyTorpedo(torpedo, ship, DT);
    // the push across its flight
    const course = lastVelocity.clone().normalize();
    const change = torpedo.velocity.clone().sub(lastVelocity).divideScalar(DT);
    lateral = Math.max(lateral, change.addScaledVector(course, -change.dot(course)).length());
    if (strikes(before, torpedo.position, ship, HULL, DT)) return { hit: t, firstPass: passed ? firstPass : 0, lateral };
    const now = ship.position.distanceTo(torpedo.position);
    if (!passed) {
      if (closing < 0 && firstPass < Infinity && now > firstPass) passed = true;
      else firstPass = Math.min(firstPass, now);
    }
  }
  return { hit: null, firstPass, lateral };
}

/** A ship flying straight away at full speed, a torpedo `behind` (units) on its tail from a pursuer's tube. */
const fleeing = (behind: number) => [{ position: v(0, 0, 0), velocity: v(0, 0, -MAX_SPEED) }, v(0, 0, behind), v(0, 0, -MAX_SPEED - LAUNCH)] as const;
/** A ship at rest, a torpedo `away` (units) off launched at it. */
const resting = (away: number) => [{ position: v(0, 0, 0), velocity: v(0, 0, 0) }, v(0, 0, away), v(0, 0, -LAUNCH)] as const;
/** A ship flying at full speed at the drone `away` (units) that launches the torpedo. */
const headOn = (away: number) => [{ position: v(0, 0, 0), velocity: v(0, 0, MAX_SPEED) }, v(0, 0, away), v(0, 0, -LAUNCH)] as const;
const scenes = { fleeing: fleeing(20000), resting: resting(30000), headOn: headOn(40000) };

/** Full grip across the line to the torpedo, to one side (`side`: +1 or -1, or a function of the time since the break). */
function breaking(before: number, side: (since: number) => number = () => 1): Evasion {
  let since: number | null = null;
  return ({ t, seconds, ship, torpedo }) => {
    if (since === null && seconds < before) since = t;
    if (since === null) return null;
    const line = new THREE.Vector3().subVectors(torpedo.position, ship.position);
    const push = v(side(t - since), 0, 0);
    return { push: push.addScaledVector(line, -push.dot(line) / line.lengthSq()).setLength(BREAK) };
  };
}
/** One dodge across the line to the torpedo, `before` seconds before it hits. */
function dodging(before: number): Evasion {
  let done = false;
  return ({ seconds }) => {
    if (done || seconds >= before) return null;
    done = true;
    return { kick: v(DODGE, 0, 0) };
  };
}
/** Breaks to one side, then the other, every `period` seconds. */
const jinking = (before: number, period: number) => breaking(before, (since) => (Math.floor(since / period) % 2 ? -1 : 1));

/** Runs a scene afresh with an evasion. */
const run = (scene: (typeof scenes)[keyof typeof scenes], evade: Evasion = () => null) => chase({ position: scene[0].position.clone(), velocity: scene[0].velocity.clone() }, scene[1], scene[2], evade);
/** Seconds before the hit at which a break, jinks or a dodge come in time. */
const IN_TIME = [0.6, 0.8, 1, 1.2, 1.5, 2];

describe('a torpedo', () => {
  it('is faster than a ship in normal flight, slower than an overdrive, and less agile', () => {
    expect(TORPEDO_TOP_SPEED).toBeGreaterThan(MAX_SPEED);
    expect(TORPEDO_TOP_SPEED).toBeLessThan(400 / 0.05);
    expect(TORPEDO_LATERAL).toBeLessThan(gripAt(MAX_SPEED));
  });

  it('catches a ship flying straight: from 1 km behind one fleeing at full speed in under 10 s, one at rest, one coming head-on', () => {
    expect(run(scenes.fleeing).hit).toBeLessThan(10);
    expect(run(scenes.resting).hit).not.toBeNull();
    expect(run(scenes.headOn).hit).not.toBeNull();
  });

  for (const [name, scene] of Object.entries(scenes)) {
    it(`overshoots a ship (${name}) breaking hard 0.6 to 2 s before the hit, and hits one breaking too late`, () => {
      for (const before of IN_TIME) expect(run(scene, breaking(before)).firstPass, `break ${before} s before`).toBeGreaterThan(HULL);
      expect(run(scene, breaking(0.4)).hit).not.toBeNull();
    });

    it(`is shaken off for good by a ship (${name}) jinking every 1.5 s from 0.6 to 1.5 s before the hit`, () => {
      for (const before of IN_TIME.filter((seconds) => seconds <= 1.5)) expect(run(scene, jinking(before, 1.5)).hit, `jinks from ${before} s before`).toBeNull();
    });

    it(`misses a ship (${name}) dodging 0.6 to 1.2 s before the hit, and hits one dodging earlier or later`, () => {
      for (const before of [0.6, 0.8, 1, 1.2]) expect(run(scene, dodging(before)).firstPass, `dodge ${before} s before`).toBeGreaterThan(HULL);
      for (const before of [0.4, 1.5, 2]) expect(run(scene, dodging(before)).firstPass, `dodge ${before} s before`).toBe(0);
    });

    it(`never pushes across its flight harder than its thrusters (${name})`, () => {
      for (const before of IN_TIME) for (const evade of [breaking(before), jinking(before, 1.5), dodging(before)]) expect(run(scene, evade).lateral).toBeLessThanOrEqual(TORPEDO_LATERAL * 1.001);
    });
  }

  it('comes back at a ship that holds its break at rest or head-on', () => {
    for (const before of IN_TIME) {
      expect(run(scenes.resting, breaking(before)).hit, `resting, break ${before} s before`).not.toBeNull();
      expect(run(scenes.headOn, breaking(before)).hit, `head-on, break ${before} s before`).not.toBeNull();
    }
  });

  it('goes off at the hull of a ship it passes between two frames', () => {
    const ship = { position: v(0, 0, 0), velocity: v(0, 0, 0) };
    expect(strikes(v(300, 0, 600), v(300, 0, -600), ship, HULL, 1 / 30)).toBe(true);
    expect(strikes(v(400, 0, 600), v(400, 0, -600), ship, HULL, 1 / 30)).toBe(false);
    // a ship flying across the step: its own motion within the frame counts
    expect(strikes(v(0, 0, 600), v(0, 0, -600), { position: v(500, 0, 0), velocity: v(30000, 0, 0) }, HULL, 1 / 30)).toBe(true);
  });

  it(`burns out after ${TORPEDO_LIFETIME} s, and goes off at the hull of the ship it reaches`, () => {
    const field = { lineOfSight: () => true, obstacle: null, overlap: () => false, insideWell: () => false } as unknown as AsteroidField;
    const shooter = { id: 'a', alive: true, radius: HULL, flight: { position: v(0, 0, 0), velocity: v(0, 0, 0) }, allyOf: () => false } as unknown as GameShip;
    const target = (z: number) => ({ id: 'b', name: 'b', alive: true, radius: HULL, flight: { position: v(0, 0, z), velocity: v(0, 0, 0) }, allyOf: () => false }) as unknown as GameShip;
    const flight = (distance: number) => {
      const torpedoes = new Torpedoes({ puff() {} } as unknown as Effects);
      const ship = target(-distance);
      torpedoes.launch('a.0', shooter, ship, v(0, 0, 0), v(0, 0, -LAUNCH), 0, true);
      for (let now = 0; now < TORPEDO_LIFETIME + 1; now += DT) {
        let gone: { at: number; hit: GameShip | null } | null = null;
        torpedoes.update(DT, now, field, [shooter, ship], (torpedo, hit) => {
          gone = { at: now, hit };
          torpedoes.remove(torpedo);
        });
        if (gone) return gone as { at: number; hit: GameShip | null };
      }
      return null;
    };
    // beyond its reach: gone after its lifetime, on nothing
    const far = flight(TORPEDO_TOP_SPEED * TORPEDO_LIFETIME + 20000);
    expect(far?.hit).toBeNull();
    expect(far?.at).toBeCloseTo(TORPEDO_LIFETIME, 1);
    // within reach: at the hull, the ship hit
    const near = flight(20000);
    expect(near?.hit?.id).toBe('b');
    expect(near!.at).toBeLessThan(TORPEDO_LIFETIME);
  });
});

/** The hook's tests step at twice the game's rate, for the rope. */
const ROPE_DT = 1 / 120;
/** Open space: nothing in the way, nothing to strike. */
const SPACE = { lineOfSight: () => true, obstacle: null, overlap: () => null, insideWell: () => false } as unknown as AsteroidField;
const EFFECTS = { puff: () => {} } as unknown as Effects;

/** A ship as the torpedoes see it, `id` at `x`, of no side but its own. */
function ship(id: string, x: number): GameShip & { body: Body } {
  const position = new THREE.Vector3(x, 0, 0);
  const velocity = new THREE.Vector3();
  const flight = { position, velocity };
  return { id, name: id, alive: true, radius: 340, flight, body: { position, velocity, mass: MASS.ship }, allyOf: () => false } as unknown as GameShip & { body: Body };
}

/** A torpedo of `shooter` at the origin, at rest, homing on a mark far out along x; `age` seconds old. */
function torpedo(shooter: GameShip, age = 0) {
  const torpedoes = new Torpedoes(EFFECTS);
  const target: Homing = { id: 'mark', name: 'mark', alive: true, radius: 340, flight: { position: new THREE.Vector3(1e6, 0, 0), velocity: new THREE.Vector3() } };
  torpedoes.launch('s.0', shooter, target, new THREE.Vector3(), new THREE.Vector3(), -age, true);
  return { torpedoes, torpedo: torpedoes.list[0] };
}

/**
 * A torpedo on the rope of `holder` (70 m off, the winch's floor), for `seconds`: the holder
 * burns its drive away from the torpedo's target with `drive` (units/s²), the torpedo pushes
 * for its target while its motor burns, the rope pulls both by their masses.
 */
function tug(holder: GameShip & { body: Body }, held: Torpedo, torpedoes: Torpedoes, drive: number, seconds: number) {
  held.holder = holder;
  let detonated = false;
  let length: number | null = 1400;
  for (let t = 0; t < seconds; t += ROPE_DT) {
    holder.flight.velocity.x -= drive * ROPE_DT;
    holder.flight.position.addScaledVector(holder.flight.velocity, ROPE_DT);
    torpedoes.update(ROPE_DT, t, SPACE, [holder], () => (detonated = true));
    length = pullOn(holder.body, held, length ?? 1400, true, 1400, MAX_SPEED, ROPE_DT, 'moved');
  }
  return detonated;
}

describe('a torpedo on the hook', () => {
  it('weighs a tonne against a ship of sixty: a drifting ship is tugged only a little towards its target', () => {
    const holder = ship('h', -1400);
    const { torpedoes, torpedo: held } = torpedo(ship('s', 50000));
    tug(holder, held, torpedoes, 0, 2);
    // the 20 g motor pulls both, a sixty-first of it on the ship: about 0.3 g (its push comes up within a quarter second)
    expect(holder.flight.velocity.x).toBeGreaterThan(((TORPEDO_THRUST * MASS.torpedo) / (MASS.ship + MASS.torpedo)) * 2 * 0.7);
    expect(holder.flight.velocity.x).toBeLessThan(((TORPEDO_THRUST * MASS.torpedo) / (MASS.ship + MASS.torpedo)) * 2);
    expect(held.velocity.x).toBeCloseTo(holder.flight.velocity.x, -1);
  });

  it('loses the tug of war against a ship that burns away: the drive drags it off its course', () => {
    const holder = ship('h', -1400);
    const { torpedoes, torpedo: held } = torpedo(ship('s', 50000));
    tug(holder, held, torpedoes, MAIN_THRUST, 2);
    expect(held.velocity.x).toBeLessThan(-MAIN_THRUST);
    expect(held.position.x).toBeLessThan(0);
  });

  it('is towed without resistance once its motor has burnt out, and stays on the rope', () => {
    const holder = ship('h', -1400);
    const { torpedoes, torpedo: held } = torpedo(ship('s', 50000), TORPEDO_LIFETIME + 1);
    const detonated = tug(holder, held, torpedoes, MAIN_THRUST, 1);
    expect(detonated).toBe(false);
    expect(torpedoes.list).toContain(held);
    // both go at the drive's pace, a sixty-first slower for the mass in tow
    expect(held.velocity.x).toBeCloseTo((-MAIN_THRUST * 60) / 61, -2);
    expect(holder.flight.velocity.x).toBeCloseTo(held.velocity.x, -2);
  });

  it('keeps its fuse live on a string for every ship, its shooter and its holder too', () => {
    const shooter = ship('s', 300);
    const { torpedo: held } = torpedo(shooter);
    // free, it never goes off on its own shooter
    expect(fused(held, held.position, [shooter], 0, ROPE_DT)).toBeNull();
    held.holder = ship('h', -1400);
    expect(fused(held, held.position, [shooter], 0, ROPE_DT)).toBe(shooter);
    const holder = held.holder;
    holder.flight.position.set(200, 0, 0);
    expect(fused(held, held.position, [holder], 0, ROPE_DT)).toBe(holder);
  });

  it('goes off at the hull of a ship of its shooter\'s own side as at any other (friendly fire)', () => {
    const shooter = ship('s', -5000);
    const ally = { ...ship('a', 200), allyOf: (other: GameShip) => other === shooter } as unknown as GameShip;
    shooter.allyOf = (other: GameShip) => other === ally;
    const { torpedo: free } = torpedo(shooter);
    expect(fused(free, free.position, [shooter, ally], 0, ROPE_DT)).toBe(ally);
  });

  it("gives the kill to whoever holds it, or flung it within the last seconds, else to its shooter", () => {
    const shooter = ship('s', 300);
    const holder = ship('h', -1400);
    const { torpedo: held } = torpedo(shooter);
    expect(creditOf(held, 0)).toBe(shooter);
    held.holder = holder;
    expect(creditOf(held, 1)).toBe(holder);
    // let go at 2 s: still the flinger's for FLING_CREDIT seconds
    held.holder = null;
    held.flinger = holder;
    held.releasedAt = 2;
    expect(creditOf(held, 2 + FLING_CREDIT - 0.1)).toBe(holder);
    expect(creditOf(held, 2 + FLING_CREDIT + 0.1)).toBe(shooter);
  });
});
