import * as THREE from 'three';
import { contact, IMMOVABLE, MASS, share, type Body } from '../world/bodies';
import { onCore, plugMass, type JunkBuild } from '../world/junk';
import { METERS_PER_UNIT } from './flight';

/** Impacts slower than this (units/s) only scratch the paint. */
export const SAFE_IMPACT = 250;
/** Hull damage per unit/s of impact speed above SAFE_IMPACT. */
const IMPACT_DAMAGE = 1 / 12;
/** Share of the impact speed a ship keeps when it bounces off a rock. */
const RESTITUTION = 0.3;
/**
 * Scraping along a surface takes sideways speed in proportion to how hard the hull was pushed
 * off it (a friction coefficient): a strike at 50 m/s takes about 10 m/s, and a ship resting
 * on a rock under its pull slides to a stop at the same rate whatever the frame rate.
 */
const FRICTION = 0.15;

/** The way from the second ship of a ram to the first (see ram). */
const toFirst = new THREE.Vector3();
/** A body bouncing off a surface, and the surface, which does not move (see bounceOff). */
const mover = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: 1 };
const wall = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: IMMOVABLE };

/**
 * A ship's `velocity` bounces off a surface moving at `moving` with the outward `normal`, and
 * scraping along it bleeds off some sideways speed (a contact with a body that does not move,
 * see contact); returns how fast it struck (units/s), 0 when it was moving away. A livelier
 * body than a ship's hull passes its own `restitution`.
 */
export function bounceOff(velocity: THREE.Vector3, moving: THREE.Vector3, normal: THREE.Vector3, restitution = RESTITUTION): number {
  mover.velocity.copy(velocity);
  wall.velocity.copy(moving);
  const approach = contact(mover, wall, normal, restitution, FRICTION, true, false);
  velocity.copy(mover.velocity);
  return approach;
}

/** Two bodies bump, `normal` from b to a, each of them shoved by its share as a ship off a rock (see contact); returns how fast they closed. */
export function bump(a: Body, b: Body, normal: THREE.Vector3, restitution = RESTITUTION, moveA = true, moveB = true): number {
  return contact(a, b, normal, restitution, FRICTION, moveA, moveB);
}

/** The hull an impact this fast (units/s) takes. */
export const impactDamage = (approach: number) => Math.max(0, approach - SAFE_IMPACT) * IMPACT_DAMAGE;

/**
 * One rule for every hull meeting a body: what crushes a hull is the change of speed it takes,
 * so the blow it feels is the closing speed times the other body's share of their masses
 * (`other` / (`mass` + `other`); rock, a ring or anything anchored is IMMOVABLE and gives the
 * whole closing speed, a body as heavy as the ship half of it, a light plate a few percent),
 * times where it lands (`zone`, see RAM_ZONE; 1 where the pair knows no zone), taken through the
 * rock's curve (impactDamage). Rock is this rule with a share of one.
 */
export function feltBlow(closing: number, mass: number, other: number, zone = 1): number {
  return closing * share(mass, other) * zone;
}

/** The hull points a hull of `mass` takes meeting a body of `other` at `closing` (units/s), struck where `zone` says (see feltBlow). */
export const blowDamage = (closing: number, mass: number, other: number, zone = 1) => impactDamage(feltBlow(closing, mass, other, zone));

/**
 * A hull punching through a sheet of junk (see strikeJunk) is dented by the plug it tears out:
 * the plug's kinetic energy in the ship's frame, at the speed the two close, goes into the
 * armor of the nose. A hull point per this much of it (J): a solar wing's 75 kg plug at
 * 250 m/s (2.3 MJ) costs 3 points, about a laser's scorch and a half; a fairing's 250 kg plug
 * (7.8 MJ) 10; a tank's tonne of two walls (31 MJ) 42, a solid hit.
 */
const SHEET_JOULES = 750_000;
/** Slower than this (units/s, 30 m/s) a sheet only scratches the paint: a touch, no dent. */
export const SHEET_SAFE = 600;
/**
 * A sheet tears before it passes more than this to the armor (hull points): it is torn through
 * and shatters ahead of the nose, so no single sheet wrecks a whole hull, a tank's walls at a
 * race's boosted speed (450 m/s, 101 MJ) included.
 */
const SHEET_MOST = 60;

/** The hull points a plug of `plug` kg torn out of a sheet at a closing speed of `closing` (units/s) costs the armor (see SHEET_JOULES). */
export function sheetDamage(plug: number, closing: number): number {
  if (closing < SHEET_SAFE) return 0;
  const speed = closing * METERS_PER_UNIT;
  return Math.min(SHEET_MOST, (0.5 * plug * speed * speed) / SHEET_JOULES);
}

/** What a strike of junk did (see strikeJunk), reused for every strike. */
const struck = { core: false, felt: 0, dent: 0 };
const closing = new THREE.Vector3();

