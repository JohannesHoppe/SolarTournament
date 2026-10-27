import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUv, lacquer, shine, surfaced, wornSurface, type Wear } from '../view/surfaces';
import { hazeUniforms } from '../view/haze';

/**
 * The two interceptors, built in code as low-poly hulls (a few hundred triangles each), shaded
 * smooth around their bodies and hard at their edges. From the model files they keep only what
 * the game reads: the collider box (so the shared hit radius stays as it is), the drive flame
 * and the glows at the nozzles. The
 * human interceptor follows the original model: a fuselage with a canopy, two tall fins on
 * struts, a gun under the nose, two drives. The alien interceptor is a slim dart with a tall
 * dorsal blade, swept side blades and the glowing veins of its life support.
 */

type Section = [number, number][];
/** One end of a loft: its depth along the ship (z, the nose towards -z), its scale and its center. */
type End = { z: number; w: number; h: number; x?: number; y?: number };

/** An octagon with flat sides, top and bottom, the cross section of most hull parts (width and height 2). */
const OCTAGON: Section = [[-1, -0.6], [-0.6, -1], [0.6, -1], [1, -0.6], [1, 0.6], [0.6, 1], [-0.6, 1], [-1, 0.6]];
const RECTANGLE: Section = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
/** A blade: thin and pointed at both edges. */
const BLADE: Section = [[-1, 0], [0, -1], [1, 0], [0, 1]];

/**
 * A hull part lofted from one cross section to another: the section scaled to each end and
 * moved to its center, the sides joined facet by facet, both ends capped. Its normals are the
 * facets' own (see hull for how the hull is shaded).
 */
function loft(section: Section, back: End, front: End): THREE.BufferGeometry {
  const ring = (end: End) => section.map(([x, y]) => new THREE.Vector3((end.x ?? 0) + x * end.w, (end.y ?? 0) + y * end.h, end.z));
  const a = ring(back);
  const b = ring(front);
  const points: THREE.Vector3[] = [];
  const n = section.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    points.push(a[i], b[i], b[j], a[i], b[j], a[j]);
  }
  for (let i = 1; i < n - 1; i++) points.push(a[0], a[i + 1], a[i], b[0], b[i], b[i + 1]);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
}

/** Paints a part in one color, so parts of several colors merge into one mesh. */
function paint(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Mirrors a part to the other side (x), keeping its faces turned outwards. */
function mirror(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const copy = geometry.clone().scale(-1, 1, 1);
  const position = copy.attributes.position;
  // the mirror turns the winding inside out: swap two corners of every triangle
  for (let i = 0; i < position.count; i += 3) {
    const x = position.getX(i + 1), y = position.getY(i + 1), z = position.getZ(i + 1);
    position.setXYZ(i + 1, position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));
    position.setXYZ(i + 2, x, y, z);
  }
  copy.computeVertexNormals();
  return copy;
}

/** Both sides of a part. */
const pair = (geometry: THREE.BufferGeometry) => [geometry, mirror(geometry)];

/** A new root for a hull: the model file's collider, drive flame and glows, where they were. */
function keepEngine(original: THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  const source = original.clone(true);
  source.updateMatrixWorld(true);
  const kept: THREE.Object3D[] = [];
  source.traverse((o) => {
    const name = o.name.toLowerCase();
    if (o.userData.collider || name.startsWith('drive') || name.includes('glow')) kept.push(o);
  });
  for (const o of kept) root.attach(o);
  return root;
}

/** The sheen of every hull: what its plates mirror (see shine), and how strongly. */
const SHEEN = 1.1;
/** A hull's surface repeats every this many units (20 m), so a panel is a few meters wide. */
const TILE = 400;
/** How deep the seams and rivets look (see surfaced). */
const RELIEF = 1.5;
/**
 * Facets meeting at less than this angle (radians, 60°) are shaded as one curved surface, so a
 * light's highlight slides across a body as it turns instead of flashing facet by facet; the
 * octagonal bodies round off, while the corners of boxes (90°), caps and blade edges stay hard.
 */
const CREASE = Math.PI / 3;
/**
 * The clear lacquer over the paint: its strength (0..1) and roughness. Smooth enough that the
 * sun, a drive's light or the hangar's lamps show as a small, crisp glint sliding over the
 * rounded bodies; half strength, an old coat, so the glint stays a glint and a flat panel only
 * flashes in the moment it mirrors the sun. Where the paint has rusted, chipped or been
 * scratched, the lacquer is gone or dull (the red channel of the surface's map, see wornSurface).
 */
