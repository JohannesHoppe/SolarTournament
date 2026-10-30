import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FlightModel, MAX_SPEED } from '../ship/flight';
import { testField } from '../test/field';
import type { Asteroid, AsteroidField } from '../world/asteroids';
import { IMMOVABLE, MASS, type Body } from '../world/bodies';
import { Cable, CUT_MARGIN, WRAP_MAX } from './cable';
import { clearOf, pullOn } from './hook';
import { HOOK_FLING, HOOK_STANDOFF } from './school';

const DT = 1 / 120;
/** A ship's radius (units, 17 m). */
const SHIP = { radius: 340 };

/** A field of rocks of `scale` at `spots`, at rest, and the rocks in that order (scale 4: a rock reaching 317 m, 290 m along x, 190 m along y, 155 m along z). */
function rocks(spots: THREE.Vector3[], scale = 4) {
  const field = testField();
  const placements = spots.map((position) => ({ kind: 'rock' as const, type: 0, scale, position, orientation: new THREE.Quaternion(), solid: false }));
  field.generate({ key: 'wrap', seed: 1, kind: 'rock', count: 0, minScale: 1, maxScale: 1, radius: 1, inner: 0, spin: 0, toughness: 800, placements });
  return { field, list: [...field.asteroids.values()] };
}

/** Where a ray from `from` towards the rock's center first meets its surface: a hook's bite. */
function bite(field: AsteroidField, rock: Asteroid, from: THREE.Vector3) {
  const direction = rock.object.position.clone().sub(from).normalize();
  return from.clone().addScaledVector(direction, field.raycast(from, direction, 1e6)!.distance);
}

/** Whether a straight stretch runs through something solid more than CUT_MARGIN in from its ends. */
function through(field: AsteroidField, from: THREE.Vector3, to: THREE.Vector3) {
  const length = from.distanceTo(to);
  if (length <= CUT_MARGIN * 2) return false;
  const direction = to.clone().sub(from).divideScalar(length);
  return field.raycast(from.clone().addScaledVector(direction, CUT_MARGIN), direction, length - CUT_MARGIN * 2, true) !== null;
}

/** The cable's stretches from `start` over its wrap points to `end`. */
function stretches(cable: Cable, start: THREE.Vector3, end: THREE.Vector3): [THREE.Vector3, THREE.Vector3][] {
  const points = [start, ...Array.from({ length: cable.count }, (_, i) => cable.at(i)), end];
  return points.slice(1).map((point, i) => [points[i], point]);
}

/** A ship's flight as a body. */
const body = (flight: FlightModel): Body => ({ position: flight.position, velocity: flight.velocity, mass: MASS.ship });
/** A point on a rock, at rest, as the anchor of a cable. */
const fixed = (at: THREE.Vector3): Body => ({ position: at, velocity: new THREE.Vector3(), mass: IMMOVABLE });

/**
 * A ship on a cable made fast at `anchor`, reeling for `seconds` (or holding, `reeling` false),
 * the cable lying on the field's pieces: each step it follows them, pulls along the last stretch
 * and the ship flies on. `check` sees every step.
 */
function swing(field: AsteroidField, flight: FlightModel, anchor: THREE.Vector3, seconds: number, reeling: boolean, check: (cable: Cable, length: number) => void = () => {}) {
  const cable = new Cable();
  let length: number | null = flight.position.distanceTo(anchor);
  let whole = true;
  for (let t = 0; t < seconds && length !== null && whole; t += DT) {
    whole = cable.follow(field, anchor, flight.position, t > 0);
    if (!whole) break;
    const path = cable.path(true);
    if (path) path.floor = 0;
    const rock = path ? path.nearRock : field.asteroids.values().next().value!;
    length = pullOn(body(flight), fixed(anchor), length, reeling, clearOf(SHIP, rock), MAX_SPEED, DT, 'fixed', path);
    flight.position.addScaledVector(flight.velocity, DT);
    if (length !== null) check(cable, length);
  }
  return { cable, length, whole };
}

/** A cable from beside the rock's far end to beside its near end, clear of it, the end free to move across behind the rock along x. */
function across(rock: Asteroid) {
  return { start: new THREE.Vector3(rock.radius + 3000, 0, -rock.radius / 2 - 3000), end: new THREE.Vector3(rock.radius + 3000, 0, rock.radius / 2 + 3000) };
}

/** A rock alone in a field, and a fresh cable across it (see across). */
function acrossRock() {
  const { field, list } = rocks([new THREE.Vector3()]);
  return { field, rock: list[0], ...across(list[0]), cable: new Cable() };
}

