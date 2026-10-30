import * as THREE from 'three';
import { Randomizer } from '../random';
import type { ImpostorGlow } from '../view/impostor';
import {
  bakeCube,
  cachedRelief,
  DETAIL_RES,
  Noise,
  patchRelief,
  pitCell,
  pitDistance,
  pitGrid,
  rockRecipe,
  samplerNormal,
  shapeImpostor,
  stampTile,
  surfaceSample,
  tileNoise,
  tileTexture,
  type Crater,
  type ReliefSampler,
  type ReliefTexel,
  type RockRecipe,
  WHOLE_SHAPE,
} from './rocks';

/**
 * Ice: the chunks of the Rings of Saturn, water ice as Saturn's ring particles are. Each is a
 * rock shape (the same mesh and the same measured surface, so it collides exactly as that rock
 * would, see world/surface), but shaded with a relief map of its own (see iceSample): rounded
 * masses under a porous frost crust, a few soft impacts and sublimation pits, flat glassy
 * fracture planes where the chunk split, fine crack networks, dirty bands and specks of
 * silicate dust. Its material answers like ice (see ICE_RAMP, ICE_FRAGMENT): cool white, glossy
 * where it broke, blue in its cracks, sunlight coming through its thin parts and its side away
 * from the sun, and frost grains glittering as the chunk turns or the pilot flies past.
 */

/** Fixed seed of the ice's own relief: every browser bakes the same ice. */
const ICE_SEED = 1610;

/**
 * The kinds of ice surface, as the relief map's alpha holds them: one ramp, ordered so that
 * what lies side by side on a chunk lies side by side on it (a crack in a glassy face, a glassy
 * face in the frost, dust in the frost), as the map's filtering and mipmaps blend neighbours.
 */
export const ICE_KIND = { fracture: 0, glass: 0.25, frost: 0.5, dusty: 0.75, dust: 1 } as const;

/** How one kind of ice looks (see ICE_RAMP). */
interface IceLook {
  /** Multiplied onto ICE_COLOR (linear RGB). */
  tint: [number, number, number];
  roughness: number;
  /** How much of the sunlight that reaches it through the chunk comes out (0..1). */
  through: number;
  /** How much its frost grains glitter (0..1). */
  frost: number;
}

/**
 * The kinds of ICE_KIND in order: a fracture's depths deep blue and lit from within; a fresh
 * fracture plane clear and glossy, a little blue; the frost crust white, rough and glittering;
 * frost with dust; the dark silicate dust a ring particle carries.
 */
export const ICE_RAMP: IceLook[] = [
  { tint: [0.22, 0.5, 1], roughness: 0.3, through: 1, frost: 0 },
  { tint: [0.72, 0.86, 1], roughness: 0.14, through: 0.75, frost: 0.15 },
  { tint: [1, 1, 1], roughness: 0.62, through: 0.35, frost: 1 },
  { tint: [0.74, 0.71, 0.67], roughness: 0.75, through: 0.15, frost: 0.45 },
  { tint: [0.3, 0.27, 0.24], roughness: 0.88, through: 0, frost: 0 },
];

/** The ice's color (a slightly cool white) and its cold glow in the shadow, up close and as a billboard alike. */
const ICE_COLOR = 0xf2f7ff;
const ICE_EMISSIVE = 0x0d1a2e;

/** How much of the shape's small crags the ice's relief keeps: little, frost and sublimation round them off. */
const ICE_CRAGS = 0.15;

/** A plane where the chunk split (template units): the surface beyond `cut` from the center along `normal` lies flat on it. */
interface Facet {
  normal: THREE.Vector3;
  cut: number;
}

/** A pit in the ice: an impact (a bowl with a soft rim, clean ice in it) or a sublimation pit (a soft hollow, its floor dark with the dust the vanished ice left). */
interface IcePit extends Crater {
  impact: boolean;
}

/** A dirty band through a chunk, a layer of dust frozen in: the points `|dot(p, normal) − offset| < width` (shares of the mean semi-axis). */
interface Band {
  normal: THREE.Vector3;
  offset: number;
  width: number;
}

