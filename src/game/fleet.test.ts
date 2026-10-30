import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARRIVAL, BATTERY_PERIOD, DODGE_MASS, Fleet, FLEET_SPEED, HANGAR_CEILING, HANGAR_FLOOR, HANGAR_WIDTH, HANGARS, PLUME_REACH, SINK_SECONDS, TORPEDO_HITS, type Target } from './fleet';
import { Randomizer } from '../random';
import { MASS, massOf } from '../world/bodies';
import { Wrecks } from '../world/wrecks';
import { PROBE_RADIUS, Probes } from './items';
import { Bot, evenSkills, SIEGE_DISTANCE } from '../ship/bots';
import type { Ship } from '../ship/ship';
import { testField } from '../test/field';
import { arenaById, ARENAS, RING_SHEET, type ArenaProfile } from '../world/arenas';
import { DISTANT_DETAIL } from '../world/rocks';
import { HULL_BOXES } from '../world/shapes';
import { ROUND_SECONDS } from '../music/songs';
import { COMET_SPEED, cometAt, cometEnd, cometStart, headAt, headEnd, HEAD_RADIUS, makeComet, meetObstacle, PIECE_RADIUS, roundComets, runDown, Shower, SHOWER_PIECES } from './comet';
import { RAMMED, type Asteroid, type AsteroidField, type ShovedState } from '../world/asteroids';
import { Human, SEEDS, SPREAD } from '../test/human';
import { SHIP_RADIUS, startFlight, STEP } from '../test/pilot';

/** A battleship in the arena, its bow along -z at the center, unturned. */
function battleship() {
  const fleet = new Fleet(7);
  fleet.arrivesAt = 0;
  fleet.position.set(0, 0, 0);
  fleet.quaternion.identity();
  fleet.velocity.set(0, 0, 0);
  fleet.root.updateMatrixWorld();
  fleet.update(1, 0);
  return fleet;
}

const zonesOf = (fleet: Fleet, kind: string) => fleet.zones.flatMap((zone, i) => (zone.kind === kind ? [i] : []));
const breakAll = (fleet: Fleet, zones: number[]) => zones.flatMap((zone) => Array.from({ length: fleet.hitsOf(zone) }, () => fleet.hit(zone)).flat());
const down = new THREE.Vector3(0, -1, 0);