const LACQUER = 0.5;
const LACQUER_ROUGHNESS = 0.15;
/**
 * The brightest the lacquer mirrors a light, per unit of the sun's intensity (linear, before
 * the lacquer's strength; the bloom starts at 0.88). Out there no air dims the sun, and a
 * smooth panel at its mirror angle throws it back nearly whole: the glint blinds, with a wide
 * halo, the brighter the nearer the sun (the corona's twice the belt's). Uncapped it would be
 * hundreds of times brighter and the bloom would swallow the whole ship. The lacquer's
 * reflection of the sky (see shine) stays as it is.
 */
const GLINT_PER_SUN = 1.25;
const glintPeak = { value: GLINT_PER_SUN * 3.2 };

/** The glint's cap for a sun of this intensity (see GLINT_PER_SUN); set with each arena's sun. */
export function setGlint(sunIntensity: number) {
  glintPeak.value = GLINT_PER_SUN * sunIntensity;
}

/** Caps the lacquer's mirror image of the lights at the glint's peak, keeping its hue; the hull takes the haze as every material does (see view/haze). */
function capGlint(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  hazeUniforms(shader, this);
  shader.uniforms.glintPeak = glintPeak;
  const direct = 'clearcoatSpecularDirect';
  const capped = `${direct} * min( 1.0, glintPeak / max( max( ${direct}.r, ${direct}.g ), max( ${direct}.b, 1e-4 ) ) )`;
  shader.fragmentShader = 'uniform float glintPeak;\n' + shader.fragmentShader.replace(`( ${direct} + clearcoatSpecularIndirect )`, `( ${capped} + clearcoatSpecularIndirect )`);
}

/**
 * A hull on the model file's engine (see keepEngine): the painted `parts` as one mesh with its
 * `wear` (see wornSurface: the paint's color times the surface's, worn down to metal where it
 * chipped, mirroring the sky where it is smooth) under a clear lacquer, and the `glow` parts, if
 * any, lit in their color. Both meshes carry `name`. The `trim` comes along hidden (see
 * lightStrips).
 */
function hull(original: THREE.Object3D, name: string, wear: Wear, seed: number, parts: THREE.BufferGeometry[], trim: THREE.Object3D, glow?: { parts: THREE.BufferGeometry[]; color: THREE.Color }): THREE.Object3D {
  const root = keepEngine(original);
  const surface = wornSurface(seed, wear);
  const material = lacquer(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      ...surfaced(surface, RELIEF),
      side: THREE.DoubleSide,
      envMap: shine(),
      envMapIntensity: SHEEN,
      clearcoat: LACQUER,
      clearcoatMap: surface.orm,
      clearcoatRoughness: LACQUER_ROUGHNESS,
    }),
  );
  material.onBeforeCompile = capGlint;
  // the texture coordinates follow the facets (see boxUv), the normals the creases
  const meshes: THREE.Mesh[] = [new THREE.Mesh(toCreasedNormals(boxUv(mergeGeometries(parts), TILE), CREASE), material)];
  if (glow) meshes.push(new THREE.Mesh(mergeGeometries(glow.parts), new THREE.MeshBasicMaterial({ color: glow.color, toneMapped: false })));
  for (const mesh of meshes) {
    mesh.name = name;
    root.add(mesh);
  }
  root.add(trim);
  return root;
}

/** A loft's cross section at depth `z`, between the ends it lies between (`ends` from the nose back). */
function at(ends: End[], z: number): End {
  let i = 1;
  while (i < ends.length - 1 && ends[i].z < z) i++;
  const a = ends[i - 1];
  const b = ends[i];
  const k = (z - a.z) / (b.z - a.z);
  const mix = (p: number, q: number) => p + (q - p) * k;
  return { z, w: mix(a.w, b.w), h: mix(a.h, b.h), x: mix(a.x ?? 0, b.x ?? 0), y: mix(a.y ?? 0, b.y ?? 0) };
}

/**
 * The line along the right flank of an octagonal body lofted through `ends` (from the nose back),
 * at `f` of its half height above its middle (the flat flank reaches ±0.6), from depth `from` to
 * `to`. The body is straight between its ends, so the line bends only there.
 */
