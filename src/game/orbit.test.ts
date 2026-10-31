import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ORBIT_CALL_GAP, OrbitCalls, orbitable, orbitOf, orbitRoom, readOrbit, safePeriapsis, wellAlarmLevel, wellMu, type Orbit, type OrbitState } from './orbit';
import { escapeLoad, WELL_CRITICAL, wellLevel } from './alarms';
import { arenaById, ARENAS } from '../world/arenas';
import { FlightModel, MAIN_THRUST, MAX_SPEED, METERS_PER_UNIT } from '../ship/flight';
import { ARENA_LIMIT } from '../world/arena';
import { IDLE } from '../input/input';
import { testField } from '../test/field';

const hole = arenaById('hole')!.layout.well!;
const mu = wellMu(hole);
const orbit = (): Orbit => ({ periapsis: 0, apoapsis: 0, circular: 0, radial: 0 });
/** A ship `distance` above the hole, flying across the line to it at `speed` (units/s), `outward` of it away from the hole. */
const at = (distance: number, speed: number, outward = 0) => ({ position: new THREE.Vector3(0, distance, 0), velocity: new THREE.Vector3(speed, outward, 0) });
const circular = (distance: number) => Math.sqrt(mu / distance);
const state = (distance: number, speed: number, drifting = false, outward = 0) => {
  const { position, velocity } = at(distance, speed, outward);
  return readOrbit(hole, position, velocity, MAIN_THRUST, drifting, false, orbit());
};

/** The pull the game flies by: the Event Horizon's field gravity, the hole's and every rock's. */
const field = testField();
field.generate(arenaById('hole')!.layout);
const pullOf = (position: THREE.Vector3, target: THREE.Vector3) => field.gravity(position, target);