describe("the President's fleet", () => {
  it('takes a beam on its armor, its batteries, and its reactor only once the dome is open', () => {
    const fleet = battleship();
    const reactor = zonesOf(fleet, 'reactor')[0];
    const above = fleet.zones[reactor].at.clone().setY(20000);
    expect(fleet.raycast(above, down, 40000, 1)?.zone).toBe(-1);
    const battery = zonesOf(fleet, 'battery')[0];
    expect(fleet.raycast(fleet.zones[battery].at.clone().setY(20000), down, 40000, 1)?.zone).toBe(battery);
    // a battery that is broken lets the beam through to the armor below it
    breakAll(fleet, [battery]);
    expect(fleet.raycast(fleet.zones[battery].at.clone().setY(20000), down, 40000, 1)?.zone).toBe(-1);
    breakAll(fleet, zonesOf(fleet, 'battery'));
    expect(fleet.phase).toBe(3);
    expect(fleet.raycast(above, down, 40000, 1)?.zone).toBe(reactor);
    // far beside it, nothing
    expect(fleet.raycast(new THREE.Vector3(30000, 20000, 0), down, 40000, 1)).toBeNull();
  });

  it('turns to its plume at half its batteries, and goes down with its reactor, once a round', () => {
    const fleet = battleship();
    const batteries = zonesOf(fleet, 'battery');
    breakAll(fleet, batteries.slice(0, batteries.length / 2));
    expect(fleet.phase).toBe(2);
    breakAll(fleet, batteries);
    // hits on the sealed reactor count nothing until the dome is open
    const reactor = zonesOf(fleet, 'reactor')[0];
    const sunk = breakAll(fleet, [reactor]).filter((e) => e.kind === 'sunk');
    expect(sunk).toHaveLength(1);
    // it burns with its reactor critical, then it is over: no next one, and no more hits count
    expect(fleet.present(1)).toBe(false);
    expect(fleet.sunk(SINK_SECONDS / 2)).toBe(false);
    expect(fleet.sunk(SINK_SECONDS + 0.1)).toBe(true);
    expect(fleet.present(1000)).toBe(false);
    expect(fleet.hit(batteries[0])).toEqual([]);
  });

  it('fires each battery once a period, at the same moments everywhere', () => {
    const fleet = battleship();
    let shots = 0;
    for (let clock = 0; clock <= BATTERY_PERIOD * 10; clock += 1 / 60) shots += fleet.firing(clock).length;
    expect(shots).toBeGreaterThanOrEqual(zonesOf(fleet, 'battery').length * 9);
    expect(shots).toBeLessThanOrEqual(zonesOf(fleet, 'battery').length * 11);
  });

  it('hides what is behind its hull and sets off a torpedo that touches it', () => {
    const fleet = battleship();
    const across = new THREE.Vector3(1, 0, 0);
    expect(fleet.ray(new THREE.Vector3(-20000, 0, 0), across, 40000)).not.toBeNull();
    // a ray that stops short of it, or passes above it, sees past
    expect(fleet.ray(new THREE.Vector3(-20000, 0, 0), across, 10000)).toBeNull();
    expect(fleet.ray(new THREE.Vector3(-20000, 5000, 0), across, 40000)).toBeNull();
    expect(fleet.touches(new THREE.Vector3(0, 900, 0), 120)).toBe(true);
    expect(fleet.touches(new THREE.Vector3(0, 3000, 0), 120)).toBe(false);
    // gone up, it is gone from the field
    breakAll(fleet, zonesOf(fleet, 'battery'));
    breakAll(fleet, zonesOf(fleet, 'reactor'));
    fleet.update(SINK_SECONDS + 100, 0);
    expect(fleet.ray(new THREE.Vector3(-20000, 0, 0), across, 40000)).toBeNull();
  });

  it('counts a torpedo as TORPEDO_HITS hits on every open part it goes off near, and lets one lock on them', () => {
    const fleet = battleship();
    const battery = zonesOf(fleet, 'battery')[0];
    const reactor = zonesOf(fleet, 'reactor')[0];
    expect(fleet.beacons[battery].alive).toBe(true);
    expect(fleet.beacons[battery].flight.position.distanceTo(fleet.zoneAt(battery))).toBeLessThan(1);
    // the sealed reactor is no target
    expect(fleet.beacons[reactor].alive).toBe(false);
    const at = fleet.zoneAt(battery).add(new THREE.Vector3(0, 400, 0));
    for (const zone of fleet.blast(at)) fleet.hit(zone, TORPEDO_HITS);
    expect(fleet.blast(at)).toEqual([battery]);
    expect(fleet.hits[battery]).toBe(TORPEDO_HITS);
    // more hits than a part has left break it and count no further
    fleet.hit(battery, fleet.hitsOf(battery));
    expect(fleet.hits[battery]).toBe(fleet.hitsOf(battery));
    expect(fleet.beacons[battery].alive).toBe(false);
  });

  it('shows each part on the side it faces, where a ship attacking it holds, from wherever it comes', () => {
    const fleet = battleship();
    const field = testField();
    const reactor = zonesOf(fleet, 'reactor')[0];
    const keel = new THREE.Vector3(0, -30000, 0);
    // under the keel the reactor on deck is hidden by the hull, and so is a battery on deck
    breakAll(fleet, zonesOf(fleet, 'battery').filter((zone) => fleet.zones[zone].at.y < 0));
    const deck = zonesOf(fleet, 'battery').find((zone) => fleet.zones[zone].at.y > 0)!;
    expect(fleet.inSight(deck, keel, field)).toBe(false);
    const hold = new THREE.Vector3();
    for (const from of [keel, new THREE.Vector3(30000, 0, 0), new THREE.Vector3(0, 30000, 0), new THREE.Vector3(0, 0, 30000), new THREE.Vector3(0, 0, -30000)]) {
      fleet.siegeFrom(deck, from, SIEGE_DISTANCE, hold);
      expect(hold.distanceTo(fleet.zoneAt(deck))).toBeCloseTo(SIEGE_DISTANCE, 0);
      expect(fleet.inSight(deck, hold, field)).toBe(true);
    }
    breakAll(fleet, zonesOf(fleet, 'battery'));
    expect(fleet.inSight(reactor, keel, field)).toBe(false);
    for (const zone of [reactor, ...zonesOf(fleet, 'drive')]) {
      for (const from of [keel, new THREE.Vector3(-30000, 0, 0), new THREE.Vector3(0, 0, -30000)]) {
        fleet.siegeFrom(zone, from, SIEGE_DISTANCE, hold);
        expect(fleet.inSight(zone, hold, field)).toBe(true);
      }
    }
    // the keel's batteries show themselves below it
    const fresh = battleship();
    for (const zone of zonesOf(fresh, 'battery').filter((zone) => fresh.zones[zone].at.y < 0)) {
      fresh.siegeFrom(zone, new THREE.Vector3(0, 30000, 0), SIEGE_DISTANCE, hold);
      expect(hold.y).toBeLessThan(fresh.zones[zone].at.y);
      expect(fresh.inSight(zone, hold, field)).toBe(true);
    }
  });

  it('pushes a ship out of its hull', () => {
    const fleet = battleship();
    const center = new THREE.Vector3(0, 700, -1000);
    const normal = fleet.resolve(center, 300, 1)!;
    expect(normal.y).toBeCloseTo(1);
    expect(center.y).toBeGreaterThan(800 + 300);
  });

  it("collides at its batteries' turrets and barrels, its drives' bells and its bared reactor, and takes a beam or a torpedo there as on the part", () => {
    const fleet = battleship();
    const battery = zonesOf(fleet, 'battery')[0];
    // the muzzles, 85 m before the battery's mount, beyond its sphere
    const muzzle = fleet.zones[battery].at.clone().add(new THREE.Vector3(0, 0, -1750));
    expect(muzzle.distanceTo(fleet.zones[battery].at)).toBeGreaterThan(fleet.zones[battery].radius);
    expect(fleet.touches(muzzle, 50)).toBe(true);
    const ship = muzzle.clone().add(new THREE.Vector3(0, 200, 0));
    expect(fleet.resolve(ship, SHIP_RADIUS, 1)!.y).toBeCloseTo(1);
    expect(fleet.raycast(muzzle.clone().setY(20000), down, 40000, 1)?.zone).toBe(battery);
    expect(fleet.blast(muzzle.clone().add(new THREE.Vector3(0, 300, 0)))).toContain(battery);
    // broken, it is gone, and a beam goes through to whatever lies below
    breakAll(fleet, [battery]);
    expect(fleet.touches(muzzle, 50)).toBe(false);
    expect(fleet.raycast(muzzle.clone().setY(20000), down, 40000, 1)?.zone ?? -1).not.toBe(battery);
    // the drive's bell astern of the hull, burnt out or not
    const drive = zonesOf(fleet, 'drive')[0];
    const bell = fleet.zones[drive].at.clone().setZ(11600);
    expect(fleet.touches(bell, 10)).toBe(true);
    const behind = bell.clone().setZ(12000);
    expect(fleet.resolve(behind, SHIP_RADIUS, 1)!.z).toBeCloseTo(1);
    const astern = new THREE.Vector3(0, 0, -1);
    expect(fleet.raycast(bell.clone().setZ(30000), astern, 40000, 1)?.zone).toBe(drive);
    breakAll(fleet, [drive]);
    expect(fleet.touches(bell, 10)).toBe(true);
    expect(fleet.raycast(bell.clone().setZ(30000), astern, 40000, 1)?.zone).toBe(-1);
    // the reactor's core where it bulges out of the deck, once the dome is open
    const reactor = zonesOf(fleet, 'reactor')[0];
    const core = fleet.zones[reactor].at.clone().add(new THREE.Vector3(0, 500, 0));
    breakAll(fleet, zonesOf(fleet, 'battery'));
    expect(fleet.phase).toBe(3);
    expect(fleet.touches(core, 10)).toBe(true);
    expect(fleet.touches(core.clone().setY(core.y + 300), 10)).toBe(false);
  });

  it("breaks a comet's head that runs into it, and stops each piece of its shower where it meets the hull", () => {
    const fleet = battleship();
    // a comet along x through the center at field time 100: into the battleship's flank
    const comet = makeComet(100, new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 5);
    const shower = new Shower(comet);
    const head = new THREE.Vector3();
    const piece = new THREE.Vector3();
    const step = 1 / 60;
    let stopped = 0;
    for (let time = cometStart(comet); time < cometEnd(comet); time += step) {
      fleet.update(time, 0);
      meetObstacle(comet, shower, fleet, time, step, () => stopped++);
      if (time < headEnd(comet)) expect(fleet.touches(headAt(comet, time, head), HEAD_RADIUS), `${time}`).toBe(false);
      for (let i = 0; i < SHOWER_PIECES; i++) if (!shower.gone(i, time)) expect(fleet.touches(shower.pieceAt(i, time, piece), PIECE_RADIUS), `piece ${i} at ${time}`).toBe(false);
    }
    // it broke on the flank, coming from -x
    expect(comet.broken).toBeLessThan(100);
    expect(headAt(comet, comet.broken, head).x).toBeLessThan(0);
    expect(headAt(comet, comet.broken, head).x).toBeGreaterThan(-6000 - HEAD_RADIUS - COMET_SPEED * step * 2);
    // the swarm behind the hull is stopped where the hull stands in its way, and flies on around it
    expect(stopped).toBeGreaterThan(SHOWER_PIECES / 10);
    expect(stopped).toBeLessThan(SHOWER_PIECES);
  });

  it('stays solid while it sinks, for ships as for rays and torpedoes, and is gone once it went up', () => {
    const fleet = battleship();
    breakAll(fleet, zonesOf(fleet, 'battery'));
    breakAll(fleet, zonesOf(fleet, 'reactor'));
    const sinking = SINK_SECONDS / 2;
    fleet.update(sinking, 0);
    expect(fleet.present(sinking)).toBe(false);
    expect(fleet.touches(new THREE.Vector3(0, 900, 0), 120)).toBe(true);
    expect(fleet.resolve(new THREE.Vector3(0, 700, 0), 300, sinking)).not.toBeNull();
    const gone = SINK_SECONDS + 100;
    fleet.update(gone, 0);
    expect(fleet.touches(new THREE.Vector3(0, 900, 0), 120)).toBe(false);
    expect(fleet.resolve(new THREE.Vector3(0, 700, 0), 300, gone)).toBeNull();
  });

  it('turns its stern on the nearest pilot in its second phase and burns it', () => {
    const fleet = battleship();
    const batteries = zonesOf(fleet, 'battery');
    breakAll(fleet, batteries.slice(0, batteries.length / 2));
    const pilot: Target = { id: 'p:a', alive: true, flight: { position: new THREE.Vector3(15000, 0, 0) } };
    for (let t = 0; t < 30; t += 0.1) fleet.lead(0.1, 1 + t, [pilot]);
    expect(fleet.target).toBe('p:a');
    expect(fleet.burning).toBe(true);
    expect(fleet.plumeAt(pilot.flight.position, 300)).toBeGreaterThan(0);
    // beyond the plume's reach it burns nothing
    expect(fleet.plumeAt(pilot.flight.position.clone().setLength(PLUME_REACH * 2), 300)).toBe(0);
    // a bot in it flies away from its axis, out to the side
    const axis = fleet.plumeNear(pilot.flight.position, 2300, new THREE.Vector3())!;
    expect(axis.distanceTo(pilot.flight.position)).toBeLessThan(2300 + 1400 + PLUME_REACH * 0.12);
    expect(fleet.plumeNear(new THREE.Vector3(15000, 0, 20000), 2300, new THREE.Vector3())).toBeNull();
  });

  it('is followed by the other browsers as the lead flies it', () => {
    const lead = battleship();
    const other = new Fleet(7);
    expect(other.present(ARRIVAL - 1)).toBe(false);
    const battery = zonesOf(lead, 'battery')[0];
    breakAll(lead, [battery]);
    let events = other.follow(JSON.parse(JSON.stringify(lead.toState())));
    expect(other.broken(battery)).toBe(true);
    expect(events.map((e) => e.kind)).toEqual(['broken']);
    expect(other.position.distanceTo(lead.position)).toBeLessThan(1);
    breakAll(lead, zonesOf(lead, 'battery'));
    breakAll(lead, zonesOf(lead, 'reactor'));
    events = other.follow(JSON.parse(JSON.stringify(lead.toState())));
    expect(events.map((e) => e.kind)).toContain('sunk');
    expect(other.down).toBe(true);
    // a browser that comes after it went down sees it gone, with no blast to set off
    const late = new Fleet(7);
    expect(late.follow(JSON.parse(JSON.stringify(lead.toState())))).toEqual([]);
    expect(late.down).toBe(true);
  });
});

