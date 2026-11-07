import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUv, marbleSurface, signTexture, surfaced } from '../view/surfaces';
import { pixelTexture } from '../view/textures';
import { cos, sin } from '../detmath';
import { DOME_RADIUS, surfaceHeight } from './moon';
import { domeGlass, polishedGold } from './ballroom';

/**
 * The Ballroom's floor under its dome (docs/campaign/STORY.md, chapter 19), the scene in person
 * where the President meets the Host (see campaign/scenes): beautiful and new as only what he owns
 * is. A floor of white and black marble inlaid with gold out to the dome's foot, a round dais of
 * three steps in the middle, a red carpet up to it, a ring of gold columns with lamps on them, a
 * chandelier hanging over the dais, the Ballroom's name in orange neon behind it, and the dome's
 * gold-tinted glass over all of it, Earth showing through. Built in its own frame (the floor's
 * middle at the origin, y up, the dais's back towards -z) and set at the dome's middle in the
 * world, its floor over the Moon's ground under the dome.
 */

/** The plain at the dome's middle (units), where the dome's glass stands. */
const PLAIN = surfaceHeight(0, 0);
/** The floor over the plain (units): over the highest the ground gets under the dome (its hummocks), sampled every 20 m, and 0.5 m more. */
const FLOOR = (() => {
  let top = -Infinity;
  for (let x = -DOME_RADIUS; x <= DOME_RADIUS; x += 400) for (let z = -DOME_RADIUS; z <= DOME_RADIUS; z += 400) if (x * x + z * z <= DOME_RADIUS * DOME_RADIUS) top = Math.max(top, surfaceHeight(x, z));
  return top - PLAIN + 10;
})();
/** The marble's tile (units, 6 m: four slabs of 1.5 m a side). */
const MARBLE_TILE = 120;
/** The dais's three steps: their radii (units, 8, 6.5 and 5 m), each 0.25 m high. */
const STEPS = [160, 130, 100];
const STEP_HEIGHT = 5;
/** The dais's top over the floor (units). */
export const DAIS_TOP = STEPS.length * STEP_HEIGHT;
/** The carpet: from the dais's foot this far towards +z (units, 25 m), this wide (units, 3 m). */
const CARPET_LENGTH = 500;
const CARPET_WIDTH = 60;
/** The columns: COLUMNS of them in a ring round the dais (units, 40 m out), each 12 m high and 0.8 m thick, a lamp on its top. */
const COLUMNS = 10;
const COLUMN_RING = 800;
const COLUMN_HEIGHT = 240;
const COLUMN_RADIUS = 16;
/** The chandelier over the dais (units, 20 m up), its rings of crystals, and how bright and far its light reaches (units, 60 m). */
const CHANDELIER_UP = 400;
const CHANDELIER_LIGHT = 3;
const CHANDELIER_REACH = 1200;
/** The column lamps' light and reach (units, 30 m). */
const LAMP_LIGHT = 1.2;
const LAMP_REACH = 600;

/** Where the clone stands (units, in the hall's frame): on the carpet 1.5 m before the dais's lowest step; its eyes' height (units, 1.7 m). */
export const HALL_EYE_AT = new THREE.Vector3(0, 0, 190);
export const HALL_EYE = 34;
/** Where the people stand (units, in the hall's frame): the President on the dais's top step, at its front, Quill a step below him on the lowest, to his left. */
export const HALL_SPOTS = { dais: new THREE.Vector3(0, DAIS_TOP, 80), foot: new THREE.Vector3(60, STEP_HEIGHT, 132) } as const;

/** A shape built in the xy plane laid on the floor, facing up (a quarter turn about x, no trigonometry). */
const FLAT = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

