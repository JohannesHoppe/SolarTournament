import * as THREE from 'three';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { ARENAS, HOLE_RADIUS, KESSLER_WORLD, SATURN_CENTER, sternAt, type ArenaId, type ArenaProfile } from './arenas';
import { canvas, toTexture } from '../view/textures';
import { loadPlanetMap, type Planet, type PlanetMaps } from '../assets';
import { Jupiter } from './jupiter';

/**
 * What an arena shows beyond its field: Saturn, whose ring the arena lies in, the planet below
 * the Kessler field, Jupiter, the sun up close, the black hole with its disk, the neon sign
 * on the derelict. Scenery only; what pulls and blocks is the field's well.
 */

/** Saturn's radius (units); it lies at SATURN_CENTER, its ring runs through the arena. */
const SATURN_RADIUS = 90000;
/** The ring around it, from the inner edge of its faint inner ring to the outer edge of its outer bright one (units). */
const RING_INNER = 150000;
const RING_OUTER = 330000;
/** The ring's sheet fades in between these distances from the pilot (units, 1.5 to 6 km). */
const RING_FADE_NEAR = 30000;
const RING_FADE_FAR = 120000;
/**
 * Specks of ice in the ring around the pilot: so many in a square of the ring's plane ICE_SLAB
 * to each side of the pilot (units, 1.6 km), which moves along with the pilot (a speck left
 * behind comes back on the far side, faded in and out at the square's edge), ICE_THICKNESS above
 * and below the plane (units, 125 m, the field's sheet). Dense enough that a rock's or a ship's
 * shadow shows as a dark lane through them.
 */
const ICE_SPECKS = 16000;
const ICE_SLAB = 32000;
const ICE_THICKNESS = 2500;
/** A speck's size (units, 3 m), drawn at no less than a pixel and no more than ICE_SPECK_PIXELS (device px), so one passing close by stays a speck. */
const ICE_SPECK_SIZE = 60;
const ICE_SPECK_PIXELS = 6;
/**
 * The ice crystals that catch the sun in the ring's sheet: one in a cell of this edge (units,
 * 20 m) may glint; cells smaller on screen than a few pixels show none, so the glitter never
 * crawls or shimmers in the distance.
 */
const GLINT_CELL = 400;
/**
 * Jupiter shows only the cap around the point below the arena, this far around (rad, 35°):
 * its horizon lies within 23° for a ship at the arena's top edge, 3.4 km over the deck.
 */
const JUPITER_CAP = 0.62;
/**
 * The arena hangs over this latitude of Jupiter (rad, 13° south), between its southern
 * belts, so they run across the view; its great red storm (on the map at 20° south) lies some
 * 6 km off to the south and east.
 */
const JUPITER_LATITUDE = -0.22;
/** Where the map's longitude 0 lies (a share of a turn): the great storm, at 0.3625 on the map, 0.1 rad east of the point below the arena. */
const JUPITER_LONGITUDE = 0.3625 + 0.1 / (2 * Math.PI);
/** Up to this distance (units, 12.5 km) Jupiter's clouds show fine detail beyond its map's texels (see gasFragment). */
const JUPITER_FINE_REACH = 250000;
/** The light a planet's lit side gets on top of the arena's sun (the sky's faint glow), a share of the sun's. */
const PLANET_AMBIENT = 0.02;
/** The sun of the corona arena: a sphere this large at this distance (units). */
const CORONA_RADIUS = 62000;
const CORONA_DISTANCE = 240000;
/** The black hole's disk: from and to (units, 300 m to 1.4 km). */
const DISK_INNER = 6000;
const DISK_OUTER = 28000;
/**
 * Segment counts Jupiter's cap is built at (width, height), from the full picture down:
 * its bands and storms are its map and a per-pixel pattern in the fragment shader (see
 * gasFragment), not geometry, so the mesh only has to stay round enough that its smooth-shaded curvature does not
 * facet; the cap itself (see JUPITER_CAP) spans only a thin band of latitude, which the height
 * count already concentrates there.
 */
const JUPITER_SEGMENTS: readonly [width: number, height: number][] = [
  [256, 96],
  [128, 48],
  [64, 24],
];

