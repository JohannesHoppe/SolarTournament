import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxContact } from './boxes';
import { industrialSurface, shine, signTexture, surfaced } from '../view/surfaces';
import { sponsorSigns } from '../game/satire-ads';

/**
 * A ring of the tournament as a structure in space: an electromagnetic coil built like the
 * rest of the world, from flat armored blocks. SEGMENTS coil housings around the opening,
 * with gaps between them bridged by cable conduits; on their inner faces the windings glow
 * (their color tells what the ring is to the pilot); four struts reach out to blinking
 * position lights, and on top sits a small station module with a sponsor's plate.
 *
 * Everything lies outside the opening (`radius`), so the rules of a ring stay those of its
 * radius alone. All of it is solid but the lights and the windings' glow (see touchRing): flying
 * through the opening is the point; flying into the coil, a strut, the module or its plate is a
 * crash like one into rock.
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
/** The seed of the rings' plating (see industrialSurface). */
const GATE_SEED = 2584;

const matrix = new THREE.Matrix4();
const offset = new THREE.Vector3();
const outward = new THREE.Vector3();

/** A block of a ring: `width` along the ring, `height` outward, `depth` along its axis, its center `out` from the ring's center at `angle` around the axis and `along` it. */
interface Part {
  width: number;
  height: number;
  depth: number;
  angle: number;
  out: number;
  along: number;
}

/** The station module on top (two blocks) of a ring whose housings start at `inner`. */
function moduleParts(inner: number): Part[] {
  const top = Math.PI / 2;
  return [
    { width: 700, height: 260, depth: 300, angle: top, out: inner + THICKNESS + 130, along: 0 },
    { width: 260, height: 180, depth: 220, angle: top, out: inner + THICKNESS + 350, along: 0 },
  ];
}

/** The module's sponsor plates, facing along the axis both ways. */
function plateParts(inner: number): Part[] {
  const top = Math.PI / 2;
  return [-1, 1].map((side) => ({ width: 560, height: 140, depth: 8, angle: top, out: inner + THICKNESS + 140, along: side * 154 }));
}

/** The four struts between housings, out to the position lights, each with the cap the light sits on. */
function strutParts(inner: number): Part[] {
  const step = (Math.PI * 2) / SEGMENTS;
  const parts: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i + 0.5) * (Math.PI / 2) + step / 2;
    parts.push({ width: 60, height: STRUT, depth: 60, angle, out: inner + THICKNESS + STRUT / 2, along: 0 });
    parts.push({ width: 140, height: 100, depth: 140, angle, out: inner + THICKNESS + STRUT, along: 0 });
  }
  return parts;
}

/** A solid part as collisions see it: its center in the ring's frame, half its extents, and its turn about the axis (and back). */
type SolidPart = { center: THREE.Vector3; half: THREE.Vector3; turn: THREE.Quaternion; back: THREE.Quaternion };
/** The solid parts beyond the band of a ring of each opening radius, built once. */
const solids = new Map<number, { parts: SolidPart[]; reach: number }>();

function solidParts(radius: number) {
  let kit = solids.get(radius);
  if (!kit) {
    const inner = radius + CLEARANCE;
    const parts = [...moduleParts(inner), ...plateParts(inner), ...strutParts(inner)].map((part) => {
      const turn = new THREE.Quaternion().setFromAxisAngle(axis, part.angle - Math.PI / 2);
      return {
        center: new THREE.Vector3(Math.cos(part.angle) * part.out, Math.sin(part.angle) * part.out, part.along),
        half: new THREE.Vector3(part.width / 2, part.height / 2, part.depth / 2),
        turn,
        back: turn.clone().invert(),
      };
    });
    // nothing of it lies farther from the ring's center than this
    const reach = Math.max(...parts.map((part) => part.center.length() + part.half.length()));
    kit = { parts, reach };
    solids.set(radius, kit);
  }
  return kit;
}

const ringTurn = new THREE.Quaternion();
const inRing = new THREE.Vector3();
const inPart = new THREE.Vector3();
const partNormal = new THREE.Vector3();
const partClosest = new THREE.Vector3();

/**
 * Whether a ship (a sphere at `position` of `shipRadius`) touches a ring at `center`, facing
 * `facing` (unit length), its opening `radius`: its housings (see touchBand), its station module
 * with the sponsor's plates, or a strut. When it does, `position` moves out of it and `normal`
 * is the outward normal there; true.
 */
export function touchRing(center: THREE.Vector3, facing: THREE.Vector3, radius: number, position: THREE.Vector3, shipRadius: number, normal: THREE.Vector3): boolean {
  if (touchBand(center, facing, radius, position, shipRadius, normal)) return true;
  const { parts, reach } = solidParts(radius);
  inRing.subVectors(position, center);
  if (inRing.length() > reach + shipRadius) return false;
  // into the ring's own frame, as the kit builds it (see GateKit.build)
  ringTurn.setFromUnitVectors(axis, facing).invert();
  inRing.applyQuaternion(ringTurn);
  for (const part of parts) {
    inPart.subVectors(inRing, part.center).applyQuaternion(part.back);
    if (!boxContact(inPart, part.half, shipRadius, partNormal, partClosest)) continue;
    ringTurn.invert();
    normal.copy(partNormal).applyQuaternion(part.turn).applyQuaternion(ringTurn);
    position.copy(partClosest).applyQuaternion(part.turn).add(part.center).applyQuaternion(ringTurn).add(center).addScaledVector(normal, shipRadius);
    return true;
  }
  return false;
}

