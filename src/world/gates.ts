import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A ring of the tournament as a structure in space: an electromagnetic coil built like the
 * rest of the world, from flat armored blocks. SEGMENTS coil housings around the opening,
 * with gaps between them bridged by cable conduits; on their inner faces the windings glow
 * (their color tells what the ring is to the pilot); four struts reach out to blinking
 * position lights, and on top sits a small station module with a sponsor's plate.
 *
 * Everything lies outside the opening (`radius`), so the rules of a ring stay those of its
 * radius alone; the structure is scenery and nothing collides with it.
 */
const SEGMENTS = 10;
/** Share of each segment's arc that is housing; the rest is the gap a conduit bridges. */
const HOUSING = 0.72;
/** The housing's radial thickness and depth along the ring's axis, and how far the opening stays clear of it (units: 10 m, 18 m, 1 m). */
const THICKNESS = 200;
const DEPTH = 360;
const CLEARANCE = 20;
/** The windings: strips on a housing's inner face, WINDINGS of them across its depth (units, 1.5 m wide). */
const WINDINGS = 3;
const WINDING = 30;
/** The lit rim of the windings on each face of a housing (units, 3 m high). */
const RIM = 60;
/** The struts reach this far out beyond the housings (units, 25 m) to the position lights. */
const STRUT = 500;
/** The position lights blink once every BLINK seconds, lit for BLINK_ON of it. */
const BLINK = 1.2;
const BLINK_ON = 0.18;

const matrix = new THREE.Matrix4();
const rotation = new THREE.Quaternion();
const place = new THREE.Vector3();
const size = new THREE.Vector3();
const axis = new THREE.Vector3(0, 0, 1);

/**
 * A box of `width` (along the ring), `height` (outward) and `depth` (along the axis), its center
 * `out` units from the ring's center at `angle` and `along` units along the axis.
 */
function block(width: number, height: number, depth: number, angle: number, out: number, along = 0): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(width, height, depth);
  rotation.setFromAxisAngle(axis, angle - Math.PI / 2);
  place.set(Math.cos(angle) * out, Math.sin(angle) * out, along);
  return box.applyMatrix4(matrix.compose(place, rotation, size.set(1, 1, 1)));
}

/** The geometries and materials every ring of one kind shares; each ring is a few meshes over them. */
export class GateKit {
  private readonly frame: THREE.BufferGeometry;
  private readonly coil: THREE.BufferGeometry;
  private readonly lamps: THREE.BufferGeometry;
  private readonly plate: THREE.BufferGeometry;
  /** Gray armor, with a faint glow of its own (the coils' heat and the arena's light), so its side away from the sun still shows. */
  private readonly metal = new THREE.MeshStandardMaterial({ color: 0x6a707c, metalness: 0.45, roughness: 0.55, flatShading: true, emissive: 0x141c2a, emissiveIntensity: 1 });
  private readonly sign = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(1.6), toneMapped: false });
  private readonly lights = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08), toneMapped: false });
  private readonly coils: THREE.Material[] = [];
  private lit = true;

  constructor(radius: number) {
    const frame: THREE.BufferGeometry[] = [];
    const coil: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    const inner = radius + CLEARANCE;
    const step = (Math.PI * 2) / SEGMENTS;
    const span = step * HOUSING;
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = i * step;
      // the housing, a narrower armor plate on its outside, and the windings on its inner face
      frame.push(block(2 * inner * Math.sin(span / 2), THICKNESS, DEPTH, angle, inner + THICKNESS / 2));
      frame.push(block(2 * inner * Math.sin(span / 2) * 0.8, THICKNESS * 0.35, DEPTH * 0.7, angle, inner + THICKNESS * 1.15));
      for (let w = 0; w < WINDINGS; w++) {
        const along = ((w + 0.5) / WINDINGS - 0.5) * DEPTH * 0.8;
        coil.push(block(2 * inner * Math.sin(span / 2) * 0.92, WINDING * 0.6, WINDING, angle, inner + WINDING * 0.3 - 4, along));
      }
      // the windings' ends show on both faces along the opening's rim, so the ring reads from ahead as a dashed circle of light
      for (const side of [-1, 1]) coil.push(block(2 * inner * Math.sin(span / 2) * 0.92, RIM, RIM / 2, angle, inner + RIM / 2, side * (DEPTH / 2 + RIM / 4)));
      // two conduits across the gap to the next housing
      const gap = angle + step / 2;
      for (const along of [-DEPTH * 0.3, DEPTH * 0.3]) frame.push(block(2 * (inner + THICKNESS * 0.6) * Math.sin(step / 2), 50, 50, gap, inner + THICKNESS * 0.6, along));
    }
    // four struts between housings, out to the position lights
    for (let i = 0; i < 4; i++) {
      const angle = (i + 0.5) * (Math.PI / 2) + step / 2;
      frame.push(block(60, STRUT, 60, angle, inner + THICKNESS + STRUT / 2));
      frame.push(block(140, 100, 140, angle, inner + THICKNESS + STRUT));
      lamps.push(block(70, 70, 70, angle, inner + THICKNESS + STRUT + 85));
    }
    // the station module on top, with its sponsor's plate facing along the axis both ways
    const top = Math.PI / 2;
    frame.push(block(700, 260, 300, top, inner + THICKNESS + 130));
    frame.push(block(260, 180, 220, top, inner + THICKNESS + 350));
    const plate = [block(560, 140, 8, top, inner + THICKNESS + 140, 154), block(560, 140, 8, top, inner + THICKNESS + 140, -154)];
    lamps.push(block(50, 50, 50, top, inner + THICKNESS + 470));
    this.frame = mergeGeometries(frame);
    this.coil = mergeGeometries(coil);
    this.lamps = mergeGeometries(lamps);
    this.plate = mergeGeometries(plate);
    for (const parts of [frame, coil, lamps, plate]) for (const part of parts) part.dispose();
  }

  /** A glow for the windings: a color, at a brightness (above 1 it blooms); `faint` lets the dark show through. */
  coilMaterial(color: THREE.ColorRepresentation, brightness: number, faint = false): THREE.Material {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(brightness), toneMapped: false, transparent: faint, opacity: faint ? 0.6 : 1 });
    this.coils.push(material);
    return material;
  }

  /** A ring at a point, its opening facing along `normal`, its windings glowing in `coil`; the windings' mesh changes material with the ring's state. */
  build(position: THREE.Vector3, normal: THREE.Vector3, coil: THREE.Material): { root: THREE.Group; coil: THREE.Mesh } {
    const root = new THREE.Group();
    const windings = new THREE.Mesh(this.coil, coil);
    root.add(new THREE.Mesh(this.frame, this.metal), windings, new THREE.Mesh(this.lamps, this.lights), new THREE.Mesh(this.plate, this.sign));
    root.position.copy(position);
    root.quaternion.setFromUnitVectors(axis, normal);
    return { root, coil: windings };
  }

  /** The position lights blink, all rings of the kit alike, on the clock (s). */
  blink(time: number) {
    const lit = time % BLINK < BLINK_ON;
    if (lit === this.lit) return;
    this.lit = lit;
    this.lights.color.setRGB(1, 0.12, 0.08).multiplyScalar(lit ? 3 : 0.25);
  }

  dispose() {
    for (const geometry of [this.frame, this.coil, this.lamps, this.plate]) geometry.dispose();
    for (const material of [this.metal, this.sign, this.lights, ...this.coils]) material.dispose();
  }
}