/** Smooth value noise in 3D for the shaders of planets, suns and the solar flare (visuals only, so float hashing is fine). */
export const noise3 = /* glsl */ `
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

export const bandsVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vLocal = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vView = -view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;

/**
 * Noise in octaves (fractal Brownian motion) over noise3: the first three octaves always, the
 * finer ones weighed by `fine`, so detail that would only shimmer far off fades out there.
 */
export const fbm = /* glsl */ `
  float fbm(vec3 p, float fine) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= 3 && fine <= 0.0) break;
      sum += amplitude * (i < 3 ? 1.0 : fine) * noise(p);
      p = p * 2.03 + 17.1;
      amplitude *= 0.5;
    }
    return sum;
  }
`;

/** A planet's vertex shader for the shaders below: its own point (for the pattern), its normal and position in the world (for light and view). */
const planetVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * A gas planet's clouds from its map (cylindrical: longitude across, latitude up, in the planet's
 * own frame, turned by `frame` and slowly spinning east). The map is sampled by the longitude
 * whose change across the pixel is smaller of two that wrap at opposite sides, so its seam never
 * shows as a line. Within `reach` of the pilot (Jupiter, flown just above its tops), eddies
 * finer than the map's texels bend the map's clouds a few texels and draw them out into streaks
 * and grain, drifting with the winds. Lit by the arena's sun (`light`: its color and strength,
 * Lambert's diffuse light), with a soft terminator where the upper air scatters it red; on the
 * night side lightning in the storms and aurora over the poles (`storms`); haze along the limb.
 * With RING, the ring's shadow: the way from the cloud tops to the sun crosses the ring's plane
 * (through `center`, square to world y) and loses what the ring's opacity there holds back.
 */
const gasFragment = /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  uniform vec3 light;
  uniform mat3 frame;
  uniform sampler2D map;
  uniform float texel;
  uniform float longitude;
  uniform float reach;
  uniform vec3 haze;
  uniform float storms;
  #ifdef RING
  uniform sampler2D ring;
  uniform vec3 center;
  uniform vec2 radii;
  #endif
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  ${noise3}
  ${fbm}
  void main() {
    vec3 p = normalize(frame * vLocal);
    float spin = time * 0.0004;
    vec3 q = vec3(cos(spin) * p.x - sin(spin) * p.z, p.y, sin(spin) * p.x + cos(spin) * p.z);
    float fine = reach > 0.0 ? clamp(1.0 - distance(cameraPosition, vWorld) / reach, 0.0, 1.0) : 0.0;
    float lat = asin(clamp(q.y, -1.0, 1.0));
    // the angle grows westward, the map's longitude eastward (as seen from outside, north up)
    vec2 uv = vec2(longitude - atan(q.z, q.x) / 6.2831853, 0.5 + lat / 3.14159265);
    float detail = 1.0;
    if (fine > 0.0) {
      // eddies finer than the map's texels curl its clouds and drift with the winds
      float swirl = fbm(q * 40.0 + vec3(0.0, 0.0, time * 0.001), 1.0);
      float eddies = fbm(q * 160.0 + vec3(swirl * 6.0, 0.0, time * 0.002), fine);
      uv += (vec2(swirl, eddies) - 0.5) * texel * 3.0 * fine;
      // the winds draw them out along the bands: streaks long in longitude, thin in latitude
      float streaks = fbm(vec3(q.x * 50.0, (lat + 0.004 * (eddies - 0.5)) * 1200.0, q.z * 50.0), fine);
      // the grain of the cloud tops, seen from just above them
      float grain = fbm(q * 900.0 + eddies * 3.0, fine);
      detail = mix(1.0, (0.8 + 0.4 * streaks) * (0.75 + 0.5 * grain), fine);
    }
    float east = fract(uv.x);
    float west = fract(uv.x + 0.5) - 0.5;
    uv.x = fwidth(east) <= fwidth(west) ? east : west;
    vec3 color = texture2D(map, uv).rgb * detail;
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 toSun = normalize(sun);
    float facing = dot(n, toSun);
    // the upper air carries a little light past the geometric terminator
    float incidence = clamp((facing + 0.04) / 1.04, 0.0, 1.0);
    // cloud tops scatter the light from within their haze (Lommel-Seeliger's law, 1 for the sun
    // and the eye straight above): at a low sun they keep more light than a solid surface would
    float day = 2.0 * incidence / (incidence + max(dot(n, view), 0.05));
    day = min(day, 1.0) * smoothstep(0.0, 0.08, incidence);
    float shade = 1.0;
    #ifdef RING
    // the ring's shadow: where the way to the sun crosses the ring's plane, and how opaque the ring is there
    float along = (center.y - vWorld.y) / toSun.y;
    float u = (length(vWorld.xz + toSun.xz * along - center.xz) - radii.x) / (radii.y - radii.x);
    shade -= texture2D(ring, vec2(clamp(u, 0.0, 1.0), 0.5)).a * step(0.0, along) * step(0.0, u) * step(u, 1.0);
    #endif
    vec3 lit = color * (light * day * shade + light * ${PLANET_AMBIENT});
    // the terminator glows: sunlight scattered red through the upper air
    // squared by hand: GLSL ES leaves pow() of a negative base (the night side) undefined
    float dusk = facing * 7.0;
    lit += vec3(1.0, 0.45, 0.2) * light * exp(-dusk * dusk) * 0.05 * shade;
    if (storms > 0.0) {
      // lightning flickering in the night side's storms
      vec3 cells = q * 260.0;
      float flash = hash(floor(cells) + floor(time * 4.0));
      float bolt = step(0.9993, flash) * smoothstep(0.5, 0.0, length(fract(cells) - 0.5));
      lit += vec3(0.75, 0.82, 1.0) * bolt * (1.0 - smoothstep(-0.08, 0.3, facing)) * 1.6;
      // aurora over the poles
      float polar = smoothstep(0.82, 0.95, abs(q.y));
      lit += vec3(0.3, 1.0, 0.6) * polar * (0.5 + 0.5 * sin(atan(q.z, q.x) * 20.0 + time * 0.3)) * (1.0 - smoothstep(-0.08, 0.3, facing)) * 0.4;
    }
    // haze along the limb, lit as the clouds below it
    float limb = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    lit = mix(lit, haze * light * (0.1 + 0.8 * day * shade), pow(limb, 4.0) * 0.5);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

/**
 * A world with air and water, worn by the regime: dark oceans with the sun's glint, grey and
 * brown continents, ice at the poles, clouds that drift, and on the night side the orange glow of
 * its sprawling cities; blue haze along the limb.
 */
const worldFragment = /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  ${noise3}
  ${fbm}
  void main() {
    vec3 p = normalize(vLocal);
    float fine = clamp(1.0 - distance(cameraPosition, vWorld) / 600000.0, 0.0, 1.0);
    float height = fbm(p * 3.0 + fbm(p * 6.0, 1.0) * 0.6, fine);
    float land = smoothstep(0.49, 0.52, height);
    float ice = smoothstep(0.78, 0.86, abs(p.y) + (height - 0.5) * 0.2);
    vec3 ocean = mix(vec3(0.02, 0.07, 0.2), vec3(0.04, 0.16, 0.34), smoothstep(0.3, 0.49, height));
    vec3 ground = mix(vec3(0.32, 0.29, 0.24), vec3(0.2, 0.22, 0.17), fbm(p * 30.0, fine));
    vec3 color = mix(mix(ocean, ground, land), vec3(0.9, 0.93, 0.97), ice);
    float clouds = smoothstep(0.56, 0.8, fbm(p * 7.0 + vec3(time * 0.003, 0.0, 0.0) + fbm(p * 14.0, fine), fine));
    color = mix(color, vec3(0.9), clouds * 0.85);
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 toSun = normalize(sun);
    float light = dot(n, toSun);
    float day = smoothstep(-0.05, 0.25, light);
    vec3 lit = color * (0.02 + 0.8 * day);
    // the sun's glint on open water
    lit += vec3(1.0, 0.92, 0.8) * pow(max(dot(reflect(-toSun, n), view), 0.0), 60.0) * (1.0 - land) * (1.0 - clouds) * day * 0.8;
    // the cities at night: the regime never switches off the lights of its sprawl
    float cities = step(0.62, noise(p * 260.0)) * smoothstep(0.55, 0.7, noise(p * 40.0));
    lit += vec3(1.0, 0.6, 0.25) * cities * land * (1.0 - ice) * (1.0 - clouds) * (1.0 - day) * 0.9;
    float limb = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    lit = mix(lit, vec3(0.3, 0.55, 1.0) * (0.1 + 0.8 * day), pow(limb, 3.0) * 0.7);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

/**
 * The surface of a sun up close: boiling cells of plasma, a fine granulation over them, groups of
 * dark sunspots with their paler rims, hotter towards the middle.
 */
const sunFragment = /* glsl */ `
  uniform float time;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  ${noise3}
  void main() {
    vec3 p = normalize(vLocal);
    float cells = noise(p * 14.0 + time * 0.05) * 0.5 + noise(p * 40.0 - time * 0.11) * 0.3 + noise(p * 160.0 + time * 0.3) * 0.2;
    float center = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    vec3 color = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.5), cells * 0.7 + center * 0.5);
    float spots = noise(p * 5.0 + 11.0) * 0.7 + noise(p * 24.0) * 0.3;
    float penumbra = smoothstep(0.7, 0.73, spots);
    float umbra = smoothstep(0.75, 0.78, spots);
    color *= 1.0 - 0.45 * penumbra - 0.45 * umbra;
    // bright enough to bloom, not so bright that the cells and spots wash out to white
    gl_FragColor = vec4(color * (0.75 + 0.55 * center), 1.0);
  }