/**
 * Whether a ship touches the housings of a ring: they form a solid band from the opening's
 * edge outwards, THICKNESS thick and DEPTH deep (the conduits close its gaps). When it does,
 * `position` moves out of the band and `normal` is the band's outward normal there; true.
 */
function touchBand(center: THREE.Vector3, facing: THREE.Vector3, radius: number, position: THREE.Vector3, shipRadius: number, normal: THREE.Vector3): boolean {
  offset.subVectors(position, center);
  const along = offset.dot(facing);
  // far off the band's plane, or far from its circle: no touch (cheap test first)
  if (Math.abs(along) > DEPTH / 2 + shipRadius) return false;
  outward.copy(offset).addScaledVector(facing, -along);
  const out = outward.length();
  const inner = radius + CLEARANCE;
  const outer = inner + THICKNESS;
  if (out < inner - shipRadius || out > outer + shipRadius) return false;
  if (out > 1e-6) outward.divideScalar(out);
  else outward.set(1, 0, 0);
  // the nearest point of the band's cross section (out, along) to the ship
  let nearOut = THREE.MathUtils.clamp(out, inner, outer);
  let nearAlong = THREE.MathUtils.clamp(along, -DEPTH / 2, DEPTH / 2);
  let dOut = out - nearOut;
  let dAlong = along - nearAlong;
  const distance = Math.hypot(dOut, dAlong);
  if (distance >= shipRadius) return false;
  if (distance < 1e-6) {
    // the ship's center inside the band: out through the nearest face
    const toInner = out - inner;
    const toOuter = outer - out;
    const toFront = DEPTH / 2 - along;
    const toBack = along + DEPTH / 2;
    const least = Math.min(toInner, toOuter, toFront, toBack);
    dOut = dAlong = 0;
    if (least === toInner || least === toOuter) {
      dOut = least === toInner ? -1 : 1;
      nearOut = least === toInner ? inner : outer;
    } else {
      dAlong = least === toFront ? 1 : -1;
      nearAlong = dAlong * (DEPTH / 2);
    }
  } else {
    dOut /= distance;
    dAlong /= distance;
  }
  normal.copy(outward).multiplyScalar(dOut).addScaledVector(facing, dAlong).normalize();
  // onto the band's surface, one ship radius off
  position.copy(center).addScaledVector(outward, nearOut).addScaledVector(facing, nearAlong).addScaledVector(normal, shipRadius);
  return true;
}
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
  /**
   * Gray armor plating, riveted, grimy, with hazard stripes and stenciled coil numbers (see
   * industrialSurface), with a faint glow of its own (the coils' heat and the arena's light), so
   * its side away from the sun still shows.
   */
  private readonly metal = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(GATE_SEED), 1.5), color: 0x8a909c, flatShading: true, emissive: 0x141c2a, emissiveIntensity: 1, envMap: shine(), envMapIntensity: 0.6 });
  /** The sponsors' lit signs on the station modules, one sponsor a ring, in turn (see build). */
  private readonly signs = sponsorSigns().map(({ brand, color }) => new THREE.MeshBasicMaterial({ map: signTexture(brand, color), color: new THREE.Color(1, 1, 1).multiplyScalar(1.4), toneMapped: false }));
  private readonly lights = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08), toneMapped: false });
  private readonly coils: THREE.Material[] = [];
  private lit = true;
  /** Rings built so far, for whose sign comes next. */
  private built = 0;

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
    // four struts out to the position lights, and the station module on top with its sponsor's plates
    const solid = (part: Part) => block(part.width, part.height, part.depth, part.angle, part.out, part.along);
    for (const part of [...strutParts(inner), ...moduleParts(inner)]) frame.push(solid(part));
    for (let i = 0; i < 4; i++) lamps.push(block(70, 70, 70, (i + 0.5) * (Math.PI / 2) + step / 2, inner + THICKNESS + STRUT + 85));
    const plate = plateParts(inner).map(solid);
    lamps.push(block(50, 50, 50, Math.PI / 2, inner + THICKNESS + 470));
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

  /**
   * A ring at a point, its opening facing along `normal`, its windings glowing in `coil`; the
   * windings' mesh changes material with the ring's state. Each ring built carries the next
   * sponsor's sign.
   */
  build(position: THREE.Vector3, normal: THREE.Vector3, coil: THREE.Material): { root: THREE.Group; coil: THREE.Mesh } {
    const root = new THREE.Group();
    const windings = new THREE.Mesh(this.coil, coil);
    const sign = this.signs[this.built++ % this.signs.length];
    root.add(new THREE.Mesh(this.frame, this.metal), windings, new THREE.Mesh(this.lamps, this.lights), new THREE.Mesh(this.plate, sign));
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
    for (const material of [this.metal, this.lights, ...this.signs, ...this.coils]) material.dispose();
    for (const sign of this.signs) sign.map?.dispose();
  }
}
