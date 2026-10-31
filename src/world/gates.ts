import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxContact } from './boxes';
import { hazardSurface, industrialSurface, shine, signTexture, surfaced, windingSurface, WIRE_GLOW } from '../view/surfaces';
import { Randomizer } from '../random';
import { sponsorSigns } from '../game/satire-ads';

/**
 * A ring of the tournament as a structure in space: an electromagnetic coil built like the
 * rest of the world, from flat armored blocks. SEGMENTS coil housings around the opening,
 * with gaps between them bridged by cable conduits, each housing in a paint of its own, worn
 * hazard paint along the opening; on their inner faces the windings of copper wire glow (their
 * color tells what the ring is to the pilot); four struts reach out to blinking position
 * lights, and on top sits a small station module with a sponsor's plate.
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

/** The points a ring's solid parts are sampled by (see ringSamples), at most this far apart (units, 5 m). */
const SAMPLE_SPACING = 100;

/**
 * Points on the surface of a ring's solid parts in the world, as a flat list (xyz): around its
 * band, inside and outside, front and back, and over the faces of its housings' module, plates
 * and struts, none farther apart than SAMPLE_SPACING. What a piece of the field is held against:
 * a strut is thinner than the gaps between the points of a rock's outline.
 */
export function ringSamples(center: THREE.Vector3, facing: THREE.Vector3, radius: number): Float32Array {
  const list: number[] = [];
  const inner = radius + CLEARANCE;
  const turn = new THREE.Quaternion().setFromUnitVectors(axis, facing);
  const point = new THREE.Vector3();
  const add = () => {
    point.applyQuaternion(turn).add(center);
    list.push(point.x, point.y, point.z);
  };
  // the band: rings of points across its section, around the circle at its outer face's spacing
  const around = Math.ceil((Math.PI * 2 * (inner + THICKNESS)) / SAMPLE_SPACING);
  const across = Math.ceil(THICKNESS / SAMPLE_SPACING);
  const lengthwise = Math.ceil(DEPTH / SAMPLE_SPACING);
  for (let k = 0; k < around; k++) {
    const angle = (k / around) * Math.PI * 2;
    for (let i = 0; i <= across; i++) {
      const out = inner + (THICKNESS * i) / across;
      for (let j = 0; j <= lengthwise; j++) {
        point.set(Math.cos(angle) * out, Math.sin(angle) * out, -DEPTH / 2 + (DEPTH * j) / lengthwise);
        add();
      }
    }
  }
  const corner = new THREE.Vector3();
  for (const part of solidParts(radius).parts) {
    const counts = [part.half.x, part.half.y, part.half.z].map((half) => Math.ceil((half * 2) / SAMPLE_SPACING) + 1);
    for (let i = 0; i < counts[0]; i++) {
      for (let j = 0; j < counts[1]; j++) {
        for (let k = 0; k < counts[2]; k++) {
          // the faces only: one coordinate at its end
          if (i % (counts[0] - 1) && j % (counts[1] - 1) && k % (counts[2] - 1)) continue;
          corner.set(-1 + (2 * i) / (counts[0] - 1), -1 + (2 * j) / (counts[1] - 1), -1 + (2 * k) / (counts[2] - 1)).multiply(part.half);
          point.copy(corner).applyQuaternion(part.turn).add(part.center);
          add();
        }
      }
    }
  }
  return new Float32Array(list);
}

/** How far from a ring's center anything of it lies (units), for a ring of opening `radius`: its band and its solid parts, whichever reaches farther. */
export function ringReach(radius: number): number {
  return Math.max(solidParts(radius).reach, Math.hypot(radius + CLEARANCE + THICKNESS, DEPTH / 2));
}