describe("the battleship and the field's rock", () => {
  const field = testField(DISTANT_DETAIL, HULL_BOXES);
  const STEP_SECONDS = 0.1;
  /** How deep anything may lie in the hull once a step is resolved (units, 10 cm). */
  const DEPTH = 2;
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  /**
   * Flies the battleship of `arena` through a whole round, the field moving on its orbits, the
   * round's comets running down rock as they come and meeting the hull; every two seconds a
   * piece of wreckage and a dropped probe come at it from 1.5 km, 100 m/s faster than it;
   * `hunted`, half its batteries are broken from the start and a pilot circles it above and
   * below, so its stern swings after him, and its drives are shot out half way. Returns the
   * pieces it dodges (see DODGE_MASS) its hull (hangars and dome included) ever reached into,
   * whatever of the field, the shower, the wreckage and the probes lay in its hull (turrets and
   * bells included) once a step was resolved, each with the field time, the pieces it rammed
   * aside, and how many of the wreckage and probes met it.
   */
  const sail = (arena: ArenaProfile, hunted: boolean) => {
    field.generate(arena.layout);
    const fleet = new Fleet(arena.layout.seed, field, arena.sheet);
    field.obstacle = fleet;
    const wrecks = new Wrecks();
    const probes = new Probes();
    // the first round of the arena's seed that has comets
    const comets = hunted ? [] : (Array.from({ length: 20 }, (_, round) => roundComets(arena.layout.seed, round, field.well, false)).find((list) => list.length) ?? []);
    let shower = null as Shower | null;
    const pilot = { id: 'p:a', alive: true, flight: { position: new THREE.Vector3() } };
    if (hunted) breakAll(fleet, zonesOf(fleet, 'battery').slice(0, 3));
    const touched: string[] = [];
    const inside: string[] = [];
    const rammed = new Set<string>();
    let met = 0;
    let sent = 0;
    const random = new Randomizer(arena.layout.seed);
    let hunts = false;
    for (let time = 0; time < ARRIVAL + ROUND_SECONDS && !fleet.down; time += STEP_SECONDS) {
      field.setClock(time);
      const comet = cometAt(comets, time);
      const flying = comet && time >= cometStart(comet) && time <= cometEnd(comet) ? comet : null;
      if (shower?.comet !== flying) shower = flying ? new Shower(flying) : null;
      if (flying) runDown(flying, field, time, () => {});
      if (hunted && time > ARRIVAL + ROUND_SECONDS / 2 && fleet.drives > 0) breakAll(fleet, zonesOf(fleet, 'drive'));
      pilot.flight.position.set(Math.cos(time * 0.2) * 15000, Math.sin(time * 0.13) * 12000, Math.sin(time * 0.2) * 15000).add(fleet.position);
      fleet.lead(STEP_SECONDS, time, hunted ? [pilot] : [], comets);
      fleet.update(time, time);
      for (const state of fleet.rams) rammed.add(state.id);
      fleet.rams.length = 0;
      if (flying) meetObstacle(flying, shower, fleet, time, STEP_SECONDS);
      if (!fleet.present(time)) continue;
      // wreckage and a probe thrown at it
      if (Math.round(time / STEP_SECONDS) % 20 === 0) {
        const from = new THREE.Vector3(random.range(-1, 1), random.range(-1, 1), random.range(-1, 1)).normalize();
        const at = from.clone().multiplyScalar(30000).add(fleet.position);
        const velocity = from.clone().multiplyScalar(-2000).add(fleet.velocity);
        wrecks.spawn(`b:x:${sent}`, 0, at, velocity, 350, time);
        probes.drop(`b:x:${sent}`, 0, ['repair'], at, velocity, time);
        sent++;
      }
      const before = wrecks.list.length;
      wrecks.update(STEP_SECONDS, time, field);
      met += before - wrecks.list.length;
      probes.update(STEP_SECONDS, time, field);
      hunts ||= fleet.target === pilot.id;
      const when = `at ${time.toFixed(1)} s`;
      for (const piece of field.asteroids.values()) {
        if (massOf(piece) >= DODGE_MASS && fleet.reaches(piece.object.position, piece.radius)) touched.push(`${piece.id} ${when}`);
        if (fleet.depthOf(piece, time, normal, point) > DEPTH) inside.push(`${piece.id} ${when}`);
      }
      for (const wreck of wrecks.list) if (fleet.touches(wreck.mesh.position, wreck.radius)) inside.push(`wreck ${wreck.id} ${when}`);
      for (const probe of probes.list) {
        if (fleet.touches(probe.position, PROBE_RADIUS)) inside.push(`probe ${probe.id} ${when}`);
        if (fleet.touches(probe.position, PROBE_RADIUS + 200)) met++;
      }
      if (shower && time < headEnd(shower.comet) && fleet.touches(headAt(shower.comet, time, point), HEAD_RADIUS)) inside.push(`comet ${when}`);
      for (let i = 0; shower && i < SHOWER_PIECES; i++) if (!shower.gone(i, time) && fleet.touches(shower.pieceAt(i, time, point), PIECE_RADIUS)) inside.push(`shower piece ${i} ${when}`);
    }
    field.obstacle = null;
    return { touched, inside, rammed: rammed.size, met, hunts, comets: comets.length };
  };

  /** A whole round flown step by step takes a few seconds, more on a busy machine. */
  const ROUND_TEST = 30000;
  for (const arena of ARENAS) {
    it(`keeps clear of the heavy pieces of ${arena.id}'s field over a whole round past the round's comets, rams the light ones aside, and nothing ever lies in its hull, wreckage and probes neither`, () => {
      const passing = sail(arena, false);
      expect(passing.comets).toBeGreaterThan(0);
      expect(passing.touched).toEqual([]);
      expect(passing.inside).toEqual([]);
      expect(passing.met).toBeGreaterThan(0);
    }, ROUND_TEST);
    it(`does so in ${arena.id} with its stern hunting a pilot, and adrift`, () => {
      const hunting = sail(arena, true);
      expect(hunting.hunts).toBe(true);
      expect(hunting.touched).toEqual([]);
      expect(hunting.inside).toEqual([]);
    }, ROUND_TEST);
  }

  it("flies its orbit over the Rings of Saturn's sheet of ice, clear of it, and in the plane where nothing is in its way", () => {
    const rings = arenaById('rings')!;
    field.generate(rings.layout);
    // its keel over the drawn sheet, and over the layer's chunks without it
    const fleet = new Fleet(23, field, rings.sheet);
    expect(fleet.lane).toBeGreaterThan(RING_SHEET);
    expect(fleet.reaches(fleet.position.clone().setY(RING_SHEET), 1)).toBe(false);
    expect(fleet.reaches(fleet.position.clone().setY(fleet.lane - 1000), 1)).toBe(true);
    expect(new Fleet(23, field).lane).toBeGreaterThan(1600);
    field.generate(arenaById('giant')!.layout);
    expect(new Fleet(47, field).lane).toBe(0);
  });

  const rings = arenaById('rings')!;
  /** The world velocity of a piece's center. */
  const drift = (piece: Asteroid) => field.surfaceVelocity(piece, piece.object.position, new THREE.Vector3());
  const momentum = (piece: Asteroid, fleet: Fleet) => drift(piece).multiplyScalar(massOf(piece)).addScaledVector(fleet.velocity, MASS.battleship);

  it('rams a chunk of ice a tenth of its mass aside, barely slowed, the two trading momentum, nothing left in its hull', () => {
    const { fleet, piece } = bowOn(field, rings, 0.1);
    const before = momentum(piece, fleet);
    fleet.ram(1);
    expect(fleet.rams.map((state) => state.id)).toEqual([piece.id]);
    expect(momentum(piece, fleet).distanceTo(before)).toBeLessThan(before.length() * 1e-4);
    // it keeps nine tenths of its speed, the chunk flies off ahead of it
    expect(-fleet.velocity.z).toBeGreaterThan(FLEET_SPEED * 0.88);
    expect(-drift(piece).z).toBeGreaterThan(-fleet.velocity.z);
    expect(fleet.depthOf(piece, 1, normal, point)).toBe(0);
  });

  it('is slowed hard by a chunk three times its mass, and shoves it a little', () => {
    const { fleet, piece } = bowOn(field, rings, 3);
    fleet.ram(1);
    expect(-fleet.velocity.z).toBeLessThan(FLEET_SPEED * 0.3);
    expect(-drift(piece).z).toBeGreaterThan(FLEET_SPEED * 0.2);
    expect(fleet.depthOf(piece, 1, normal, point)).toBe(0);
  });

  it('drifting slowly into a light piece, sends it off at a meter a second; into a heavy one, bounces off it alone, telling no other browser', () => {
    const light = bowOn(field, rings, 0.1);
    light.fleet.velocity.set(0, 0, -10);
    const before = momentum(light.piece, light.fleet);
    light.fleet.ram(1);
    expect(light.fleet.rams).toHaveLength(1);
    expect(-drift(light.piece).z + light.fleet.velocity.z).toBeGreaterThan(19.9);
    expect(momentum(light.piece, light.fleet).distanceTo(before)).toBeLessThan(before.length() * 1e-4);
    expect(light.fleet.depthOf(light.piece, 1, normal, point)).toBe(0);
    const heavy = bowOn(field, rings, 3);
    heavy.fleet.velocity.set(0, 0, -10);
    heavy.fleet.ram(1);
    expect(heavy.fleet.rams).toEqual([]);
    expect(drift(heavy.piece).length()).toBeLessThan(1e-6);
    expect(heavy.fleet.velocity.z).toBeGreaterThan(0);
    expect(heavy.fleet.depthOf(heavy.piece, 1, normal, point)).toBe(0);
  });

  it('tells every browser where it shoved a piece, and one that joins later has it there too, and the pieces it breaks into', () => {
    const { fleet, piece, placed } = bowOn(field, rings, 0.1);
    fleet.ram(1);
    const told = JSON.parse(JSON.stringify(fleet.rams[0]));
    const other = testField(DISTANT_DETAIL, HULL_BOXES);
    other.generate(rings.layout);
    other.move(placed);
    other.move(told);
    const same = (a: AsteroidField, b: AsteroidField) => {
      for (const [id, rock] of a.asteroids) {
        expect(b.asteroids.get(id)!.object.position.distanceTo(rock.object.position), id).toBeLessThan(1e-6);
        expect(b.asteroids.get(id)!.object.quaternion.angleTo(rock.object.quaternion), id).toBeLessThan(1e-6);
      }
    };
    for (const f of [field, other]) f.setClock(30);
    same(field, other);
    // it breaks: its pieces fly off alike, and a browser that joins after has them where they are
    for (const f of [field, other]) {
      f.shatter(piece.id, 31);
      f.setClock(40);
    }
    same(field, other);
    const late = testField(DISTANT_DETAIL, HULL_BOXES);
    late.restore(JSON.parse(JSON.stringify(field.snapshot())), rings.layout);
    expect([...late.asteroids.keys()].filter((id) => id.startsWith(`${piece.id}.`)).length).toBeGreaterThan(1);
    same(field, late);
  });
});

