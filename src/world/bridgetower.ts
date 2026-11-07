import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Randomizer } from '../random';
import type { HullBox } from './boxes';
import { macroUv, patchedPlating, PLATING_TILE } from './boneyard';
import { boxUv } from '../view/surfaces';

/**
 * The PAAA 01's bridge tower (docs/campaign/STORY.md, chapter 14, The Memorial): torn off the
 * bow when the world ship broke, drifting in the gap before the bow's torn end. A tall shaft of
 * the world ship's plating, DECKS rooms high, its bottom open where it tore, each deck's floor
 * with a hatch to the one above (the hatches on alternate sides, so a ship climbing it weaves),
 * the bridge on top, where the log is kept. Dim red emergency lamps on every deck, the log's
 * console still glowing up there. Built in its own frame (the shaft's open bottom at its middle
 * at the origin, y up), solid as boxes (see world/boxes), set out by a mission as a hull of the
 * convoy (see Markers.iceTugAt).
 */

/** The shaft's half width inside (units, 70 m), a deck's height (units, 80 m), and the decks. */
export const TOWER_HALF = 1400;
export const DECK_HEIGHT = 1600;
export const DECKS = 4;
/** A hatch's half width (units, 30 m a side), its middle this far off the shaft's axis along x, on alternate sides. */
export const HATCH_HALF = 600;
const HATCH_OFF = 700;
/** The plating's thickness (units, 2 m). */
const WALL = 40;

/** The hatches in the tower's frame, in the order a ship climbs them: each deck's floor but the lowest, a hatch's middle on it. */
export const HATCHES: readonly THREE.Vector3[] = Array.from({ length: DECKS - 1 }, (_, k) => new THREE.Vector3(k % 2 ? -HATCH_OFF : HATCH_OFF, (k + 1) * DECK_HEIGHT, 0));
/** The log on the bridge, the top deck's middle, in the tower's frame. */
export const LOG = new THREE.Vector3(0, (DECKS - 0.5) * DECK_HEIGHT, 0);

const PAINT = { key: 'bridgetower', seed: 14030, tint: 0x8d9197, texts: ['PAAA 01', 'DECK', 'BRIDGE', 'NO ENTRY', 'UNITED EARTH'] } as const;

let built: { root: THREE.Group; boxes: readonly HullBox[] } | null = null;

/** The tower, built once: its meshes and the boxes it collides as. */
export function bridgeTower(): { root: THREE.Group; boxes: readonly HullBox[] } {
  if (built) return built;
  const r = new Randomizer(PAINT.seed);
  const root = new THREE.Group();
  const boxes: HullBox[] = [];
  const parts: THREE.BufferGeometry[] = [];
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => {
    boxes.push({ center: new THREE.Vector3(x, y, z), half: new THREE.Vector3(hx, hy, hz), turn: new THREE.Quaternion() });
    parts.push(boxUv(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2).translate(x, y, z).toNonIndexed(), PLATING_TILE));
  };
  const height = DECKS * DECK_HEIGHT;
  const outer = TOWER_HALF + WALL;
  // the four walls, full height, and the roof over the bridge
  box(-TOWER_HALF - WALL / 2, height / 2, 0, WALL / 2, height / 2, outer);
  box(TOWER_HALF + WALL / 2, height / 2, 0, WALL / 2, height / 2, outer);
  box(0, height / 2, -TOWER_HALF - WALL / 2, TOWER_HALF, height / 2, WALL / 2);
  box(0, height / 2, TOWER_HALF + WALL / 2, TOWER_HALF, height / 2, WALL / 2);
  box(0, height + WALL / 2, 0, outer, WALL / 2, outer);
  // each deck's floor round its hatch: the strips on either side of it along x, and before and behind it
  for (const hatch of HATCHES) {
    const y = hatch.y;
    const left = hatch.x - HATCH_HALF;
    const right = hatch.x + HATCH_HALF;
    box((-TOWER_HALF + left) / 2, y, 0, (left + TOWER_HALF) / 2, WALL / 2, TOWER_HALF);
    box((right + TOWER_HALF) / 2, y, 0, (TOWER_HALF - right) / 2, WALL / 2, TOWER_HALF);
    box(hatch.x, y, (-TOWER_HALF - HATCH_HALF) / 2, HATCH_HALF, WALL / 2, (TOWER_HALF - HATCH_HALF) / 2);
    box(hatch.x, y, (TOWER_HALF + HATCH_HALF) / 2, HATCH_HALF, WALL / 2, (TOWER_HALF - HATCH_HALF) / 2);
  }
  root.add(new THREE.Mesh(macroUv(mergeGeometries(parts), r.range(0, 1)), patchedPlating(PAINT.key, PAINT)));

  // dim red emergency lamps on every deck's walls, and the log's console glowing on the bridge
  const lamps: THREE.BufferGeometry[] = [];
  for (let deck = 0; deck < DECKS; deck++) {
    const y = deck * DECK_HEIGHT + DECK_HEIGHT * 0.8;
    for (const side of [-1, 1]) lamps.push(new THREE.BoxGeometry(12, 30, 60).translate(side * (TOWER_HALF - 8), y, r.range(-800, 800)).toNonIndexed());
  }
  root.add(new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.06).multiplyScalar(2.5), toneMapped: false })));
  // each hatch framed by the amber strip lights that still run on the emergency circuit, so it is found in the dark
  const strips: THREE.BufferGeometry[] = [];
  for (const hatch of HATCHES) {
    for (const side of [-1, 1]) {
      strips.push(new THREE.BoxGeometry(8, WALL + 4, HATCH_HALF * 2).translate(hatch.x + side * HATCH_HALF, hatch.y, hatch.z).toNonIndexed());
      strips.push(new THREE.BoxGeometry(HATCH_HALF * 2, WALL + 4, 8).translate(hatch.x, hatch.y, hatch.z + side * HATCH_HALF).toNonIndexed());
    }
  }
  root.add(new THREE.Mesh(mergeGeometries(strips), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.12).multiplyScalar(2), toneMapped: false })));
  const log = new THREE.Mesh(new THREE.BoxGeometry(160, 50, 60).translate(LOG.x, (DECKS - 1) * DECK_HEIGHT + 25 + WALL / 2, LOG.z - 400), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.57, 1).multiplyScalar(2), toneMapped: false }));
  root.add(log);
  for (let deck = 0; deck < DECKS; deck++) {
    const light = new THREE.PointLight(deck === DECKS - 1 ? 0x6f9fff : 0xff3a20, 1.2, DECK_HEIGHT * 1.5, 0);
    light.position.set(0, deck * DECK_HEIGHT + DECK_HEIGHT * 0.7, 0);
    root.add(light);
  }
  built = { root, boxes };
  return built;
}
