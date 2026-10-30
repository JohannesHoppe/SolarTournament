import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS } from '../world/arenas';
import { testField } from '../test/field';
import { ADRIFT_SECONDS, BASE_RADIUS, CORE_BRAKE, Flags, type Flier } from './flags';
import { HOOK_RANGE } from './hook';
import { MASS } from '../world/bodies';

const belt = ARENAS.find((a) => a.id === 'belt')!.layout;
const DT = 1 / 60;

/** Flags in the belt, the same on every browser. */
function flags() {
  const field = testField();
  field.generate(belt);
  return { field, flags: new Flags(field, belt.seed) };
}

type Pilot = Flier & { alive: boolean; kind: 'bot' | 'host' };
/** A pilot of this browser, a ship's radius (17 m), high above the field, far from bases and cores until a test moves it. */
function pilot(id: string, kind: 'bot' | 'host' = 'bot'): Pilot {
  const flight = { position: new THREE.Vector3(0, 30000, 0), velocity: new THREE.Vector3(), orientation: new THREE.Quaternion() };
  return { id, alive: true, radius: 340, kind, owner: null, flight, body: { position: flight.position, velocity: flight.velocity, mass: MASS.ship } };
}

/** The ships fly on their velocities for `seconds` from `now`, the lead's rules and the cores running every frame; returns the time then. */
function fly(f: Flags, ships: Pilot[], now: number, seconds: number, until: () => boolean = () => false): number {
  for (let t = 0; t < seconds && !until(); t += DT) {
    now += DT;
    for (const ship of ships) ship.flight.position.addScaledVector(ship.flight.velocity, DT);
    f.lead(ships, now);
    f.update(DT, ships, now);
  }
  return now;
}

/** Puts a carrier 500 m in front of its base's ring (on the field's side), flying for its middle at 200 m/s, the core it tows on the cable behind it, as fast; flies on for a second. */
function lineUp(f: Flags, ship: Pilot, side: number, ships: Pilot[], now: number) {
  const facing = f.facings[side];
  ship.flight.velocity.copy(facing).multiplyScalar(4000);
  ship.flight.orientation.setFromUnitVectors(new THREE.Vector3(0, 0, -1), facing);
  ship.flight.position.copy(f.bases[side]).addScaledVector(facing, -10000);
  const core = f.cores[1 - side];
  core.position.copy(ship.flight.position).addScaledVector(facing, -ship.radius * 5.2);
  core.previous.copy(core.position);
  core.velocity.copy(ship.flight.velocity);
  return fly(f, ships, now, 1);
}

/** Orange, a Host, against blue, a bot, sides given. */
function match() {
  const { field, flags: f } = flags();
  const orange = pilot('o', 'host');
  const blue = pilot('b');
  const ships = [orange, blue];
  f.lead(ships, 0);
  return { field, f, orange, blue, ships };
}

/** Orange has taken blue's core at its base; returns the time then too. */
function stolen() {
  const game = match();
  game.orange.flight.position.copy(game.f.bases[1]);
  return { ...game, now: fly(game.f, game.ships, 0, DT) };
}

/** How far a point lies along a base's axis from its ring (negative: on the field's side). */
const along = (f: Flags, side: number, point: THREE.Vector3) => point.clone().sub(f.bases[side]).dot(f.facings[side]);