function flankLine(ends: End[], f: number, from: number, to: number): THREE.Vector3[] {
  const depths = [from, ...ends.map((end) => end.z).filter((z) => z > from && z < to), to];
  return depths.map((z) => {
    const end = at(ends, z);
    return new THREE.Vector3((end.x ?? 0) + end.w, (end.y ?? 0) + f * end.h, z);
  });
}

type Size = { h: number; d: number };
/** The trim's light tube: half its height and half its depth (units); 35 cm tall, standing 10 cm off the hull. */
const TUBE: Size = { h: 3.5, d: 1 };
/**
 * The rails of the channel the tube is set into, one above it and one below: 12 cm tall and
 * standing 20 cm off the hull, so the tube lies recessed between them and only glances out.
 */
const RAIL: Size = { h: 1.2, d: 2 };
const RAIL_OFFSET = TUBE.h + RAIL.h;
/** The tube comes in panels 2.5 m long with a 30 cm joint between them, the way a hull takes a fitting (units). */
const PANEL = 50;
const JOINT = 6;
const RAIL_METAL = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.45, metalness: 0.8, flatShading: true });

/** A profile of `size` from `a` to `b` on the hull (its inner face on the line), both flanks. */
const bar = (a: THREE.Vector3, b: THREE.Vector3, size: Size) => pair(loft(RECTANGLE, { z: b.z, w: size.d, h: size.h, x: b.x + size.d, y: b.y }, { z: a.z, w: size.d, h: size.h, x: a.x + size.d, y: a.y }));

/** A rail of `size` along `line`, moved up by `dy`. */
function rail(line: THREE.Vector3[], size: Size, dy: number): THREE.BufferGeometry[] {
  const moved = line.map((p) => new THREE.Vector3(p.x, p.y + dy, p.z));
  return moved.slice(1).flatMap((b, i) => bar(moved[i], b, size));
}

/** The tube along `line` in panels (see PANEL); a panel over a bend of the line takes the chord. */
function panels(line: THREE.Vector3[]): THREE.BufferGeometry[] {
  const lengths = line.slice(1).map((b, i) => b.distanceTo(line[i]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const point = (s: number) => {
    let i = 0;
    while (i < lengths.length - 1 && s > lengths[i]) s -= lengths[i++];
    return line[i].clone().lerp(line[i + 1], Math.min(1, s / lengths[i]));
  };
  const count = Math.max(1, Math.round((total + JOINT) / (PANEL + JOINT)));
  const step = (total + JOINT) / count;
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < count; k++) parts.push(...bar(point(k * step), point(k * step + step - JOINT), TUBE));
  return parts;
}

/** A profile across the stern: `width` long, centered at `y`, its inner face on the stern's face at `z`. */
function sternBar(width: number, y: number, z: number, size: Size): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, size.h * 2, size.d * 2).translate(0, y, z + size.d).toNonIndexed();
}

/**
 * Lays u from the nose (0 at depth `front`) to the stern (1 at `back`) over a part, so a running
 * light along the tube travels towards the drives (see Ship.outfit).
 */
function lengthwise(geometry: THREE.BufferGeometry, front: number, back: number): THREE.BufferGeometry {
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) uv.set([(position.getZ(i) - front) / (back - front), 0.5], i * 2);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * The neon trim, a look of the hangar (see Ship.outfit): a light tube in panels, recessed in a
 * channel of two dark rails, along both flanks on the flank's `line` from the nose back, and a
 * bar of the same make across the stern (`stern`: its width, height and depth), the light a
 * pursuer sees. The flanks are `trimFlanks`, the stern bar `trimStern`, both tubes `trimLight`;
 * all of it `trim`, hidden until a ship wears it.
 */
function lightStrips(line: THREE.Vector3[], stern: { width: number; y: number; z: number }): THREE.Object3D {
  const front = line[0].z;
  const back = stern.z;
  const fitting = (name: string, rails: THREE.BufferGeometry[], tube: THREE.BufferGeometry[]) => {
    const group = new THREE.Group();
    group.name = name;
    const light = new THREE.Mesh(mergeGeometries(tube.map((part) => lengthwise(part, front, back))), new THREE.MeshBasicMaterial({ toneMapped: false }));
    light.name = 'trimLight';
    group.add(new THREE.Mesh(mergeGeometries(rails), RAIL_METAL), light);
    return group;
  };
  const trim = new THREE.Group();
  trim.name = 'trim';
  trim.visible = false;
  trim.add(
    fitting('trimFlanks', [...rail(line, RAIL, RAIL_OFFSET), ...rail(line, RAIL, -RAIL_OFFSET)], panels(line)),
    fitting('trimStern', [-RAIL_OFFSET, RAIL_OFFSET].map((dy) => sternBar(stern.width + 8, stern.y + dy, stern.z, RAIL)), [sternBar(stern.width, stern.y, stern.z, TUBE)]),
  );
  return trim;
}

