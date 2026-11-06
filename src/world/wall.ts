import * as THREE from 'three';
import { atan2, cos, sin } from '../detmath';
import type { Placement } from './asteroids';

/**
 * The Solar Wall (the campaign's chapter 3, the Wall Run, see docs/campaign/): the finished
 * stretch of the President's wall on the lane from the Belt to Mars. Where things are, for the
 * field and its scenery (world/solarwall), and where its searchlights look.
 *
 * The wall stands in open space as a fence of girders hung with mesh: a slab across the lane in
 * the plane x = 0, its top edge WALL_TOP over the field's middle, reaching far below and along z
 * beyond the arena, so the only way across is over it. Its searchlights stand on the top edge,
 * one every LIGHT_STEP, each sweeping a cone of light across the lane, to and fro and along
 * the wall: whatever is held in one for long enough is seen.
 */

/** 1 km in units. */
const KM = 20000;

/** The top edge over the field's middle (units, 200 m), and how far the wall reaches below it and along it as one solid piece (units). */
export const WALL_TOP = 4000;
const WALL_DEPTH = 8 * KM;
const WALL_REACH = 8 * KM;
/** Its thickness (units, 20 m): girders and mesh. */
const WALL_THICK = 200;
/** The wall's solid box. */
export const WALL_HALF = new THREE.Vector3(WALL_THICK / 2, WALL_DEPTH / 2, WALL_REACH);
/** How long the finished stretch is (units, 340 km): the scenery draws it out to its ends. */
export const WALL_LENGTH = 340 * KM;

/** The wall as the field's piece of kind 'rack' (type `type` in the yards' set, see world/yard). */
export function wallPlacement(type: number): Placement {
  return { kind: 'rack', type, scale: 1, position: new THREE.Vector3(0, WALL_TOP - WALL_DEPTH / 2, 0), orientation: new THREE.Quaternion(), solid: true };
}

/**
 * The searchlights: LIGHTS of them on the top edge, LIGHT_STEP apart (units, 400 m) about the
 * field's middle; each cone LIGHT_ANGLE wide on either side of its axis (rad, 14°) and reaching
 * LIGHT_REACH (units, 3 km). Each sweeps across the lane (about z) by up to SWEEP_ACROSS either
 * way over SWEEP_PERIOD seconds (76°, its axis down to some 13° over the level with the sweep
 * along the wall, the cone's lower edge about level, so the cones graze the lane beside the
 * wall but hardly the top edge itself: a ship that keeps within some 50 m of the edge mostly
 * stays under them) and along the wall (about x) by up to SWEEP_ALONG at a period of
 * its own, its phases set by its place, so a gap travels along the wall.
 */
export const LIGHTS = 15;
export const LIGHT_STEP = 8000;
export const LIGHT_ANGLE = 0.245;
export const LIGHT_REACH = 3 * KM;
const SWEEP_ACROSS = 1.33;
const SWEEP_ALONG = 0.4;
export const SWEEP_PERIOD = 24;
const ALONG_PERIOD = 17;

/** The foot of searchlight `i` on the top edge (units, into `out`). */
export function lightAt(i: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(0, WALL_TOP + 120, (i - (LIGHTS - 1) / 2) * LIGHT_STEP);
}

/** Where searchlight `i` looks at field time `time` (s): a unit vector into `out`, up from the edge, tilted across the lane and along the wall. */
export function lightAim(i: number, time: number, out: THREE.Vector3): THREE.Vector3 {
  const across = SWEEP_ACROSS * sin((2 * Math.PI * time) / SWEEP_PERIOD + i * 0.9);
  const along = SWEEP_ALONG * sin((2 * Math.PI * time) / ALONG_PERIOD + i * 1.7);
  // up, turned towards ±x by `across`, then towards ±z by `along`
  return out.set(sin(across) * cos(along), cos(across) * cos(along), sin(along));
}

const foot = new THREE.Vector3();
const aim = new THREE.Vector3();
const toward = new THREE.Vector3();

/** Whether a point is held in a searchlight's cone at field time `time`. */
export function inLight(point: THREE.Vector3, time: number): boolean {
  for (let i = 0; i < LIGHTS; i++) {
    toward.subVectors(point, lightAt(i, foot));
    const along = toward.dot(lightAim(i, time, aim));
    if (along <= 0 || along > LIGHT_REACH) continue;
    const off = toward.addScaledVector(aim, -along).length();
    if (atan2(off, along) < LIGHT_ANGLE) return true;
  }
  return false;
}

/** From a hull's middle to its bow or stern as the searchlights look for it (units, 120 m: the barge's). */
export const HULL_REACH = 2400;
const end = new THREE.Vector3();

/** Whether a searchlight holds a hull of HULL_REACH, its middle at `middle` lying along `way` (a unit vector): its bow, middle or stern. */
export function hullInLight(middle: THREE.Vector3, way: THREE.Vector3, time: number): boolean {
  for (const along of [-HULL_REACH, 0, HULL_REACH]) if (inLight(end.copy(middle).addScaledVector(way, along), time)) return true;
  return false;
}
