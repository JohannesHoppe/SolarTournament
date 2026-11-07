import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { Noise } from './noise';
import { reliefPiece } from './horizon';
import { Randomizer } from '../random';

/**
 * The Plumes at Enceladus's south pole (the campaign's chapter 10, see docs/campaign/): the four
 * tiger stripes, long troughs in the ice with a ridge along each lip, and the jets of water vapor
 * and ice grains rising from their vents, which feed one of Saturn's rings. Where things are, for
 * the field and its scenery (world/plumes).
 *
 * The place's y is the true vertical. The ground lies LAND below the field's middle, the stripes
 * running across it along STRIPE_WAY, STRIPE_SPACING apart, squeezed as every place's distances
 * are: the real stripes are some 130 km long and 35 km apart. Saturn stands huge and still in the
 * sky: Enceladus keeps one face to it.
 */

/** 1 km in units. */
const KM = 20000;

/** Enceladus's pull at its surface (units/s²): 0.11 m/s², about a 90th of a g, from its mass of 1.08 × 10²⁰ kg over its radius of 252 km; too weak for a ship to feel. */
export const ENCELADUS_FALL = 2.3;
/** Enceladus's radius (units, 252 km): its ground falls away by some 200 m at 10 km. */
const ENCELADUS_RADIUS = 252 * KM;

/** The ground under the field's middle (units, 600 m below it). */
export const LAND = -12000;

/** The stripes' names, as astronomers gave them (proper names, never translated), in order across the field. */
export const STRIPE_NAMES = ['Alexandria', 'Cairo', 'Baghdad', 'Damascus'] as const;
/** The way the stripes run (level, unit), and the way across them. */
const STRIPE_TURN = 0.4;
export const STRIPE_WAY = new THREE.Vector3(cos(STRIPE_TURN), 0, sin(STRIPE_TURN));
const ACROSS = new THREE.Vector3(-STRIPE_WAY.z, 0, STRIPE_WAY.x);
/** The stripes STRIPE_SPACING apart (units, 1.2 km), the middle of the field between the second and the third. */
const STRIPE_SPACING = 24000;
/** A stripe's trough: TROUGH_DEPTH deep (units, 120 m) and TROUGH_HALF wide on each side of its middle (60 m); its lips' ridges RIDGE_HEIGHT high (40 m) at RIDGE_OFF from the middle (150 m), RIDGE_HALF wide on each side (90 m). */
const TROUGH_DEPTH = 2400;
const TROUGH_HALF = 1200;
const RIDGE_HEIGHT = 800;
const RIDGE_OFF = 3000;
const RIDGE_HALF = 1800;
/** How far a stripe winds off its straight line (units, 100 m), once every WIND_LENGTH or so along it (3 km). */
const WIND = 2000;
const WIND_LENGTH = 60000;
/** Hummocks of old ice over all of it: a few meters, some 150 m across. */
const BUMPS = 120;
const BUMP_SCALE = 3000;
const bumps = new Noise(10006);

/** How far along the stripes (x, z) lies from the field's middle, and how far across them. */
const alongOf = (x: number, z: number) => x * STRIPE_WAY.x + z * STRIPE_WAY.z;
const acrossOf = (x: number, z: number) => x * ACROSS.x + z * ACROSS.z;

/** Where stripe `k`'s middle lies across the field at `along` (units from the field's middle along the stripes). */
export function stripeAcross(k: number, along: number): number {
  return (k - (STRIPE_NAMES.length - 1) / 2) * STRIPE_SPACING + WIND * sin(along / WIND_LENGTH * Math.PI * 2 + k * 1.7);
}

/** A bump of `half` width at `d` from its middle: 1 there, 0 from `half` out, smooth between. */
const bump = (d: number, half: number) => {
  const x = Math.min(1, Math.abs(d) / half);
  return (1 - x * x) * (1 - x * x);
};

/** The trough and ridges of the stripes at (x, z) over the plain (units, negative in a trough). */
export function stripeRelief(x: number, z: number): number {
  const along = alongOf(x, z);
  const across = acrossOf(x, z);
  let relief = 0;
  for (let k = 0; k < STRIPE_NAMES.length; k++) {
    const d = across - stripeAcross(k, along);
    relief += RIDGE_HEIGHT * (bump(d - RIDGE_OFF, RIDGE_HALF) + bump(d + RIDGE_OFF, RIDGE_HALF)) - TROUGH_DEPTH * bump(d, TROUGH_HALF);
  }
  return relief;
}

