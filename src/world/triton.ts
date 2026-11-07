import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { setFromAxisAngle } from '../detthree';
import { Noise } from './noise';
import { reliefPiece } from './horizon';
import { Randomizer } from '../random';
import type { Column, Placement } from './asteroids';

/**
 * Memorial on Triton (the campaign's chapter 14, see docs/campaign/): the pinkish nitrogen plain,
 * its cantaloupe terrain of dimples and ridges, the geysers of nitrogen gas and dark dust rising
 * from it, and the Navy's Memorial Station, oldest of its bases. Where things are, for the field
 * and its scenery (world/geysers).
 *
 * The place's y is the true vertical. The plain lies LAND below the field's middle; the geysers
 * rise GEYSER_HEIGHT over it, squeezed as every place's heights are (the real ones rise some
 * 8 km), and lean with the thin wind at their tops. Neptune hangs in the sky, still: Triton keeps
 * one face to it.
 */

/** 1 km in units. */
const KM = 20000;

/** Triton's pull at its surface (units/s²): 0.78 m/s², about a 13th of a g, from its mass of 2.14 × 10²² kg over its radius of 1,353 km. */
export const TRITON_FALL = 15.6;
/** Triton's radius (units, 1,353 km). */
const TRITON_RADIUS = 1353 * KM;

/** The plain under the field's middle (units, 600 m below it). */
export const LAND = -12000;

/** The cantaloupe terrain: dimples DIMPLE_DEPTH deep (units, 25 m) on a cellular pattern DIMPLE_SIZE across (units, 400 m), ridges between them; hummocks over all of it. */
const DIMPLE_DEPTH = 500;
const DIMPLE_SIZE = 8000;
const BUMPS = 100;
const BUMP_SCALE = 3000;
const dimples = new Noise(14006);
const bumps = new Noise(14007);

/** Triton's ground (units, its height) over (x, z): the plain, its dimples and ridges, hummocks, and the moon's curve. */
export function surfaceHeight(x: number, z: number): number {
  // a ridged noise is near 1 along its ridges: the dimples between them sink
  const ridges = dimples.fractal(x / DIMPLE_SIZE, 0.3, z / DIMPLE_SIZE, 2, true);
  return LAND - DIMPLE_DEPTH * (1 - ridges) + BUMPS * bumps.fractal(x / BUMP_SCALE, 0.4, z / BUMP_SCALE, 3) - (x * x + z * z) / (2 * TRITON_RADIUS);
}

/** How far the ground's solid piece reaches from the field's middle (units, 4 km square), and how deep under its highest point. */
export const GROUND_HALF = new THREE.Vector3(4 * KM, 4000, 4 * KM);
const GROUND_TOP = LAND + BUMPS;

/** The ground as the field's piece (see reliefPiece): its relief in its box's coordinates, and its placement as type `type` of the yards' set. */
const piece = reliefPiece(surfaceHeight, GROUND_HALF, GROUND_TOP);
export const groundRelief = piece.relief;
export const groundPlacement = piece.placement;

/**
 * The geysers: GEYSERS of them seeded over the field, none nearer each other than GEYSER_GAP
 * (units, 1 km), each a column GEYSER_RADIUS wide (units, 80 m) rising GEYSER_HEIGHT (units, 2 km)
 * and pushing a ship in it up with GEYSER_PUSH on its axis at its foot (units/s², 6 g: more than a
 * ship's thrusters push, RCS_THRUST, so a flight computer cannot hold a ship that flies in: it is
 * thrown up), see Column.
 */
const GEYSERS = 10;
const GEYSER_GAP = 20000;
export const GEYSER_RADIUS = 1600;
export const GEYSER_HEIGHT = 40000;
export const GEYSER_PUSH = 1200;
const GEYSER_REACH = 55000;

export const GEYSERS_AT: readonly THREE.Vector3[] = (() => {
  const r = new Randomizer(14008);
  const out: THREE.Vector3[] = [];
  while (out.length < GEYSERS) {
    const angle = r.range(0, Math.PI * 2);
    const reach = Math.sqrt(r.nextFloat()) * GEYSER_REACH;
    const x = cos(angle) * reach;
    const z = sin(angle) * reach;
    if (out.some((g) => (g.x - x) * (g.x - x) + (g.z - z) * (g.z - z) < GEYSER_GAP * GEYSER_GAP)) continue;
    out.push(new THREE.Vector3(x, surfaceHeight(x, z), z));
  }
  return out;
})();

/** The geysers as the field's columns (see FieldLayout.columns). */
export const GEYSER_COLUMNS: readonly Column[] = GEYSERS_AT.map((at) => ({ at, radius: GEYSER_RADIUS, height: GEYSER_HEIGHT, push: GEYSER_PUSH }));

/** The Navy's Memorial Station: where it stands on the plain, its box's half extents as the listening post's (see world/callisto), the race's end. */
export const STATION_AT = new THREE.Vector3(-45000, surfaceHeight(-45000, -35000), -35000);

/** The Memorial Station as the field's piece of `type`, `half` its box, standing on the plain. */
export function memorialPlacement(type: number, half: THREE.Vector3): Placement {
  const at = STATION_AT.clone();
  at.y += half.y - 200;
  return { kind: 'rack', type, scale: 1, position: at, orientation: setFromAxisAngle(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), 0.6), solid: true };
}

/**
 * Neptune over Triton: some 8° across (from 355,000 km off, its radius 24,600 km), 30° up and
 * still in the sky; drawn at NEPTUNE_DISTANCE (units, inside the sky's sphere of stars), on the
 * sky's side away from the sun.
 */
const NEPTUNE_DISTANCE = 250000;
const NEPTUNE_ANGLE = 0.0693;
const NEPTUNE_UP = 0.52;
export const NEPTUNE_AT = new THREE.Vector3(cos(NEPTUNE_UP) * 0.6, sin(NEPTUNE_UP), cos(NEPTUNE_UP) * 0.8).normalize().multiplyScalar(NEPTUNE_DISTANCE);
export const NEPTUNE_SIZE = NEPTUNE_DISTANCE * sin(NEPTUNE_ANGLE);
