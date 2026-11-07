import * as THREE from 'three';
import { reliefGround } from './boneyard';
import { behindAll, moonBeyond } from './horizon';
import { Noise } from './noise';
import { Randomizer } from '../random';
import { listeningPost } from './valhalla';
import { shine, solarWing, WING_CELLS_ACROSS, WING_CELLS_ALONG, WING_FRONT } from '../view/surfaces';
import { SUN_DIRECTION } from './space';
import { cos, sin } from '../detmath';
import { GROUND_HALF, groundRelief, surfaceHeight } from './mercury';

/**
 * How Caloris on Mercury looks (where things are in world/mercury): the ground of the field as the
 * piece it collides as (its relief, see Relief), the crater floor's photograph tinted to the
 * basin's warm grey; the sun miners' camp, the listening post's build in the miners' sun-bleached
 * paint; the plain beyond, drawn behind everything, and on it the miners' fields of solar panels,
 * row on row, turned to the low sun.
 */

/** Caloris's plains: a warm grey, darker than the Moon's, lit faintly by the glare off the plain. */
const MERCURY_TINT = 0xb4a898;
const MERCURY_GLOW = 0x1c1a17;

/** The ground of the field in its box's frame (`half` its half extents), on the relief world/mercury gives (see reliefGround). */
export const mercuryGround = (half: THREE.Vector3): THREE.Group => reliefGround(half, groundRelief, MERCURY_TINT, MERCURY_GLOW);

/** The sun miners' camp: the listening post's build (see world/valhalla) in their paint, bleached by a sun seven times as strong as at Earth. */
const CAMP_PAINT = { key: 'sun-miners', seed: 20101, tint: 0xd8cbb0, texts: ['CALORIS SUN MINERS', 'SHIFT 4', 'SHADE ONLY', 'MIND THE GLARE', 'NOON IS DEATH'] };
export const minersCamp = (half: THREE.Vector3): THREE.Group => listeningPost(half, CAMP_PAINT);

/**
 * The miners' solar fields on the plain beyond the field: FIELDS fields, each ROWS rows of
 * PANELS panels PANEL_LENGTH by PANEL_HEIGHT (units, 60 by 20 m) standing PANEL_LIFT over the
 * ground, every one turned square to the sun; from FIELDS_FROM to FIELDS_TO out (units, 5 to 14 km).
 */
const FIELDS = 9;
const ROWS = 5;
const PANELS = 12;
const PANEL_LENGTH = 1200;
const PANEL_HEIGHT = 400;
const PANEL_LIFT = 100;
const ROW_SPACING = 1400;
const FIELDS_FROM = 100000;
const FIELDS_TO = 280000;

/** The solar fields as one instanced mesh, drawn behind everything with the plain under them. */
function solarFields(): THREE.InstancedMesh {
  const panel = new THREE.PlaneGeometry(PANEL_LENGTH, PANEL_HEIGHT);
  // the wing's cells (see WING_FRONT), as many along and across as a panel this size holds
  const uv = panel.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (PANEL_LENGTH / PANEL_HEIGHT) * (WING_CELLS_ACROSS / WING_CELLS_ALONG), WING_FRONT[0] + uv.getY(i) * (WING_FRONT[1] - WING_FRONT[0]));
  const cells = solarWing();
  const material = behindAll(new THREE.MeshStandardMaterial({ map: cells.map, roughnessMap: cells.orm, metalnessMap: cells.orm, roughness: 1, metalness: 1, envMap: shine(), envMapIntensity: 0.6, side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(panel, material, FIELDS * ROWS * PANELS);
  const facing = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), SUN_DIRECTION);
  // a row runs square to the sun's bearing over the plain
  const along = new THREE.Vector3(-SUN_DIRECTION.z, 0, SUN_DIRECTION.x).normalize();
  const back = new THREE.Vector3(SUN_DIRECTION.x, 0, SUN_DIRECTION.z).normalize();
  const r = new Randomizer(20102);
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  let k = 0;
  for (let field = 0; field < FIELDS; field++) {
    const bearing = (field / FIELDS) * Math.PI * 2 + r.range(-0.25, 0.25);
    const out = r.range(FIELDS_FROM, FIELDS_TO);
    const cx = cos(bearing) * out;
    const cz = sin(bearing) * out;
    for (let row = 0; row < ROWS; row++) {
      for (let p = 0; p < PANELS; p++) {
        at.set(cx, 0, cz).addScaledVector(along, (p - PANELS / 2) * PANEL_LENGTH * 1.05).addScaledVector(back, (row - ROWS / 2) * ROW_SPACING);
        at.y = surfaceHeight(at.x, at.z) + PANEL_LIFT + PANEL_HEIGHT / 2;
        mesh.setMatrixAt(k++, matrix.compose(at, facing, scale));
      }
    }
  }
  mesh.userData.shadowless = true;
  return mesh;
}

/** Caloris beyond the field: the warm grey plain, darker patches of the planet's low-reflectance crust in it. */
const PLAIN = new THREE.Color(0.3, 0.28, 0.25);
const DARK = new THREE.Color(0.14, 0.13, 0.13);
const patches = new Noise(20103);

/** The plain beyond the field's ground, out to its horizon some 25 km away, and the miners' solar fields on it, drawn behind everything. */
export function caloris(): THREE.Group {
  const paint = (x: number, z: number, color: THREE.Color) => color.copy(PLAIN).lerp(DARK, THREE.MathUtils.smoothstep(patches.fractal(x / 120000, 0.2, z / 120000, 3), 0.1, 0.45));
  return moonBeyond(GROUND_HALF.x, 25 * 20000, surfaceHeight, paint, MERCURY_GLOW).add(solarFields());
}