/** How far from a ring's axis its housings begin and its struts end (units), for a ring of opening `radius`: what a ship steers clear of. */
export function ringRim(radius: number): { inner: number; outer: number } {
  return { inner: radius + CLEARANCE, outer: solidParts(radius).reach };
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
 * How a block's faces take their surface: one tile every `u` units along a face's first
 * direction and `v` along its second, shifted by `shift` tiles, and the paint's tint in its
 * vertex colors (see GateKit.metal).
 */
interface Skin {
  u: number;
  v: number;
  shift?: readonly [number, number];
  tint?: THREE.Color;
}

const white = new THREE.Color(1, 1, 1);

/**
 * A box of `width` (along the ring), `height` (outward) and `depth` (along the axis), its center
 * `out` units from the ring's center at `angle` and `along` units along the axis, its faces
 * tiled by `skin` at the same density whatever their size.
 */
function block(width: number, height: number, depth: number, angle: number, out: number, along = 0, skin: Skin = PLATING): THREE.BufferGeometry {
  return placed(skinned(new THREE.BoxGeometry(width, height, depth), [width, height, depth], skin), angle, out, along);
}

/** A part built along its own y axis (outward), moved to `out` from the ring's center at `angle` and `along` its axis. */
function placed(geometry: THREE.BufferGeometry, angle: number, out: number, along = 0): THREE.BufferGeometry {
  rotation.setFromAxisAngle(axis, angle - Math.PI / 2);
  place.set(Math.cos(angle) * out, Math.sin(angle) * out, along);
  return geometry.applyMatrix4(matrix.compose(place, rotation, size.set(1, 1, 1)));
}

/**
 * A box's texture coordinates scaled to its faces' sizes (BoxGeometry's faces in its order: ±x
 * spans depth and height, ±y width and depth, ±z width and height), and its tint as vertex colors.
 */
function skinned(box: THREE.BufferGeometry, [width, height, depth]: readonly number[], skin: Skin): THREE.BufferGeometry {
  const uv = box.attributes.uv;
  const spans = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  const [su, sv] = skin.shift ?? [0, 0];
  for (let i = 0; i < uv.count; i++) {
    const [du, dv] = spans[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * du) / skin.u + su, (uv.getY(i) * dv) / skin.v + sv);
  }
  return tinted(box, skin.tint ?? white);
}