`;

const diskVertex = /* glsl */ `
  varying vec2 vPlane;
  varying vec3 vToCamera;
  void main() {
    vPlane = position.xy;
    vToCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The black hole's disk: hot gas spiraling in, white-hot at the inner edge, orange and dark further out. */
const diskFragment = /* glsl */ `
  uniform float time;
  uniform float inner;
  uniform float outer;
  varying vec2 vPlane;
  varying vec3 vToCamera;
  ${noise3}
  void main() {
    float r = length(vPlane);
    float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
    float angle = atan(vPlane.y, vPlane.x);
    // the inner gas circles faster: the spiral winds up towards the hole; the streams are drawn
    // on a circle, so they close without a seam
    float spin = angle + time * (0.9 / (0.15 + t));
    vec2 around = vec2(cos(spin), sin(spin));
    float streaks = noise(vec3(around * 6.0, t * 18.0)) * 0.5 + noise(vec3(around * 19.0, t * 50.0)) * 0.3 + noise(vec3(around * 60.0, t * 160.0)) * 0.2;
    float heat = pow(1.0 - t, 2.2);
    vec3 color = mix(vec3(0.9, 0.25, 0.04), vec3(1.0, 0.85, 0.65), heat);
    float fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.6, 1.0, t));
    // dark lanes between the bright streams, so the spiral reads
    float lanes = smoothstep(0.35, 0.75, streaks);
    // where the gas streams towards the pilot it shines brighter and bluer, where it streams away dimmer
    float beaming = dot(vec3(-sin(angle), cos(angle), 0.0), normalize(vToCamera));
    color = mix(color, color * vec3(0.8, 0.9, 1.3), max(beaming, 0.0) * (1.0 - t));
    gl_FragColor = vec4(color * (0.08 + 0.9 * heat) * lanes * fade * (1.0 + 0.5 * beaming), 1.0);
  }
`;

/**
 * What a ShaderMaterial with `lights: true` needs to read the sun's shadow map as three.js's own
 * materials do (`getShadowMask()`: 1 lit, 0 in the shadow of whatever casts one): the vertex
 * stage's declarations, the lines its main runs once `worldPosition` and `mvPosition` are set,
 * and the fragment stage's declarations. On a rung without shadows the renderer leaves
 * USE_SHADOWMAP undefined and the mask is 1 at no cost.
 */
const shadowVertexPars = /* glsl */ `
  #include <common>
  #include <shadowmap_pars_vertex>
`;
const shadowVertex = /* glsl */ `
  #ifdef HAS_NORMAL
    vec3 transformedNormal = normalMatrix * normal;
  #endif
  #include <shadowmap_vertex>
`;
const shadowFragmentPars = /* glsl */ `
  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
`;

/** A lit ShaderMaterial's uniforms: the lights' (filled by the renderer) and its own, which are kept as given (never cloned). */
function litUniforms(own: Record<string, THREE.IUniform>): Record<string, THREE.IUniform> {
  return { ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights), ...own };
}

