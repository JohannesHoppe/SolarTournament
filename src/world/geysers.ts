import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { behindAll, moonBeyond } from './horizon';
import { Noise } from './noise';
import { listeningPost } from './valhalla';
import type { Jets } from './plumes';
import { GEYSER_HEIGHT, GEYSER_RADIUS, GEYSERS_AT, GROUND_HALF, groundRelief, NEPTUNE_AT, NEPTUNE_SIZE, surfaceHeight } from './triton';

/**
 * How Memorial on Triton looks (where things are in world/triton): the ground of the field as the
 * piece it collides as (its relief, see Relief), the crater floor's photograph tinted to Triton's
 * pinkish nitrogen ice; the Navy's Memorial Station, the listening post's build in the Navy's
 * oldest grey; the geysers, columns of dark dust bending with the thin wind at their tops; the
 * plain beyond with its dark streaks, drawn behind everything; and Neptune in the sky.
 */

/** Triton's nitrogen ice: pinkish white (it reflects some 70 % of the far sun's light), lit by Neptune's glow. */
const TRITON_TINT = 0xf2dcd6;
const TRITON_GLOW = 0x48404a;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/triton gives (see reliefGround). */
export const tritonGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, TRITON_TINT, TRITON_GLOW);

/** The Memorial Station's plating: the Navy's oldest grey, its stencils. */
const MEMORIAL_PAINT = { key: 'navy-memorial', seed: 14101, tint: 0x7f8590, texts: ['UEN MEMORIAL STATION', 'NAVY', 'FIRST FLEET', 'NOBODY LEAVES', 'TRITON'] };

/** The Memorial Station (see world/triton): the listening post's build in the Navy's grey. */
export const memorialStation = (half: THREE.Vector3): THREE.Group => listeningPost(half, MEMORIAL_PAINT);

/** The geysers: dark dust rising at 60 m/s, from 15 m wide at the vent to their column's width, bending with the wind at their tops (see world/plumes, Jets). */
export const TRITON_JETS: Jets = { vents: GEYSERS_AT, reach: GEYSER_HEIGHT, start: 300, end: GEYSER_RADIUS, rise: 1200, wind: new THREE.Vector3(9000, 0, 3000), dark: true, tone: new THREE.Color(0.42, 0.37, 0.34), seed: 14009 };

/** Triton beyond the field: its pinkish ice, darker in long streaks the geysers' dust laid down downwind. */
const ICE = new THREE.Color(0.46, 0.4, 0.38);
const STREAK = new THREE.Color(0.2, 0.17, 0.16);
const streaks = new Noise(14010);

/** Neptune: a little bluer than Uranus's cyan, faint bands. */
const NEPTUNE_COLOR = 0x6fa3dd;

/** The plain beyond the field's ground, from 3.4 km out to its horizon some 25 km away, and Neptune, drawn behind everything. */
export function triton(): THREE.Group {
  const paint = (x: number, z: number, color: THREE.Color) => {
    // the streaks run downwind (+x), long and thin
    const streak = THREE.MathUtils.smoothstep(streaks.fractal(x / 90000, 0.2, z / 12000, 3), 0.15, 0.4);
    color.copy(ICE).lerp(STREAK, streak);
  };
  const neptune = new THREE.Mesh(new THREE.SphereGeometry(NEPTUNE_SIZE, 64, 32), behindAll(new THREE.MeshStandardMaterial({ color: NEPTUNE_COLOR, roughness: 1, metalness: 0, emissive: 0x08101c })));
  neptune.position.copy(NEPTUNE_AT);
  neptune.userData.shadowless = true;
  return moonBeyond(GROUND_HALF.x, 25 * 20000, surfaceHeight, paint, TRITON_GLOW).add(neptune);
}
