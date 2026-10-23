import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Bot, evenSkills, skillsOf, startTiming } from './bots';
import { FlightModel, MAIN_THRUST } from './flight';
import { LOCK_RANGE, noseOn, Ship, strainAfter } from './ship';
import { testField } from '../test/field';
import type { AsteroidField } from '../world/asteroids';

/** A ship's hit radius (units, 17 m), as the game's hulls have it. */
const RADIUS = 340;
const STEP = 1 / 30;

/** A ship with the game's rules for sides and its tail, but no model: the bots only read its flight and state. */
function ship(name: string, position: THREE.Vector3, facing: THREE.Vector3): Ship {
  const s = Object.create(Ship.prototype) as Ship;
  Object.assign(s, { id: name, name, radius: RADIUS, alive: true, protectedUntil: 0, team: -1, strain: 0, heat: 0, overheated: false, flight: new FlightModel() });
  s.flight.reset(position, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, facing.clone().add(position), new THREE.Vector3(0, 1, 0))));
  return s;
}

/** An empty field, or one with a single big rock at the origin. */
function field(rock: boolean): AsteroidField {
  const f = testField();
  f.generate({ key: rock ? 'wall' : 'none', seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: 0, toughness: 800, placements: rock ? [{ kind: 'rock', type: 0, scale: 20, position: new THREE.Vector3(), orientation: new THREE.Quaternion(), solid: false }] : [] });
  return f;
}

const at = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);