/**
 * A ship (`ship`) meets a piece of the Satellite Junkyard's junk built as `build` (see
 * world/junk) at `local`, the point struck in the piece's frame; the piece is a body there
 * (`piece`: its whole mass, its velocity at that point), `normal` points out of it. On its core
 * the two bump as bodies of their masses (see bump). On a sheet the hull punches through: the
 * plug it tears out (see plugMass) takes the hull's speed as the two would as one body, the ship
 * giving up the plug's share of the closing speed and the piece taking the momentum the plug
 * gained; once, as the hull enters (`through`: it is already in this sheet, and nothing
 * happens). Both velocities change here. Returns whether it struck the core, the blow the
 * ship felt (units/s: on a core its own share of the closing speed, which impactDamage takes as
 * an impact against rock; on a sheet the speed it gave up) and on a sheet the dent the plug
 * left in its armor (hull points, see sheetDamage); null when nothing struck.
 */
export function strikeJunk(build: JunkBuild, local: THREE.Vector3, ship: Body, piece: Body, normal: THREE.Vector3, through: boolean): { readonly core: boolean; readonly felt: number; readonly dent: number } | null {
  if (onCore(build, local)) {
    const approach = bump(ship, piece, normal);
    if (approach <= 0) return null;
    struck.core = true;
    struck.felt = approach * share(ship.mass, piece.mass);
    struck.dent = 0;
    return struck;
  }
  if (through) return null;
  const plug = plugMass(build);
  closing.subVectors(ship.velocity, piece.velocity);
  struck.dent = sheetDamage(plug, closing.length());
  const parted = plug / (ship.mass + plug);
  ship.velocity.addScaledVector(closing, -parted);
  piece.velocity.addScaledVector(closing, (ship.mass * parted) / piece.mass);
  struck.core = false;
  struck.felt = closing.length() * parted;
  return struck;
}

/**
 * Two ships meeting slower than this (units/s, 15 m/s, their closing speed along the line between
 * them) only bump: a clunk through the hull and a bounce, scratches and dents. A pack flying
 * together, or two ships touching while they jostle, never closes this fast.
 */
export const RAM_SAFE = 300;
/**
 * A ram is a hull meeting a body like any other (see feltBlow): two interceptors of the same
 * mass, so each feels half the closing speed, times where it is struck (RAM_ZONE), through the
 * rock's curve. Where it strikes decides what breaks, as with the laser: the armored nose takes
 * less of the blow, a flank all of it and a shake of its thrusters (RAM_THRUSTERS of their
 * health per point of hull), the open drive more than all of it and loses a hundredth of its
 * thrust per point of hull it takes (RAM_DRIVE), its reactor going critical once nothing is
 * left. A ram that hurts at all hurts at least as much as a laser's hit (RAM_LEAST hull, and a
 * fifth of the drive's thrust from behind).
 *
 * So a ram hurts from 25 m/s of closing (half of it the felt 12.5 m/s that scratches nothing on
 * rock). At 60 m/s (the dodge kicked into a flank) a flank loses 29 hull points; a nose into a
 * nose at 100 m/s costs each 38; two noses meeting faster than 207 m/s (two ships at full
 * speed head on) both go down; from 112 m/s into a drive its reactor goes critical; an
 * overdrive's shove into a flank (about 200 m/s closing) kills the ship ahead.
 */
export const RAM_ZONE: Readonly<Record<'nose' | 'flank' | 'drive', number>> = { nose: 0.7, flank: 1, drive: 1.3 };
const RAM_THRUSTERS = 0.01;
const RAM_DRIVE = 100;
const RAM_LEAST = 2;
const RAM_LEAST_DRIVE = 0.2;
/** The two ships keep this share of their closing speed, apart again (as off a rock). */
const RAM_RESTITUTION = RESTITUTION;

/** Where a ram strikes a ship: its armored nose, a flank, or the open drive behind. */
export type RamZone = 'nose' | 'flank' | 'drive';

/** What a ram closing at `closing` (units/s) does to a ship struck in `zone`: hull points, and shares of the drive's and the thrusters' health. */
export function ramDamage(closing: number, zone: RamZone): { hull: number; drive: number; thrusters: number } {
  if (closing <= RAM_SAFE) return { hull: 0, drive: 0, thrusters: 0 };
  const hull = Math.max(RAM_LEAST, blowDamage(closing, MASS.ship, MASS.ship, RAM_ZONE[zone]));
  if (zone === 'drive') return { hull, drive: Math.max(RAM_LEAST_DRIVE, hull / RAM_DRIVE), thrusters: 0 };
  return { hull, drive: 0, thrusters: zone === 'flank' ? Math.min(1, hull * RAM_THRUSTERS) : 0 };
}

/** The change of velocity each of two ships takes when they close at `closing` (units/s): a bump of two bodies of the same mass (see contact). */
export const ramImpulse = (closing: number) => closing * (1 + RAM_RESTITUTION) * share(MASS.ship, MASS.ship);

/**
 * Two ships meet: `apart` points from the first to the second (unit length). They bump as two
 * bodies (see contact in world/bodies), keeping RAM_RESTITUTION of their closing speed apart,
 * each taking its share by mass (half each, two interceptors); `first`/`second` say whose
 * velocity this browser changes (it runs that ship). Returns the closing speed (units/s), 0
 * when they were already moving apart.
 */
export function ram(a: Body, b: Body, apart: THREE.Vector3, first: boolean, second: boolean): number {
  return contact(a, b, toFirst.copy(apart).negate(), RAM_RESTITUTION, 0, first, second);
}