/** The ice's own relief of a shape (see iceSample), drawn from the ice's seed. */
interface IceRelief {
  facets: Facet[];
  pits: IcePit[];
  grid: Map<number, IcePit[]>;
  band: Band | null;
  meanAxis: number;
  /** The noise level above which a speck of dust lies (higher: fewer). */
  specks: number;
}

/** How deep a fracture plane cuts below the shape's highest point along it (shares of the mean semi-axis): shallow, so the flat face never strays far from the drawn mesh's outline. */
const FACET_DEPTH: [number, number] = [0.035, 0.085];

const reliefs = new Map<number, IceRelief>();

const randomDirection = (r: Randomizer) => new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();

/** The fixed ice relief of a shape (see IceRelief), the same on every call and every browser. */
function iceRelief(index: number): IceRelief {
  let relief = reliefs.get(index);
  if (relief) return relief;
  const recipe = rockRecipe(index);
  const noise = new Noise(recipe.noiseSeed);
  const { axes } = recipe;
  const meanAxis = (axes.x + axes.y + axes.z) / 3;
  const r = new Randomizer(ICE_SEED * 7919 + index * 6151);
  // the shape's surface at a spread of directions, to find how far it reaches along a plane's normal
  const probes = Array.from({ length: 600 }, () => {
    const d = randomDirection(r);
    const bump = surfaceSample(noise, recipe, d, ICE_CRAGS).bump;
    return d.multiply(axes).multiplyScalar(1 + bump);
  });
  const facets: Facet[] = [];
  const facetCount = 2 + (r.nextInt() % 3);
  for (let i = 0; i < facetCount; i++) {
    const normal = randomDirection(r);
    let reach = 0;
    for (const p of probes) reach = Math.max(reach, p.dot(normal));
    facets.push({ normal, cut: reach - r.range(...FACET_DEPTH) * meanAxis });
  }
  const pits: IcePit[] = [];
  const hollows = 16 + (r.nextInt() % 14);
  for (let i = 0; i < hollows; i++) {
    const width = r.range(0.05, 0.15);
    pits.push({ center: randomDirection(r), width, depth: width * r.range(0.12, 0.22), impact: false });
  }
  const impacts = 2 + (r.nextInt() % 4);
  for (let i = 0; i < impacts; i++) {
    const width = r.range(0.04, 0.11);
    pits.push({ center: randomDirection(r), width, depth: width * r.range(0.2, 0.3), impact: true });
  }
  const band = r.nextFloat() < 0.7 ? { normal: randomDirection(r), offset: r.range(-0.5, 0.5), width: r.range(0.03, 0.07) } : null;
  relief = { facets, pits, grid: pitGrid(pits, 1.3), band, meanAxis, specks: r.range(0.6, 0.68) };
  reliefs.set(index, relief);
  return relief;
}

/** The fracture planes of an ice shape (see Facet): what a test checks the baked map's flat faces against. */
export function iceFacets(index: number): readonly Facet[] {
  return iceRelief(index).facets;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The ice's surface at a direction (unit vector): `bump` how far it reaches (as the rock's, see
 * surfaceSample) and `value` its kind (see ICE_KIND). Rounded masses (the shape's lumps with
 * few of its crags) under a lumpy frost crust; sublimation pits, their floors dark with the dust
 * the vanished ice left behind, and a few impacts with clean ice in them; specks of dust on the
 * surface; fracture planes, flat and glassy, younger than all of that; a dirty band frozen into
 * the ice, showing on the frost and the fracture planes alike; and over all, crack networks,
 * denser in the fracture planes, their depths blue.
 */
