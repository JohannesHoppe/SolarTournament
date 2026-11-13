import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { setFromAxisAngle } from '../detthree';
import type { Air } from './air';
import type { Placement } from './asteroids';

/**
 * Highball over Venus (a side trip of the campaign, see docs/campaign/): Victory Cola's floating
 * city, some 54 km over the surface, where the air has Earth's pressure and a bearable warmth and
 * a breath of Earth's air is a lifting gas. Where things are, for the field and its scenery
 * (world/highball).
 *
 * The place's y is the true vertical. The top of Venus's sulfuric acid clouds runs DECK below the
 * field's middle as the deck of its air (see world/air): over it the city floats on the air in its
 * halls, under it the yellow haze, thicker, hotter and more corrosive the deeper. Venus's air
 * works as Jupiter's and Titan's do in the game (the same haze, drag and heat by depth), squeezed
 * as theirs are; the real cloud deck is some 20 km thick.
 */

/** 1 km in units. */
const KM = 20000;

/** Venus's pull at the city (units/s²): 8.87 m/s², some 0.9 g. */
export const VENUS_FALL = 177;
/** Venus's radius (units, 6,052 km): the deck is a sphere of it about Venus's middle. */
const VENUS_RADIUS = 6052 * KM;

/** The cloud tops under the field's middle (units, 1 km under it). */
export const DECK = -1 * KM;
/**
 * Venus's air: its deck DECK under the field's middle, a sphere of Venus's radius (see Air); carbon
 * dioxide (850 J/(kg·K)) at 300 K at the cloud tops, warming by 155 K a kilometer downwards (the
 * real ~9 K a kilometer squeezed as the density is): under the acid clouds the air heats a hull.
 */
export const VENUS_AIR: Air = { center: new THREE.Vector3(0, DECK - VENUS_RADIUS, 0), radius: VENUS_RADIUS, kelvin: 300, lapse: 155 / 20000, heatCapacity: 850 };

/**
 * The city's platform: a square PLATFORM_HALF_SIDE from its middle to each flank (units, 550 m)
 * and PLATFORM_THICK thick (units, 60 m), its top PLATFORM_TOP under the field's middle (units,
 * 100 m); solid as the box it is.
 */
export const PLATFORM_HALF_SIDE = 11000;
export const PLATFORM_THICK = 1200;
export const PLATFORM_TOP = -2000;
export const PLATFORM_HALF = new THREE.Vector3(PLATFORM_HALF_SIDE, PLATFORM_THICK / 2, PLATFORM_HALF_SIDE);

/**
 * The halls: HALLS glass halls on the platform, HALL_RING from its middle (units, 380 m), each
 * HALL_HALF in half extents (units, 160 by 50 by 90 m), long side round the ring; the air in them
 * Earth's, lifting the city. Biodome four is the fourth (index 3), its tomatoes Nicole's echo.
 */
export const HALLS = 6;
const HALL_RING = 7600;
export const HALL_HALF = new THREE.Vector3(1600, 500, 900);
/** The bearing of hall `k` on the platform (rad). */
const hallBearing = (k: number) => (k / HALLS) * Math.PI * 2 + Math.PI / HALLS;
export function hallAt(k: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(cos(hallBearing(k)) * HALL_RING, PLATFORM_TOP + HALL_HALF.y, sin(hallBearing(k)) * HALL_RING);
}
/** Biodome four (see HALLS). */
export const BIODOME_FOUR = 3;

/**
 * The tower at the platform's middle: a Victory Cola bottle 400 m high, its body BOTTLE_RADIUS at
 * its widest (units, 90 m) up to BODY_HEIGHT (units, 220 m), its shoulders narrowing to the neck
 * NECK_RADIUS (units, 35 m) up to BOTTLE_HEIGHT (units, 400 m); solid as a box inside the body and
 * one inside the neck, each a fifth narrower than its round.
 */
export const BOTTLE_RADIUS = 1800;
export const BODY_HEIGHT = 4400;
export const NECK_RADIUS = 700;
export const BOTTLE_HEIGHT = 8000;
const INSIDE = 0.8;
export const BODY_HALF = new THREE.Vector3(BOTTLE_RADIUS * INSIDE, BODY_HEIGHT / 2, BOTTLE_RADIUS * INSIDE);
/** The neck's box, from the shoulders' top (a third of the way from the body to the cap) to the cap. */
const NECK_FROM = BODY_HEIGHT + (BOTTLE_HEIGHT - BODY_HEIGHT) / 3;
export const NECK_HALF = new THREE.Vector3(NECK_RADIUS * INSIDE, (BOTTLE_HEIGHT - NECK_FROM) / 2, NECK_RADIUS * INSIDE);

const UP = new THREE.Vector3(0, 1, 0);
const turned = (angle: number) => setFromAxisAngle(new THREE.Quaternion(), UP, angle);

/**
 * The city as the field's pieces: the platform (`platform`), the halls (`hall`), the bottle's
 * body (`bottle`, drawn whole) and its neck (`neck`, a collider only).
 */
export function cityPlacements(types: { platform: number; hall: number; bottle: number; neck: number }): Placement[] {
  const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const piece = (type: number, position: THREE.Vector3, angle: number): Placement => ({ kind: 'rack', type, scale: 1, position, orientation: turned(angle), solid: true });
  const middle = PLATFORM_TOP - PLATFORM_THICK / 2;
  return [
    piece(types.platform, at(0, middle, 0), 0),
    ...Array.from({ length: HALLS }, (_, k) => piece(types.hall, hallAt(k), -hallBearing(k) - Math.PI / 2)),
    piece(types.bottle, at(0, PLATFORM_TOP + BODY_HEIGHT / 2, 0), 0),
    piece(types.neck, at(0, PLATFORM_TOP + NECK_FROM + NECK_HALF.y, 0), 0),
  ];
}
