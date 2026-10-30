import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { allyInLine, Bot, BOT_NAMES, evenSkills, meanSkill, missOf, novaWorth, reactionOf, skillsOf, startTiming, TORPEDO_CLEARANCE } from './bots';
import { FlightModel, MAIN_THRUST, MAX_SPEED } from './flight';
import { firstHull, LASER_RANGE, LOCK_RANGE, MAX_HEAT, noseOn, Ship, strainAfter } from './ship';
import { testField } from '../test/field';
import type { AsteroidField } from '../world/asteroids';
import { arenaById } from '../world/arenas';
import { airBurn, airHeat, altitudeIn, dragOn, safeSpeed } from '../world/air';

/** A ship's hit radius (units, 17 m), as the game's hulls have it. */
const RADIUS = 340;
const STEP = 1 / 30;

/** A ship with the game's rules for sides and its tail, but no model: the bots only read its flight and state. */
function ship(name: string, position: THREE.Vector3, facing: THREE.Vector3): Ship {
  const s = Object.create(Ship.prototype) as Ship;
  Object.assign(s, { id: name, name, radius: RADIUS, alive: true, drive: 1, protectedUntil: 0, team: -1, strain: 0, heat: 0, overheated: false, inShadow: false, sunCooling: 1, perks: { cooling: 1 }, flight: new FlightModel() });
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

  it('keeps its hull clear of a rock its line of flight only just misses', () => {
    const f = field(true);
    // the rock's highest point along the line z = 0: the line of flight passes half a ship radius
    // above it, clear of the rock, while the hull around the line would strike it
    const down = at(0, -1);
    let top = -Infinity;
    for (let x = -12000; x <= 12000; x += 100) {
      const hit = f.raycast(at(x, 50000), down, 100000);
      if (hit) top = Math.max(top, 50000 - hit.distance);
    }
    expect(top).toBeGreaterThan(0);
    const height = top + RADIUS / 2;
    const me = ship('Kessler', at(-40000, height), at(1));
    me.flight.velocity.set(3000, 0, 0);
    expect(f.raycast(me.flight.position, at(1), 80000)).toBeNull();
    const bot = new Bot(me, evenSkills(0.5));
    // a probe beyond the rock, straight along the line: the bot wants to fly on along it
    bot.lure = at(60000, height);
    const gravity = new THREE.Vector3();
    for (let t = 0; t < 60 && me.flight.position.x < 15000; t += STEP) {
      me.flight.update(STEP, bot.think(t, [me], f), gravity);
      expect(f.overlap(me.flight.position, RADIUS)).toBeNull();
    }
    expect(me.flight.position.x).toBeGreaterThan(15000);
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

  it('counts only the hunters within its own sight, a storm\'s shorter reach included', () => {
    const f = field(false);
    const me = ship('Kessler', at(0), at(1));
    const near = ship('Laika', at(10000), at(1));
    // two hunters beyond the near one, their noses on it: within a storm-blind bot's sight of the prey, not of the bot
    const hunters = [ship('Vega', at(18000, 1000), at(-1, -0.1)), ship('Orion', at(18000, -1000), at(-1, 0.1))];
    const ships = [me, near, ...hunters];
    for (const s of [me, ...hunters]) s.team = 0;
    near.team = 1;
    const clear = new Bot(me, evenSkills(0.5));
    clear.think(0, ships, f);
    expect(clear.target).toBeNull();
    const blind = new Bot(me, evenSkills(0.5));
    blind.blind = true;
    blind.think(0, ships, f);
    expect(blind.target).toBe(near);
  });

  it('fight better the better their skills, but none fires sooner than a quick Host or aims like a machine', () => {
    // Kessler is the middling one, even in every skill
    expect(skillsOf('Kessler')).toEqual(evenSkills(0.5));
    for (const name of BOT_NAMES) {
      const { aim, reflexes } = skillsOf(name);
      expect(reactionOf(reflexes)).toBeGreaterThanOrEqual(0.15);
      expect(missOf(aim)).toBeGreaterThanOrEqual(0.2 - 1e-9);
    }
    for (let skill = 0; skill < 0.8; skill += 0.1) {
      expect(reactionOf(skill + 0.1)).toBeLessThanOrEqual(reactionOf(skill));
      expect(missOf(skill + 0.1)).toBeLessThan(missOf(skill));
    }
    // the middling bot's reaction and aim sit halfway between the worst and the best
    expect(reactionOf(0.5)).toBeCloseTo(0.3);
    expect(missOf(0.5)).toBeCloseTo(0.5);
    expect(meanSkill(skillsOf('Kessler'))).toBe(0.5);
  });

  it('give a bot whose name another browser made up the even skills, also a name every object inherits', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'Nobody']) expect(skillsOf(name)).toEqual(evenSkills(0.4));
  });

  it('time their start as a Host would, closer to BURN! the better their reflexes', () => {
    for (const r of [0, 0.5, 1]) for (const x of [0, 0.25, 0.5, 0.75, 1]) expect(Math.abs(startTiming(r, x))).toBeLessThanOrEqual(0.9);
    expect(Math.abs(startTiming(1, 0))).toBeLessThan(Math.abs(startTiming(0, 0)));
    expect(startTiming(0.5, 0.5)).toBe(0);
  });
});

