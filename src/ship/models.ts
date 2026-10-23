import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas } from '../view/textures';

/**
 * The two interceptors, built in code as low-poly hulls of flat facets (a few hundred
 * triangles each). From the model files they keep only what the game reads: the collider box
 * (so the shared hit radius stays as it is), the drive flame and the glows at the nozzles. The
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
 * moved to its center, the sides joined facet by facet, both ends capped. Flat shaded.
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

/** The sheen of every hull: what its polished plates mirror (see shine), and how strongly. */
const SHEEN = 1.1;
let mirrored: THREE.CubeTexture | null = null;

/**
 * What a hull's plates mirror, painted in code: deep space, the sun blazing on one side, and
 * the tournament's neon in streaks, orange and azure. The glint of polished metal turning in
 * the light, built once for every hull.
 */
function shine(): THREE.CubeTexture {
  if (mirrored) return mirrored;
  const face = (paint: (g: CanvasRenderingContext2D) => void) => {
    const [element, g] = canvas(128);
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#2a3242');
    sky.addColorStop(0.55, '#0a0d14');
    sky.addColorStop(1, '#020203');
    g.fillStyle = sky;
    g.fillRect(0, 0, 128, 128);
    paint(g);
    return element;
  };
  const streak = (color: string, y: number) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = color;
    g.fillRect(0, y, 128, 6);
  };
  const sun = (g: CanvasRenderingContext2D) => {
    const glow = g.createRadialGradient(64, 40, 0, 64, 40, 46);
    glow.addColorStop(0, '#fffaf0');
    glow.addColorStop(0.2, '#ffd9a0');
    glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
  };
  // +x, -x, +y, -y, +z, -z
  mirrored = new THREE.CubeTexture([face(sun), face(streak('#ff9d00', 70)), face(() => {}), face(() => {}), face(streak('#4d91ff', 76)), face(streak('#ff9d00', 60))]);
  mirrored.colorSpace = THREE.SRGBColorSpace;
  mirrored.needsUpdate = true;
  return mirrored;
}

/**
 * A hull on the model file's engine (see keepEngine): the painted `parts` as one flat-shaded,
 * polished mesh of the given finish, and the `glow` parts, if any, lit in their color. Both
 * meshes carry `name`.
 */
function hull(original: THREE.Object3D, name: string, finish: { roughness: number; metalness: number }, parts: THREE.BufferGeometry[], glow?: { parts: THREE.BufferGeometry[]; color: THREE.Color }): THREE.Object3D {
  const root = keepEngine(original);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, ...finish, side: THREE.DoubleSide, envMap: shine(), envMapIntensity: SHEEN });
  const meshes: THREE.Mesh[] = [new THREE.Mesh(mergeGeometries(parts), material)];
  if (glow) meshes.push(new THREE.Mesh(mergeGeometries(glow.parts), new THREE.MeshBasicMaterial({ color: glow.color, toneMapped: false })));
  for (const mesh of meshes) {
    mesh.name = name;
    root.add(mesh);
  }
  return root;
}

const OLIVE = 0x56663f;
const OLIVE_DARK = 0x3d4a2d;
const STEEL = 0x8c9198;
const GUNMETAL = 0x34383e;
const STRIPE = 0xff9d00;
const GLASS = 0x0d1a2a;

/** The human interceptor, after the original: about 32 m across and 29 m long. */
export function humanInterceptor(original: THREE.Object3D): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [
    // fuselage: wide at the drives, narrowing to the nose
    paint(loft(OCTAGON, { z: 240, w: 70, h: 55, y: 5 }, { z: -170, w: 45, h: 40, y: 0 }), OLIVE),
    paint(loft(OCTAGON, { z: -170, w: 45, h: 40 }, { z: -290, w: 12, h: 10, y: -8 }), OLIVE),
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
  ];
  return hull(original, 'humanHull', { roughness: 0.42, metalness: 0.45 }, parts);
}

const IVORY = 0xd9d3c3;
const GOLD = 0xc9a227;
const GOLD_DARK = 0x7a5f14;
const AMBER_GLASS = 0x3a2608;
const SUN = new THREE.Color(1, 0.62, 0.1).multiplyScalar(2.2);

/**
 * The Sovereign, the President's gift to a Host who has made both interceptors complete: a long
 * ivory arrowhead with a gold canopy, delta wings swept back to gold tips, forward canards, and
 * sun-orange neon along every leading edge. It keeps the human interceptor's drives, so its
 * flames burn where the model file has them.
 */
export function sovereign(original: THREE.Object3D): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [
    // the arrowhead: wide at the drives, a long, flat needle to the nose
    paint(loft(OCTAGON, { z: 250, w: 62, h: 40, y: 4 }, { z: -120, w: 40, h: 26 }), IVORY),
    paint(loft(OCTAGON, { z: -120, w: 40, h: 26 }, { z: -380, w: 4, h: 4, y: -4 }), IVORY),
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
  const neon: THREE.BufferGeometry[] = [
    // the leading edges and the spine, in the sun's orange
    ...pair(loft(RECTANGLE, { z: 240, w: 2, h: 2, x: 268, y: 3 }, { z: -40, w: 2, h: 2, x: 72, y: 4 })),
    ...pair(loft(RECTANGLE, { z: -120, w: 2, h: 2, x: 40, y: 0 }, { z: -370, w: 2, h: 2, x: 4, y: -3 })),
    loft(RECTANGLE, { z: 240, w: 2, h: 2, y: 55 }, { z: 30, w: 2, h: 2, y: 42 }),
  ];
  return hull(original, 'sovereignHull', { roughness: 0.3, metalness: 0.6 }, parts, { parts: neon, color: SUN });
}

const VOID = 0x15121c;
const VOID_SHEEN = 0x2b2438;
const VEIN = new THREE.Color(0.1, 1, 0.75).multiplyScalar(1.5);

/**
 * The alien interceptor: a slim dart, a tall dorsal blade and a keel, two swept blades at the
 * sides with the drives at their roots; the glowing veins are its life support, which keeps
 * the air rich in oxygen that its crew needs.
 */
export function alienInterceptor(original: THREE.Object3D): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [
    // the dart: a long, narrow body ending in a needle
    paint(loft(OCTAGON, { z: 400, w: 34, h: 40, y: -10 }, { z: 60, w: 62, h: 52, y: 0 }), VOID),
    paint(loft(OCTAGON, { z: 60, w: 62, h: 52 }, { z: -330, w: 6, h: 8, y: -10 }), VOID_SHEEN),
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
  return hull(original, 'alienHull', { roughness: 0.28, metalness: 0.5 }, parts, { parts: veins, color: VEIN });
}
