import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import { macroUv, patchedPlating, PLATING_TILE } from './boneyard';
import { boxUv, industrialSurface, signTexture, surfaced } from '../view/surfaces';
import { shelf } from './shelf';

/**
 * The galley of Patience (docs/campaign/STORY.md, section 7): a cramped room in her ring habitat
 * where the crew eats, the second scene in person (see campaign/scenes). A box of patched plating,
 * the long table bolted to the floor with its benches, the galley's counter with a hot plate and
 * dented pots, lockers, pipes and a cable tray under the ceiling, a lamp over the table, and a
 * round porthole looking out on Vesta below, where Patience holds over the claims. Everything worn
 * and mended; only the lamp, the hot plate's glow, a screen and the crew's hand-painted sign are
 * light. Built in its own frame (the floor's middle at the origin, y up, the porthole towards -x)
 * and set at GALLEY in the world.
 */

/** Where the galley hangs in Rheasilvia (units): Patience holding 2 km over the claims. */
export const GALLEY = new THREE.Vector3(0, 40000, 0);
/** The room's inner half extents (units: 9 m long, 6 m wide, 2.6 m high). */
const HALF = new THREE.Vector3(90, 26, 60);
/** Where the clone stands, by the door at the room's far end, and its eyes' height over the floor (units, 1.7 m). */
export const GALLEY_DOOR = new THREE.Vector3(60, 0, 0);
export const GALLEY_EYE = 34;
/** Where the people stand (units, in the galley's frame): Hedda at the head of the table, Pim at the counter. */
export const GALLEY_SPOTS = { head: new THREE.Vector3(-55, 0, 6), counter: new THREE.Vector3(-10, 0, 42) } as const;
/** The porthole's radius (units, 0.8 m), in the wall towards -x. */
const PORTHOLE = 16;
/** How bright the lamp over the table lights the room, and how far (units, 10 m). */
const LAMP_LIGHT = 2;
const LAMP_REACH = 200;
const GALLEY_SEED = 7350;

const plating = { key: 'galley', seed: GALLEY_SEED, tint: 0x9aa39a, texts: ['PATIENCE', 'GALLEY', 'NO SMOKING', 'RING 2', 'CREW ONLY'] } as const;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();

/** The galley, built once. */
let built: THREE.Group | null = null;

