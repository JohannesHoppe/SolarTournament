import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { behindAll } from './horizon';

/**
 * The Long Ladder (the campaign's chapter 16, see docs/campaign/): the Ministry's chain of fuel
 * depots out past Pluto, its rungs. Two of them are flown, both in open space, their fields of
 * ice what drifts there: Haumea's ring, a thin band of water ice around the dwarf planet, the
 * elongated body itself below it, spinning once in four hours; and Eris, one of the brightest
 * bodies known, its depot in orbit over it, its moon Dysnomia beside it. Where things are and how
 * they look.
 */

/**
 * Haumea under its ring: an ellipsoid of HAUMEA_AXES (units, its 2,322 by 1,704 by 1,026 km scaled
 * to the sky as every place's bodies are), HAUMEA_AT below the field; its crystalline ice white, a
 * dark red spot on its face.
 */
const HAUMEA_DISTANCE = 220000;
export const HAUMEA_AT = new THREE.Vector3(0.3, -1, 0.2).normalize().multiplyScalar(HAUMEA_DISTANCE);
const HAUMEA_AXES = new THREE.Vector3(1, 0.73, 0.44).multiplyScalar(60000);

/** Eris below its depot: a ball ERIS_SIZE across (units), ERIS_AT below the field, bright as fresh snow; Dysnomia, its moon, small beside it. */
const ERIS_DISTANCE = 200000;
export const ERIS_AT = new THREE.Vector3(-0.2, -1, 0.35).normalize().multiplyScalar(ERIS_DISTANCE);
const ERIS_SIZE = 70000;
export const DYSNOMIA_AT = new THREE.Vector3(cos(0.5) * 0.7, sin(0.5), cos(0.5) * -0.7).normalize().multiplyScalar(ERIS_DISTANCE * 1.2);
const DYSNOMIA_SIZE = 6000;

/** The depot at Eris (Rung Two): where a fuel barge's lane ends, on the field's edge. */
export const DEPOT_AT = new THREE.Vector3(-50000, 4000, -30000);

/** A body of the Ladder: a ball (or an ellipsoid) in `color`, faintly lit by `glow`, drawn behind everything. */
function body(at: THREE.Vector3, scale: THREE.Vector3, color: number, glow: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32).scale(scale.x, scale.y, scale.z), behindAll(new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, emissive: glow })));
  mesh.position.copy(at);
  mesh.userData.shadowless = true;
  return mesh;
}

/** Haumea's sky: the elongated body below the ring, its long axis across the sky, a red spot on it. */
export function haumea(): THREE.Group {
  const group = new THREE.Group().add(body(HAUMEA_AT, HAUMEA_AXES, 0xe8eef2, 0x101418));
  // the dark red spot, a patch of its face richer in minerals: a flattened disc laid on it towards the field
  const spot = new THREE.Mesh(new THREE.CircleGeometry(HAUMEA_AXES.y * 0.25, 32), behindAll(new THREE.MeshStandardMaterial({ color: 0x9a5a48, roughness: 1, metalness: 0 })));
  const toField = HAUMEA_AT.clone().negate().normalize();
  // the ellipsoid's surface along that way: 1 / sqrt(sum of (component / axis)²), a little over it
  const reach = 1 / Math.sqrt((toField.x / HAUMEA_AXES.x) * (toField.x / HAUMEA_AXES.x) + (toField.y / HAUMEA_AXES.y) * (toField.y / HAUMEA_AXES.y) + (toField.z / HAUMEA_AXES.z) * (toField.z / HAUMEA_AXES.z));
  spot.position.copy(HAUMEA_AT).addScaledVector(toField, reach * 1.01);
  spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toField);
  spot.userData.shadowless = true;
  return group.add(spot);
}

/** Eris's sky: the bright ball below the depot, Dysnomia beside it. */
export function eris(): THREE.Group {
  return new THREE.Group().add(body(ERIS_AT, new THREE.Vector3(ERIS_SIZE, ERIS_SIZE, ERIS_SIZE), 0xf6f6f4, 0x16181a), body(DYSNOMIA_AT, new THREE.Vector3(DYSNOMIA_SIZE, DYSNOMIA_SIZE, DYSNOMIA_SIZE), 0x5a5652, 0x080808));
}