const OLIVE = 0x56663f;
const OLIVE_DARK = 0x3d4a2d;
const STEEL = 0x8c9198;
const GUNMETAL = 0x34383e;
/** The rims of the drives' bells, blued and bronzed by the heat of the burns. */
const HEAT_TINT = 0x6a5440;
const STRIPE = 0xff9d00;
const GLASS = 0x0d1a2a;
const TAIL_LIGHT = new THREE.Color(1, 0.12, 0.06).multiplyScalar(2.4);

/**
 * The human interceptor's wear: an old fighter of the depots, olive paint chipped down to the
 * metal, rust running from its rivets, grime, and the stencils of every depot it passed through.
 */
const DEPOT: Wear = { rust: 0.8, chips: 0.7, grime: 0.6, scratches: 0.6, seams: 0.7, stencils: ['07', 'NO STEP', 'FUEL', 'DEPOT 41-C', 'RESCUE', '2511'], roughness: 0.62, metalness: 0.25 };

/** The human interceptor's fuselage, from the nose back. */
const HUMAN_BODY: End[] = [{ z: -290, w: 12, h: 10, y: -8 }, { z: -170, w: 45, h: 40, y: 0 }, { z: 240, w: 70, h: 55, y: 5 }];

/** The human interceptor, after the original: about 32 m across and 29 m long. */
export function humanInterceptor(original: THREE.Object3D): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [
    // fuselage: wide at the drives, narrowing to the nose
    paint(loft(OCTAGON, HUMAN_BODY[2], HUMAN_BODY[1]), OLIVE),
    paint(loft(OCTAGON, HUMAN_BODY[1], HUMAN_BODY[0]), OLIVE),
    // canopy, dark glass
    paint(loft(OCTAGON, { z: -40, w: 30, h: 14, y: 42 }, { z: -170, w: 18, h: 6, y: 34 }), GLASS),
    // spine and belly
    paint(loft(RECTANGLE, { z: 230, w: 12, h: 10, y: 62 }, { z: -40, w: 8, h: 4, y: 50 }), OLIVE_DARK),
    paint(loft(RECTANGLE, { z: 160, w: 34, h: 12, y: -50 }, { z: -150, w: 22, h: 8, y: -40 }), STEEL),
    // gun under the nose
    paint(loft(OCTAGON, { z: -120, w: 9, h: 9, y: -52 }, { z: -300, w: 6, h: 6, y: -52 }), GUNMETAL),
    // drive nacelles, with their nozzles where the flames burn
    ...pair(paint(loft(OCTAGON, { z: 250, w: 30, h: 26, x: 87, y: 2 }, { z: 60, w: 22, h: 20, x: 75, y: 4 }), STEEL)),
    ...pair(paint(loft(OCTAGON, { z: 275, w: 26, h: 22, x: 87, y: 2 }, { z: 250, w: 30, h: 26, x: 87, y: 2 }), GUNMETAL)),
    // struts out to the fins, swept back
    ...pair(paint(loft(BLADE, { z: 150, w: 60, h: 12, x: 120, y: 10 }, { z: 0, w: 40, h: 10, x: 190, y: 14 }), OLIVE_DARK)),
    ...pair(paint(loft(RECTANGLE, { z: 120, w: 110, h: 8, x: 170, y: 12 }, { z: 20, w: 90, h: 6, x: 170, y: 12 }), OLIVE)),
    // the tall fins: slabs leaning out, the leading edge swept back
    ...pair(paint(loft(RECTANGLE, { z: 260, w: 16, h: 78, x: 285, y: 8 }, { z: -110, w: 8, h: 30, x: 300, y: 30 }), OLIVE)),
    // tournament stripes on the fins
    ...pair(paint(loft(RECTANGLE, { z: 150, w: 17, h: 8, x: 285, y: 70 }, { z: 60, w: 15, h: 8, x: 289, y: 64 }), STRIPE)),
    // the stern, what the pilot sees most of: flared bells around the nozzles, their rims tinted
    // by the heat, a drive block between the nacelles with its cooling ribs, and a bulkhead with
    // vents over it
    ...pair(paint(loft(OCTAGON, { z: 292, w: 32, h: 28, x: 87, y: 2 }, { z: 272, w: 27, h: 23, x: 87, y: 2 }), HEAT_TINT)),
    ...pair(paint(loft(OCTAGON, { z: 286, w: 22, h: 18, x: 87, y: 2 }, { z: 284, w: 30, h: 26, x: 87, y: 2 }), GUNMETAL)),
    paint(loft(RECTANGLE, { z: 262, w: 40, h: 28, y: -2 }, { z: 200, w: 44, h: 32, y: 0 }), GUNMETAL),
    ...[-18, -6, 6, 18].map((y) => paint(loft(RECTANGLE, { z: 266, w: 46, h: 2.5, y }, { z: 214, w: 46, h: 2.5, y }), STEEL)),
    paint(loft(RECTANGLE, { z: 244, w: 56, h: 6, y: 48 }, { z: 214, w: 50, h: 6, y: 46 }), OLIVE_DARK),
    ...[-36, -12, 12, 36].map((x) => paint(loft(RECTANGLE, { z: 246, w: 6, h: 2, x, y: 54 }, { z: 218, w: 6, h: 2, x, y: 52 }), GUNMETAL)),
  ];
  const lights: THREE.BufferGeometry[] = [
    // position lights at the fins' tops and on the stern
    ...pair(loft(RECTANGLE, { z: 262, w: 5, h: 5, x: 285, y: 88 }, { z: 250, w: 5, h: 5, x: 285, y: 88 })),
    ...pair(loft(RECTANGLE, { z: 264, w: 4, h: 4, x: 30, y: 30 }, { z: 256, w: 4, h: 4, x: 30, y: 30 })),
  ];
  // the trim along the fuselage's shoulders, above the nacelles, and across the bulkhead
  const trim = lightStrips(flankLine(HUMAN_BODY, 0.45, -230, 240), { width: 96, y: 48, z: 244 });
  return hull(original, 'humanHull', DEPOT, 41, parts, trim, { parts: lights, color: TAIL_LIGHT });
}

