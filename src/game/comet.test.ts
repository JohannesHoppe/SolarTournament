import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COMET_REACH, COMET_SPEED, COMET_WARNING, COMET_WINDOWS, cometAt, cometEnd, cometsOf, cometStart, roundComets, headAt, HEAD_MASS, HEAD_RADIUS, makeComet, PIECE_RADIUS, routeNearest, runDown, Shower, SHOWER_LENGTH, SHOWER_PIECES, tailDepth, type Comet } from './comet';
import { SUN_DIRECTION } from '../world/space';
import { Fleet } from './fleet';
import { ARENAS } from '../world/arenas';
import { ARENA_LIMIT } from '../world/arena';
import { testField } from '../test/field';

const layoutOf = (id: string) => ARENAS.find((arena) => arena.id === id)!.layout;

describe('the comets of a round', () => {
  it('are the same for the same room and round on every browser, and differ from round to round', () => {
    expect(cometsOf(1234, 3)).toEqual(cometsOf(1234, 3));
    const rounds = Array.from({ length: 12 }, (_, round) => JSON.stringify(cometsOf(1234, round).map((comet) => [comet.at, comet.nearest])));
    expect(new Set(rounds).size).toBeGreaterThan(6);
  });

  it('come in their windows, cross the field near its center along the horizon, and leave before the round ends', () => {
    let seen = 0;
    for (let seed = 1; seed < 200; seed++) {
      for (const comet of cometsOf(seed, 0)) {
        seen++;
        // a route off the center reaches the edge's sphere a little later
        expect(COMET_WINDOWS.some((w) => comet.edge >= w.from - 0.2 && comet.edge <= w.to + 1)).toBe(true);
        expect(comet.direction.length()).toBeCloseTo(1);
        expect(Math.abs(comet.direction.y)).toBeLessThan(Math.sin(0.61));
        expect(comet.nearest.length()).toBeLessThanOrEqual(16000 + 1e-6);
        expect(comet.nearest.dot(comet.direction)).toBeCloseTo(0, 3);
        // without a well the route is straight
        expect(headAt(comet, comet.at + 10, new THREE.Vector3()).distanceTo(comet.nearest.clone().addScaledVector(comet.direction, 10 * COMET_SPEED))).toBeLessThan(1);
        expect(comet.swallowed).toBe(Infinity);
        expect(cometStart(comet)).toBeGreaterThan(60);
        expect(cometEnd(comet)).toBeLessThan(5 * 60 + 8);
      }
    }
    // about one comet a round, sometimes none, sometimes two
    expect(seen / 199).toBeGreaterThan(0.9);
    expect(seen / 199).toBeLessThan(1.4);
  });

  it('are bent by the black hole and swallowed at its horizon, their shower after them', () => {
    const well = layoutOf('hole').well!;
    let seen = 0;
    for (let seed = 1; seed < 80; seed++) {
      for (const comet of cometsOf(seed, 2, well)) {
        seen++;
        expect(comet.swallowed).toBeLessThan(comet.at + COMET_REACH / COMET_SPEED);
        expect(comet.swallowed).toBeGreaterThan(comet.edge);
        const head = headAt(comet, comet.swallowed, new THREE.Vector3());
        expect(head.distanceTo(well.position)).toBeLessThan(well.radius);
        // the route bends: by the time it is swallowed it has fallen off the straight line
        const straight = comet.nearest.clone().addScaledVector(comet.direction, (comet.swallowed - comet.at) * COMET_SPEED);
        expect(straight.distanceTo(head)).toBeGreaterThan(HEAD_RADIUS);
        // the head stays where it went; the shower's pieces follow it in, every one gone at the end
        expect(headAt(comet, comet.swallowed + 5, new THREE.Vector3()).distanceTo(head)).toBeLessThan(1);
        const shower = new Shower(comet);
        const end = cometEnd(comet);
        for (let i = 0; i < SHOWER_PIECES; i++) expect(shower.gone(i, end)).toBe(true);
        expect(end).toBeLessThan(5 * 60 + 8);
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('never come to the flight school, nor outside a round, so nothing there warns of one', () => {
    const wells = [null, ...ARENAS.map((arena) => arena.layout.well ?? null)];
    for (let seed = 1; seed < 60; seed++) {
      for (let round = 0; round < 4; round++) {
        for (const well of wells) {
          const comets = roundComets(seed, round, well, true);
          expect(comets).toEqual([]);
          for (let clock = 0; clock < 6 * 60; clock += 0.5) expect(cometAt(comets, clock)).toBeNull();
        }
      }
      expect(roundComets(seed, -1, null, false)).toEqual([]);
    }
    // 59 seeds by four rounds by eight wells, six minutes each: a few seconds on a busy machine
  });

  it('come to a round as cometsOf lays them out, each followed from its warning to the end of its shower and then let go', () => {
    let seen = 0;
    for (let seed = 1; seed < 60; seed++) {
      const comets = roundComets(seed, 1, null, false);
      expect(comets).toEqual(cometsOf(seed, 1));
      for (const comet of comets) {
        seen++;
        expect(cometAt(comets, cometStart(comet) - COMET_WARNING - 0.1)).not.toBe(comet);
        expect(cometAt(comets, comet.edge - COMET_WARNING)).toBe(comet);
        expect(cometAt(comets, comet.at)).toBe(comet);
        expect(cometAt(comets, cometEnd(comet) + 0.1)).not.toBe(comet);
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it("dive through the field into Jupiter's depths, coming from above its cloud deck", () => {
    const well = layoutOf('giant').well!;
    for (let seed = 1; seed < 80; seed++) {
      for (const comet of cometsOf(seed, 2, well)) {
        // it crosses the field's middle first, through its nearest point, then falls in
        const there = new THREE.Vector3();
        const when = routeNearest(comet, comet.nearest, comet.start, comet.swallowed, there);
        expect(there.distanceTo(comet.nearest)).toBeLessThan(200);
        expect(comet.swallowed).toBeGreaterThan(when + 3);
        expect(comet.swallowed).toBeLessThan(comet.at + COMET_REACH / COMET_SPEED);
        expect(cometEnd(comet)).toBeLessThan(5 * 60 + 8);
        for (let time = comet.from; time < comet.swallowed; time += 1) expect(headAt(comet, time, new THREE.Vector3()).distanceTo(well.position)).toBeGreaterThan(well.radius);
        expect(headAt(comet, cometStart(comet), new THREE.Vector3()).length()).toBeGreaterThan(ARENA_LIMIT * 0.9);
      }
    }
  });
});

describe("a comet's shower", () => {
  it('is laid out the same everywhere, trailing the head within its length', () => {
    const comet = cometsOf(77, 2)[0] ?? cometsOf(78, 2)[0];
    const a = new Shower(comet);
    const b = new Shower(comet);
    expect([...a.behind]).toEqual([...b.behind]);
    expect([...a.offsets]).toEqual([...b.offsets]);
    const head = headAt(comet, comet.at, new THREE.Vector3());
    const piece = new THREE.Vector3();
    for (let i = 0; i < SHOWER_PIECES; i++) {
      a.pieceAt(i, comet.at, piece);
      const behind = head.clone().sub(piece).dot(comet.direction);
      expect(behind).toBeGreaterThan(0);
      expect(behind).toBeLessThanOrEqual(SHOWER_LENGTH);
    }
  });
});

/** Flies a field from `from` to `to` at a frame step, the comet running down what is in its way. */
function fly(field: ReturnType<typeof testField>, comet: Comet, dt: number, from: number, to: number) {
  for (let time = from; time < to; time += dt) {
    field.setClock(time);
    runDown(comet, field, time, () => {});
  }
  field.setClock(to);
}

describe("a comet's head", () => {
  it('breaks the same rocks at the same field times on every browser, however their frames fall', () => {
    const belt = layoutOf('belt');
    const [a, b] = [testField(), testField()];
    a.generate(belt);
    b.generate(belt);
    // a comet straight through the first rock of the field
    const target = [...a.asteroids.values()][0];
    const at = 40;
    const comet = makeComet(at, new THREE.Vector3(1, 0.1, 0.3).normalize(), a.positionOf(target, at, new THREE.Vector3()), 5);
    fly(a, comet, 1 / 60, 30, 50);
    fly(b, comet, 1 / 23, 30, 50);
    expect(a.snapshot().x.length).toBeGreaterThan(0);
    expect(b.snapshot().x).toEqual(a.snapshot().x);
    // two Belt fields generated and flown for 20 seconds: a few seconds on a busy machine
  });

  it("breaks up on the wreck's hull, which takes its momentum the same way on every browser, and a newcomer's snapshot carries it", () => {
    const derelict = layoutOf('derelict');
    const [a, b, c] = [testField(), testField(), testField()];
    for (const field of [a, b]) field.generate(derelict);
    const hull = [...a.asteroids.values()].find((rock) => rock.solid)!;
    const at = 40;
    const before = a.positionOf(hull, 60, new THREE.Vector3());
    // a comet grazing the piece, off its center
    const height = hull.semiAxes.y * hull.object.matrixWorld.getMaxScaleOnAxis();
    const through = a.positionOf(hull, at, new THREE.Vector3()).add(new THREE.Vector3(0, height * 0.5, 0));
    // each browser follows a comet of its own
    const [one, other] = [makeComet(at, new THREE.Vector3(0, 0, 1), through, 9), makeComet(at, new THREE.Vector3(0, 0, 1), through, 9)];
    fly(a, one, 1 / 60, 30, 60);
    fly(b, other, 1 / 23, 30, 60);
    const moved = a.asteroids.get(hull.id)!;
    expect(moved.shovedBy).toBe(9);
    // it broke up where it struck, before it reached the line through the piece's center
    expect(one.broken).toBeLessThan(at);
    expect(other.broken).toBe(one.broken);
    // the piece moves on with the head's momentum: both masses at the speed that keeps it
    const speed = COMET_SPEED * (HEAD_MASS / (HEAD_MASS + a.bodyMass(moved)));
    expect(moved.velocity.length()).toBeCloseTo(speed, 3);
    expect(moved.object.position.distanceTo(before)).toBeGreaterThan(speed * 10);
    // its half of the world ship goes along as one body, every section alike, none turning
    for (const section of a.welded(moved)) {
      expect(section.velocity.distanceTo(moved.velocity)).toBeLessThan(1e-9);
      expect(section.spinRate).toBe(0);
    }
    expect(a.welded(moved).length).toBeGreaterThan(1);
    expect(b.asteroids.get(hull.id)!.object.position.distanceTo(moved.object.position)).toBeLessThan(1e-6);
    expect(b.asteroids.get(hull.id)!.object.quaternion.angleTo(moved.object.quaternion)).toBeLessThan(1e-6);
    // a newcomer at field time 60 takes the motion from the snapshot
    c.restore(JSON.parse(JSON.stringify(a.snapshot())), derelict);
    c.setClock(80);
    a.setClock(80);
    expect(c.asteroids.get(hull.id)!.object.position.distanceTo(a.asteroids.get(hull.id)!.object.position)).toBeLessThan(1e-6);
  });

  it('is gone for a newcomer who joins just after it broke up on the hull, which it never shoves twice', () => {
    const derelict = layoutOf('derelict');
    const [lead, newcomer] = [testField(), testField()];
    lead.generate(derelict);
    const hull = [...lead.asteroids.values()].find((rock) => rock.solid)!;
    const at = 40;
    const height = hull.semiAxes.y * hull.object.matrixWorld.getMaxScaleOnAxis();
    const through = lead.positionOf(hull, at, new THREE.Vector3()).add(new THREE.Vector3(0, height * 0.5, 0));
    const comet = makeComet(at, new THREE.Vector3(0, 0, 1), through, 9);
    fly(lead, comet, 1 / 60, 30, 60);
    // the newcomer joins a fifth of a second after the head broke up, its own comet whole as roundComets builds it
    const joined = comet.broken + 0.2;
    const early = testField();
    early.generate(derelict);
    fly(early, makeComet(at, new THREE.Vector3(0, 0, 1), through, 9), 1 / 60, 30, joined);
    newcomer.restore(JSON.parse(JSON.stringify(early.snapshot())), derelict);
    const late = makeComet(at, new THREE.Vector3(0, 0, 1), through, 9);
    fly(newcomer, late, 1 / 60, joined, 60);
    expect(late.broken).toBeCloseTo(comet.broken, 3);
    lead.setClock(60);
    expect(newcomer.asteroids.get(hull.id)!.velocity.distanceTo(lead.asteroids.get(hull.id)!.velocity)).toBeLessThan(1e-3);
    expect(newcomer.snapshot().x).toEqual(lead.snapshot().x);
  });
});

describe("the President's battleship and a comet", () => {
  /**
   * Flies a battleship through a round's first 140 s past `comet`, the lead browser seeing it
   * coming or not; returns whether its head or a piece of its shower struck it, and where the
   * battleship was at field time `at`.
   */
  const sail = (comet: Comet | null, seen: boolean, at: number) => {
    const fleet = new Fleet(7);
    const shower = comet && new Shower(comet);
    const piece = new THREE.Vector3();
    const where = new THREE.Vector3();
    let struck = false;
    for (let time = 0; time < 140; time += 0.1) {
      fleet.lead(0.1, time, [], comet && seen ? [comet] : []);
      fleet.update(time, time);
      if (Math.abs(time - at) < 0.05) where.copy(fleet.position);
      if (!comet || !shower || time < cometStart(comet) || !fleet.present(time)) continue;
      if (fleet.touches(headAt(comet, time, piece), HEAD_RADIUS)) struck = true;
      for (let i = 0; i < SHOWER_PIECES; i += 5) if (fleet.touches(shower.pieceAt(i, time, piece), PIECE_RADIUS)) struck = true;
    }
    return { struck, where };
  };

  it('burns out of the way of a comet whose route runs right through it, in time for its head and shower', () => {
    // a comet whose head passes right where the battleship on its orbit is at that moment
    const at = 100;
    const comet = makeComet(at, new THREE.Vector3(0.6, 0.1, 0.8).normalize(), sail(null, false, at).where, 3);
    expect(sail(comet, false, at).struck).toBe(true);
    expect(sail(comet, true, at).struck).toBe(false);
  });
});

describe("a comet's tails", () => {
  const head = new THREE.Vector3(1000, 2000, -3000);
  const away = SUN_DIRECTION.clone().negate();
  const across = new THREE.Vector3().crossVectors(SUN_DIRECTION, new THREE.Vector3(0, 1, 0)).normalize();
  const at = (direction: THREE.Vector3, meters: number, from = head) => from.clone().addScaledVector(direction, meters * 20);

  it('stream away from the sun whichever way the comet flies, 25 km long', () => {
    for (const course of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.3, 1).normalize(), away.clone(), SUN_DIRECTION.clone()]) {
      expect(tailDepth(head, course, 1, at(away, 3000))).toBeGreaterThan(0.8);
      expect(tailDepth(head, course, 1, at(away, 24000))).toBeGreaterThan(0);
      expect(tailDepth(head, course, 1, at(away, 26000))).toBe(0);
      // towards the sun there is none
      expect(tailDepth(head, course, 1, at(SUN_DIRECTION, 3000))).toBe(0);
    }
  });

  it('lie apart from the route, where the shower flies, once it is out of the coma', () => {
    for (const meters of [600, 1200, 1800]) expect(tailDepth(head, across, 1, at(across, -meters))).toBe(0);
  });

  it('bend the dust tail back along the route, the ion tail not', () => {
    // 15 km down, the dust tail's axis lies 30 % of its 22 km times (15/22)², about 3 km, back along the route
    const lagged = at(across, -3000, at(away, 15000));
    expect(tailDepth(head, across, 1, lagged)).toBeGreaterThan(0.1);
    expect(tailDepth(head, across.clone().negate(), 1, lagged)).toBe(0);
  });

  it('are drawn in with the comet', () => {
    expect(tailDepth(head, across, 0.1, at(away, 3000))).toBe(0);
  });
});