describe('capture the flag', () => {
  it('lays out its bases alike on every browser, opposite each other and clear of rock', () => {
    const a = flags();
    const b = flags();
    expect(a.flags.bases.map((p) => p.toArray())).toEqual(b.flags.bases.map((p) => p.toArray()));
    expect(a.flags.bases[0].clone().add(a.flags.bases[1]).length()).toBeLessThan(1);
    for (const base of a.flags.bases) expect(a.field.overlap(base, BASE_RADIUS)).toBeNull();
  });

  it('spreads Hosts over both sides and evens the numbers out with bots', () => {
    const { flags: f } = flags();
    const ships = [pilot('host1', 'host'), pilot('host2', 'host'), ...Array.from({ length: 6 }, (_, i) => pilot(`bot${i}`))];
    f.lead(ships, 0);
    expect(f.teamOf('host1')).not.toBe(f.teamOf('host2'));
    expect(ships.filter((s) => f.teamOf(s.id) === 0).length).toBe(4);
    // two bots leave one side: a bot of the other side moves over
    const gone = ships.filter((s) => s.kind === 'bot' && f.teamOf(s.id) === 0).slice(0, 2);
    const left = ships.filter((s) => !gone.includes(s));
    f.lead(left, 1);
    const sides = [0, 1].map((team) => left.filter((s) => f.teamOf(s.id) === team).length);
    expect(Math.abs(sides[0] - sides[1])).toBeLessThan(2);
  });

  it('takes a core in tow, drops it with its carrier, sends it home, and captures', () => {
    const { f, orange, blue, ships } = match();
    expect([f.teamOf('o'), f.teamOf('b')]).toEqual([0, 1]);
    // orange flies to blue's core and takes it
    orange.flight.position.copy(f.bases[1]);
    f.lead(ships, 1);
    expect(f.cores[1].carrier).toBe('o');
    // and dies on the way home: the core drifts where it hung
    orange.flight.position.set(0, 0, 0);
    let now = fly(f, ships, 1, 1);
    orange.alive = false;
    f.lead(ships, (now += DT));
    expect(f.cores[1].carrier).toBeNull();
    expect(f.cores[1].home).toBe(false);
    // blue touches its own core adrift: it goes home
    blue.flight.position.copy(f.cores[1].position);
    f.lead(ships, (now += DT));
    expect(f.cores[1].home).toBe(true);
    // orange's next clone takes it again and brings it home through its ring
    orange.alive = true;
    blue.flight.position.set(0, 30000, 0);
    orange.flight.position.copy(f.bases[1]);
    now = fly(f, ships, now, DT);
    now = lineUp(f, orange, 0, ships, now);
    fly(f, ships, now, 3, () => f.captures[0] > 0);
    expect(f.captures).toEqual([1, 0]);
    expect(f.cores[1].home).toBe(true);
    expect(f.takeEvents().map((e) => e.kind)).toEqual(['grab', 'drop', 'return', 'grab', 'capture']);
  });

  it('captures when the core on its cable passes through the ring, not when its carrier does', () => {
    const { f, orange, ships, now: taken } = stolen();
    let now = lineUp(f, orange, 0, ships, taken);
    // the core hangs on its cable, about 75 m behind the ship's stern
    const cable = orange.flight.position.distanceTo(f.cores[1].position);
    expect(cable).toBeGreaterThan(orange.radius * 4.5);
    expect(cable).toBeLessThan(orange.radius * 5.5);
    // the carrier is through its ring, the core on its cable not yet: no capture
    now = fly(f, ships, now, 2, () => along(f, 0, orange.flight.position) > 0);
    expect(along(f, 0, f.cores[1].position)).toBeLessThan(0);
    expect(f.captures).toEqual([0, 0]);
    // the core follows through the ring's opening a moment later: a capture
    fly(f, ships, now, 1, () => f.captures[0] > 0);
    expect(f.captures).toEqual([1, 0]);
  });

  it('takes a core bitten by the harpoon from afar, on a cable the winch reels in', () => {
    const { f, orange, blue, ships } = match();
    // 800 m in front of blue's ring, its core in reach of the hook
    orange.flight.position.copy(f.bases[1]).addScaledVector(f.facings[1], -16000);
    expect(f.hookable(orange).map((mark) => mark.team)).toEqual([1]);
    f.claim('o', 1);
    let now = fly(f, ships, 0, DT);
    expect(f.cores[1].carrier).toBe('o');
    // the core comes in on the long cable, and hangs on the short one a few seconds later
    expect(orange.flight.position.distanceTo(f.cores[1].position)).toBeGreaterThan(HOOK_RANGE / 2);
    now = fly(f, ships, now, 6);
    expect(orange.flight.position.distanceTo(f.cores[1].position)).toBeLessThan(orange.radius * 5.5);
    // a core in tow is no mark for a harpoon; a claim from beyond the hook's reach takes nothing
    expect(f.hookable(blue).map((mark) => mark.team)).toEqual([0]);
    orange.alive = false;
    now = fly(f, ships, now, DT);
    blue.flight.position.copy(f.cores[1].position).add(new THREE.Vector3(0, 40000, 0));
    f.claim('b', 1);
    now = fly(f, ships, now, DT);
    expect(f.cores[1].home).toBe(false);
    // from within it, blue's harpoon on its own core adrift sends it home
    blue.flight.position.copy(f.cores[1].position).add(new THREE.Vector3(0, 15000, 0));
    f.claim('b', 1);
    fly(f, ships, now, DT);
    expect(f.cores[1].home).toBe(true);
    expect(f.takeEvents().map((e) => [e.kind, e.ship])).toEqual([
      ['grab', 'o'],
      ['drop', 'o'],
      ['return', 'b'],
    ]);
  });

  it('lets a core go where it hangs, with its own velocity, and its thrusters bring it to rest', () => {
    const { f, orange, ships, now: taken } = stolen();
    let now = taken;
    // away from the field at 200 m/s: the cable comes taut, and the core flies along on it
    orange.flight.velocity.copy(f.facings[1]).multiplyScalar(4000);
    now = fly(f, ships, now, 3);
    expect(f.cores[1].velocity.distanceTo(orange.flight.velocity)).toBeLessThan(400);
    const hung = f.cores[1].position.clone();
    const moving = f.cores[1].velocity.clone();
    orange.alive = false;
    f.lead(ships, (now += DT));
    expect(f.cores[1].carrier).toBeNull();
    expect(f.cores[1].position).toEqual(hung);
    expect(f.cores[1].velocity).toEqual(moving);
    // it comes to rest after speed / CORE_BRAKE seconds, about speed² / 2 CORE_BRAKE on
    const speed = moving.length();
    now = fly(f, ships, now, speed / CORE_BRAKE + 0.5);
    expect(f.cores[1].velocity.length()).toBe(0);
    expect(f.cores[1].position.distanceTo(hung) / (speed ** 2 / (2 * CORE_BRAKE))).toBeCloseTo(1, 1);
  });

  describe('the tow rope', () => {
    /** Orange with blue's core in tow, both at rest far above the field, the core `slack` short of the cable's length behind the stern. */
    function towing(slack: number) {
      const { f, orange, ships, now: taken } = stolen();
      orange.flight.position.set(0, 60000, 0);
      const core = f.cores[1];
      core.position.set(0, 60000, orange.radius * (0.8 + 4.5) - slack);
      core.previous.copy(core.position);
      core.velocity.set(0, 0, 0);
      return { f, orange, ships, core, now: fly(f, ships, taken, DT) };
    }
    /** The momentum of ship and core along z, in ship masses (the core weighs a quarter). */
    const momentum = (ship: Pilot, core: { velocity: THREE.Vector3 }) => ship.flight.velocity.z + 0.25 * core.velocity.z;

    it('only pulls: slack, the ship flies on; taut, it jerks the core along and is slowed', () => {
      const { f, orange, ships, core, now } = towing(1000);
      orange.flight.velocity.set(0, 0, -2000);
      // 50 m of slack: nothing pulls for a moment
      let later = fly(f, ships, now, 0.4);
      expect(orange.flight.velocity.z).toBe(-2000);
      expect(core.velocity.length()).toBe(0);
      later = fly(f, ships, later, 0.5);
      // taut: the core is yanked along and the ship tugged back, momentum kept
      expect(core.velocity.z).toBeLessThan(-1000);
      expect(orange.flight.velocity.z).toBeGreaterThan(-1900);
      expect(momentum(orange, core)).toBeCloseTo(-2000, -1);
      // and the cable holds its length
      for (let t = 0; t < 1; t += DT) {
        later = fly(f, ships, later, DT);
        expect(core.position.distanceTo(orange.flight.position)).toBeLessThan(orange.radius * 5.3 + 5);
      }
    });

    it('never pushes: a ship flying back towards its core leaves the cable slack', () => {
      const { f, orange, ships, core, now } = towing(0);
      orange.flight.velocity.set(0, 0, 500);
      fly(f, ships, now, 1);
      expect(orange.flight.velocity.z).toBe(500);
      expect(core.velocity.length()).toBe(0);
    });

    it('passes momentum the other way: a core flung away pulls its ship after it', () => {
      const { f, orange, ships, core, now } = towing(0);
      core.velocity.set(0, 0, 2000);
      fly(f, ships, now, 0.2);
      expect(orange.flight.velocity.z).toBeGreaterThan(100);
      expect(momentum(orange, core)).toBeCloseTo(500, -1);
    });

    it('bumps into its ship and bounces off, both shoved, nothing harmed', () => {
      const { f, orange, ships, core, now } = towing(0);
      orange.flight.velocity.set(0, 0, 0);
      core.velocity.set(0, 0, -2000);
      fly(f, ships, now, 1.5);
      // it came back off the hull, and the ship took a shove forward
      expect(orange.flight.velocity.z).toBeLessThan(-100);
      expect(momentum(orange, core)).toBeCloseTo(-500, -1);
      expect(orange.alive).toBe(true);
    });
  });

  it('bounces a core adrift off rock', () => {
    const { field, f, orange, ships, now: taken } = stolen();
    orange.alive = false;
    let now = fly(f, ships, taken, DT);
    // set loose 100 m off the nearest rock's surface, at 100 m/s towards its center
    const rock = [...field.asteroids.values()].sort((a, b) => a.object.position.distanceTo(f.bases[1]) - b.object.position.distanceTo(f.bases[1]))[0];
    const away = f.bases[1].clone().sub(rock.object.position).normalize();
    f.cores[1].position.copy(rock.object.position).addScaledVector(away, rock.radius + 2000);
    f.cores[1].velocity.copy(away).multiplyScalar(-2000);
    let deepest = Infinity;
    for (let t = 0; t < 3; t += DT) {
      now = fly(f, ships, now, DT);
      deepest = Math.min(deepest, f.cores[1].position.distanceTo(rock.object.position));
      expect(field.overlap(f.cores[1].position, 100)).toBeNull();
    }
    expect(deepest).toBeLessThan(rock.radius + 2000);
  });

  it('keeps a core in tow whose cable a rock comes across: the cable lies on the rock', () => {
    const { field, f, orange, ships, now: taken } = stolen();
    f.takeEvents();
    const rock = [...field.asteroids.values()].sort((a, b) => a.object.position.distanceTo(f.bases[1]) - b.object.position.distanceTo(f.bases[1]))[0];
    const center = rock.object.position;
    const off = rock.radius + 2000;
    // the core held still beyond the rock, the carrier coming down past its other side
    const core = center.clone().add(new THREE.Vector3(-off, off, 0));
    let now = taken;
    let wrapped = 0;
    for (let y = off; y > -off; y -= 50) {
      now += DT;
      f.cores[1].position.copy(core);
      f.cores[1].velocity.set(0, 0, 0);
      orange.flight.position.copy(center).add(new THREE.Vector3(off, y, 0));
      f.lead(ships, now);
      expect(f.cores[1].carrier).toBe('o');
      wrapped = Math.max(wrapped, f.cores[1].lies.count);
    }
    expect(wrapped).toBeGreaterThan(0);
    expect(f.takeEvents()).toEqual([]);
  });

  it('loses a core whose tow cable a rock swept through: the cable snaps, the core flies on', () => {
    const { field, f, orange, ships, now: taken } = stolen();
    f.takeEvents();
    // the carrier on one side of the nearest rock, its core on the other
    const rock = [...field.asteroids.values()].sort((a, b) => a.object.position.distanceTo(f.bases[1]) - b.object.position.distanceTo(f.bases[1]))[0];
    const across = new THREE.Vector3(1, 0, 0);
    orange.flight.position.copy(rock.object.position).addScaledVector(across, rock.radius + 2000);
    f.cores[1].position.copy(rock.object.position).addScaledVector(across, -rock.radius - 2000);
    f.cores[1].velocity.set(0, 1000, 0);
    f.lead(ships, taken + DT);
    expect(orange.alive).toBe(true);
    expect(f.cores[1].carrier).toBeNull();
    expect(f.cores[1].home).toBe(false);
    expect(f.takeEvents().map((e) => [e.kind, e.ship])).toEqual([['drop', 'o']]);
    f.update(DT, ships, taken + DT);
    expect(f.cores[1].velocity.y).toBeGreaterThan(0);
  });

  it('sends a core adrift home after a while', () => {
    const { f, orange, ships } = stolen();
    orange.alive = false;
    f.lead(ships, 2);
    expect(f.cores[1].home).toBe(false);
    f.lead(ships, 2 + ADRIFT_SECONDS + 0.1);
    expect(f.cores[1].home).toBe(true);
  });

  it('is followed by the other browsers as the lead sends it', () => {
    const { f: lead, orange, ships, now: taken } = stolen();
    let now = taken;
    const other = flags().flags;
    other.follow(JSON.parse(JSON.stringify(lead.toState())), now);
    expect(other.teamOf('b')).toBe(1);
    expect(other.cores[1].carrier).toBe('o');
    // a browser that just came does not hear what happened before it
    expect(other.takeEvents()).toEqual([]);
    now = lineUp(lead, orange, 0, ships, now);
    fly(lead, ships, now, 3, () => lead.captures[0] > 0);
    other.follow(JSON.parse(JSON.stringify(lead.toState())), now);
    expect(other.captures).toEqual([1, 0]);
    expect(other.takeEvents().map((e) => e.kind)).toEqual(['capture']);
  });
});
