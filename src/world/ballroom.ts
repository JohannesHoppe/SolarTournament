import * as THREE from 'three';
import { reliefGround, withCollider } from './boneyard';
import { behindAll, moonBeyond } from './horizon';
import { Noise } from './noise';
import { pixelTexture } from '../view/textures';
import { lacquer, shine } from '../view/surfaces';
import { rotateY } from '../detthree';
import { cos, sin } from '../detmath';
import { DOME_HEIGHT, DOME_RADIUS, EARTH_AT, EARTH_SIZE, GROUND_HALF, groundRelief, surfaceHeight } from './moon';

/**
 * How the Ballroom on the Moon looks (where things are in world/moon): the ground of the field as
 * the piece it collides as (its relief, see Relief), the crater floor's photograph, the Moon's own
 * grey; the Ballroom, beautiful and new as only what the President owns is: a dome of gold-tinted
 * glass on ribs of polished gold, warm light inside, a ring of lamps round its foot; the plain
 * beyond, drawn behind everything; and Earth in the sky, blue and white.
 */

/** The Moon's regolith: grey, lit by earthshine. */
const MOON_TINT = 0xd6d4d0;
const MOON_GLOW = 0x1e1e20;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/moon gives (see reliefGround). */
export const moonGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, MOON_TINT, MOON_GLOW);

/** The dome's ribs: RIBS of them over it, and its lamps round its foot. */
const RIBS = 16;
const LAMPS = 48;

/** The President's polished gold (the dome's ribs and band, the dais's rims, the hall's columns), mirroring what shines. */
export const polishedGold = () => lacquer(new THREE.MeshPhysicalMaterial({ color: 0xe2aa3e, metalness: 1, roughness: 0.28, envMap: shine(), envMapIntensity: 2.6, clearcoat: 0.5, clearcoatRoughness: 0.2 }));

/** The dome's glass, a half sphere squashed to the dome's height with its foot at `floor`, gold-tinted; `inside` the face seen from under it (the hall, see world/hall). */
export function domeGlass(floor: number, inside = false): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2).scale(DOME_RADIUS, DOME_HEIGHT, DOME_RADIUS).translate(0, floor, 0),
    lacquer(new THREE.MeshPhysicalMaterial({ color: 0xe8c890, emissive: 0x6a4010, metalness: 0.2, roughness: 0.08, transparent: true, opacity: inside ? 0.3 : 0.55, envMap: shine(), envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.04, side: inside ? THREE.BackSide : THREE.FrontSide, depthWrite: !inside })),
  );
}

/** The Ballroom in its box's frame (`half` its half extents, the box's bottom on the plain): the dome, its ribs, its lamps. */
export function ballroom(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const floor = -half.y;
  // the glass: gold-tinted, the warm light of the ball inside showing through
  group.add(domeGlass(floor));
  // the ribs: polished gold arcs from the foot to the crown
  const gold = polishedGold();
  for (let i = 0; i < RIBS; i++) {
    // a half ring standing in its xy plane, from the foot over the crown to the foot, turned about the axis
    const rib = rotateY(new THREE.TorusGeometry(1, 0.012, 6, 48, Math.PI).scale(DOME_RADIUS, DOME_HEIGHT, DOME_RADIUS), (i / RIBS) * Math.PI);
    group.add(new THREE.Mesh(rib.translate(0, floor, 0), gold));
  }
  // the foot: a band of gold, and lamps round it
  const band = new THREE.Mesh(new THREE.CylinderGeometry(DOME_RADIUS * 1.01, DOME_RADIUS * 1.03, 160, 64, 1, true).translate(0, floor + 80, 0), gold);
  group.add(band);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.55).multiplyScalar(2.5), toneMapped: false });
  const bulb = new THREE.SphereGeometry(40, 8, 6);
  for (let i = 0; i < LAMPS; i++) {
    const angle = (i / LAMPS) * Math.PI * 2;
    const light = new THREE.Mesh(bulb, lamp);
    light.position.set(cos(angle) * DOME_RADIUS * 1.05, floor + 200, sin(angle) * DOME_RADIUS * 1.05);
    group.add(light);
  }
  return withCollider(group, half);
}

/** Earth's face as a texture: oceans, land in green and brown, clouds over both (from noise, a sky's few pixels across). */
function earthTexture(): THREE.CanvasTexture {
  const land = new Noise(19008);
  const clouds = new Noise(19009);
  return pixelTexture(256, (x, y, rgb) => {
    const ground = land.fractal(x / 40, 0.3, y / 40, 4);
    const cloud = Math.max(0, clouds.fractal(x / 24, 0.7, y / 24, 4) - 0.1) * 2.2;
    const base = ground > 0.12 ? [0.32, 0.36, 0.2] : [0.06, 0.16, 0.38];
    for (let k = 0; k < 3; k++) rgb[k] = base[k] + (1 - base[k]) * Math.min(1, cloud);
  });
}

/** The plain beyond the field's ground, out to its horizon some 20 km away, and Earth over it, drawn behind everything. */
export function moon(): THREE.Group {
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_SIZE, 64, 32), behindAll(new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.9, metalness: 0, emissive: 0x0a1426 })));
  earth.position.copy(EARTH_AT);
  earth.userData.shadowless = true;
  return moonBeyond(GROUND_HALF.x, 20 * 20000, surfaceHeight, (_, __, color) => color.setRGB(0.3, 0.3, 0.3), MOON_GLOW).add(earth);
}