function iceSample(noise: Noise, recipe: RockRecipe, relief: IceRelief, d: THREE.Vector3, out: { bump: number; value: number }) {
  let bump = surfaceSample(noise, recipe, d, ICE_CRAGS).bump;
  // the frost crust: porous and lumpy
  const grain = noise.sample(d.x * 30 + 13.7, d.y * 30 - 41.3, d.z * 30 + 77.1);
  bump += 0.0025 * grain;
  let kind: number = ICE_KIND.frost + 0.04 * grain;
  let dust = 0;

  const pits = relief.grid.get(pitCell(d.x, d.y, d.z));
  if (pits) {
    for (const pit of pits) {
      const t = pitDistance(d, pit);
      if (t >= 1.3) continue;
      if (pit.impact) {
        if (t < 1) {
          bump += pit.depth * (t * t - 1) + pit.depth * 0.2 * t * t * t * t;
          kind += (ICE_KIND.glass + 0.1 - kind) * 0.6 * (1 - t * t);
        } else {
          const rim = (1.3 - t) / 0.3;
          bump += pit.depth * 0.2 * rim * rim;
        }
      } else if (t < 1) {
        const k = (1 - t * t) * (1 - t * t);
        bump -= pit.depth * k;
        dust = Math.max(dust, 0.45 * k);
      }
    }
  }
  const speck = noise.sample(d.x * 44 + 5.3, d.y * 44 + 91.7, d.z * 44 - 23.9) - relief.specks;
  if (speck > 0) dust = Math.max(dust, Math.min(0.8, speck * 10));
  kind += (ICE_KIND.dust - kind) * dust * 0.9;

  // fracture planes: the surface beyond a plane lies on it
  const ex = d.x * recipe.axes.x, ey = d.y * recipe.axes.y, ez = d.z * recipe.axes.z;
  let glass = false;
  for (const facet of relief.facets) {
    const along = ex * facet.normal.x + ey * facet.normal.y + ez * facet.normal.z;
    if (along <= 0) continue;
    const flat = facet.cut / along - 1;
    if (bump > flat) {
      bump = flat;
      glass = true;
    }
  }
  if (glass) kind = ICE_KIND.glass + 0.03 * grain;

  const px = ex / relief.meanAxis, py = ey / relief.meanAxis, pz = ez / relief.meanAxis;
  const { band } = relief;
  if (band) {
    const q = Math.abs(px * band.normal.x + py * band.normal.y + pz * band.normal.z + 0.05 * noise.sample(px * 3 + 7.1, py * 3 - 2.2, pz * 3 + 4.4) - band.offset) / band.width;
    if (q < 1) {
      const patchy = clamp01(noise.sample(px * 2.2 - 9.1, py * 2.2 + 3.3, pz * 2.2 + 8.8) * 2 + 0.7);
      kind += (ICE_KIND.dusty + 0.1 - kind) * (1 - q * q) * patchy;
    }
  }

  // cracks: the zero crossings of a noise make a network, a second noise lets them run out; the fracture planes crazed finer yet
  let crack = 0;
  const n = noise.fractal(d.x * 5.5 + 31.3, d.y * 5.5 - 17.1, d.z * 5.5 + 2.9, 2);
  const a = Math.abs(n) / 0.028;
  if (a < 1) crack = (1 - a) * (1 - a) * clamp01(noise.sample(d.x * 2.1 + 61.7, d.y * 2.1 - 5.9, d.z * 2.1 + 19.3) * 3 + 0.4);
  if (glass) {
    const b = Math.abs(noise.sample(d.x * 14 - 3.7, d.y * 14 + 8.1, d.z * 14 + 50.5)) / 0.07;
    if (b < 1) crack = Math.max(crack, 0.8 * (1 - b) * (1 - b));
  }
  bump -= 0.005 * crack;
  kind += (ICE_KIND.fracture - kind) * crack;
  out.bump = bump;
  out.value = clamp01(kind);
  return out;
}

/** An ice shape's surface as its relief map shows it (see iceSample). */
function iceSampler(index: number): ReliefSampler {
  const recipe = rockRecipe(index), relief = iceRelief(index), noise = new Noise(recipe.noiseSeed);
  return (direction, out) => iceSample(noise, recipe, relief, direction, out);
}

/** The six faces of an ice shape's relief map: as a rock's (see world/rocks, reliefMap), its alpha the kind of ice (see ICE_KIND). Baked by the same workers. */
export function bakeIceRelief(index: number): Uint8Array[] {
  return bakeCube(rockRecipe(index).axes, iceSampler(index));
}

/** An ice shape's relief map (see bakeIceRelief). */
export function iceReliefMap(index: number): THREE.CubeTexture {
  return cachedRelief('ice', index, bakeIceRelief);
}

/** The surface normal of an ice shape as its relief map holds it, from finite differences `step` (radians) to either side: what a test reads the baked map against. */
export function iceNormal(index: number, direction: THREE.Vector3, step: number): THREE.Vector3 {
  return samplerNormal(rockRecipe(index).axes, iceSampler(index), direction, step);
}

