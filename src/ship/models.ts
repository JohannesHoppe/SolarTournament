import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUv, hullSurface, lacquer, shine, type Wear } from '../view/surfaces';
import { hazeUniforms } from '../view/haze';
import { NOZZLE_LENGTH, QUAD_SIZE, quadsOf, thrustersOf, type QuadLayout } from './thrusters';

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
 * moved to its center, the sides joined facet by facet, both ends capped unless `open` leaves
 * one or both of them out (a bell's mouth). Its normals are the facets' own (see hull for how the
 * hull is shaded).
 */
function loft(section: Section, back: End, front: End, open: 'back' | 'front' | 'both' | null = null): THREE.BufferGeometry {
  const ring = (end: End) => section.map(([x, y]) => new THREE.Vector3((end.x ?? 0) + x * end.w, (end.y ?? 0) + y * end.h, end.z));
  const a = ring(back);
  const b = ring(front);
  const points: THREE.Vector3[] = [];
  const n = section.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    points.push(a[i], b[i], b[j], a[i], b[j], a[j]);
  }
  for (let i = 1; i < n - 1; i++) {
    if (open !== 'back' && open !== 'both') points.push(a[0], a[i + 1], a[i]);
    if (open !== 'front' && open !== 'both') points.push(b[0], b[i], b[i + 1]);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Paints a part in one color, so parts of several colors merge into one mesh; `finish` says
 * how much of the coat's lacquer, polish and metal it has (1 all of it, 0 none: dull soot),
 * carried in the color's alpha (see hullShader).
 */
function paint(geometry: THREE.BufferGeometry, color: number, finish = 1): THREE.BufferGeometry {
  return paintAlong(geometry, 0, color, 1, color, finish);
}

/** Paints a part from `fromColor` at depth `from` to `toColor` at depth `to`, blended between them (see paint). */
function paintAlong(geometry: THREE.BufferGeometry, from: number, fromColor: number, to: number, toColor: number, finish = 1): THREE.BufferGeometry {
  const a = new THREE.Color(fromColor);
  const b = new THREE.Color(toColor);
  const c = new THREE.Color();
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) {
    c.lerpColors(a, b, THREE.MathUtils.clamp((position.getZ(i) - from) / (to - from), 0, 1));
    colors.set([c.r, c.g, c.b, finish], i * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geometry;
}

/** The inside of a bell, its liner, black with the soot of its burns, dull (see paint). */
const SOOT = 0x0c0c0d;
const sooty = (geometry: THREE.BufferGeometry) => paint(geometry, SOOT, 0);

/**
 * A bell, open at its mouth: lofted through `ends` from its throat to its mouth, the outside
 * painted in `colors` at each end (a burn's heat tints it towards the rim), and inside it a
 * sooty liner `wall` thinner all round, closed a wall's depth before the throat. The liner lies
 * well clear of the outside (see SKIN), so looking into the mouth shows its dark hollow, never a
 * flickering lid. The throat goes into what carries the bell, which hides the open outside there.
 */
function bell(section: Section, ends: End[], colors: number[], wall: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const thin = (end: End): End => ({ ...end, w: end.w - wall, h: end.h - wall });
  const first = ends[1].z - ends[0].z;
  const lined = [at([ends[0], ends[1]], ends[0].z + Math.sign(first) * wall), ...ends.slice(1)];
  for (let i = 1; i < ends.length; i++) {
    parts.push(paintAlong(loft(section, ends[i - 1], ends[i], 'both'), ends[i - 1].z, colors[i - 1], ends[i].z, colors[i]));
    parts.push(sooty(loft(section, thin(lined[i - 1]), thin(lined[i]), i === 1 ? 'front' : 'both')));
  }
  return parts;
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

/** A nozzle's throat and mouth, half their size (units): 35 cm across at the housing, flaring to 60 cm. */
const THROAT = 3.5;
const MOUTH = 6;
const AHEAD = new THREE.Vector3(0, 0, -1);

/** How far a thruster's bell reaches back into its housing (units, 10 cm), and how thick its wall is (5 cm). */
const NOZZLE_ROOT = 2;
const NOZZLE_WALL = 1;
/** A thruster housing's bevel: its edges are cut off at this share of its half size. */
const HOUSING: Section = [[-1, -0.75], [-0.75, -1], [0.75, -1], [1, -0.75], [1, 0.75], [0.75, 1], [-0.75, 1], [-1, 0.75]];

/**
 * The maneuvering thrusters of a hull (see ship/thrusters): at each of the layout's four corners
 * a housing with beveled edges, two bands of `collar` around it clear of the nozzles' roots, its
 * four nozzles flaring out of it (open bells, sooty inside); `housings` and `nozzles` in their paint.
 */
function thrusterQuads(layout: QuadLayout, housing: number, collar: number, nozzle: number): { housings: THREE.BufferGeometry[]; nozzles: THREE.BufferGeometry[] } {
  const around = (q: THREE.Vector3, z: number, half: number, grow: number, color: number) =>
    paint(loft(HOUSING, { z: z + half, w: QUAD_SIZE + grow, h: QUAD_SIZE + grow, x: q.x, y: q.y }, { z: z - half, w: QUAD_SIZE + grow, h: QUAD_SIZE + grow, x: q.x, y: q.y }), color);
  const housings = quadsOf(layout).flatMap((q) => [around(q, q.z, QUAD_SIZE, 0, housing), around(q, q.z - 9, 2, 1.5, collar), around(q, q.z + 9, 2, 1.5, collar)]);
  const nozzles: THREE.BufferGeometry[] = [];
  const turn = new THREE.Quaternion();
  for (const { mouth, exhaust } of thrustersOf(layout).nozzles) {
    // a bell along -z from inside the housing's face, turned the way its gas leaves
    const throat = mouth.clone().addScaledVector(exhaust, -NOZZLE_LENGTH);
    turn.setFromUnitVectors(AHEAD, exhaust);
    for (const part of bell(OCTAGON, [{ z: NOZZLE_ROOT, w: THROAT, h: THROAT }, { z: -NOZZLE_LENGTH, w: MOUTH, h: MOUTH }], [nozzle, nozzle], NOZZLE_WALL)) {
      nozzles.push(part.applyQuaternion(turn).translate(throat.x, throat.y, throat.z));
    }
  }
  return { housings, nozzles };
}

/**
 * Where each hull's maneuvering thrusters sit, its right-hand clusters (see ship/thrusters): fore
 * on the flank of the fuselage behind the nose, aft far back and, where the hull reaches out
 * there, far out, so the couples that turn the ship have long levers; all near the height of the
 * ship's center, so a push moves it without turning it.
 */
export const THRUSTER_LAYOUTS: Record<'human' | 'alien' | 'sovereign', QuadLayout> = {
  // the fuselage's flank behind the canopy; the outside of the drive nacelles
  human: { fore: new THREE.Vector3(58, 0, -150), aft: new THREE.Vector3(127, 2, 200) },
  // the dart's flank ahead of its widest and near its stern, above the drive pods
  alien: { fore: new THREE.Vector3(48, -5, -120), aft: new THREE.Vector3(52, -8, 330) },
  // the arrowhead's flank behind the canards; the outside of the gold wing tips
  sovereign: { fore: new THREE.Vector3(53, 0, -100), aft: new THREE.Vector3(298, 8, 200) },
};

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
/** How deep the seams, rivets, scales and ribs look: the strength of the surface's normal map (see hullSurface). */
const RELIEF = 1;
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
 * halo, the brighter the nearer the sun (the corona's nearly three times the belt's). Uncapped it would be
 * hundreds of times brighter and the bloom would swallow the whole ship. The lacquer's
 * reflection of the sky (see shine) stays as it is.
 */
const GLINT_PER_SUN = 1.25;
const glintPeak = { value: GLINT_PER_SUN * 3.2 };

/** The glint's cap for a sun of this intensity (see GLINT_PER_SUN); set with each arena's sun. */
export function setGlint(sunIntensity: number) {
  glintPeak.value = GLINT_PER_SUN * sunIntensity;
}

/**
 * The steel under the paint (linear), where it chipped off or was scratched through: the surface
 * marks such spots as metal (see flakes in view/surfaces), and the hull shows them in this color
 * instead of its paint's, a pale bare metal that catches the light, never a dark hole.
 */
const BARE_STEEL = new THREE.Color(0xb4b8be);

/**
 * The hull's shader: caps the lacquer's mirror image of the lights at the glint's peak, keeping
 * its hue; shows bare steel wherever the surface's metalness rises well above its paint's
 * (`userData.paint`, the wear's metalness), so that paint chipped down to the metal reads as
 * metal; takes from each part's finish (see paint) how much lacquer, polish and metal it has;
 * lets the skin glow faintly along its outline in `userData.rim` (black for none), brightest
 * where the hull turns away from the eye; and takes the haze as every material does (see
 * view/haze).
 */
function hullShader(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  hazeUniforms(shader, this);
  shader.uniforms.glintPeak = glintPeak;
  shader.uniforms.paintMetal = { value: this.userData.paint };
  shader.uniforms.rimGlow = { value: this.userData.rim ?? new THREE.Color(0) };
  const direct = 'clearcoatSpecularDirect';
  const capped = `${direct} * min( 1.0, glintPeak / max( max( ${direct}.r, ${direct}.g ), max( ${direct}.b, 1e-4 ) ) )`;
  const steel = `vec3( ${BARE_STEEL.r.toFixed(4)}, ${BARE_STEEL.g.toFixed(4)}, ${BARE_STEEL.b.toFixed(4)} )`;
  shader.fragmentShader =
    'uniform float glintPeak;\nuniform float paintMetal;\nuniform vec3 rimGlow;\n' +
    shader.fragmentShader
      .replace(`( ${direct} + clearcoatSpecularIndirect )`, `( ${capped} + clearcoatSpecularIndirect )`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
	totalEmissiveRadiance += rimGlow * pow( 1.0 - saturate( abs( dot( normal, normalize( vViewPosition ) ) ) ), 3.0 );`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
	diffuseColor.rgb = mix( diffuseColor.rgb, ${steel} * sampledDiffuseColor.rgb, smoothstep( paintMetal + 0.15, paintMetal + 0.4, metalnessFactor ) );
	// the part's finish (see paint): soot is dull, neither polished nor metal
	roughnessFactor = mix( 1.0, roughnessFactor, vColor.a );
	metalnessFactor *= vColor.a;`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
	#ifdef USE_CLEARCOAT
		material.clearcoat *= vColor.a;
	#endif
	#ifdef USE_IRIDESCENCE
		material.iridescence *= vColor.a;
	#endif`,
      );
}

/**
 * A skin over a part (a radiator's glow, a band of paint) stands this far off it (units, 3 cm):
 * a hundred times what the depth buffer tells apart at the chase camera's distance, so the two
 * never fight for a pixel; faces closer than that, or crossing, flicker as the ship turns.
 */
const SKIN = 0.6;

/**
 * A band of paint around the top of a slab lofted (RECTANGLE) through `ends` (from the nose
 * back), `height` tall, from depth `from` to `to`: a skin over the slab's sides and top (see SKIN).
 */
function band(ends: End[], from: number, to: number, height: number): THREE.BufferGeometry {
  const end = (z: number): End => {
    const slab = at(ends, z);
    return { z, w: slab.w + SKIN, h: height / 2, x: slab.x, y: (slab.y ?? 0) + slab.h + SKIN - height / 2 };
  };
  return loft(RECTANGLE, end(to), end(from));
}

/**
 * The glowing skin of a radiator: the part lofted from `back` to `front`, a little larger all
 * round (see SKIN), its vertices as hot as `warmth` says at their place (0..1, the
 * glow's share there: hottest where the coolant comes in).
 */
function radiator(section: Section, back: End, front: End, warmth: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const grow = (end: End, dz: number): End => ({ ...end, z: end.z + dz, w: end.w + SKIN, h: end.h + SKIN });
  const geometry = loft(section, grow(back, SKIN), grow(front, -SKIN));
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) colors.fill(warmth(p.fromBufferAttribute(position, i)), i * 3, i * 3 + 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * A coat of a hull: its painted `parts`, their `wear` drawn from `seed` (see hullSurface), what
 * of the material differs from the hull's lacquered paint (`look`), the color its surface's
 * glowing map glows in, if any (`glow`), and the faint glow along its outline (`rim`, see hullShader).
 */
type Coat = { parts: THREE.BufferGeometry[]; wear: Wear; seed: number; look?: THREE.MeshPhysicalMaterialParameters; glow?: THREE.Color; rim?: THREE.Color };

/**
 * A coat as one mesh: the paint's color times its surface's, worn down to bare steel where it
 * chipped (see hullShader), its relief a normal map, mirroring the sky where it is smooth, under
 * a clear lacquer. The texture coordinates follow the facets (see boxUv), the normals the creases.
 */
function coat({ parts, wear, seed, look, glow, rim }: Coat): THREE.Mesh {
  const surface = hullSurface(seed, wear, !!glow);
  const material = lacquer(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: surface.map,
      roughnessMap: surface.orm,
      metalnessMap: surface.orm,
      roughness: 1,
      metalness: 1,
      normalMap: surface.normal,
      normalScale: new THREE.Vector2(RELIEF, RELIEF),
      side: THREE.DoubleSide,
      envMap: shine(),
      envMapIntensity: SHEEN,
      clearcoat: LACQUER,
      clearcoatMap: surface.orm,
      clearcoatRoughness: LACQUER_ROUGHNESS,
      ...(glow && surface.glow ? { emissive: glow, emissiveMap: surface.glow } : {}),
      ...look,
    }),
  );
  material.userData.paint = wear.metalness;
  material.userData.rim = rim;
  material.onBeforeCompile = hullShader;
  return new THREE.Mesh(toCreasedNormals(boxUv(mergeGeometries(parts), TILE, 'readable'), CREASE), material);
}

/**
 * A hull on the model file's engine (see keepEngine): its `coats`, each one mesh (see coat), and
 * the `glow` parts, if any, lit in their color. Every mesh carries `name`. The `trim` comes along
 * hidden (see lightStrips), and so do the `radiators`, one mesh named `radiator` that glows over
 * them as the laser's heat rises (see Ship.radiate).
 */
function hull(original: THREE.Object3D, name: string, coats: Coat[], trim: THREE.Object3D, radiators: THREE.BufferGeometry[], glow?: { parts: THREE.BufferGeometry[]; color: THREE.Color }): THREE.Object3D {
  const root = keepEngine(original);
  const meshes = coats.map(coat);
  if (glow) meshes.push(new THREE.Mesh(mergeGeometries(glow.parts), new THREE.MeshBasicMaterial({ color: glow.color, toneMapped: false })));
  for (const mesh of meshes) {
    mesh.name = name;
    root.add(mesh);
  }
  root.add(trim);
  const skin = new THREE.Mesh(
    mergeGeometries(radiators),
    new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
  );
  skin.name = 'radiator';
  skin.visible = false;
  root.add(skin);
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
/** The drives' bells, tinted by the heat of the burns as steel goes: straw and bronze halfway out, blued at the rim. */
const HEAT_TINT = 0x86663a;
const HEAT_BLUE = 0x3e4c7c;
const STRIPE = 0xff9d00;
const GLASS = 0x0d1a2a;
const TAIL_LIGHT = new THREE.Color(1, 0.12, 0.06).multiplyScalar(2.4);

/**
 * The human interceptor's wear: an old fighter of the depots, olive paint chipped down to the
 * metal, rust running from its rivets, grime, and the stencils of every depot it passed through.
 */
export const DEPOT: Wear = { rust: 0.8, chips: 0.7, grime: 0.6, scratches: 0.6, seams: 0.7, stencils: ['07', 'NO STEP', 'FUEL', 'DEPOT 41-C', 'RESCUE', '2511'], roughness: 0.62, metalness: 0.25, flakes: true };
/** Its fins: the same paint and wear on ribbed plates in riveted frames. */
const DEPOT_FINS: Wear = { ...DEPOT, stencils: ['07', 'NO STEP'], relief: 'ribs' };

/**
 * A hoop around a part lofted through `ends`: `half` deep on either side of depth `z`, standing
 * `stand` off it, its two faces rings from the part out to the hoop (no lid across the part).
 */
function hoop(section: Section, ends: End[], z: number, half: number, stand: number): THREE.BufferGeometry {
  const ring = (end: End, grow: number) => section.map(([x, y]) => new THREE.Vector3((end.x ?? 0) + x * (end.w + grow), (end.y ?? 0) + y * (end.h + grow), end.z));
  const points: THREE.Vector3[] = [];
  const n = section.length;
  const rings = [z - half, z + half].map((d) => [ring(at(ends, d), 0), ring(at(ends, d), stand)]);
  const [[, outerA], [, outerB]] = rings;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    points.push(outerA[i], outerB[i], outerB[j], outerA[i], outerB[j], outerA[j]);
    for (const [inner, outer] of rings) points.push(inner[i], outer[i], outer[j], inner[i], outer[j], inner[j]);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
}

/** The cap at the end of a drive's nacelle, from its rim at the stern forward; open at the rim, where the bell comes out of it. */
const NACELLE_CAP: End = { z: 275, w: 26, h: 22, x: 87, y: 2 };
const NACELLE_END: End = { z: 250, w: 30, h: 26, x: 87, y: 2 };
/** A drive's bell, from its throat inside the nacelle's cap to its rim (units: 1.6 m across at the rim). */
const DRIVE_BELL: End[] = [{ z: 268, w: 23, h: 19, x: 87, y: 2 }, { z: 281, w: 26, h: 22, x: 87, y: 2 }, { z: 294, w: 33, h: 29, x: 87, y: 2 }];
/** The cooling rings around a bell: where they sit, half their depth and how far they stand off it (units: 25 cm deep, 9 cm proud). */
const BELL_RINGS = [279, 288];
const BELL_RING_HALF = 2.5;
const BELL_RING_STAND = 1.8;

/**
 * The two drives' bells at the stern, both drives of the human interceptor's make (the
 * Sovereign's too): open bells flaring from inside the nacelle's cap, painted `colors` from the
 * throat to the rim, banded by cooling rings in `rings` paint.
 */
function driveBells(colors: number[], rings: number): THREE.BufferGeometry[] {
  const parts = bell(OCTAGON, DRIVE_BELL, colors, 2.5);
  for (const z of BELL_RINGS) parts.push(paint(hoop(OCTAGON, DRIVE_BELL, z, BELL_RING_HALF, BELL_RING_STAND), rings));
  return parts.flatMap(pair);
}

/** The heights of the cooling ribs across the human interceptor's drive block, and where the vents sit on the bulkhead over it (units). */
const RIBS = [-18, -6, 6, 18];
const VENTS = [-36, -12, 12, 36];

/** The human interceptor's fuselage, from the nose back. */
const HUMAN_BODY: End[] = [{ z: -290, w: 12, h: 10, y: -8 }, { z: -170, w: 45, h: 40, y: 0 }, { z: 240, w: 70, h: 55, y: 5 }];
/** The human interceptor's right fin, from its leading edge back. */
const HUMAN_FIN: End[] = [{ z: -110, w: 8, h: 30, x: 300, y: 30 }, { z: 260, w: 16, h: 78, x: 285, y: 8 }];

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
    ...pair(paint(loft(OCTAGON, NACELLE_CAP, NACELLE_END, 'back'), GUNMETAL)),
    // struts out to the fins, swept back
    ...pair(paint(loft(BLADE, { z: 150, w: 60, h: 12, x: 120, y: 10 }, { z: 0, w: 40, h: 10, x: 190, y: 14 }), OLIVE_DARK)),
    ...pair(paint(loft(RECTANGLE, { z: 120, w: 110, h: 8, x: 170, y: 12 }, { z: 20, w: 90, h: 6, x: 170, y: 12 }), OLIVE)),
    // tournament stripes around the fins' tops, 80 cm tall
    ...pair(paint(band(HUMAN_FIN, 60, 150, 16), STRIPE)),
    // the stern, what the pilot sees most of: the drives' open bells, heat-tinted and banded by
    // cooling rings, a drive block between the nacelles with its cooling ribs, and a bulkhead with
    // vents over it
    ...driveBells([GUNMETAL, HEAT_TINT, HEAT_BLUE], STEEL),
    paint(loft(RECTANGLE, { z: 262, w: 40, h: 28, y: -2 }, { z: 200, w: 44, h: 32, y: 0 }), GUNMETAL),
    ...RIBS.map((y) => paint(loft(RECTANGLE, { z: 266, w: 46, h: 2.5, y }, { z: 214, w: 46, h: 2.5, y }), STEEL)),
    paint(loft(RECTANGLE, { z: 244, w: 56, h: 6, y: 48 }, { z: 214, w: 50, h: 6, y: 46 }), OLIVE_DARK),
    ...VENTS.map((x) => paint(loft(RECTANGLE, { z: 246, w: 6, h: 2, x, y: 54 }, { z: 218, w: 6, h: 2, x, y: 52 }), GUNMETAL)),
    ...Object.values(thrusterQuads(THRUSTER_LAYOUTS.human, GUNMETAL, OLIVE_DARK, STEEL)).flat(),
  ];
  // the tall fins: slabs leaning out, the leading edge swept back, ribbed
  const fins = pair(paint(loft(RECTANGLE, HUMAN_FIN[1], HUMAN_FIN[0]), OLIVE));
  const lights: THREE.BufferGeometry[] = [
    // position lights at the fins' tops and on the stern
    ...pair(loft(RECTANGLE, { z: 262, w: 5, h: 5, x: 285, y: 88 }, { z: 250, w: 5, h: 5, x: 285, y: 88 })),
    ...pair(loft(RECTANGLE, { z: 264, w: 4, h: 4, x: 30, y: 30 }, { z: 256, w: 4, h: 4, x: 30, y: 30 })),
  ];
  // the trim along the fuselage's shoulders, above the nacelles, and across the bulkhead
  const trim = lightStrips(flankLine(HUMAN_BODY, 0.45, -230, 240), { width: 96, y: 48, z: 244 });
  // the radiators: the drive block's cooling ribs, hottest at the back where the coolant comes
  // from the drives, and the vents on the bulkhead over them
  const radiators = [
    ...RIBS.map((y) => radiator(RECTANGLE, { z: 266, w: 46, h: 2.5, y }, { z: 214, w: 46, h: 2.5, y }, (p) => 0.55 + 0.45 * THREE.MathUtils.smoothstep(p.z, 214, 266))),
    ...VENTS.map((x) => radiator(RECTANGLE, { z: 246, w: 6, h: 2, x, y: 54 }, { z: 218, w: 6, h: 2, x, y: 52 }, () => 0.8)),
  ];
  const coats: Coat[] = [
    { parts, wear: DEPOT, seed: 41 },
    { parts: fins, wear: DEPOT_FINS, seed: 42 },
  ];
  return hull(original, 'humanHull', coats, trim, radiators, { parts: lights, color: TAIL_LIGHT });
}

const IVORY = 0xd9d3c3;
const GOLD = 0xc9a227;
const GOLD_DARK = 0x7a5f14;
/** A gold bell's rim, darkened by the soot of its burns. */
const GOLD_SOOT = 0x4a3a1a;
const AMBER_GLASS = 0x3a2608;

/** The Sovereign's delta wing, from its trailing edge to its leading edge (the right one; the left one mirrors it). */
const SOVEREIGN_WING: [End, End] = [{ z: 230, w: 120, h: 9, x: 150, y: 0 }, { z: -40, w: 30, h: 6, x: 70, y: 2 }];

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
    // the canopy, amber glass in a gold frame (see gold)
    paint(loft(OCTAGON, { z: 20, w: 24, h: 12, y: 30 }, { z: -150, w: 12, h: 5, y: 22 }), AMBER_GLASS),
    // delta wings swept back to gold tips
    ...pair(paint(loft(BLADE, ...SOVEREIGN_WING), IVORY)),
  ];
  // everything gold, engraved and brushed: the canopy's frame, the wing tips, the forward canards
  // near the nose, the drive nacelles with their bells where the flames burn, the thrusters
  const thrusters = thrusterQuads(THRUSTER_LAYOUTS.sovereign, GOLD, GOLD_DARK, GOLD_DARK);
  const gold: THREE.BufferGeometry[] = [
    paint(loft(RECTANGLE, { z: 240, w: 8, h: 8, y: 46 }, { z: 20, w: 6, h: 3, y: 38 }), GOLD),
    ...pair(paint(loft(RECTANGLE, { z: 250, w: 14, h: 30, x: 272, y: 8 }, { z: 140, w: 8, h: 14, x: 268, y: 10 }), GOLD)),
    ...pair(paint(loft(BLADE, { z: -170, w: 46, h: 5, x: 64, y: 4 }, { z: -250, w: 14, h: 3, x: 40, y: 4 }), GOLD_DARK)),
    ...pair(paint(loft(OCTAGON, { z: 250, w: 28, h: 24, x: 87, y: 2 }, { z: 40, w: 18, h: 16, x: 70, y: 4 }), GOLD)),
    ...pair(paint(loft(OCTAGON, NACELLE_CAP, { z: 250, w: 28, h: 24, x: 87, y: 2 }, 'back'), GOLD_DARK)),
    ...driveBells([GOLD_DARK, GOLD, GOLD_SOOT], GOLD_DARK),
    ...thrusters.housings,
    ...thrusters.nozzles,
  ];
  // the trim high on the arrowhead's flanks, above the wings and the nacelles, and across its stern
  const trim = lightStrips(flankLine(SOVEREIGN_BODY, 0.5, -340, 250), { width: 100, y: 20, z: 250 });
  // the delta wings are its radiators, hottest at their roots towards the trailing edge
  const radiators = pair(radiator(BLADE, SOVEREIGN_WING[0], SOVEREIGN_WING[1], (p) => THREE.MathUtils.smoothstep(p.z, -40, 230) * (1 - 0.6 * THREE.MathUtils.smoothstep(Math.abs(p.x), 90, 270))));
  const coats: Coat[] = [
    { parts, wear: GIFT, seed: 7 },
    { parts: gold, wear: GILDED, seed: 8, look: { clearcoat: GOLD_LACQUER } },
  ];
  return hull(original, 'sovereignHull', coats, trim, radiators);
}