/** A geometry painted in one tint through its vertex colors. */
function tinted(geometry: THREE.BufferGeometry, tint: THREE.Color): THREE.BufferGeometry {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The plating's tile (units, 19 m a side): its panels some 5 m, its rivets 60 cm apart. */
const PLATING_TILE = 384;
const PLATING: Skin = { u: PLATING_TILE, v: PLATING_TILE };
/** The windings' tile (see windingSurface): a clamp strap every 15 m along them, a turn every 50 cm across them. */
const WINDING_SKIN: Skin = { u: 300, v: 80 };
/** The hazard paint's band (see hazardSurface): HAZARD_BAND high (units, 2 m), its tile 8 pairs of stripes long, each pair as wide as the band is high. */
const HAZARD_BAND = 40;
const HAZARD_SKIN: Skin = { u: HAZARD_BAND * 8, v: HAZARD_BAND };
/**
 * The paint of the housings, plate by plate: the depots' gray-blue, darker gunmetal, a housing
 * patched with plates of a faded ochre primer or a washed-out azure, each a little lighter or
 * darker; multiplied with the plating's map.
 */
const PAINTS = [0x8a909c, 0x6f747d, 0x9a8f78, 0x7c8796, 0x858a90].map((hex) => new THREE.Color(hex));
const PAINT_SEED = 1984;

/** The lamps on the struts' ends (units): a housing of LAMP_HOUSING radius and LAMP_BASE high, a lens of LENS_RADIUS on it under a guard. */
const LAMP_HOUSING = 46;
const LAMP_BASE = 30;
const LENS_RADIUS = 34;

/**
 * A position light standing on a surface `out` from the ring's center at `angle`, `scale` times
 * the struts' size: a squat housing with a bezel around a domed red lens (into `lens`), and a
 * guard of two crossed bars arching over it (into `frame`).
 */
function lamp(frame: THREE.BufferGeometry[], lens: THREE.BufferGeometry[], angle: number, out: number, scale: number) {
  const [housing, base, glass] = [LAMP_HOUSING * scale, LAMP_BASE * scale, LENS_RADIUS * scale];
  const dark = PAINTS[1].clone().multiplyScalar(0.6);
  frame.push(placed(tinted(new THREE.CylinderGeometry(housing * 0.9, housing, base, 10).translate(0, base / 2, 0), dark), angle, out));
  frame.push(placed(tinted(new THREE.TorusGeometry(glass + 4 * scale, 5 * scale, 4, 12).rotateX(Math.PI / 2).translate(0, base, 0), dark), angle, out));
  for (const turn of [0, Math.PI / 2]) {
    const bar = new THREE.BoxGeometry(2 * glass + 14 * scale, 6 * scale, 6 * scale).translate(0, base + glass + 3 * scale, 0).rotateY(turn);
    frame.push(placed(tinted(bar, dark), angle, out));
  }
  lens.push(placed(new THREE.SphereGeometry(glass, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, base, 0), angle, out));
}

/** The geometries and materials every ring of one kind shares; each ring is a few meshes over them. */
export class GateKit {
  private readonly frame: THREE.BufferGeometry;
  private readonly coil: THREE.BufferGeometry;
  private readonly stripes: THREE.BufferGeometry;
  private readonly lamps: THREE.BufferGeometry;
  private readonly plate: THREE.BufferGeometry;
  /**
   * Armor plating, riveted, patched and grimy, with stenciled coil numbers (see
   * industrialSurface), tiled at the same density on every face, each housing in a paint of its
   * own (see PAINTS), with a faint glow of its own (the coils' heat and the arena's light), so its
   * side away from the sun still shows.
   */
  private readonly metal = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(GATE_SEED), 1.5), color: 0xffffff, vertexColors: true, flatShading: true, emissive: 0x141c2a, emissiveIntensity: 1, envMap: shine(), envMapIntensity: 0.6 });
  /** Worn hazard paint (see hazardSurface) along the housings' faces by the opening, around the struts' ends and across the module's foot. */
  private readonly hazard = new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 1), emissive: 0x141c2a, envMap: shine(), envMapIntensity: 0.4 });
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
    const stripes: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    const r = new Randomizer(PAINT_SEED);
    const paint = () => PAINTS[r.nextInt() % PAINTS.length];
    // each part takes the plating at a spot of its own, in its paint a shade lighter or darker
    const skin = (tint: THREE.Color): Skin => ({ ...PLATING, shift: [r.range(0, 1), r.range(0, 1)], tint: tint.clone().multiplyScalar(r.range(0.92, 1.06)) });
    const stripe = (): Skin => ({ ...HAZARD_SKIN, shift: [r.range(0, 1), 0] });
    const inner = radius + CLEARANCE;
    const step = (Math.PI * 2) / SEGMENTS;
    const span = step * HOUSING;
    const width = 2 * inner * Math.sin(span / 2);
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = i * step;
      // the housing and a narrower armor plate on its outside, each in a paint of its own, and the windings on its inner face
      frame.push(block(width, THICKNESS, DEPTH, angle, inner + THICKNESS / 2, 0, skin(paint())));
      frame.push(block(width * 0.8, THICKNESS * 0.35, DEPTH * 0.7, angle, inner + THICKNESS * 1.15, 0, skin(paint())));
      const wound: Skin = { ...WINDING_SKIN, shift: [r.range(0, 1), 0] };
      for (let w = 0; w < WINDINGS; w++) {
        const along = ((w + 0.5) / WINDINGS - 0.5) * DEPTH * 0.8;
        coil.push(block(width * 0.92, WINDING * 0.6, WINDING, angle, inner + WINDING * 0.3 - 4, along, wound));
      }
      // the windings' ends show on both faces along the opening's rim, so the ring reads from ahead
      // as a dashed circle of light; beside them on both faces, hazard paint along the opening
      for (const side of [-1, 1]) {
        coil.push(block(width * 0.92, RIM, RIM / 2, angle, inner + RIM / 2, side * (DEPTH / 2 + RIM / 4), wound));
        stripes.push(block(width * 0.92, HAZARD_BAND, 3, angle, inner + RIM + 15 + HAZARD_BAND / 2, side * (DEPTH / 2 + 1.5), stripe()));
      }
      // two conduits across the gap to the next housing
      const gap = angle + step / 2;
      for (const along of [-DEPTH * 0.3, DEPTH * 0.3]) frame.push(block(2 * (inner + THICKNESS * 0.6) * Math.sin(step / 2), 50, 50, gap, inner + THICKNESS * 0.6, along, skin(PAINTS[1])));
    }
    // four struts out to the position lights, and the station module on top with its sponsor's plates
    const solid = (part: Part, look: Skin) => block(part.width, part.height, part.depth, part.angle, part.out, part.along, look);
    for (const part of [...strutParts(inner), ...moduleParts(inner)]) frame.push(solid(part, skin(PAINTS[r.nextInt() % 2])));
    const plate = plateParts(inner).map((part) => solid(part, { u: part.width, v: part.height }));
    // a sleeve of hazard paint under each strut's cap, and a band across the module's foot
    const cap = inner + THICKNESS + STRUT;
    for (const part of strutParts(inner).filter((_, k) => k % 2 === 0)) stripes.push(block(part.width + 6, HAZARD_BAND, part.depth + 6, part.angle, cap - 50 - HAZARD_BAND / 2 - 10, 0, stripe()));
    const [foot] = moduleParts(inner);
    stripes.push(block(foot.width * 0.96, HAZARD_BAND, foot.depth + 4, foot.angle, foot.out - foot.height / 2 + HAZARD_BAND / 2 + 16, 0, stripe()));
    // the position lights on the struts' caps, and a small one on a mast on top of the module
    for (let i = 0; i < 4; i++) lamp(frame, lamps, (i + 0.5) * (Math.PI / 2) + step / 2, cap + 50, 1);
    const top = inner + THICKNESS + 440;
    frame.push(placed(tinted(new THREE.CylinderGeometry(8, 10, 30, 6).translate(0, 15, 0), PAINTS[1]), Math.PI / 2, top));
    lamp(frame, lamps, Math.PI / 2, top + 30, 0.6);
    this.frame = mergeGeometries(frame);
    this.coil = mergeGeometries(coil);
    this.stripes = mergeGeometries(stripes);
    this.lamps = mergeGeometries(lamps);
    this.plate = mergeGeometries(plate);
    for (const parts of [frame, coil, stripes, lamps, plate]) for (const part of parts) part.dispose();
  }

  /**
   * A glow for the windings: copper wire in turns (see windingSurface) glowing in a color, at a
   * brightness (above 1 it blooms); a `faint` glow is tone mapped with the rest of the picture,
   * so the copper shows under it.
   */
  coilMaterial(color: THREE.ColorRepresentation, brightness: number, faint = false): THREE.Material {
    const wire = windingSurface();
    const material = new THREE.MeshStandardMaterial({ map: wire.map, normalMap: wire.normal, roughness: 0.35, metalness: 1, envMap: shine(), envMapIntensity: 0.8, emissive: color, emissiveMap: wire.glow, emissiveIntensity: brightness * WIRE_GLOW, toneMapped: faint });
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
    const stripes = new THREE.Mesh(this.stripes, this.hazard);
    root.add(new THREE.Mesh(this.frame, this.metal), windings, stripes, new THREE.Mesh(this.lamps, this.lights), new THREE.Mesh(this.plate, sign));
    // a solid ring stands in the sun: it throws a shadow and takes those of the rocks (the paint, flush on it, only takes them)
    for (const part of root.children) part.castShadow = part.receiveShadow = true;
    stripes.castShadow = false;
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
    for (const geometry of [this.frame, this.coil, this.stripes, this.lamps, this.plate]) geometry.dispose();
    for (const material of [this.metal, this.hazard, this.lights, ...this.signs, ...this.coils]) material.dispose();
    for (const sign of this.signs) sign.map?.dispose();
  }
}