/** Enceladus's ground (units, its height) over (x, z): the plain, the stripes' troughs and ridges, hummocks over all of it, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  return LAND + stripeRelief(x, z) + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.4, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * ENCELADUS_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 4000, 4 * KM);
/** Its box's top: over the highest the ground gets there, a ridge and its hummocks. */
const GROUND_TOP = LAND + RIDGE_HEIGHT + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/**
 * The vents along the stripes' floors, VENTS_PER_STRIPE to a stripe, seeded along the stretch of
 * it inside the arena; from each a plume rises straight up, PLUME_REACH high (units, 3 km),
 * widening from PLUME_START (units, 30 m) at the vent to PLUME_END (400 m), thickest at its foot.
 */
const VENTS_PER_STRIPE = 5;
const VENT_STRETCH = 50000;
export const PLUME_REACH = 60000;
export const PLUME_START = 600;
export const PLUME_END = 8000;

/** The vents in the world, each on its stripe's floor, in stripe order. */
export const VENTS: readonly THREE.Vector3[] = (() => {
  const r = new Randomizer(10007);
  const vents: THREE.Vector3[] = [];
  for (let k = 0; k < STRIPE_NAMES.length; k++) {
    for (let i = 0; i < VENTS_PER_STRIPE; i++) {
      const along = -VENT_STRETCH + ((i + 0.2 + 0.6 * r.nextFloat()) / VENTS_PER_STRIPE) * 2 * VENT_STRETCH;
      const across = stripeAcross(k, along);
      const x = along * STRIPE_WAY.x + across * ACROSS.x;
      const z = along * STRIPE_WAY.z + across * ACROSS.z;
      vents.push(new THREE.Vector3(x, surfaceHeight(x, z), z));
    }
  }
  return vents;
})();

/** How thick a plume is at `s`, the share of its height (0 at its vent): full at its foot, thinning out. */
export const plumeAlong = (s: number) => (1 - s) * (1 - s);

/** How thick the plumes are at `point` (0..1): full on a plume's axis at its foot, fading to its edge and its top. */
export function plumeDensity(point: THREE.Vector3): number {
  let density = 0;
  for (const vent of VENTS) {
    const up = point.y - vent.y;
    if (up <= 0 || up >= PLUME_REACH) continue;
    const s = up / PLUME_REACH;
    const radius = PLUME_START + (PLUME_END - PLUME_START) * s;
    const dx = point.x - vent.x;
    const dz = point.z - vent.z;
    const across = Math.sqrt(dx * dx + dz * dz);
    if (across >= radius) continue;
    density = Math.max(density, (1 - THREE.MathUtils.smoothstep(across, radius * 0.6, radius)) * plumeAlong(s));
  }
  return density;
}

/** Where the HUD marks stripe `k` (see ArenaProfile.references): its middle on the ground at the field's middle. */
export function stripeMark(k: number): THREE.Vector3 {
  const across = stripeAcross(k, 0);
  const x = across * ACROSS.x;
  const z = across * ACROSS.z;
  return new THREE.Vector3(x, surfaceHeight(x, z), z);
}

/**
 * Saturn over Enceladus: some 28° across (from 238,000 km off, its radius 60,300 km), its ring
 * seen almost from its edge (Enceladus orbits in its plane), 22° up and still in the sky; drawn at
 * SATURN_DISTANCE (units, inside the sky's sphere of stars), on the sky's side away from the sun.
 */
const SATURN_DISTANCE = 250000;
const SATURN_ANGLE = 0.248;
const SATURN_UP = 0.384;
export const SATURN_AT = new THREE.Vector3(cos(SATURN_UP) * 0.6, sin(SATURN_UP), cos(SATURN_UP) * 0.8).normalize().multiplyScalar(SATURN_DISTANCE);
export const SATURN_SIZE = SATURN_DISTANCE * sin(SATURN_ANGLE);