/** The carpet's weave: deep red with a gold border along both edges, a fine nap. */
function carpetTexture(): THREE.Texture {
  const texture = pixelTexture(128, (x, y, rgb) => {
    const edge = Math.min(x, 127 - x);
    const nap = ((x * 7 + y * 13) % 5) / 40;
    const border = edge >= 6 && edge < 12;
    rgb[0] = border ? 0.85 : 0.42 + nap;
    rgb[1] = border ? 0.62 : 0.03 + nap / 3;
    rgb[2] = border ? 0.22 : 0.05 + nap / 3;
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** The hall, built once. */
let built: THREE.Group | null = null;

export function hall(): THREE.Group {
  if (built) return built;
  const root = new THREE.Group();
  const gold = polishedGold();
  const marble = new THREE.MeshStandardMaterial({ ...surfaced(marbleSurface(), 0.3), envMapIntensity: 1 });

  // the floor out to the dome's foot, and the dome's glass seen from under it
  root.add(new THREE.Mesh(boxUv(new THREE.CircleGeometry(DOME_RADIUS, 96).applyMatrix4(FLAT).translate(0, FLOOR, 0), MARBLE_TILE), marble));
  root.add(domeGlass(0, true));

  // the dais: three round steps of marble, each with a rim of gold
  const steps: THREE.BufferGeometry[] = [];
  const rims: THREE.BufferGeometry[] = [];
  STEPS.forEach((radius, k) => {
    steps.push(boxUv(new THREE.CylinderGeometry(radius, radius, STEP_HEIGHT, 64).translate(0, FLOOR + STEP_HEIGHT * (k + 0.5), 0).toNonIndexed(), MARBLE_TILE));
    rims.push(new THREE.TorusGeometry(radius, 0.8, 6, 64).applyMatrix4(FLAT).translate(0, FLOOR + STEP_HEIGHT * (k + 1), 0).toNonIndexed());
  });
  root.add(new THREE.Mesh(mergeGeometries(steps), marble));
  root.add(new THREE.Mesh(mergeGeometries(rims), gold));

  // the red carpet from the clone's spot up to the dais's foot
  const carpetMap = carpetTexture();
  carpetMap.repeat.set(1, CARPET_LENGTH / CARPET_WIDTH);
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(CARPET_WIDTH, 0.6, CARPET_LENGTH).translate(0, FLOOR + 0.3, STEPS[0] + CARPET_LENGTH / 2 - 20), new THREE.MeshStandardMaterial({ map: carpetMap, roughness: 0.95, metalness: 0 }));
  root.add(carpet);

  // the columns in their ring, a lamp burning on each
  const columns: THREE.BufferGeometry[] = [];
  const bulbs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < COLUMNS; i++) {
    const angle = ((i + 0.5) / COLUMNS) * Math.PI * 2;
    const x = sin(angle) * COLUMN_RING;
    const z = cos(angle) * COLUMN_RING;
    columns.push(new THREE.CylinderGeometry(COLUMN_RADIUS, COLUMN_RADIUS * 1.2, COLUMN_HEIGHT, 24).translate(x, FLOOR + COLUMN_HEIGHT / 2, z).toNonIndexed());
    columns.push(new THREE.CylinderGeometry(COLUMN_RADIUS * 1.6, COLUMN_RADIUS * 1.6, 8, 24).translate(x, FLOOR + 4, z).toNonIndexed());
    columns.push(new THREE.CylinderGeometry(COLUMN_RADIUS * 1.6, COLUMN_RADIUS, 10, 24).translate(x, FLOOR + COLUMN_HEIGHT + 5, z).toNonIndexed());
    bulbs.push(new THREE.SphereGeometry(10, 12, 8).translate(x, FLOOR + COLUMN_HEIGHT + 20, z).toNonIndexed());
    if (i % 2 === 0) {
      const lamp = new THREE.PointLight(0xffd9a0, LAMP_LIGHT, LAMP_REACH, 0);
      lamp.position.set(x, FLOOR + COLUMN_HEIGHT + 20, z);
      root.add(lamp);
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(columns), gold));
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.6).multiplyScalar(2.5), toneMapped: false });

  // the chandelier: a gold ring hung on its chain, three rings of crystals lit from within
  const chandelier: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.8, 0.8, 600, 6).translate(0, FLOOR + CHANDELIER_UP + 300, 0).toNonIndexed()];
  for (const [ring, drop] of [[80, 0], [56, -20], [30, -40]] as const) {
    chandelier.push(new THREE.TorusGeometry(ring, 2, 6, 48).applyMatrix4(FLAT).translate(0, FLOOR + CHANDELIER_UP + drop, 0).toNonIndexed());
    const count = Math.round(ring / 4);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      bulbs.push(new THREE.OctahedronGeometry(3.2).scale(1, 2.2, 1).translate(sin(angle) * ring, FLOOR + CHANDELIER_UP + drop - 8, cos(angle) * ring).toNonIndexed());
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(chandelier), gold));
  root.add(new THREE.Mesh(mergeGeometries(bulbs.map((bulb) => bulb.deleteAttribute('uv'))), glow));
  const light = new THREE.PointLight(0xffe2b0, CHANDELIER_LIGHT, CHANDELIER_REACH, 0);
  light.position.set(0, FLOOR + CHANDELIER_UP - 30, 0);
  root.add(light);

  // the Ballroom's name in orange neon behind the dais, on a frame of gold
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(400, 100), new THREE.MeshBasicMaterial({ map: signTexture('THE BALLROOM', '#ff9d00'), toneMapped: false }));
  sign.position.set(0, FLOOR + 180, -260);
  root.add(sign);
  root.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(410, 6, 6).translate(0, FLOOR + 233, -262), new THREE.BoxGeometry(410, 6, 6).translate(0, FLOOR + 127, -262), new THREE.BoxGeometry(6, 180, 6).translate(-205, FLOOR + 90, -262), new THREE.BoxGeometry(6, 180, 6).translate(205, FLOOR + 90, -262)]), gold));

  root.position.set(0, PLAIN, 0);
  root.updateMatrixWorld(true);
  built = root;
  return root;
}

/** The hall's floor at its middle in the world. */
const HALL_FLOOR = new THREE.Vector3(0, PLAIN + FLOOR, 0);
/** A point of the hall (in its frame, on its floor) in the world. */
export const inHall = (local: THREE.Vector3, out = new THREE.Vector3()) => out.copy(local).add(HALL_FLOOR);