/**
 * An ice crystal catching the sun: the sun mirrored by a facet of `facet` (a direction) towards
 * the eye, a tight highlight that only shows from a few directions, so it glints and is gone as
 * the pilot moves; still, it never changes with time alone.
 */
const glint = /* glsl */ `
  float glint(vec3 facet, vec3 toSun, vec3 view, float sharpness) {
    return pow(max(dot(normalize(facet), normalize(toSun + view)), 0.0), sharpness);
  }
`;

const ringVertex = /* glsl */ `
  ${shadowVertexPars}
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vWorld = worldPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    ${shadowVertex}
  }
`;

/**
 * Saturn's ring, a sheet in the world's horizontal plane through the planet: its color and
 * opacity from the strip `map`, inner edge to outer. The face the sun shines on scatters the
 * sunlight back; seen from the other face, only what the thin parts let through shows (most
 * where the ring is half opaque, almost none through the dense ring). The planet's shadow: where
 * the way to the sun runs through its sphere, with a soft edge for the sun's disk. Up close the
 * sheet fades out (`near` to `far` from the pilot), and within the sun's shadow map it takes the
 * shadows of everything there (the field's ice, ships, gates, the battleship, a comet). Here and
 * there an ice crystal glints in the sun (see glint, GLINT_CELL).
 */