export function galley(): THREE.Group {
  if (built) return built;
  const r = new Randomizer(GALLEY_SEED);
  const root = new THREE.Group();
  const plated = (parts: THREE.BufferGeometry[]) => {
    const geometry = mergeGeometries(parts.map((part) => boxUv(part, PLATING_TILE / 4)));
    root.add(new THREE.Mesh(macroUv(geometry, r.range(0, 1), PLATING_TILE / 4), patchedPlating(plating.key, plating)));
  };
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(GALLEY_SEED), 0.6), color: 0x5f625f });
  const metal = (parts: THREE.BufferGeometry[]) => root.add(new THREE.Mesh(mergeGeometries(parts.map((part) => boxUv(part, 40))), steel));
  const light = (parts: THREE.BufferGeometry[], color: THREE.Color) => root.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ color, toneMapped: false })));
  const { x: hx, y: hy, z: hz } = HALF;
  const wall = 4;

  // the room: floor, ceiling, the long walls, the door's wall; the porthole's wall in four pieces round its hole
  plated([
    box(hx * 2, wall, hz * 2, 0, -wall / 2, 0),
    box(hx * 2, wall, hz * 2, 0, hy * 2 + wall / 2, 0),
    box(hx * 2, hy * 2, wall, 0, hy, -hz - wall / 2),
    box(hx * 2, hy * 2, wall, 0, hy, hz + wall / 2),
    box(wall, hy * 2, hz * 2, hx + wall / 2, hy, 0),
    box(wall, hy * 2, hz - PORTHOLE, -hx - wall / 2, hy, -(hz + PORTHOLE) / 2),
    box(wall, hy * 2, hz - PORTHOLE, -hx - wall / 2, hy, (hz + PORTHOLE) / 2),
    box(wall, hy - PORTHOLE, PORTHOLE * 2, -hx - wall / 2, (hy - PORTHOLE) / 2, 0),
    box(wall, hy - PORTHOLE, PORTHOLE * 2, -hx - wall / 2, hy * 2 - (hy - PORTHOLE) / 2, 0),
  ]);
  // the porthole's frame, bolted round its glass
  metal([box(3, 4, PORTHOLE * 2 + 8, -hx + 1, hy - PORTHOLE - 2, 0), box(3, 4, PORTHOLE * 2 + 8, -hx + 1, hy + PORTHOLE + 2, 0), box(3, PORTHOLE * 2, 4, -hx + 1, hy, -PORTHOLE - 2), box(3, PORTHOLE * 2, 4, -hx + 1, hy, PORTHOLE + 2)]);

  // the long table bolted to the floor, a bench either side
  metal([box(110, 1.5, 22, -20, 15, 0), box(4, 14, 4, -70, 7, 0), box(4, 14, 4, 30, 7, 0)]);
  metal([box(100, 1.5, 9, -20, 9, -20), box(100, 1.5, 9, -20, 9, 20), box(2, 9, 2, -65, 4.5, -20), box(2, 9, 2, 25, 4.5, -20), box(2, 9, 2, -65, 4.5, 20), box(2, 9, 2, 25, 4.5, 20)]);
  // mugs and a dented pot on the table
  metal([new THREE.CylinderGeometry(1.4, 1.2, 3, 8).translate(-40, 17.2, 4).toNonIndexed(), new THREE.CylinderGeometry(1.4, 1.2, 3, 8).translate(-12, 17.2, -5).toNonIndexed(), new THREE.CylinderGeometry(5, 4.5, 6, 12).translate(-25, 18.7, 2).toNonIndexed()]);
  // the counter along the wall: cupboards, its top, the hot plate glowing, pots on the shelf above
  metal([box(90, 18, 14, -20, 9, hz - 7), box(92, 1.5, 15, -20, 18.7, hz - 7.5), box(90, 1.2, 8, -20, 34, hz - 4)]);
  for (let k = 0; k < 4; k++) metal([new THREE.CylinderGeometry(3.4, 3, 5, 10).translate(-50 + k * 18, 37.2, hz - 4).toNonIndexed()]);
  light([box(12, 0.4, 10, -2, 19.6, hz - 8)], new THREE.Color(1, 0.3, 0.08).multiplyScalar(1.6));
  // lockers on the other long wall, one door hanging open
  const lockers: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) lockers.push(box(12, 42, 10, -55 + k * 13, 21, -hz + 5));
  lockers.push(box(1, 38, 11, -55 + 4 * 13 + 6.5, 21, -hz + 15));
  metal(lockers);
  // pipes and a cable tray under the ceiling, the length of the room
  metal([new THREE.CylinderGeometry(1.6, 1.6, hx * 2, 10).applyMatrix4(ALONG_X).translate(0, hy * 2 - 3, -hz + 10).toNonIndexed(), new THREE.CylinderGeometry(1, 1, hx * 2, 8).applyMatrix4(ALONG_X).translate(0, hy * 2 - 3, -hz + 16).toNonIndexed(), box(hx * 2, 1, 10, 0, hy * 2 - 6, hz - 14)]);
  // a screen by the door with the ring's watch rota
  light([box(0.4, 10, 16, hx - 1, 30, -30)], new THREE.Color(0.35, 0.75, 0.6));
  // a lamp over the table on its short cable, and its warm light
  metal([box(0.6, 12, 0.6, -20, hy * 2 - 6, 0), new THREE.ConeGeometry(7, 5, 12, 1, true).translate(-20, hy * 2 - 13, 0).toNonIndexed()]);
  light([new THREE.SphereGeometry(2.4, 10, 6).translate(-20, hy * 2 - 15, 0)], new THREE.Color(1, 0.85, 0.6).multiplyScalar(3));
  const lamp = new THREE.PointLight(0xffd9a8, LAMP_LIGHT, LAMP_REACH, 0);
  lamp.position.set(-20, hy * 2 - 16, 0);
  root.add(lamp);
  // the crew's sign over the counter, painted by hand
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), new THREE.MeshBasicMaterial({ map: signTexture('EAT · SLEEP · HAUL', '#4d91ff'), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  sign.applyMatrix4(FACING_IN);
  sign.position.set(-20, hy * 2 - 10, hz - 1);
  root.add(sign);
  // the shelf of mementos and the rail of tags beside the porthole (see world/shelf)
  root.add(shelf());

  root.position.copy(GALLEY);
  root.updateMatrixWorld(true);
  built = root;
  return root;
}

/** A cylinder built along y laid along x (a quarter turn about z, no trigonometry). */
const ALONG_X = new THREE.Matrix4().set(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
/** A plane facing +z turned to face -z, into the room from the wall at +z (a half turn about y). */
const FACING_IN = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);

/** A point of the galley (in its frame, on its floor) in the world. */
export const inGalley = (local: THREE.Vector3, out = new THREE.Vector3()) => out.copy(local).add(GALLEY);