/**
 * The Sovereign's wear: a gift of the President, kept like new; a few scratches, its number in
 * gold. Its plates are flush, welded and bonded with thin, crisp panel lines, and not a rivet
 * (a technique of the age of steam): its only fasteners are flush bolts on a few hatches.
 */
export const GIFT: Wear = { rust: 0, chips: 0.05, grime: 0.1, scratches: 0.2, seams: 0.3, stencils: ['01'], roughness: 0.3, metalness: 0.6, relief: 'flush' };
/**
 * Its gold: polished metal, brushed along its length and engraved in bands of interlaced waves
 * and the regime's stars (see engraving in view/surfaces), barely touched. Gold needs no paint and
 * takes only a thin lacquer (GOLD_LACQUER), so its own shine shows.
 */
const GILDED: Wear = { rust: 0, chips: 0, grime: 0.06, scratches: 0.15, seams: 0.3, stencils: [], roughness: 0.36, metalness: 0.85, relief: 'engraved' };
const GOLD_LACQUER = 0.2;

/**
 * The alien skin: a deep violet-black, light enough that its scales still show where the sun
 * does not reach, and a lighter sheen on its blades and needle.
 */
const VOID = 0x262030;
const VOID_SHEEN = 0x3c3452;
const VEIN = new THREE.Color(0.1, 1, 0.75).multiplyScalar(1.5);
/** The faint glow along a few scales' rims, the life support's finest vessels (linear; its map says where, see scales in view/surfaces). */
const CAPILLARY = new THREE.Color(0.1, 1, 0.75).multiplyScalar(0.25);
/**
 * The film over the alien skin: a thin layer that plays in colors as the angle changes, as oil on
 * water or a beetle's shell, between violet, green and gold (thicknesses in nanometers); the
 * picture's quality takes it off with the lacquer (see setLacquer). The skin mirrors the sky
 * twice as strongly as painted plates, so the film and the scales show on the side away from
 * the sun too.
 */
