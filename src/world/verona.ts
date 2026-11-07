import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { behindAll, moonBeyond } from './horizon';
import { Noise } from './noise';
import { GROUND_HALF, groundRelief, MOUTH, offFace, surfaceHeight, URANUS_AT, URANUS_SIZE } from './miranda';

/**
 * How Verona on Miranda looks (where things are in world/miranda): the ground of the field as the
 * piece it collides as (its relief on a grid of GROUND_CELL, fine enough for the face), the crater
 * floor's photograph tinted to Miranda's grey ice; the hideout's mouth in the face, a dark hangar
 * door in a frame of the Loose's lamps; the moon beyond, its patchwork of bright and dark
 * terrains; and Uranus in the sky, a pale cyan ball lying on its side, its dark rings seen almost
 * from their edge.
 */

/** Miranda's ice: grey, lit faintly by Uranus's glow. */
const MIRANDA_TINT = 0xdcdfe2;
const MIRANDA_GLOW = 0x1a1d20;
/** The ground's grid (units, 25 m): fine enough that the face stands as steep as it collides. */
const GROUND_CELL = 500;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/miranda gives (see reliefGround). */
export const mirandaGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, MIRANDA_TINT, MIRANDA_GLOW, GROUND_CELL);

/** The hideout's mouth: a dark door MOUTH_WIDE by MOUTH_HIGH (units, 90 by 35 m) in the face, its frame of lamps (LAMP_SIZE, 2 m) in the Loose's amber. */
const MOUTH_WIDE = 1800;
const MOUTH_HIGH = 700;
const LAMP_SIZE = 40;
const LAMP = new THREE.Color(1, 0.62, 0.2).multiplyScalar(2.5);
/** How far the door stands out of the face (units, 15 m): over its boulders. */
const MOUTH_OUT = 300;

/** The hideout's mouth in the face, facing south out of it. */
export function hideout(): THREE.Group {
  const group = new THREE.Group();
  const door = new THREE.Mesh(new THREE.PlaneGeometry(MOUTH_WIDE, MOUTH_HIGH), new THREE.MeshBasicMaterial({ color: 0x050607 }));
  group.add(door);
  // lamps along the frame, a few out
  const lamp = new THREE.MeshBasicMaterial({ color: LAMP, toneMapped: false });
  const geometry = new THREE.SphereGeometry(LAMP_SIZE, 6, 4);
  for (let i = 0; i <= 12; i++) {
    if (i % 5 === 3) continue;
    const x = -MOUTH_WIDE / 2 + (i / 12) * MOUTH_WIDE;
    for (const y of [-MOUTH_HIGH / 2 - LAMP_SIZE * 2, MOUTH_HIGH / 2 + LAMP_SIZE * 2]) {
      const light = new THREE.Mesh(geometry, lamp);
      light.position.set(x, y, LAMP_SIZE);
      group.add(light);
    }
  }
  for (let i = 0; i <= 4; i++) {
    for (const x of [-MOUTH_WIDE / 2 - LAMP_SIZE * 2, MOUTH_WIDE / 2 + LAMP_SIZE * 2]) {
      const light = new THREE.Mesh(geometry, lamp);
      light.position.set(x, -MOUTH_HIGH / 2 + (i / 4) * MOUTH_HIGH, LAMP_SIZE);
      group.add(light);
    }
  }
  // set into the face: a little out of it, facing south
  group.position.set(MOUTH.x, MOUTH.y, MOUTH.z + MOUTH_OUT);
  return group;
}

/** Miranda's patchwork beyond the field: grey ice in bright and dark terrains, the cliff's face darker. */
const BRIGHT = new THREE.Color(0.34, 0.35, 0.36);
const DARK = new THREE.Color(0.12, 0.12, 0.13);
const patches = new Noise(13008);

/** Uranus: its pale cyan, darker towards its limb, and its rings, faint and dark, nearly edge on (Miranda orbits close to their plane). */
const URANUS_COLOR = 0x9fd7df;
const RING_TILT = 0.075;
const RING_INNER = 1.6;
const RING_OUTER = 2.0;

/** Uranus in Miranda's sky: the ball and its faint rings, drawn behind everything that flies. */
function uranus(): THREE.Group {
  const planet = new THREE.Mesh(new THREE.SphereGeometry(URANUS_SIZE, 64, 32), behindAll(new THREE.MeshStandardMaterial({ color: URANUS_COLOR, roughness: 1, metalness: 0, emissive: 0x0b1416 })));
  planet.position.copy(URANUS_AT);
  planet.userData.shadowless = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(URANUS_SIZE * RING_INNER, URANUS_SIZE * RING_OUTER, 128, 1), behindAll(new THREE.MeshBasicMaterial({ color: 0x2a2c30, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
  // the rings' plane holds the line of sight but for a tilt (Miranda orbits close to it), and stands upright: Uranus lies on its side
  const sight = URANUS_AT.clone().normalize();
  const normal = new THREE.Vector3(0, 1, 0).cross(sight).normalize().addScaledVector(sight, RING_TILT).normalize();
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  ring.position.copy(URANUS_AT);
  ring.userData.shadowless = true;
  return new THREE.Group().add(planet, ring);
}

/** The moon beyond the field's ground, from 3.4 km out to its horizon some 20 km away, drawn behind everything; the hideout's mouth; Uranus in the sky. */
export function miranda(): THREE.Group {
  const paint = (x: number, z: number, color: THREE.Color) => {
    color.copy(DARK).lerp(BRIGHT, THREE.MathUtils.smoothstep(patches.fractal(x / 60000, 0.3, z / 60000, 3), -0.15, 0.15));
    // the face itself, where it drops: a shade darker
    if (Math.abs(offFace(x, z)) < 5000) color.multiplyScalar(0.7);
  };
  return moonBeyond(GROUND_HALF.x, 20 * 20000, surfaceHeight, paint, MIRANDA_GLOW).add(hideout(), uranus());
}