/** The ice's surface of a shape at a direction as its relief map holds it (see iceSample): how far it reaches, and its kind (see ICE_KIND). */
export function iceTexel(index: number, direction: THREE.Vector3): ReliefTexel {
  return iceSampler(index)(direction, { bump: 0, value: 0 });
}

let detailTexture: THREE.DataTexture | undefined;

/**
 * The detail every ice chunk shares up close, one tile that repeats seamlessly (as a rock's,
 * see world/rocks, detailMap): the frost crust's grain, small fractures (their lines a groove,
 * their kind shifted towards a fracture's blue) and tiny sublimation pits. Its b holds a shift of
 * the kind of ice (0.5 none), its mean 0.5 and its mean slope none, so it fades out with distance
 * unseen.
 */
export function iceDetailMap(): THREE.DataTexture {
  if (detailTexture) return detailTexture;
  const R = DETAIL_RES;
  const height = new Float32Array(R * R);
  const shift = new Float32Array(R * R);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const k = y * R + x;
      const grain = tileNoise(x, y, 128, 31);
      height[k] = 0.8 * grain + 0.5 * tileNoise(x, y, 64, 37) + 1.4 * tileNoise(x, y, 16, 41);
      shift[k] = 0.06 * grain;
      // small fractures: where a noise crosses zero, running out where a second one says
      const line = Math.abs(tileNoise(x, y, 8, 43) + 0.5 * tileNoise(x, y, 16, 47)) / 0.05;
      if (line < 1) {
        const crack = (1 - line) * (1 - line) * clamp01(tileNoise(x, y, 4, 53) * 2.5 + 0.3);
        height[k] -= 2.2 * crack;
        shift[k] -= 0.4 * crack;
      }
    }
  }
  const r = new Randomizer(ICE_SEED * 31 + 7);
  for (let n = 0; n < 140; n++) {
    const radius = 1.5 + 6 * r.nextFloat() * r.nextFloat();
    const cx = r.nextFloat() * R, cy = r.nextFloat() * R;
    stampTile(cx, cy, radius, 1, (k, t) => {
      const hollow = (1 - t * t) * (1 - t * t);
      height[k] -= radius * 0.3 * hollow;
      shift[k] += 0.12 * hollow;
    });
  }
  let mean = 0;
  for (const s of shift) mean += s / shift.length;
  for (let k = 0; k < shift.length; k++) shift[k] = 0.5 + shift[k] - mean;
  detailTexture = tileTexture(height, shift);
  return detailTexture;
}

/** How strongly the ice's detail tile tilts its normal up close: gentler than a rock's, frost fills it. */
const ICE_DETAIL = 0.7;
/**
 * The frost grains that glitter (template units, 2 m on the template, 1 to 5 m on a chunk of the
 * field): one may sit in each cell of this edge, a dot of a pixel or two that lights up where
 * its crystal face mirrors the sun to the eye; a cell smaller on screen than about six pixels
 * shows none, so far chunks never crawl.
 */
const ICE_GLINT_CELL = 40;
/** How bright a frost grain's glint is, a share of the sun's light: well over white, so the bloom catches it. */
const ICE_GLINT = 20;
/** How sharply a grain's face mirrors the sun (the exponent of its lobe): a few grains of a chunk light up at a time. */
const ICE_GLINT_SHARPNESS = 70;
/** How fast sunlight dies in the ice, by color, per mean radius it travels through it: red first, so what comes through is blue. */
const ICE_EXTINCTION = [9, 5, 3.2];
/** How much of the sunlight coming through a chunk scatters out every way, and how much more comes out towards an eye looking into the sun through it. */
const ICE_SCATTER = 0.1;
const ICE_FORWARD = 1.5;

const glsl = (v: number) => v.toFixed(4);
const glslVec = (v: readonly number[]) => `vec3( ${v.map(glsl).join(', ')} )`;

/** The kind of ice a fresh fracture face of a piece shows (see ICE_KIND, world/fracture): clear glassy ice, the break tile's grain shifting it a little towards a fracture's blue or the frost's white. */
const ICE_BREAK = 0.2;
/** How much a fresh fracture face glitters, as the frost's grains do (0..1): its crystal faces catch the sun. */
const ICE_BREAK_GLINT = 0.6;
/** How deep (mean radii) the light comes through the piece behind a fracture face that looks away from the sun. */
const ICE_BREAK_DEPTH = 0.3;
/** How strongly the break tile tilts a fracture face of ice: gentler than rock's, ice breaks smoother. */
const ICE_BREAK_STRENGTH = 0.6;