describe('a cable lying on the field', () => {
  it('wraps on the edge of a rock that comes across it, and lets go when it swings back', () => {
    const { field, rock, start, end, cable } = acrossRock();
    expect(cable.follow(field, start, end, true)).toBe(true);
    expect(cable.count).toBe(0);
    // the end moves across behind the rock: the cable lies on its edge, never through it
    let wrapped = 0;
    for (let x = end.x; x > -rock.radius - 3000; x -= 50) {
      end.x = x;
      expect(cable.follow(field, start, end, true)).toBe(true);
      for (const [from, to] of stretches(cable, start, end)) expect(through(field, from, to)).toBe(false);
      if (cable.count) {
        wrapped++;
        // off the surface, outside the rock
        expect(field.overlap(cable.at(0), 1)).toBeNull();
      }
    }
    expect(wrapped).toBeGreaterThan(0);
    // and back: once the cable runs straight past the rock again, it lies on nothing
    for (let x = end.x; x < rock.radius + 3000; x += 50) {
      end.x = x;
      expect(cable.follow(field, start, end, true)).toBe(true);
    }
    expect(cable.count).toBe(0);
  });

  it('keeps its length through wrap and unwrap: no jump where it starts or stops lying on the rock', () => {
    const { field, rock, start, end, cable } = acrossRock();
    let last = cable.length(start, end);
    let jumps = 0;
    const steps = Math.round(((rock.radius + 3000) * 2) / 50);
    for (const step of [-50, 50]) {
      for (let i = 0; i < steps; i++) {
        end.x += step;
        const count = cable.count;
        cable.follow(field, start, end, true);
        const length = cable.length(start, end);
        // the end moves 2.5 m a step; the cable never gains or loses more than that and the gap off the surface
        expect(Math.abs(length - last)).toBeLessThan(50 + 2 * Math.max(20, rock.radius * 0.02));
        if (cable.count !== count) jumps++;
        last = length;
      }
    }
    expect(jumps).toBeGreaterThanOrEqual(2);
  });

  it('swings a ship around the rock it bit: the cable wraps round it instead of passing through, and the ship never touches it', () => {
    const { field, list } = rocks([new THREE.Vector3()]);
    const rock = list[0];
    // the bite on top; the ship circles in the plane through it, so the rock's far side comes between
    const anchor = bite(field, rock, new THREE.Vector3(0, 100000, 0));
    const flight = new FlightModel();
    flight.position.set(rock.radius + 2000, anchor.y * 0.5, 0);
    flight.velocity.set(0, 3000, 0);
    let wraps = 0;
    const { whole } = swing(field, flight, anchor, 4, false, (cable) => {
      wraps = Math.max(wraps, cable.count);
      for (const [from, to] of stretches(cable, anchor, flight.position)) expect(through(field, from, to)).toBe(false);
      expect(field.overlap(flight.position, SHIP.radius)).toBeNull();
    });
    expect(whole).toBe(true);
    expect(wraps).toBeGreaterThan(0);
  });

  it('pulls a ship along its own stretch, towards the wrap point next to it, not the anchor', () => {
    const { field, list } = rocks([new THREE.Vector3()]);
    const rock = list[0];
    const { start, end } = across(rock);
    const flight = new FlightModel();
    flight.position.set(-rock.radius - 3000, 0, end.z);
    const cable = new Cable();
    // laid round the rock's edge as the ship came across behind it
    for (; end.x > flight.position.x; end.x -= 50) cable.follow(field, start, end, false);
    cable.follow(field, start, flight.position, true);
    expect(cable.count).toBeGreaterThan(0);
    const path = cable.path(true)!;
    path.floor = 0;
    const toward = path.near.position.clone().sub(flight.position).normalize();
    pullOn(body(flight), fixed(start), cable.length(start, flight.position), true, clearOf(SHIP, rock), MAX_SPEED, DT, 'fixed', path);
    expect(flight.velocity.clone().normalize().dot(toward)).toBeGreaterThan(0.999);
    // and the anchor lies on the other side: the straight line to it would have pulled elsewhere
    expect(start.clone().sub(flight.position).normalize().dot(toward)).toBeLessThan(0.99);
  });

  it('snaps on too many wraps, on the well, on the battleship’s hull and on a rock sweeping through it', () => {
    // the end circles a rock again and again, winding the cable onto it until no wrap is left
    const small = rocks([new THREE.Vector3()], 1);
    const circle = small.list[0].radius + 2000;
    const from = new THREE.Vector3(0, 0, -small.list[0].radius - 3000);
    const to = new THREE.Vector3();
    const wound = new Cable();
    let turn = -Math.PI / 2 + 0.3;
    while (turn < Math.PI * 6 && wound.follow(small.field, from, to.set(Math.cos(turn) * circle, 0, Math.sin(turn) * circle), true)) turn += 0.01;
    expect(wound.count).toBe(WRAP_MAX);
    expect(turn).toBeLessThan(Math.PI * 6);
    // the well's body across the cable: it snaps, and lies on nothing elsewhere
    const { field } = rocks([new THREE.Vector3(0, 100000, 0)]);
    field.well = { position: new THREE.Vector3(), radius: 4000, surfaceGravity: 0 };
    const well = new Cable();
    expect(well.follow(field, new THREE.Vector3(-8000, 0, 0), new THREE.Vector3(8000, 0, 0), true)).toBe(false);
    expect(well.follow(field, new THREE.Vector3(-8000, 0, 0), new THREE.Vector3(8000, 0, 0), false)).toBe(true);
    expect(well.count).toBe(0);
    // a hull (the battleship's) across it
    field.well = null;
    field.obstacle = { position: new THREE.Vector3(), ray: (origin: THREE.Vector3, direction: THREE.Vector3, max: number) => { const hit = origin.z < 0 && direction.z > 0 ? -origin.z : null; return hit !== null && hit <= max ? hit : null; } } as never;
    expect(new Cable().follow(field, new THREE.Vector3(0, 0, -8000), new THREE.Vector3(0, 0, 8000), true)).toBe(false);
    field.obstacle = null;
    // the rock comes 100 m across the cable in one step: no cable slides round that
    const swept = rocks([new THREE.Vector3()]);
    const rock = swept.list[0];
    const start = new THREE.Vector3(-rock.radius - 4000, rock.radius * 0.8, 0);
    const cable = new Cable();
    expect(cable.follow(swept.field, start, new THREE.Vector3(rock.radius + 4000, rock.radius * 0.8, 0), true)).toBe(true);
    expect(cable.follow(swept.field, start, new THREE.Vector3(rock.radius + 4000, -rock.radius * 0.8, 0), true)).toBe(false);
  });

  it('tows a core round a rock that comes between it and its carrier, which drags it along', () => {
    const { field, list } = rocks([new THREE.Vector3()]);
    const rock = list[0];
    const length = SHIP.radius * 4.5;
    const core: Body = { position: new THREE.Vector3(-rock.radius - length, 0, 0), velocity: new THREE.Vector3(), mass: MASS.core };
    const ship = new FlightModel();
    // the straight line between them grazes the rock's side
    ship.position.set(rock.radius + length, 0, 3500);
    ship.velocity.set(0, 0, 2000);
    const cable = new Cable();
    cable.follow(field, core.position, ship.position, false);
    let cord: number | null = cable.length(core.position, ship.position);
    let wrapped = false;
    for (let t = 0; t < 4 && cord !== null; t += DT) {
      expect(cable.follow(field, core.position, ship.position, true)).toBe(true);
      wrapped ||= cable.count > 0;
      const path = cable.path(false);
      if (path) path.floor = length;
      cord = pullOn(core, body(ship), cord, false, length, Infinity, DT, 'moved', path);
      core.position.addScaledVector(core.velocity, DT);
      ship.position.addScaledVector(ship.velocity, DT);
      expect(field.overlap(core.position, 100)).toBeNull();
    }
    expect(wrapped).toBe(true);
    // the core follows its carrier, which pays for it
    expect(core.velocity.z).toBeGreaterThan(500);
    expect(ship.velocity.z).toBeLessThan(2000);
  });

  it('lays out alike on every browser, and takes nothing new on the way', () => {
    const run = () => {
      const { field, list } = rocks([new THREE.Vector3()]);
      const rock = list[0];
      const anchor = bite(field, rock, new THREE.Vector3(0, 100000, 0));
      const flight = new FlightModel();
      flight.position.set(rock.radius + 2000, anchor.y * 0.5, 0);
      flight.velocity.set(0, 3000, 0);
      return { anchor, flight, field };
    };
    const one = run();
    const two = run();
    const clone = vi.spyOn(THREE.Vector3.prototype, 'clone');
    const a = swing(one.field, one.flight, one.anchor, 3, false);
    const pool = new Set(Array.from({ length: a.cable.count }, (_, i) => a.cable.at(i)));
    expect(clone).not.toHaveBeenCalled();
    clone.mockRestore();
    const b = swing(two.field, two.flight, two.anchor, 3, false);
    expect(b.cable.count).toBe(a.cable.count);
    for (let i = 0; i < a.cable.count; i++) expect(b.cable.at(i).toArray()).toEqual(a.cable.at(i).toArray());
    expect(two.flight.position.toArray()).toEqual(one.flight.position.toArray());
    expect(pool.size).toBe(a.cable.count);
  });
});

// plausibility: the flight school's hook drill (see school.ts) must work at every rock of the belt
describe('the hook drill on a cable lying on its rock', () => {
  for (const reach of [2000, 5000, 11000]) {
    it(`flings a pilot faster than it asks around a rock reaching ${reach / 20} m, never touching it`, () => {
      const probe = rocks([new THREE.Vector3()], 1);
      const { field, list } = rocks([new THREE.Vector3()], reach / probe.list[0].radius);
      const rock = list[0];
      const flight = new FlightModel();
      flight.position.set(rock.radius + HOOK_STANDOFF, 0, 0);
      flight.velocity.set(0, 0, 1000);
      const anchor = bite(field, rock, flight.position);
      const { whole, length } = swing(field, flight, anchor, 3, true, () => expect(field.overlap(flight.position, SHIP.radius)).toBeNull());
      expect(whole).toBe(true);
      expect(length).not.toBeNull();
      expect(flight.velocity.length()).toBeGreaterThan(HOOK_FLING);
    });
  }
});