describe('bots fly by the Hosts\' rules', () => {
  it('only command what a Host\'s stick, drive and thrusters can, and never touch their flight themselves', () => {
    const f = field(false);
    const ships = [ship('Kessler', at(-6000), at(1)), ship('Halley', at(6000), at(-1)), ship('Laika', at(0, 6000), at(0, -1)), ship('Vega', at(0, -6000), at(0, 1))];
    const bots = ships.map((s) => new Bot(s, skillsOf(s.name)));
    const gravity = new THREE.Vector3();
    const before = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), orientation: new THREE.Quaternion() };
    let fired = 0;
    for (let t = 0; t < 60; t += STEP) {
      bots.forEach((bot, i) => {
        const flight = ships[i].flight;
        before.position.copy(flight.position);
        before.velocity.copy(flight.velocity);
        before.orientation.copy(flight.orientation);
        const c = bot.think(t, ships, f);
        expect(flight.position.equals(before.position) && flight.velocity.equals(before.velocity) && flight.orientation.equals(before.orientation)).toBe(true);
        for (const axis of [c.yaw, c.pitch, c.roll, c.strafeX, c.strafeY, c.strafeZ]) expect(Math.abs(axis)).toBeLessThanOrEqual(1);
        expect(c.thrust).toBeGreaterThanOrEqual(0);
        expect(c.thrust).toBeLessThanOrEqual(1);
        if (c.fire) fired++;
        flight.update(STEP, c, gravity);
        ships[i].strain = strainAfter(ships[i].strain, flight.properAcceleration, STEP);
      });
    }
    // they did fight: the trigger is theirs to pull, the laser's cadence the ship's (see Ship.update)
    expect(fired).toBeGreaterThan(0);
  });

  it('never targets a ship behind rock, beyond its sight, or beyond a storm\'s', () => {
    const me = ship('Kessler', at(-8000), at(1));
    const rival = ship('Halley', at(8000), at(-1));
    const bot = new Bot(me, evenSkills(0.5));
    bot.think(0, [me, rival], field(true));
    expect(bot.target).toBeNull();
    bot.think(0.1, [me, rival], field(false));
    expect(bot.target).toBe(rival);
    const far = new Bot(me, evenSkills(0.5));
    rival.flight.position.set(80000, 0, 0);
    far.think(0, [me, rival], field(false));
    expect(far.target).toBeNull();
    const blind = new Bot(me, evenSkills(0.5));
    blind.blind = true;
    rival.flight.position.set(20000, 0, 0);
    blind.think(0, [me, rival], field(false));
    expect(blind.target).toBeNull();
  });

  it('chases a thief behind rock, as a Host\'s HUD marks it, but holds its fire until it sees it', () => {
    const f = field(true);
    const me = ship('Kessler', at(-8000), at(1));
    const thief = ship('Halley', at(8000), at(-1));
    const bot = new Bot(me, evenSkills(1));
    bot.prey = thief;
    let fired = false;
    for (let t = 0; t < 3; t += STEP) fired ||= bot.think(t, [me, thief], f).fire;
    expect(bot.target).toBe(thief);
    expect(fired).toBe(false);
  });

  it('fires at a part of the battleship only in sight of it, and flies round to the side where it shows', () => {
    const f = field(false);
    const me = ship('Kessler', at(0, -12000), at(0, 1));
    const bot = new Bot(me, evenSkills(0.5));
    bot.siege = at(0);
    bot.siegeHold.set(0, 12000, 0);
    const gravity = new THREE.Vector3();
    const fly = (seconds: number, clear: boolean) => {
      let fired = false;
      for (let t = 0; t < seconds; t += STEP) {
        bot.siegeClear = clear;
        const c = bot.think(t, [me], f);
        fired ||= c.fire;
        me.flight.update(STEP, c, gravity);
      }
      return fired;
    };
    // behind the hull, its nose on the part: no shot, and on its way round
    expect(fly(3, false)).toBe(false);
    expect(me.flight.position.distanceTo(bot.siegeHold)).toBeLessThan(24000);
    // in sight, within range, its nose on it: it fires
    me.flight.reset(at(0, 12000), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(at(0, 12000), at(0), at(0, 0, 1))));
    expect(fly(3, true)).toBe(true);
  });

  it('reads who hunts whom from the noses it sees, not from the other bots\' minds', () => {
    const f = field(false);
    const me = ship('Kessler', at(0), at(1));
    const near = ship('Laika', at(10000), at(1));
    const far = ship('Halley', at(-15000), at(-1));
    // two ships of the bot's side close behind the near one, their noses on it
    const hunters = [ship('Vega', at(5000, 1000), at(1, -0.2)), ship('Orion', at(5000, -1000), at(1, 0.2))];
    const ships = [me, near, far, ...hunters];
    for (const s of [me, ...hunters]) s.team = 0;
    near.team = far.team = 1;
    const bot = new Bot(me, evenSkills(0.5));
    bot.think(0, ships, f);
    expect(bot.target).toBe(far);
    // the same ships, their noses turned away: the near one is free again
    for (const h of hunters) h.flight.orientation.setFromRotationMatrix(new THREE.Matrix4().lookAt(h.flight.position, at(5000, 0, 20000), new THREE.Vector3(0, 1, 0)));
    const fresh = new Bot(me, evenSkills(0.5));
    fresh.think(0, ships, f);
    expect(fresh.target).toBe(near);
  });

  it('time their start as a Host would, closer to BURN! the better their reflexes', () => {
    for (const r of [0, 0.5, 1]) for (const x of [0, 0.25, 0.5, 0.75, 1]) expect(Math.abs(startTiming(r, x))).toBeLessThanOrEqual(0.9);
    expect(Math.abs(startTiming(1, 0))).toBeLessThan(Math.abs(startTiming(0, 0)));
    expect(startTiming(0.5, 0.5)).toBe(0);
  });
});

describe('the clone\'s body and sensors, the same for every ship', () => {
  it('strains under a full burn and recovers in the drift', () => {
    let strain = 0;
    for (let t = 0; t < 5; t += STEP) strain = strainAfter(strain, MAIN_THRUST, STEP);
    expect(strain).toBeGreaterThan(0.99);
    for (let t = 0; t < 3.1; t += STEP) strain = strainAfter(strain, 0, STEP);
    expect(strain).toBe(0);
    // the thrusters alone (4 g) barely strain it
    for (let t = 0; t < 5; t += STEP) strain = strainAfter(strain, 800, STEP);
    expect(strain).toBeLessThan(0.15);
  });

  it('sees a nose locked, tracking or off, within the sensors\' reach', () => {
    const shooter = new FlightModel();
    shooter.reset(at(0), new THREE.Quaternion());
    // the nose is -Z
    expect(noseOn(shooter, at(0, 0, -20000), RADIUS)).toBe(2);
    expect(noseOn(shooter, at(RADIUS * 2, 0, -20000), RADIUS)).toBe(1);
    expect(noseOn(shooter, at(6000, 0, -20000), RADIUS)).toBe(0);
    expect(noseOn(shooter, at(0, 0, -LOCK_RANGE - 1), RADIUS)).toBe(0);
  });
});