/** The height of the armored casemate at the tip of the bow (units): the bow's keel rises well above the hull's middle. */
const BOW_DOOR = 1650;

/**
 * The battleship in `arena`'s field, its bow along -z at the center, flying bow first at
 * FLEET_SPEED, and the piece of its field nearest `share` of its mass at rest before its bow at
 * the casemate's height, moved in until its outline reaches `into` units into the casemate's
 * armor (field time 1), the only piece left in the field. Returns the piece's motion so placed,
 * for another field to take.
 */
function bowOn(field: AsteroidField, arena: ArenaProfile, share: number, into = 50) {
  field.generate(arena.layout);
  field.setClock(1);
  const fleet = new Fleet(arena.layout.seed, field, arena.sheet);
  fleet.arrivesAt = 0;
  fleet.position.set(0, 0, 0);
  fleet.quaternion.identity();
  fleet.velocity.set(0, 0, -FLEET_SPEED);
  fleet.root.updateMatrixWorld();
  fleet.update(1, 0);
  const off = (rock: Asteroid) => Math.abs(Math.log(massOf(rock) / MASS.battleship / share));
  const piece = [...field.asteroids.values()].sort((a, b) => off(a) - off(b))[0];
  // alone in the field: nothing else meets the hull
  for (const id of [...field.asteroids.keys()]) if (id !== piece.id) field.asteroids.delete(id);
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  let placed: ShovedState | null = null;
  for (let z = -fleet.reach - piece.radius; ; z += 10) {
    // at rest: its drift takes out what its orbit would carry it
    const at = new THREE.Vector3(0, BOW_DOOR, z);
    const still = piece.orbitAxis.clone().multiplyScalar(-piece.orbitRate).cross(at);
    placed = { id: piece.id, b: 1, p: at.toArray(), v: still.toArray(), q: [0, 0, 0, 1], s: [0, 1, 0, 0], c: RAMMED };
    field.move(placed);
    if (fleet.depthOf(piece, 1, n, p) >= into) break;
  }
  return { fleet, piece, placed };
}

