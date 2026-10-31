import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { airBurn, airHeat, altitudeIn, density, dragAt, dragOn, LOCK_DEPTH, opticalDepth, RADAR_DEPTH, reachIn, safeSpeed, SIGHT_DEPTH } from './air';
import { arenaById } from './arenas';
import { ARENA_LIMIT } from './arena';
import { FlightModel, MAIN_THRUST, MAX_SPEED } from '../ship/flight';
import { IDLE } from '../input/input';
import { testField } from '../test/field';

const air = arenaById('giant')!.layout.air!;
const G = 196.2;
/** Meters to units (1 unit = 5 cm). */
const m = (meters: number) => meters * 20;
/** A point at an altitude (units) over the deck, `x` (units) off the field's center. */
const at = (altitude: number, x = 0) => new THREE.Vector3(x, Math.sqrt((air.radius + altitude) ** 2 - x * x) - air.radius, 0);
const SIDEWAYS = new THREE.Vector3(1, 0, 0);
/** The radiators' cooling in the air (heat units/s; see ship/ship, in the shade). */
const COOLING = 50;

describe("Jupiter's air", () => {
  it('lies with its cloud deck in the reference plane, at the field\'s center', () => {
    expect(altitudeIn(air, new THREE.Vector3())).toBeCloseTo(0);
    expect(altitudeIn(air, at(m(-1000)))).toBeCloseTo(m(-1000));
  });

  it('grows denser downwards, tenfold over 2 km, and thins to a faint haze over the deck', () => {
    expect(density(-1)).toBeCloseTo(1, 3);
    expect(density(m(-2000))).toBeCloseTo(10, 0);
    expect(density(1)).toBeLessThan(0.11);
    expect(density(m(500))).toBeLessThan(0.001);
  });

  it('lets the eye see 2 km 200 m under the deck, 790 m a kilometer down, 250 m two kilometers down', () => {
    // a level look rises into thinner haze as the planet curves away below it
    expect(reachIn(air, at(m(-200)), SIDEWAYS, SIGHT_DEPTH, Infinity) / 20).toBeGreaterThan(1950);
    expect(reachIn(air, at(m(-200)), SIDEWAYS, SIGHT_DEPTH, Infinity) / 20).toBeLessThan(2100);
    // just under it a level look meets the curved deck within a few hundred meters
    expect(reachIn(air, at(m(-10)), SIDEWAYS, SIGHT_DEPTH, Infinity) / 20).toBeLessThan(1000);
    expect(reachIn(air, at(m(-1000)), SIDEWAYS, SIGHT_DEPTH, Infinity) / 20).toBeCloseTo(792, -1);
    expect(reachIn(air, at(m(-2000)), SIDEWAYS, SIGHT_DEPTH, Infinity) / 20).toBeCloseTo(251, -1);
    // the radar twice as far, a lock two thirds
    expect(reachIn(air, at(m(-1000)), SIDEWAYS, RADAR_DEPTH, Infinity) / reachIn(air, at(m(-1000)), SIDEWAYS, SIGHT_DEPTH, Infinity)).toBeCloseTo(2, 1);
    expect(reachIn(air, at(m(-1000)), SIDEWAYS, LOCK_DEPTH, Infinity) / reachIn(air, at(m(-1000)), SIDEWAYS, SIGHT_DEPTH, Infinity)).toBeCloseTo(2 / 3, 1);
  });

  it('sums the haze along a line as far as a ray reaches, through the deck too', () => {
    const origin = new THREE.Vector3();
    const end = new THREE.Vector3();
    for (const altitude of [m(300), m(20), m(-30), m(-700), m(-1800)]) {
      for (const climb of [-0.9, -0.3, -0.05, 0, 0.05, 0.3, 0.9]) {
        const direction = new THREE.Vector3(Math.sqrt(1 - climb * climb), climb, 0);
        origin.copy(at(altitude));
        const reach = reachIn(air, origin, direction, SIGHT_DEPTH, m(20000));
        if (reach >= m(20000)) continue;
        // just short of the reach the line is still seen, just past it no more (the deck may
        // use up what is left at once, where the ray crosses it)
        end.copy(origin).addScaledVector(direction, reach - 20);
        expect(opticalDepth(air, origin, end), `from ${altitude / 20} m at ${climb}`).toBeLessThan(SIGHT_DEPTH + 0.05);
        end.copy(origin).addScaledVector(direction, reach + 20);
        expect(opticalDepth(air, origin, end), `from ${altitude / 20} m at ${climb}`).toBeGreaterThan(SIGHT_DEPTH - 0.05);
      }
    }
  });

  it('hides a ship under the deck from one above it, unless it looks almost straight down', () => {
    const above = at(m(100));
    // 100 m under the deck, 2 km off: the line crosses the deck at a slant
    expect(opticalDepth(air, above, at(m(-100), m(2000)))).toBeGreaterThan(SIGHT_DEPTH);
    // straight below
    expect(opticalDepth(air, above, at(m(-100)))).toBeLessThan(SIGHT_DEPTH);
    const field = testField();
    field.generate(arenaById('giant')!.layout);
    field.asteroids.clear();
    expect(field.lineOfSight(above, at(m(-100), m(2000)))).toBe(false);
    // the radar does not see through it either at that slant; cover alone ignores the haze
    expect(field.lineOfSight(above, at(m(-100), m(2000)), RADAR_DEPTH)).toBe(false);
    expect(field.lineOfSight(above, at(m(-100), m(2000)), Infinity)).toBe(true);
  });

  it('counts the deck on a line that dips under it between two points over it', () => {
    // two ships skimming 5 m over the deck 2 km apart: the curved deck rises 12.5 m between them
    expect(opticalDepth(air, at(m(5)), at(m(5), m(2000)))).toBeGreaterThan(SIGHT_DEPTH);
    // 20 m over it they see each other
    expect(opticalDepth(air, at(m(20)), at(m(20), m(2000)))).toBeLessThan(SIGHT_DEPTH);
    // a look a few degrees down from just over the deck ends where it goes in, though it comes out again within 10 km
    for (const degrees of [3, 5, 7]) {
      const angle = THREE.MathUtils.degToRad(degrees);
      const direction = new THREE.Vector3(Math.cos(angle), -Math.sin(angle), 0);
      const origin = at(m(5));
      const reach = reachIn(air, origin, direction, SIGHT_DEPTH, m(10000));
      expect(reach / 20, `${degrees}°`).toBeLessThan(200);
      expect(altitudeIn(air, origin.clone().addScaledVector(direction, m(10000))), `${degrees}°`).toBeGreaterThan(0);
    }
  });

  it('brakes a ship by 1.5 g at the deck at the speed limit, by its speed squared, ten times as hard 2 km down', () => {
    expect(dragAt(-1, MAX_SPEED) / G).toBeCloseTo(1.5, 1);
    expect(dragAt(-1, MAX_SPEED / 2) / G).toBeCloseTo(1.5 / 4, 1);
    expect(dragAt(m(-2000), MAX_SPEED) / G).toBeCloseTo(15, 0);
  });

  it('never brakes a ship past standstill, however long the step', () => {
    const velocity = new THREE.Vector3(MAX_SPEED, 0, 0);
    const brake = dragOn(air, at(ARENA_LIMIT * -1), velocity, 10, new THREE.Vector3());
    const after = velocity.clone().addScaledVector(brake, 10);
    expect(after.x).toBeGreaterThan(0);
    expect(after.x).toBeLessThan(velocity.x);
  });

  it("lets the main drive hold the speed limit down to 1.9 km, and no more than 200 m/s at the field's bottom", () => {
    const terminal = (altitude: number) => {
      const flight = new FlightModel();
      // flying along the deck, nose ahead, full drive; gravity left out
      flight.reset(at(altitude), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), SIDEWAYS));
      const outside = new THREE.Vector3();
      for (let t = 0; t < 20; t += 1 / 60) {
        outside.set(0, 0, 0);
        dragOn(air, flight.position, flight.velocity, 1 / 60, outside);
        flight.update(1 / 60, { ...IDLE, thrust: 1 }, outside);
        flight.position.copy(at(altitude));
      }
      return flight.velocity.length();
    };
    expect(terminal(m(-1800))).toBeGreaterThan(MAX_SPEED * 0.99);
    expect(terminal(m(-2250)) / 20).toBeGreaterThan(190);
    expect(terminal(m(-2250)) / 20).toBeLessThan(210);
    expect(MAIN_THRUST / G).toBeCloseTo(13, 0);
  });

  it('heats a hull faster than it cools only below 600 m at the speed limit, and lets it fly slower deeper', () => {
    expect(airHeat(m(-500), MAX_SPEED)).toBeLessThan(COOLING);
    expect(airHeat(m(-700), MAX_SPEED)).toBeGreaterThan(COOLING);
    expect(safeSpeed(m(-500), COOLING)).toBe(MAX_SPEED);
    expect(safeSpeed(m(-1000), COOLING) / 20).toBeCloseTo(215, -1);
    expect(safeSpeed(m(-2000), COOLING) / 20).toBeCloseTo(146, -1);
    expect(safeSpeed(-ARENA_LIMIT, COOLING) / 20).toBeCloseTo(86, -1);
    // at the safe speed the air puts in what the radiators shed
    expect(airHeat(m(-2000), safeSpeed(m(-2000), COOLING))).toBeCloseTo(COOLING);
  });

  it('burns the hull only with what full radiators cannot shed, about 15 points a second at the limit 2 km down', () => {
    const step = 1 / 30;
    const radiators = { heat: 0, overheated: false, cooling: COOLING };
    let burnt = 0;
    for (let t = 0; t < 10; t += step) {
      radiators.heat = Math.max(0, radiators.heat - COOLING * step);
      burnt += airBurn(radiators, airHeat(m(-2000), MAX_SPEED) * step, step, 100);
    }
    expect(radiators.overheated).toBe(true);
    // a burning hull has full radiators after the air's step: the alarm's CRITICAL, Nicole's line and the burning on screen read them
    expect(radiators.heat).toBe(100);
    // full after half a second, then burning
    expect(burnt / 9.5).toBeCloseTo(15, 0);
    // radiators full of the laser's heat while the air heats less than they shed: nothing burns, they cool
    const laser = { heat: 110, overheated: true, cooling: COOLING };
    laser.heat -= COOLING * step;
    expect(airBurn(laser, airHeat(m(-200), MAX_SPEED) * step, step, 100)).toBe(0);
    expect(laser.heat).toBeLessThan(110);
  });
});
