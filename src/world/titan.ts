import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { reliefPiece } from './horizon';
import type { Air } from './air';

/**
 * The Circuit over Kraken Mare on Titan (the campaign's chapter 9, see docs/campaign/): Titan's
 * largest sea of liquid methane and ethane under its thick orange air. Where things are, for the
 * field and its scenery (world/kraken).
 *
 * The place's y is the true vertical. The top of Titan's haze runs through the field's middle as
 * the deck of its air (see world/air): over it open sky with Saturn hanging ringed and tilted;
 * under it the orange haze, thicker the deeper, down to the sea's still surface SEA below. Titan's
 * air works as Jupiter's does in the game (the same haze, drag and heat by depth), squeezed as
 * Jupiter's is; the real one is thicker still and some two hundred kilometers deep.
 */

/** 1 km in units. */
const KM = 20000;

/** Titan's pull at its surface (units/s²): 1.35 m/s², a seventh of a g, from its mass of 1.35 × 10²³ kg over its radius of 2,575 km. */
export const TITAN_FALL = 27;
/** Titan's radius (units, 2,575 km): the haze's deck is a sphere of it about Titan's middle, so the deck curves away as Titan does. */
const TITAN_RADIUS = 2575 * KM;

/** Titan's air: its deck through the field's middle, a sphere of Titan's radius (see Air). */
export const TITAN_AIR: Air = { center: new THREE.Vector3(0, -TITAN_RADIUS, 0), radius: TITAN_RADIUS };

/** The sea's surface under the field's middle (units, 2 km under the deck): still, glassy, liquid methane. */
export const SEA = -2 * KM;

/** The sea's height at (x, z): still liquid, level but for Titan's curve. */
export const seaHeight = (x: number, z: number) => SEA - (x * x + z * z) / (2 * TITAN_RADIUS);

/** How far the sea's solid piece reaches from the field's middle (units, 4 km square), and how deep under its surface. */
export const SEA_HALF = new THREE.Vector3(4 * KM, 2000, 4 * KM);

/** The sea as the field's piece (see reliefPiece): a ship that touches it crashes as into rock. */
const piece = reliefPiece(seaHeight, SEA_HALF, SEA);
export const seaRelief = piece.relief;
export const seaPlacement = piece.placement;

/**
 * Saturn over the haze: some 5.7° across (from 1.22 million km off, its radius 60,300 km), its
 * ring more than twice as wide, 30° up and still in the sky (Titan keeps one face to it); drawn
 * at SATURN_DISTANCE (units, inside the sky's sphere of stars), on the sky's side away from the
 * sun, so its lit face shows, its ring tilted as Titan's orbit sees it.
 */
const SATURN_DISTANCE = 250000;
const SATURN_ANGLE = 0.0494;
const SATURN_UP = 0.52;
export const SATURN_AT = new THREE.Vector3(cos(SATURN_UP) * 0.6, sin(SATURN_UP), cos(SATURN_UP) * 0.8).normalize().multiplyScalar(SATURN_DISTANCE);
export const SATURN_SIZE = SATURN_DISTANCE * sin(SATURN_ANGLE);