const ringFragment = /* glsl */ `
  ${shadowFragmentPars}
  uniform sampler2D map;
  uniform float near;
  uniform float far;
  uniform vec3 sun;
  uniform vec3 light;
  uniform vec3 center;
  uniform float radius;
  varying vec2 vUv;
  varying vec3 vWorld;
  ${noise3}
  ${glint}
  void main() {
    vec4 color = texture2D(map, vUv);
    vec3 toSun = normalize(sun);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 toCenter = center - vWorld;
    float along = dot(toCenter, toSun);
    float miss = dot(toCenter, toCenter) - along * along;
    float sunny = 1.0 - step(0.0, along) * smoothstep(radius * radius * 1.03, radius * radius * 0.97, miss);
    sunny *= getShadowMask();
    float front = step(0.0, (cameraPosition.y - vWorld.y) * toSun.y);
    float through = 2.0 * color.a * (1.0 - color.a) + 0.04;
    vec3 lit = color.rgb * light * (mix(through, 1.0, front) * sunny + ${PLANET_AMBIENT});
    // ice crystals: one in some cells, a dot of a pixel or two, only while the cells are large enough on screen
    vec2 cells = vWorld.xz / ${GLINT_CELL.toFixed(1)};
    vec2 cell = floor(cells);
    float pixel = length(fwidth(cells));
    vec2 spot = cell + 0.2 + 0.6 * vec2(hash(vec3(cell, 3.0)), hash(vec3(cell, 4.0)));
    float dot = smoothstep(1.5 * pixel, 0.5 * pixel, length(cells - spot)) * smoothstep(0.4, 0.12, pixel);
    vec3 facet = vec3(hash(vec3(cell, 1.0)) - 0.5, 0.6, hash(vec3(cell, 2.0)) - 0.5);
    lit += vec3(1.0, 0.96, 0.88) * light * 2.5 * dot * step(0.5, hash(vec3(cell, 5.0))) * glint(facet, toSun, view, 80.0) * front * sunny;
    color.a *= smoothstep(near, far, distance(vWorld, cameraPosition));
    gl_FragColor = vec4(lit, color.a);
  }
`;

const speckVertex = /* glsl */ `
  ${shadowVertexPars}
  uniform float size;
  uniform float viewport;
  uniform float slab;
  attribute vec3 facet;
  varying vec3 vFacet;
  varying vec3 vWorld;
  varying float vFade;
  void main() {
    vFacet = facet;
    // the square moves with the pilot: every speck within slab of the camera along the plane
    vec2 offset = mod(position.xz - cameraPosition.xz + slab, 2.0 * slab) - slab;
    vFade = 1.0 - smoothstep(0.7 * slab, slab, max(abs(offset.x), abs(offset.y)));
    vec4 worldPosition = vec4(cameraPosition.x + offset.x, position.y, cameraPosition.z + offset.y, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vWorld = worldPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(size * projectionMatrix[1][1] * viewport * 0.5 / -mvPosition.z, 1.0, ${ICE_SPECK_PIXELS.toFixed(1)});
    ${shadowVertex}
  }
`;

/**
 * A speck of the ring's ice around the pilot: a soft round grain, lit by the sun where nothing
 * stands between it and the sun (the sun's shadow map), its facet glinting when it mirrors the
 * sun towards the eye.
 */