describe("the battleship's hangars", () => {
  const middle = (HANGAR_FLOOR + HANGAR_CEILING) / 2;
  /** How far a ship's center may stray from a hangar's middle without touching (units): along the hull, and up and down. */
  const room = { z: HANGAR_WIDTH / 2 - SHIP_RADIUS - 5, y: (HANGAR_CEILING - HANGAR_FLOOR) / 2 - SHIP_RADIUS - 5 };

  it('leave nothing solid in a tunnel from flank to flank, and the hull around it solid', () => {
    const fleet = battleship();
    for (const z of HANGARS) {
      for (let x = -6000; x <= 6000; x += 100) {
        for (const [dy, dz] of [
          [0, 0],
          [room.y, room.z],
          [-room.y, -room.z],
          [room.y, -room.z],
          [-room.y, room.z],
        ]) {
          expect(fleet.touches(new THREE.Vector3(x, middle + dy, z + dz), SHIP_RADIUS), `x ${x} y ${dy} z ${dz}`).toBe(false);
        }
      }
      // within the hull a ship that strays farther touches a wall, the deck above or the floor
      for (const at of [new THREE.Vector3(0, HANGAR_CEILING - SHIP_RADIUS + 20, z), new THREE.Vector3(0, HANGAR_FLOOR + SHIP_RADIUS - 20, z), new THREE.Vector3(0, middle, z + HANGAR_WIDTH / 2 - SHIP_RADIUS + 20)]) {
        expect(fleet.touches(at, SHIP_RADIUS)).toBe(true);
      }
      // a ship scraping the ceiling is pushed down into the tunnel, one at a wall back into it
      const scraping = new THREE.Vector3(0, HANGAR_CEILING - SHIP_RADIUS + 20, z);
      expect(fleet.resolve(scraping, SHIP_RADIUS, 1)!.y).toBeCloseTo(-1);
      const walled = new THREE.Vector3(0, middle, z - HANGAR_WIDTH / 2 + SHIP_RADIUS - 20);
      expect(fleet.resolve(walled, SHIP_RADIUS, 1)!.z).toBeCloseTo(1);
      // and its middle counts as inside, the hull around it not
      expect(fleet.within(new THREE.Vector3(0, middle, z))).toBe(true);
      expect(fleet.within(new THREE.Vector3(0, middle, z + HANGAR_WIDTH / 2 + 150))).toBe(false);
      expect(fleet.within(new THREE.Vector3(0, HANGAR_CEILING + 100, z))).toBe(false);
    }
  });

  it('let beams, sight and torpedoes through along a tunnel, and hide a ship in it from everywhere else', () => {
    const fleet = battleship();
    const across = new THREE.Vector3(1, 0, 0);
    const down = new THREE.Vector3(0, -1, 0);
    for (const z of HANGARS) {
      expect(fleet.ray(new THREE.Vector3(-20000, middle, z), across, 40000)).toBeNull();
      expect(fleet.ray(new THREE.Vector3(-20000, middle + room.y, z - room.z), across, 40000)).toBeNull();
      // beside the tunnel, above it and below it, the hull stops a beam
      expect(fleet.ray(new THREE.Vector3(-20000, middle, z + HANGAR_WIDTH / 2 + 150), across, 40000)).not.toBeNull();
      expect(fleet.ray(new THREE.Vector3(-20000, HANGAR_CEILING + 150, z), across, 40000)).not.toBeNull();
      expect(fleet.ray(new THREE.Vector3(-20000, HANGAR_FLOOR - 50, z), across, 40000)).not.toBeNull();
      // a ship inside, seen from above or from ahead, is behind the hull
      const inside = new THREE.Vector3(0, middle, z);
      expect(fleet.ray(new THREE.Vector3(0, 20000, z), down, 20000 - middle)).not.toBeNull();
      expect(fleet.ray(new THREE.Vector3(0, middle, -20000), new THREE.Vector3(0, 0, 1), 20000 + z)).not.toBeNull();
      // and seen along the tunnel from far out, it is in sight; a torpedo flies in without touching
      expect(fleet.ray(new THREE.Vector3(20000, middle, z), across.clone().negate(), 20000)).toBeNull();
      expect(fleet.touches(inside, 60)).toBe(false);
    }
  });

  // a Host dives through a hangar of the battleship as it flies its orbit: it comes in from
  // abeam, the crosshair (and the flight with it) on the tunnel, leading it by the battleship's
  // motion as it leads a crossing ship: the near mouth from afar, the far mouth from 400 m out
  for (const speed of [3000, 5000]) {
    it(`let a Host fly through at ${speed * 0.05} m/s without touching, every hand`, () => {
      const fleet = battleship();
      for (const z of HANGARS) {
        for (const hands of SPREAD) {
          for (const seed of SEEDS) {
            // the same battleship for every flight, back at the center
            fleet.position.set(0, 0, 0);
            fleet.root.updateMatrixWorld();
            fleet.velocity.set(0, 0, -FLEET_SPEED);
            const flight = startFlight(new THREE.Vector3(20000, middle, z), new THREE.Vector3(-1, 0, 0), speed);
            const human = new Human(flight, STEP, seed, hands);
            const gravity = new THREE.Vector3();
            const mark = new THREE.Vector3();
            const local = new THREE.Vector3();
            let through = false;
            for (let t = 0; t < 20 && !through; t += STEP) {
              local.subVectors(flight.position, fleet.position);
              mark.set(local.x > 8000 ? 2300 : -6000, middle, z).add(fleet.position);
              mark.addScaledVector(fleet.velocity, mark.distanceTo(flight.position) / Math.max(1000, flight.velocity.length()));
              flight.update(STEP, human.fly(flight, mark, 'coast', gravity), gravity);
              fleet.position.addScaledVector(fleet.velocity, STEP);
              fleet.root.updateMatrixWorld();
              expect(fleet.touches(flight.position, SHIP_RADIUS), `${hands.reaction} s, seed ${seed}, tunnel at ${z}, t ${t.toFixed(2)}`).toBe(false);
              through = flight.position.x - fleet.position.x < -5000;
            }
            expect(through).toBe(true);
          }
        }
      }
    });
  }

  it('let a bot of middling skill caught in a tunnel fly out of it without touching', () => {
    const field = testField();
    for (const z of HANGARS) {
      for (const [dy, dz] of [
        [0, 0],
        [100, 200],
        [-100, -300],
      ]) {
        const fleet = battleship();
        field.obstacle = fleet;
        const flight = startFlight(new THREE.Vector3(1500, middle + dy, z + dz), new THREE.Vector3(-1, 0, 0), 3000);
        const ship = { id: 'bot', flight, radius: SHIP_RADIUS, alive: true, protectedUntil: 0, strain: 0, heat: 0, allyOf: () => false, cooling: 1 } as unknown as Ship;
        const bot = new Bot(ship, evenSkills(0.5));
        bot.waypoint = new THREE.Vector3(-20000, middle, z);
        const gravity = new THREE.Vector3();
        for (let t = 0; t < 4; t += STEP) {
          flight.update(STEP, bot.think(t, [ship], field), gravity);
          expect(fleet.touches(flight.position, SHIP_RADIUS), `tunnel at ${z}, ${dy}/${dz}, t ${t.toFixed(2)}`).toBe(false);
        }
        expect(flight.position.x).toBeLessThan(-5000);
      }
    }
  });
});