const IVORY = 0xd9d3c3;
const GOLD = 0xc9a227;
const GOLD_DARK = 0x7a5f14;
const AMBER_GLASS = 0x3a2608;

/** The Sovereign's arrowhead, from the nose back. */
const SOVEREIGN_BODY: End[] = [{ z: -380, w: 4, h: 4, y: -4 }, { z: -120, w: 40, h: 26 }, { z: 250, w: 62, h: 40, y: 4 }];

/**
 * The Sovereign, the President's gift to a Host who has made both interceptors complete: a long
 * ivory arrowhead with a gold canopy, delta wings swept back to gold tips, forward canards. It wears
 * every look, the neon trim's light strips too. It keeps the human interceptor's drives, so its
 * flames burn where the model file has them.
 */
export function sovereign(original: THREE.Object3D): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [
    // the arrowhead: wide at the drives, a long, flat needle to the nose
    paint(loft(OCTAGON, SOVEREIGN_BODY[2], SOVEREIGN_BODY[1]), IVORY),
    paint(loft(OCTAGON, SOVEREIGN_BODY[1], SOVEREIGN_BODY[0]), IVORY),
    // the canopy, amber glass in a gold frame
    paint(loft(OCTAGON, { z: 20, w: 24, h: 12, y: 30 }, { z: -150, w: 12, h: 5, y: 22 }), AMBER_GLASS),
    paint(loft(RECTANGLE, { z: 240, w: 8, h: 8, y: 46 }, { z: 20, w: 6, h: 3, y: 38 }), GOLD),
    // delta wings swept back to gold tips
    ...pair(paint(loft(BLADE, { z: 230, w: 120, h: 9, x: 150, y: 0 }, { z: -40, w: 30, h: 6, x: 70, y: 2 }), IVORY)),
    ...pair(paint(loft(RECTANGLE, { z: 250, w: 14, h: 30, x: 272, y: 8 }, { z: 140, w: 8, h: 14, x: 268, y: 10 }), GOLD)),
    // forward canards near the nose
    ...pair(paint(loft(BLADE, { z: -170, w: 46, h: 5, x: 64, y: 4 }, { z: -250, w: 14, h: 3, x: 40, y: 4 }), GOLD_DARK)),
    // the drive nacelles, gold, with their nozzles where the flames burn
    ...pair(paint(loft(OCTAGON, { z: 250, w: 28, h: 24, x: 87, y: 2 }, { z: 40, w: 18, h: 16, x: 70, y: 4 }), GOLD)),
    ...pair(paint(loft(OCTAGON, { z: 275, w: 26, h: 22, x: 87, y: 2 }, { z: 250, w: 28, h: 24, x: 87, y: 2 }), GOLD_DARK)),
  ];
  // the trim high on the arrowhead's flanks, above the wings and the nacelles, and across its stern
  const trim = lightStrips(flankLine(SOVEREIGN_BODY, 0.5, -340, 250), { width: 100, y: 20, z: 250 });
  return hull(original, 'sovereignHull', GIFT, 7, parts, trim);
}