const speckFragment = /* glsl */ `
  ${shadowFragmentPars}
  uniform vec3 sun;
  uniform vec3 light;
  uniform vec3 color;
  varying vec3 vFacet;
  varying vec3 vWorld;
  varying float vFade;
  ${glint}
  void main() {
    vec2 at = gl_PointCoord - 0.5;
    float round = smoothstep(0.25, 0.1, dot(at, at)) * vFade;
    if (round <= 0.0) discard;
    vec3 toSun = normalize(sun);
    float sunny = getShadowMask();
    vec3 lit = color * light * (0.55 * sunny + 0.12) + vec3(1.0, 0.96, 0.88) * light * 2.0 * glint(vFacet, toSun, normalize(cameraPosition - vWorld), 60.0) * sunny;
    gl_FragColor = vec4(lit, round * 0.85);
  }
`;

/** A neon sign: the text as a tube of white with layered glow, on black for additive blending. */
function neonSign(text: string, color: string, glow: string): THREE.Mesh {
  const [element, ctx] = canvas(1024, 256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, element.width, element.height);
  ctx.font = '700 150px Michroma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [blur, style] of [[60, glow], [28, glow], [10, color], [0, '#fff']] as const) {
    ctx.shadowBlur = blur;
    ctx.shadowColor = style;
    ctx.fillStyle = style;
    ctx.fillText(text, element.width / 2, element.height / 2);
  }
  const material = new THREE.MeshBasicMaterial({ map: toTexture(element), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(10000, 2500), material);
}

/** The scenery of every arena, built once; only the one of the arena in play is shown. */
export class Landmarks {
  readonly group = new THREE.Group();
  private readonly scenes = new Map<ArenaId, THREE.Group>();
  private readonly timed: THREE.ShaderMaterial[] = [];
  private readonly flicker: THREE.Mesh[] = [];
  private shown: ArenaId | null = null;
  /** Jupiter's cap, and its geometry at each of JUPITER_SEGMENTS, swapped by setDetail. */
  private jupiterMesh!: THREE.Mesh;
  private readonly jupiterCaps: THREE.BufferGeometry[] = [];
  private jupiterDetail = 0;
  /** Jupiter's deck, its sheets of cloud, its sky and weather (see world/jupiter). */
  jupiter!: Jupiter;
  /** The planets' materials, whose map setDetail swaps between the page's and the sharp one. */
  private readonly planets = new Map<Planet, THREE.ShaderMaterial>();
  /** The sharp maps (see loadPlanetMap), once asked for, and once loaded. */
  private sharpAsked = false;
  private readonly sharp = new Map<Planet, THREE.Texture>();
  private sharpWanted = false;
  /** What the sun gives the planets, the ring and its specks: its color times its strength over π (Lambert's diffuse light), the arena's (see show). */
  private readonly light = new THREE.Color();
  /** The materials of the ring's specks, which size them by the picture's height (see setViewport). */
  private readonly sized: THREE.ShaderMaterial[] = [];

  constructor(private readonly maps: PlanetMaps) {
    this.scenes.set('rings', this.rings());
    this.scenes.set('kessler', this.kessler());
    this.scenes.set('giant', this.jupiterScene());
    this.scenes.set('corona', this.corona());
    this.scenes.set('hole', this.hole());
    this.scenes.set('derelict', this.derelict());
    for (const scene of this.scenes.values()) {
      scene.visible = false;
      this.group.add(scene);
    }
  }

  show(arena: ArenaProfile) {
    if (this.shown === arena.id) return;
    this.shown = arena.id;
    for (const [id, scene] of this.scenes) scene.visible = id === arena.id;
    this.light.set(arena.sun.color).multiplyScalar(arena.sun.intensity / Math.PI);
    if (arena.id === 'giant') this.jupiter.shine();
    else this.jupiter.calm();
  }

  /** The picture's height in device pixels: the ring's specks keep their size in the world with it. */
  setViewport(height: number) {
    for (const material of this.sized) material.uniforms.viewport.value = height;
  }

