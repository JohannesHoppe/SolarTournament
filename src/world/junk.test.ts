import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { debrisSet } from './shapes';
import { junkMass, onCore, plugMass, type JunkBuild } from './junk';
import { MASS, type Body } from './bodies';
import { impactDamage, sheetDamage, SHEET_SAFE, strikeJunk } from '../ship/impact';
import { MAX_HULL } from '../ship/ship';
import { junkField } from '../test/field';
import { arenaById } from './arenas';
import { blowSpin, blowState, KNOCKED } from './asteroids';
import { FieldContacts } from './contacts';
import { fieldSlice, SYNC_SLICES, syncField } from './fieldsync';
import { shovedState } from '../net/validate';

/** Units per meter. */
const M = 20;
const builds = debrisSet().near.map((template) => template.userData.junk as JunkBuild);
const of = (kind: JunkBuild['kind']) => builds.filter((b) => b.kind === kind);

/** A point on a build's sheet or core along its long axis (template frame). */
const sheetPoint = (b: JunkBuild) => new THREE.Vector3(b.hard === null ? 0 : (b.hard as { max: number }).max + 200, 0, 0);
const corePoint = (b: JunkBuild) => new THREE.Vector3(b.hard === 'all' ? 0 : ((b.hard as { min: number; max: number }).min + (b.hard as { max: number }).max) / 2, 0, 0);

/**
 * A ship at `speed` (m/s) flies head on into a piece built as `build` grown `scale`, at rest,
 * struck at `local`: what the ship felt, the hull it lost, the speed it keeps, and the momentum
 * before and after (kg·units/s along the flight).
 */
function strike(build: JunkBuild, scale: number, speed: number, local: THREE.Vector3) {
  const ship: Body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(speed * M, 0, 0), mass: MASS.ship };
  const piece: Body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: junkMass(build, scale) };
  const before = ship.velocity.x * ship.mass;
  const struck = strikeJunk(build, local, ship, piece, new THREE.Vector3(-1, 0, 0), false);
  return {
    core: struck?.core ?? null,
    felt: (struck?.felt ?? 0) / M,
    hull: struck?.core ? impactDamage(struck.felt) : (struck?.dent ?? 0),
    kept: ship.velocity.x / (speed * M),
    momentum: [before, ship.velocity.x * ship.mass + piece.velocity.x * piece.mass],
  };
}