/** The Sovereign's wear: a gift of the President, kept like new; a few scratches, its number in gold. */
const GIFT: Wear = { rust: 0, chips: 0.05, grime: 0.1, scratches: 0.2, seams: 0.3, stencils: ['01'], roughness: 0.3, metalness: 0.6 };

const VOID = 0x15121c;
const VOID_SHEEN = 0x2b2438;
const VEIN = new THREE.Color(0.1, 1, 0.75).multiplyScalar(1.5);

/** The alien interceptor's dart, from the needle back. */
const ALIEN_BODY: End[] = [{ z: -330, w: 6, h: 8, y: -10 }, { z: 60, w: 62, h: 52 }, { z: 400, w: 34, h: 40, y: -10 }];

/**
 * The alien interceptor: a slim dart, a tall dorsal blade and a keel, two swept blades at the
 * sides with the drives at their roots; the glowing veins are its life support, which keeps
 * the air rich in oxygen that its crew needs.
 */
export function alienInterceptor(original: THREE.Object3D): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [
    // the dart: a long, narrow body ending in a needle
    paint(loft(OCTAGON, ALIEN_BODY[2], ALIEN_BODY[1]), VOID),
    paint(loft(OCTAGON, ALIEN_BODY[1], ALIEN_BODY[0]), VOID_SHEEN),
    // the dorsal blade, tall and swept back, and the keel below
    paint(loft(BLADE, { z: 330, w: 10, h: 80, y: 120 }, { z: -60, w: 12, h: 12, y: 40 }), VOID_SHEEN),
    paint(loft(BLADE, { z: 300, w: 8, h: 50, y: -90 }, { z: 40, w: 10, h: 10, y: -40 }), VOID),
    // side blades, swept, carrying the drives
    ...pair(paint(loft(BLADE, { z: 380, w: 14, h: 26, x: 104, y: -44 }, { z: 40, w: 8, h: 10, x: 150, y: -60 }), VOID_SHEEN)),
    ...pair(paint(loft(BLADE, { z: 200, w: 70, h: 10, x: 60, y: -30 }, { z: 0, w: 40, h: 6, x: 60, y: -20 }), VOID)),
    ...pair(paint(loft(OCTAGON, { z: 410, w: 18, h: 18, x: 104, y: -44 }, { z: 280, w: 16, h: 16, x: 104, y: -44 }), VOID)),
  ];
  const veins: THREE.BufferGeometry[] = [
    // along the body and up the blade: the life support's glow
    loft(RECTANGLE, { z: 300, w: 2, h: 2, y: 43 }, { z: -200, w: 2, h: 2, y: 22 }),
    loft(RECTANGLE, { z: 320, w: 2, h: 2, y: 195 }, { z: -40, w: 2, h: 2, y: 66 }),
    ...pair(loft(RECTANGLE, { z: 360, w: 2, h: 2, x: 104, y: -18 }, { z: 60, w: 2, h: 2, x: 148, y: -50 })),
    ...pair(loft(RECTANGLE, { z: 150, w: 2, h: 2, x: 64, y: 20 }, { z: -220, w: 2, h: 2, x: 20, y: 4 })),
  ];
  // the trim along the dart's flanks, below the veins and above the side blades, and across its stern
  const trim = lightStrips(flankLine(ALIEN_BODY, 0.1, -290, 400), { width: 56, y: 4, z: 400 });
  return hull(original, 'alienHull', SCARRED, 23, parts, trim, { parts: veins, color: VEIN });
}

/** The alien interceptor's wear: a grown skin of fine scales, scored by countless fights, never rusting. */
const SCARRED: Wear = { rust: 0, chips: 0.25, grime: 0.35, scratches: 0.9, seams: 0.6, stencils: [], roughness: 0.35, metalness: 0.55, scales: true };