const FILM: THREE.MeshPhysicalMaterialParameters = { iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [280, 620], envMapIntensity: 2 * SHEEN };
/** The skin's faint glow along its outline, violet (linear; see hullShader): a dark hull keeps its shape against the black of space. */
const SKIN_GLOW = new THREE.Color(0.16, 0.08, 0.3);

/** The alien interceptor's inner side blade, from its trailing edge to its leading edge (the right one). */
const ALIEN_FIN: [End, End] = [{ z: 200, w: 70, h: 10, x: 60, y: -30 }, { z: 0, w: 40, h: 6, x: 60, y: -20 }];

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
    ...pair(paint(loft(BLADE, ...ALIEN_FIN), VOID)),
    // the drive pods, open at the stern, black with soot inside
    ...pair(paint(loft(OCTAGON, { z: 410, w: 18, h: 18, x: 104, y: -44 }, { z: 280, w: 16, h: 16, x: 104, y: -44 }, 'back'), VOID)),
    ...pair(sooty(loft(OCTAGON, { z: 410, w: 16, h: 16, x: 104, y: -44 }, { z: 385, w: 13, h: 13, x: 104, y: -44 }, 'back'))),
    ...Object.values(thrusterQuads(THRUSTER_LAYOUTS.alien, VOID_SHEEN, VOID, VOID)).flat(),
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
  // the inner side blades are its radiators, hottest at the body
  const radiators = pair(radiator(BLADE, ALIEN_FIN[0], ALIEN_FIN[1], (p) => 1 - 0.7 * THREE.MathUtils.smoothstep(Math.abs(p.x), 60, 130)));
  return hull(original, 'alienHull', [{ parts, wear: SCARRED, seed: 23, look: FILM, glow: CAPILLARY, rim: SKIN_GLOW }], trim, radiators, { parts: veins, color: VEIN });
}

/** The alien interceptor's wear: a grown skin of fine scales, scored by countless fights, never rusting. */
const SCARRED: Wear = { rust: 0, chips: 0.25, grime: 0.35, scratches: 0.9, seams: 0.6, stencils: [], roughness: 0.35, metalness: 0.55, relief: 'scales' };