describe("bots in Jupiter's air, by what a Host's HUD shows", () => {
  const jupiter = arenaById('giant')!.layout;
  /** Jupiter's field without its rocks: only the air, the deck and the pull. */
  const air = () => {
    const f = testField();
    f.generate(jupiter);
    f.asteroids.clear();
    return f;
  };
  /** A point `depth` (m) under the deck, `x` (m) off the field's center. */
  const deep = (depth: number, x = 0) => {
    const radius = jupiter.air!.radius;
    return at(x * 20, Math.sqrt((radius - depth * 20) ** 2 - (x * 20) ** 2) - radius);
  };

  it('keep under the safe speed deep down and never let the air burn the hull', () => {
    const f = air();
    const me = ship('Kessler', deep(1500), at(1));
    const bot = new Bot(me, evenSkills(0.5));
    // a probe far off, deeper still: the bot wants to fly there as fast as it may
    bot.lure = deep(2200, 2500);
    const outside = new THREE.Vector3();
    let hottest = 0;
    let fastest = 0;
    let burnt = 0;
    for (let t = 0; t < 60; t += STEP) {
      // the game's rules (see Game.outside, Game.friction): gravity and drag, the clouds' shade, the air's heat
      f.gravity(me.flight.position, outside);
      dragOn(f.air!, me.flight.position, me.flight.velocity, STEP, outside);
      me.inShadow = altitudeIn(f.air!, me.flight.position) < 0;
      me.flight.update(STEP, bot.think(t, [me], f), outside);
      me.heat = Math.max(0, me.heat - me.cooling * STEP);
      burnt += airBurn(me, airHeat(altitudeIn(f.air!, me.flight.position), me.flight.velocity.length()) * STEP, STEP, MAX_HEAT);
      hottest = Math.max(hottest, me.heat);
      fastest = Math.max(fastest, me.flight.velocity.length() / safeSpeed(altitudeIn(f.air!, me.flight.position), me.cooling));
    }
    expect(hottest).toBeLessThan(MAX_HEAT);
    expect(burnt).toBe(0);
    expect(fastest).toBeLessThan(1);
    // it did get on its way
    expect(me.flight.position.distanceTo(deep(1500))).toBeGreaterThan(20000);
  });

  it('climb out of the air once its heat alarm sounds', () => {
    const f = air();
    const me = ship('Kessler', deep(1800), at(1));
    me.inShadow = true;
    me.heat = 90;
    me.flight.velocity.set(4500, 0, 0);
    const bot = new Bot(me, evenSkills(0.5));
    bot.lure = deep(2000, 3000);
    const outside = new THREE.Vector3();
    const start = altitudeIn(f.air!, me.flight.position);
    for (let t = 0; t < 4; t += STEP) {
      f.gravity(me.flight.position, outside);
      dragOn(f.air!, me.flight.position, me.flight.velocity, STEP, outside);
      me.flight.update(STEP, bot.think(t, [me], f), outside);
    }
    expect(altitudeIn(f.air!, me.flight.position)).toBeGreaterThan(start);
  });

  it('find a ship in the haze by radar farther than they see it, and fire only at what they see', () => {
    const f = air();
    const me = ship('Kessler', deep(1000), at(1));
    const bot = new Bot(me, evenSkills(1));
    // 1.2 km off a kilometer down: beyond the eye's 790 m, within the radar's 1.6 km
    const rival = ship('Halley', deep(1000, 1200), at(-1));
    let fired = false;
    for (let t = 0; t < 3; t += STEP) fired ||= bot.think(t, [me, rival], f).fire;
    expect(bot.target).toBe(rival);
    expect(fired).toBe(false);
    // 2 km off: beyond the radar too
    rival.flight.position.copy(deep(1000, 2000));
    bot.think(3, [me, rival], f);
    expect(bot.target).toBeNull();
  });

  it('lose a ship that dived under the deck, seen at a slant from above it', () => {
    const f = air();
    const me = ship('Kessler', deep(-150), at(1));
    const bot = new Bot(me, evenSkills(0.5));
    const rival = ship('Halley', deep(-50, 1500), at(-1));
    bot.think(0, [me, rival], f);
    expect(bot.target).toBe(rival);
    rival.flight.position.copy(deep(100, 1500));
    bot.think(0.1, [me, rival], f);
    expect(bot.target).toBeNull();
  });
});