  update(time: number) {
    for (const material of this.timed) material.uniforms.time.value = time;
    // the neon of the derelict stutters now and then, as a sign on emergency power does
    for (const sign of this.flicker) (sign.material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.03 ? 0.25 : 1;
  }

  /**
   * The picture's quality (see view/quality, Look.landmark): Jupiter's cap at a share of its
   * full segment count (see JUPITER_SEGMENTS), and the planets' maps sharp (2048 × 1024) from half
   * the share on, else as the page loaded them (1024 × 512). The sharp maps are fetched the first
   * time a rung asks for them and take over once they are there.
   */
  setDetail(share: number) {
    this.sharpWanted = share >= 0.5;
    if (this.sharpWanted && !this.sharpAsked) {
      this.sharpAsked = true;
      for (const planet of this.planets.keys()) {
        loadPlanetMap(planet).then(
          (texture) => {
            this.sharp.set(planet, texture);
            this.useMaps();
          },
          (error: unknown) => console.warn(`The sharp map of ${planet} did not load`, error),
        );
      }
    }
    this.useMaps();
    const tier = share >= 0.75 ? 0 : share >= 0.375 ? 1 : 2;
    if (tier === this.jupiterDetail) return;
    this.jupiterDetail = tier;
    this.jupiterMesh.geometry = this.jupiterCaps[tier];
    this.jupiter.setDetail(tier);
  }

  /** Each planet's map as setDetail wants it, the page's until the sharp one is there. */
  private useMaps() {
    for (const [planet, material] of this.planets) {
      const map = (this.sharpWanted && this.sharp.get(planet)) || this.maps.maps[planet];
      material.uniforms.map.value = map;
      material.uniforms.texel.value = 1 / (map.image as { width: number }).width;
    }
  }

  /**
   * A gas planet's material from its map (see gasFragment), its own frame turned by `frame` with
   * the map's longitude 0 at `longitude` (a share of a turn); `haze` along its limb, fine detail
   * within `reach` (0 for none), `storms` adds lightning and aurora on its night side.
   */
  private gas(planet: Planet, options: { frame: THREE.Matrix3; longitude: number; haze: number; reach: number; storms: boolean }): THREE.ShaderMaterial {
    const map = this.maps.maps[planet];
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sun: { value: SUN_DIRECTION.clone() },
        light: { value: this.light },
        frame: { value: options.frame },
        map: { value: map },
        texel: { value: 1 / (map.image as { width: number }).width },
        longitude: { value: options.longitude },
        reach: { value: options.reach },
        haze: { value: new THREE.Color(options.haze) },
        storms: { value: options.storms ? 1 : 0 },
      },
      vertexShader: planetVertex,
      fragmentShader: gasFragment,
    });
    this.timed.push(material);
    this.planets.set(planet, material);
    return material;
  }

  /** A world with air and water (see worldFragment). */
  private world(radius: number): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sun: { value: SUN_DIRECTION.clone() } },
      vertexShader: planetVertex,
      fragmentShader: worldFragment,
    });
    this.timed.push(material);
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), material);
  }

  private rings(): THREE.Group {
    const group = new THREE.Group();
    const center = SATURN_CENTER;
    // its bands lie in its equator's plane, as its ring does, which is the arena's horizon
    const material = this.gas('saturn', { frame: new THREE.Matrix3(), longitude: 0, haze: 0xd9c9a3, reach: 0, storms: false });
    // the ring's shadow on its clouds (see gasFragment)
    material.defines = { RING: '' };
    Object.assign(material.uniforms, { ring: { value: this.maps.ring }, center: { value: center }, radii: { value: new THREE.Vector2(RING_INNER, RING_OUTER) } });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(SATURN_RADIUS, 128, 64), material);
    planet.position.copy(center);
    const ring = new THREE.RingGeometry(RING_INNER, RING_OUTER, 256, 1);
    // the texture runs from the inner to the outer edge
    const uv = ring.attributes.uv;
    const p = new THREE.Vector3();
    for (let i = 0; i < uv.count; i++) {
      p.fromBufferAttribute(ring.attributes.position, i);
      uv.setXY(i, (p.length() - RING_INNER) / (RING_OUTER - RING_INNER), 0.5);
    }
    // seen from inside the ring the sheet would fill the view: up close it fades out, and the
    // chunks of ice and the specks around the pilot are the ring
    const sun = SUN_DIRECTION.clone();
    const disk = new THREE.Mesh(
      ring,
      new THREE.ShaderMaterial({
        uniforms: litUniforms({
          map: { value: this.maps.ring },
          near: { value: RING_FADE_NEAR },
          far: { value: RING_FADE_FAR },
          sun: { value: sun },
          light: { value: this.light },
          center: { value: center },
          radius: { value: SATURN_RADIUS },
        }),
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        lights: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.copy(center);
    disk.receiveShadow = true;
    // specks of ice all around the pilot, flat like the ring, each with a facet of its own to glint with
    const r = new Randomizer(1610);
    const specks = new Float32Array(ICE_SPECKS * 3);
    const facets = new Float32Array(ICE_SPECKS * 3);
    for (let i = 0; i < ICE_SPECKS; i++) {
      specks.set([r.range(-1, 1) * ICE_SLAB, r.range(-1, 1) * ICE_THICKNESS, r.range(-1, 1) * ICE_SLAB], i * 3);
      facets.set([r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(specks, 3));
    geometry.setAttribute('facet', new THREE.BufferAttribute(facets, 3));
    const speckMaterial = new THREE.ShaderMaterial({
      uniforms: litUniforms({
        sun: { value: sun },
        light: { value: this.light },
        color: { value: new THREE.Color(0xe6e1d8) },
        size: { value: ICE_SPECK_SIZE },
        viewport: { value: 1000 },
        slab: { value: ICE_SLAB },
      }),
      vertexShader: speckVertex,
      fragmentShader: speckFragment,
      lights: true,
      transparent: true,
      depthWrite: false,
    });
    this.sized.push(speckMaterial);
    const ice = new THREE.Points(geometry, speckMaterial);
    ice.receiveShadow = true;
    // the shader places the specks around the camera, wherever it is
    ice.frustumCulled = false;
    group.add(planet, disk, ice);
    return group;
  }

  private kessler(): THREE.Group {
    const group = new THREE.Group();
    // the world the station circled, far below: oceans, clouds, the lights of its cities
    const planet = this.world(180000);
    planet.position.copy(KESSLER_WORLD);
    group.add(planet);
    return group;
  }

  /**
   * Jupiter, whose cloud deck runs through the arena: its map lies on the deck, of which only the
   * cap a pilot can see is built, the rest lies beyond the horizon (see world/jupiter for the deck,
   * the air below it and the sky); its frame turns its map so the arena hangs over its southern belts (see
   * JUPITER_LATITUDE), the great red storm turning some 6 km off and drifting past as the planet spins.
   */
  private jupiterScene(): THREE.Group {
    const group = new THREE.Group();
    // the map lies on the cloud deck, which is the top of the planet's air
    const air = ARENAS.find((arena) => arena.id === 'giant')!.layout.air!;
    this.jupiterCaps.push(...JUPITER_SEGMENTS.map(([width, height]) => new THREE.SphereGeometry(air.radius, width, height, 0, Math.PI * 2, 0, JUPITER_CAP)));
    // turns the cap's top (straight below the arena) to the latitude JUPITER_LATITUDE
    const frame = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationZ(JUPITER_LATITUDE - Math.PI / 2));
    const planet = new THREE.Mesh(this.jupiterCaps[0], this.gas('giant', { frame, longitude: JUPITER_LONGITUDE, haze: 0xffd2a8, reach: JUPITER_FINE_REACH, storms: true }));
    this.jupiterMesh = planet;
    planet.position.copy(air.center);
    // its deck, the sheets below it, its sky and weather (see world/jupiter)
    this.jupiter = new Jupiter(air, planet, this.jupiterCaps, this.light);
    group.add(planet, this.jupiter.group);
    return group;
  }

  private corona(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: bandsVertex, fragmentShader: sunFragment, toneMapped: false });
    this.timed.push(material);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(CORONA_RADIUS, 96, 48), material);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(CORONA_DISTANCE);
    group.add(sun);
    return group;
  }

  private hole(): THREE.Group {
    const group = new THREE.Group();
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(HOLE_RADIUS, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, inner: { value: DISK_INNER }, outer: { value: DISK_OUTER } },
      vertexShader: diskVertex,
      fragmentShader: diskFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.timed.push(material);
    const disk = new THREE.Mesh(new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 8), material);
    disk.rotation.x = -Math.PI / 2;
    group.add(horizon, disk);
    return group;
  }

  private derelict(): THREE.Group {
    const group = new THREE.Group();
    // a sponsor's sign on both flanks of the bow, still lit, and one on the stern
    const sign = neonSign('VICTORY COLA', '#ff3fa4', '#ff0080');
    sign.position.set(-30000, 0, 2300);
    const back = sign.clone();
    back.position.z = -2300;
    back.rotation.y = Math.PI;
    const name = neonSign('SOLAR WALL', '#7fb2ff', '#0062ff');
    const [x, y] = sternAt(25000);
    name.position.set(x, y, 5400);
    name.rotation.z = 0.22;
    this.flicker.push(sign, back);
    group.add(sign, back, name);
    return group;
  }
}