const ICE_PARS = /* glsl */ `
uniform float iceMeanAxis;
const vec3 ICE_TINT[ 5 ] = vec3[ 5 ]( ${ICE_RAMP.map((k) => glslVec(k.tint)).join(', ')} );
const vec3 ICE_RESPONSE[ 5 ] = vec3[ 5 ]( ${ICE_RAMP.map((k) => glslVec([k.roughness, k.through, k.frost])).join(', ')} );
float iceRoughness;
float iceThrough;
vec3 iceFacet;
float iceSpot;
vec3 iceHash( vec3 p ) {
	p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
	p += dot( p, p.yxz + 33.33 );
	return fract( ( p.xxy + p.yxx ) * p.zyx );
}
`;

/** The kind of ice (the tile's shift on it up close; on a piece's fracture face clear, glassy ice) worked into the color, and how it answers the light (ICE_RESPONSE): what the meshes and the billboards (see iceImpostor) paint alike. */
const ICE_TINT_CHUNK = /* glsl */ `
	float iceKind = clamp( mix( reliefTexel.a + ( reliefTile - 0.5 ) * reliefNear, ${glsl(ICE_BREAK)} + ( reliefBreak - 0.5 ) * 0.5, reliefFracture ), 0.0, 1.0 );
	float iceStep = iceKind * 4.0;
	int iceAt = int( min( floor( iceStep ), 3.0 ) );
	float iceMix = iceStep - float( iceAt );
	diffuseColor.rgb *= mix( ICE_TINT[ iceAt ], ICE_TINT[ iceAt + 1 ], iceMix );
	vec3 iceResponse = mix( ICE_RESPONSE[ iceAt ], ICE_RESPONSE[ iceAt + 1 ], iceMix );
`;

/**
 * The kind of ice worked into the color (see ICE_TINT_CHUNK), its roughness and
 * how much light it lets through; and the frost grain of this pixel's cell, fixed on the chunk:
 * where it sits, the face it mirrors with (see ICE_DIRECT), how much of its dot this pixel shows.
 */
const ICE_COLOR_CHUNK = /* glsl */ `
	${ICE_TINT_CHUNK}
	iceRoughness = iceResponse.x;
	iceThrough = iceResponse.y;
	vec3 iceCells = vRockPosition / ${glsl(ICE_GLINT_CELL)};
	vec3 iceCell = floor( iceCells );
	float icePixel = length( fwidth( iceCells ) );
	// the grain lies where the surface passes its cell: its offset measured across the surface only
	vec3 iceOff = iceCells - ( iceCell + 0.25 + 0.5 * iceHash( iceCell ) );
	vec3 iceUp = normalize( vRockFacing );
	iceOff -= dot( iceOff, iceUp ) * iceUp;
	iceSpot = smoothstep( 2.0 * icePixel, 0.7 * icePixel, length( iceOff ) ) * smoothstep( 0.17, 0.08, icePixel ) * mix( iceResponse.z, ${glsl(ICE_BREAK_GLINT)}, reliefFracture );
	vec3 iceFace = normalize( reliefNormal + ( iceHash( iceCell + 17.0 ) - 0.5 ) * 1.4 );
	iceFacet = normalize( normalMatrix * ( mat3( vRockTurnX, vRockTurnY, vRockTurnZ ) * iceFace ) );
`;

/** Every light as for any material, and a frost grain's glint where its face mirrors the light to the eye, in its shadow none. */
const ICE_DIRECT = /* glsl */ `
void RE_Direct_Ice( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	float lit = saturate( dot( geometryNormal, directLight.direction ) );
	float mirror = pow( saturate( dot( iceFacet, normalize( directLight.direction + geometryViewDir ) ) ), ${glsl(ICE_GLINT_SHARPNESS)} );
	reflectedLight.directSpecular += directLight.color * vec3( 0.92, 0.97, 1.0 ) * ( ${glsl(ICE_GLINT)} * lit * iceSpot * mirror );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Ice
`;