describe('the orbit readout', () => {
  it('shows only where an orbit fits the arena: about the black hole, not about Jupiter', () => {
    const wells = Object.fromEntries(ARENAS.map((arena) => [arena.id, orbitable(arena.layout.well ?? null)]));
    expect(wells).toEqual({ belt: false, rings: false, junkyard: false, giant: false, corona: false, hole: true, derelict: false });
  });

  it('keeps a stable orbit out of the reach where the pull alone takes the CRITICAL share of the drive, outside the point of no return', () => {
    const safe = safePeriapsis(hole, MAIN_THRUST);
    expect(escapeLoad(hole, new THREE.Vector3(safe, 0, 0), new THREE.Vector3(), MAIN_THRUST)).toBeCloseTo(WELL_CRITICAL, 6);
    // 715 m from the center (to 5 m, as the README gives it), 1.29 times the point of no return at 555 m
    expect(Math.round((safe * METERS_PER_UNIT) / 5) * 5).toBe(715);
    expect(safe / Math.sqrt(mu / MAIN_THRUST)).toBeCloseTo(1.29, 2);
    // a damaged drive gets out of less: its orbits keep farther out
    expect(safePeriapsis(hole, MAIN_THRUST / 2)).toBeGreaterThan(safe);
    // the fastest circular orbit, at the safe periapsis, stays under the speed limit; the slowest is at the arena's edge
    expect(circular(safe)).toBeLessThan(MAX_SPEED);
    expect(orbitRoom(hole)).toBe(ARENA_LIMIT);
  });

  it('reads a circular orbit as one: its nearest and farthest point where the ship is', () => {
    const { position, velocity } = at(24000, circular(24000));
    const reading = orbitOf(hole, position, velocity, orbit());
    expect(reading.periapsis).toBeCloseTo(24000, 0);
    expect(reading.apoapsis).toBeCloseTo(24000, 0);
    expect(reading.circular).toBeCloseTo(circular(24000), 6);
    // 181 m/s at 1.2 km, 198 m/s at 1 km
    expect(Math.round(circular(24000) * METERS_PER_UNIT)).toBe(181);
    expect(Math.round(circular(20000) * METERS_PER_UNIT)).toBe(198);
    expect(state(24000, circular(24000))).toBe('ready');
    expect(state(24000, circular(24000), true)).toBe('stable');
  });

  it('says a ship at rest, or too slow across the line to the hole, falls in', () => {
    expect(state(24000, 0)).toBe('falls');
    expect(orbitOf(hole, new THREE.Vector3(0, 24000, 0), new THREE.Vector3(), orbit()).periapsis).toBe(0);
    // at 1.2 km an orbit is ready from about 156 m/s on (its periapsis at the safe one)
    expect(state(24000, 0.85 * circular(24000))).toBe('falls');
    expect(state(24000, 0.88 * circular(24000))).toBe('ready');
    // a ship falling straight in, however fast
    expect(state(24000, 0, false, -3000)).toBe('falls');
  });

  it('says a ship too fast leaves the arena: up to about 220 m/s at 1.2 km an orbit stays in it', () => {
    expect(state(24000, 1.2 * circular(24000))).toBe('ready');
    expect(state(24000, 1.25 * circular(24000))).toBe('leaves');
    // faster than escape: it never comes back
    const escape = Math.SQRT2 * circular(24000);
    const { position, velocity } = at(24000, escape * 1.01);
    expect(orbitOf(hole, position, velocity, orbit()).apoapsis).toBe(Infinity);
    expect(state(24000, escape * 1.01)).toBe('leaves');
    // straight out, fast: it leaves before anything else
    expect(state(24000, 0, false, 5000)).toBe('leaves');
  });

  it('keeps an orbit held up to its bounds, so a path right on one does not flicker in and out', () => {
    const edge = 0.8661 * circular(24000);
    const { position, velocity } = at(24000, edge);
    const reading = orbit();
    expect(readOrbit(hole, position, velocity, MAIN_THRUST, true, false, reading)).toBe('falls');
    expect(readOrbit(hole, position, velocity, MAIN_THRUST, true, true, reading)).toBe('stable');
  });

  it('predicts the path free drift flies: a whole revolution with the flight model stays between periapsis and apoapsis, stable all the way', () => {
    const flight = new FlightModel();
    flight.reset(new THREE.Vector3(0, 24000, 0), new THREE.Quaternion());
    flight.velocity.set(1.1 * circular(24000), 0, 0);
    const predicted = orbitOf(hole, flight.position, flight.velocity, orbit());
    const gravity = new THREE.Vector3();
    const reading = orbit();
    let nearest = Infinity;
    let farthest = 0;
    const states = new Set<OrbitState>();
    // a revolution of this ellipse takes about a minute
    for (let step = 0; step < 90 * 60; step++) {
      flight.update(1 / 60, IDLE, pullOf(flight.position, gravity));
      nearest = Math.min(nearest, flight.position.length());
      farthest = Math.max(farthest, flight.position.length());
      states.add(readOrbit(hole, flight.position, flight.velocity, MAIN_THRUST, true, true, reading));
    }
    expect(nearest / predicted.periapsis).toBeCloseTo(1, 2);
    expect(farthest / predicted.apoapsis).toBeCloseTo(1, 2);
    expect([...states]).toEqual(['stable']);
  });

  it('silences the well’s alarm only while a stable orbit is flown, and brings it back the moment a burn breaks the orbit', () => {
    const flight = new FlightModel();
    flight.reset(new THREE.Vector3(0, 24000, 0), new THREE.Quaternion());
    flight.velocity.set(circular(24000), 0, 0);
    const gravity = new THREE.Vector3();
    const reading = orbit();
    const load = () => escapeLoad(hole, flight.position, flight.velocity, MAIN_THRUST);
    let held: OrbitState = readOrbit(hole, flight.position, flight.velocity, MAIN_THRUST, true, false, reading);
    expect(held).toBe('stable');
    // in the orbit the hold reads CAUTION, yet nothing sounds
    expect(wellLevel(load())).toBe('caution');
    expect(wellAlarmLevel(load(), held)).toBeNull();
    // with the autopilot on the same path is only ready: the alarm is there
    expect(wellAlarmLevel(load(), 'ready')).toBe('caution');
    // a burn against the flight (the nose turned back, the drive lit) until the path falls
    flight.orientation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    let frames = 0;
    while (held === 'stable' && frames < 600) {
      flight.update(1 / 60, { ...IDLE, thrust: 1 }, pullOf(flight.position, gravity));
      held = readOrbit(hole, flight.position, flight.velocity, MAIN_THRUST, true, true, reading);
      frames++;
    }
    expect(held).toBe('falls');
    // a fraction of a second of burn
    expect(frames).toBeLessThan(30);
    expect(wellAlarmLevel(load(), held)).toBe(wellLevel(load()));
    expect(wellAlarmLevel(load(), held)).not.toBeNull();
  });
});

describe("Nicole's orbit calls", () => {
  it('says orbit ready once as the path becomes one, and entering stable orbit once free drift flies it', () => {
    const calls = new OrbitCalls();
    expect(calls.update('falls', 0)).toBeNull();
    expect(calls.update('ready', 1)).toBe('ready');
    expect(calls.update('ready', 2)).toBeNull();
    expect(calls.update('stable', 3)).toBe('stable');
    expect(calls.update('stable', 4)).toBeNull();
    // the autopilot back on in the orbit: nothing new to say
    expect(calls.update('ready', 5)).toBeNull();
  });

  it('says each line at most once in its gap, however often the path flickers about the edge of an orbit', () => {
    const calls = new OrbitCalls();
    const said: string[] = [];
    for (let frame = 0; frame < 60 * 60; frame++) {
      const line = calls.update(frame % 2 ? 'ready' : 'falls', frame / 60);
      if (line) said.push(line);
    }
    // a minute of flicker: once every ORBIT_CALL_GAP seconds
    expect(said.length).toBe(Math.ceil(60 / ORBIT_CALL_GAP));
  });

  it('starts afresh where the readout went away (another arena, a dead clone)', () => {
    const calls = new OrbitCalls();
    expect(calls.update('stable', 0)).toBe('stable');
    expect(calls.update(null, 1)).toBeNull();
    expect(calls.update('stable', 2)).toBeNull();
    expect(calls.update(null, 3)).toBeNull();
    expect(calls.update('stable', 2 + ORBIT_CALL_GAP)).toBe('stable');
  });
});