describe('bots near the black hole, by their escape gauge', () => {
  /** Event Horizon's field without its rocks: only the hole and its pull. */
  const hole = () => {
    const f = testField();
    f.generate(arenaById('hole')!.layout);
    f.asteroids.clear();
    return f;
  };
  /** Flies the bot under the hole's pull for `seconds`; returns its nearest distance to the horizon (units). */
  const fly = (f: AsteroidField, bot: Bot, me: Ship, seconds: number) => {
    const well = f.well!;
    const outside = new THREE.Vector3();
    let nearest = Infinity;
    for (let t = 0; t < seconds; t += STEP) {
      f.gravity(me.flight.position, outside);
      me.flight.update(STEP, bot.think(t, [me], f), outside);
      nearest = Math.min(nearest, me.flight.position.distanceTo(well.position) - well.radius);
    }
    return nearest;
  };

  it('never fly into the hole for a probe on its far side', () => {
    for (const skill of [0, 0.5, 1]) {
      const f = hole();
      const me = ship('Kessler', at(30000), at(-1));
      const bot = new Bot(me, evenSkills(skill));
      bot.lure = at(-30000);
      expect(fly(f, bot, me, 60)).toBeGreaterThan(RADIUS * 2);
    }
  });

  it('burn out of a dive at the speed limit, straight at it from 1.5 km', () => {
    for (const skill of [0, 0.5, 1]) {
      const f = hole();
      const me = ship('Kessler', at(30000), at(-1));
      me.flight.velocity.set(-MAX_SPEED, 0, 0);
      const bot = new Bot(me, evenSkills(skill));
      bot.lure = at(-30000);
      expect(fly(f, bot, me, 20)).toBeGreaterThan(RADIUS * 2);
    }
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

describe('friendly fire: the own side is hit as any other, and bots hold their fire for it', () => {
  /** Ships of one side (Capture the Flag's, or every ship against the President's battleship). */
  const side = (...ships: Ship[]) => {
    for (const s of ships) s.team = 0;
  };

  it('ends a beam at the first hull on its line, a ship of the own side as any other', () => {
    const shooter = ship('Kessler', at(-8000), at(1));
    const ally = ship('Halley', at(0), at(1));
    const rival = ship('Laika', at(8000), at(1));
    side(shooter, ally);
    const hull = firstHull([shooter, ally, rival], shooter, at(-8000), at(1), LASER_RANGE);
    expect(hull?.ship).toBe(ally);
    expect(hull?.distance).toBeCloseTo(8000 - RADIUS, 0);
    // a dead ship takes no beam: it ends on the rival behind
    ally.alive = false;
    expect(firstHull([shooter, ally, rival], shooter, at(-8000), at(1), LASER_RANGE)?.ship).toBe(rival);
  });

  it('holds its laser while a ship of its own side is in its line of fire, and fires once the line is clear', () => {
    const f = field(false);
    // the rival flies away from the bot: its drive is open, the bot's nose on it
    const me = ship('Kessler', at(-8000), at(1));
    const ally = ship('Halley', at(0, RADIUS), at(0, 0, 1));
    const rival = ship('Laika', at(8000), at(1));
    side(me, ally);
    const fires = (ships: Ship[]) => {
      const bot = new Bot(me, evenSkills(1));
      let fired = false;
      for (let t = 0; t < 3; t += STEP) fired ||= bot.think(t, ships, f).fire;
      return fired;
    };
    expect(fires([me, ally, rival])).toBe(false);
    // well clear of the line, it is no reason to hold fire
    ally.flight.position.set(0, RADIUS * 4, 0);
    expect(fires([me, ally, rival])).toBe(true);
    // a ship of the other side in the way is fair game: the beam ends on it
    ally.flight.position.set(0, RADIUS, 0);
    ally.team = 1;
    expect(fires([me, ally, rival])).toBe(true);
  });

  it('holds its laser at the battleship while one of its own side flies between', () => {
    const f = field(false);
    const me = ship('Kessler', at(0, -12000), at(0, 1));
    const ally = ship('Halley', at(0, -6000), at(1));
    side(me, ally);
    const bot = new Bot(me, evenSkills(0.5));
    bot.siege = at(0);
    bot.siegeHold.set(0, -12000, 0);
    bot.siegeClear = true;
    let fired = false;
    for (let t = 0; t < 3; t += STEP) fired ||= bot.think(t, [me, ally], f).fire;
    expect(fired).toBe(false);
    ally.alive = false;
    for (let t = 3; t < 6; t += STEP) fired ||= bot.think(t, [me, ally], f).fire;
    expect(fired).toBe(true);
  });

  it('sends no torpedo while one of its own side lies near the line to the lock, unless rock covers it', () => {
    const me = ship('Kessler', at(-12000), at(1));
    const lock = ship('Laika', at(12000), at(1));
    const ally = ship('Halley', at(-2000, RADIUS + TORPEDO_CLEARANCE / 2), at(1));
    side(me, ally);
    const clear = (f: AsteroidField) => !allyInLine(me, [me, ally, lock], f, me.flight.position, at(1), 24000, TORPEDO_CLEARANCE);
    expect(clear(field(false))).toBe(false);
    ally.flight.position.set(-2000, RADIUS + TORPEDO_CLEARANCE * 2, 0);
    expect(clear(field(false))).toBe(true);
    // beyond the lock, the torpedo goes off before it gets there
    ally.flight.position.set(16000, 0, 0);
    expect(clear(field(false))).toBe(true);
    // behind the rock at the origin, out of sight and out of reach of the blast
    ally.flight.position.set(1000, 0, 0);
    lock.flight.position.set(20000, 0, 0);
    expect(clear(field(true))).toBe(true);
  });

  it('sets off a nova core only among rivals, never with one of its own side inside the blast', () => {
    const radius = 16000;
    const me = ship('Kessler', at(0), at(1));
    const rivals = [ship('Laika', at(4000), at(1)), ship('Juno', at(-4000), at(1))];
    const ally = ship('Halley', at(0, radius * 0.9), at(1));
    side(me, ally);
    expect(novaWorth(me, [me, ...rivals], radius)).toBe(true);
    expect(novaWorth(me, [me, rivals[0]], radius)).toBe(false);
    expect(novaWorth(me, [me, ...rivals, ally], radius)).toBe(false);
    ally.flight.position.set(0, radius * 1.1, 0);
    expect(novaWorth(me, [me, ...rivals, ally], radius)).toBe(true);
  });
});