/**
 * Sunlight through the ice: the way it travels through the chunk to this point, taken on the
 * chunk's ellipsoid towards the sun (none on its sunlit side), dims it, red first; so the thin
 * rim behind the terminator glows and thick ice stays dark, and a chunk with the sun behind it
 * shines blue along its edges and its cracks. Not shadowed: the chunk itself would shadow it.
 */
const ICE_THROUGH = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
	{
		vec3 iceToSun = directionalLights[ 0 ].direction;
		vec3 iceSun = normalize( transpose( mat3( vRockTurnX, vRockTurnY, vRockTurnZ ) ) * ( transpose( normalMatrix ) * iceToSun ) );
		vec3 iceFrom = vRockPosition / reliefAxes;
		iceFrom /= max( length( iceFrom ), 1e-4 );
		vec3 iceWay = iceSun / reliefAxes;
		float iceDepth = -2.0 * dot( iceFrom, iceWay ) / dot( iceWay, iceWay ) / iceMeanAxis;
		// a piece's fracture face lies inside the whole chunk's ellipsoid: what lights it through is the piece behind it, a thin share of the chunk where the face looks away from the sun
		iceDepth = mix( iceDepth, ${glsl(ICE_BREAK_DEPTH)} * step( dot( normalize( vRockFacing ), iceSun ), 0.0 ), reliefFracture );
		vec3 iceCame = exp( -iceDepth * ${glslVec(ICE_EXTINCTION)} ) * smoothstep( 0.0, 0.06, iceDepth );
		float iceForward = pow( saturate( dot( geometryViewDir, -iceToSun ) ), 6.0 );
		reflectedLight.directDiffuse += directionalLights[ 0 ].color * diffuseColor.rgb * iceCame * iceThrough * ( ${glsl(ICE_SCATTER)} + ${glsl(ICE_FORWARD)} * iceForward );
	}
#endif
`;

/**
 * An ice shape's material: its own relief map and, up close (`closeUp`), its own detail tile
 * (see patchRelief), its response by the kind of ice (ICE_RAMP), the glitter of its frost and the
 * sunlight through it. One material per shape, for its own map; `piece` for the pieces of a broken chunk (see world/fracture), whose fracture faces show clear, glassy ice.
 */
export function iceMaterial(index: number, closeUp: boolean, piece = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ ...iceSurface(), emissive: ICE_EMISSIVE, emissiveIntensity: 1 });
  const { axes } = rockRecipe(index);
  patchRelief(material, {
    kind: 'ice',
    piece,
    breakStrength: ICE_BREAK_STRENGTH,
    map: iceReliefMap(index),
    axes: axes.clone(),
    detail: closeUp ? iceDetailMap() : null,
    strength: ICE_DETAIL,
    uniforms: { iceMeanAxis: { value: (axes.x + axes.y + axes.z) / 3 } },
    pars: ICE_PARS,
    color: ICE_COLOR_CHUNK,
    fragment: (source) =>
      source
        .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${ICE_DIRECT}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = iceRoughness;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${ICE_THROUGH}`),
  });
  return material;
}

/** What the ice's standard material is made of, its meshes' and its billboards' alike (its roughness the meshes then take by the kind of ice, see ICE_COLOR_CHUNK). */
const iceSurface = () => ({ color: new THREE.Color(ICE_COLOR), roughness: 1, metalness: 0 });

/** What an ice billboard glows with besides its color (see view/impostor): the mesh's glow, and the sunlight through it, blue. */
const ICE_GLOW: ImpostorGlow = { emissive: ICE_EMISSIVE, translucent: new THREE.Color(0.03, 0.09, 0.2) };

/** A billboard of an ice shape (see world/rocks, shapeImpostor): the rock's silhouette, painted from the ice's own relief map as its meshes paint it (ICE_TINT_CHUNK). */
export function iceImpostor(index: number): THREE.Mesh {
  const impostor = shapeImpostor(index, { ...iceSurface(), relief: iceReliefMap(index), pars: ICE_PARS, chunk: WHOLE_SHAPE + ICE_TINT_CHUNK, glow: ICE_GLOW });
  impostor.name = `ice-impostor-${index}`;
  return impostor;
}