describe('the Satellite Junkyard’s junk', () => {
  it('weighs what it is built of: the wings and shells light against an interceptor, a stack of satellites a mountain', () => {
    expect(builds.map((b) => b.kind)).toEqual(['satellite', 'stage', 'fairing', 'stack', 'shredded', 'stage', 'satellite', 'sign']);
    for (const b of builds) expect(junkMass(b, 1)).toBeGreaterThan(30_000);
    // a wing's panels, all of them, weigh a few tonnes even on the largest satellite
    for (const b of [...of('satellite'), ...of('shredded')]) expect(b.sheets * 9).toBeLessThan(30_000);
    for (const b of [...of('stack'), ...of('sign')]) expect(junkMass(b, 1)).toBeGreaterThan(40 * MASS.ship);
    // the plug a hull tears out: a wing's 75 kg, a fairing's a quarter tonne, a tank's two walls a tonne
    expect(builds.map(plugMass)).toEqual([75, 1000, 250, 0, 75, 1000, 75, 0]);
  });

  it('is punched through where it is sheet: the plug dents the armor by its energy, a scrape at a wing, a solid hit at a tank, never a wreck; the momentum kept', () => {
    for (const b of [...of('satellite'), ...of('shredded'), ...of('stage'), ...of('fairing')]) {
      for (const scale of [1, 3]) {
        const local = sheetPoint(b);
        expect(onCore(b, local)).toBe(false);
        const full = strike(b, scale, 250, local);
        expect(full.core).toBe(false);
        // the dent by the plug's kinetic energy alone, whatever the piece's size
        expect(full.hull).toBeCloseTo(sheetDamage(plugMass(b), 250 * M), 6);
        // a full hull survives any one sheet, even at a race's boosted 450 m/s
        expect(strike(b, scale, 450, local).hull).toBeLessThan(MAX_HULL);
        // the ship flies on, slowed by no more than the plug's share
        expect(full.kept).toBeGreaterThan(0.98);
        expect(full.momentum[1]).toBeCloseTo(full.momentum[0], -2);
        // a slow touch only scratches the paint
        expect(strike(b, scale, (SHEET_SAFE / M) * 0.99, local).hull).toBe(0);
      }
    }
    // the ladder at 250 m/s: a wing's panels a scrape, a fairing's shell a dent, a stage's tank walls a solid hit
    const at = (kind: JunkBuild['kind']) => Math.round(strike(of(kind)[0], 1, 250, sheetPoint(of(kind)[0])).hull);
    expect([at('satellite'), at('fairing'), at('stage')]).toEqual([3, 10, 42]);
    expect(Math.round(strike(of('satellite')[0], 1, 100, sheetPoint(of('satellite')[0])).hull * 10) / 10).toBe(0.5);
  });

  it('tears its plug out once as the hull enters, never again while the hull is in the sheet', () => {
    const b = of('fairing')[0];
    const ship: Body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(5000, 0, 0), mass: MASS.ship };
    const piece: Body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: junkMass(b, 1) };
    expect(strikeJunk(b, sheetPoint(b), ship, piece, new THREE.Vector3(-1, 0, 0), true)).toBeNull();
    expect(ship.velocity.x).toBe(5000);
  });

  it('strikes as a body of its mass where it is core: a light satellite’s bus knocked away hurts, a large one’s and a stack as rock does', () => {
    const small = of('satellite')[0];
    // a satellite of some 50 t, a little lighter than the ship: survived at 50 m/s, a wreck at full speed
    const slow = strike(small, 1, 50, corePoint(small));
    expect(slow.core).toBe(true);
    expect(slow.hull).toBeGreaterThan(0);
    expect(slow.hull).toBeLessThan(MAX_HULL / 2);
    expect(slow.felt).toBeLessThan(30);
    expect(strike(small, 1, 250, corePoint(small)).hull).toBeGreaterThanOrEqual(MAX_HULL);
    // momentum kept in the bump
    expect(slow.momentum[1]).toBeCloseTo(slow.momentum[0], -2);
    // grown threefold, a satellite weighs twenty ships: nearly rock
    expect(strike(small, 3, 100, corePoint(small)).felt).toBeGreaterThan(95);
    for (const b of [...of('stack'), ...of('sign')]) {
      const blow = strike(b, 1, 100, corePoint(b));
      expect(blow.core).toBe(true);
      expect(blow.felt).toBeGreaterThan(97);
    }
    // a stage's thrust frame and engine are its core: they hurt as its whole mass does
    for (const b of of('stage')) expect(strike(b, 1, 150, corePoint(b)).hull).toBeGreaterThan(0);
  });

  it('moves alike on two browsers once a ship struck it: the follower takes the striker’s word through the wire, and the lead’s sync keeps them alike', () => {
    const layout = arenaById('junkyard')!.layout;
    const lead = junkField();
    const follower = junkField();
    for (const field of [lead, follower]) field.generate(layout);
    for (let t = 0; t < 60; t++) for (const field of [lead, follower]) field.update(1 / 60);
    const piece = [...lead.asteroids.values()].find((a) => a.junk?.build.kind === 'satellite')!;
    expect(piece).toBeDefined();
    // a ship at 200 m/s strikes its bus, as Game.meetJunk does on the striker's browser (the lead here)
    const point = piece.object.position.clone();
    const local = point.clone().applyMatrix4(piece.inverse);
    const ship: Body = { position: point.clone(), velocity: new THREE.Vector3(4000, 0, 0), mass: MASS.ship };
    const body: Body = { position: point.clone(), velocity: lead.surfaceVelocity(piece, point, new THREE.Vector3()), mass: lead.bodyMass(piece) };
    const before = body.velocity.clone();
    const build = { ...piece.junk!.build, hard: 'all' as const };
    expect(strikeJunk(build, local, ship, body, new THREE.Vector3(-1, 0, 0), false)?.core).toBe(true);
    const change = body.velocity.clone().sub(before);
    expect(change.x).toBeGreaterThan(0);
    const center = lead.surfaceVelocity(piece, piece.object.position, new THREE.Vector3()).add(change);
    const spin = blowSpin(piece, new THREE.Vector3(), change, 0.6, new THREE.Vector3());
    const state = blowState(piece, lead.clock, piece.object.position, center, spin, KNOCKED);
    lead.move(state);
    follower.move(shovedState(JSON.parse(JSON.stringify(state)))!);
    const where = (field: typeof lead) => field.asteroids.get(piece.id)!.object.position.toArray().map((x) => Math.round(x));
    for (let t = 0; t < 120; t++) for (const field of [lead, follower]) field.update(1 / 60);
    expect(where(follower)).toEqual(where(lead));
    // the lead's contacts and its sync of the field play on alike
    const contacts = new FieldContacts();
    for (let i = 0; i < SYNC_SLICES; i++) {
      for (let t = 0; t < 30; t++) {
        for (const field of [lead, follower]) field.update(1 / 60);
        for (const knock of contacts.run(lead)) follower.move(knock);
      }
      syncField(follower, JSON.parse(JSON.stringify(fieldSlice(lead, i))));
    }
    expect(where(follower)).toEqual(where(lead));
  }, 60000);
});
