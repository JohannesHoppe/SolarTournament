import * as THREE from 'three';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { ARENAS, HOLE_RADIUS, RING_LAYER, SATURN_CENTER, type ArenaId, type ArenaProfile } from './arenas';
import { Derelict, mistDensity } from './derelict';
import { sizeBeacons } from './worldship';
import { loadPlanetMap, type Planet, type PlanetMaps } from '../assets';
import { junkyard } from './junkyard';
import { Jupiter } from './jupiter';
import { Corona } from './corona';

/**
 * What an arena shows beyond its field: Saturn, whose ring the arena lies in, Earth and the
 * junk around the Satellite Junkyard (see world/junkyard), Jupiter (see world/jupiter), the sun up close (see world/corona), the black hole with its disk, the mist
 * and the dead at the derelict's break (see world/derelict). Scenery only; what pulls and blocks is the field's well.
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
 * behind comes back on the far side, faded in and out at the square's edge), within the ring's
 * layer (RING_LAYER above and below the plane, 125 m). Dense enough that a rock's or a ship's
 * shadow shows as a dark lane through them; from above or below they show the layer as a
 * glittering floor or ceiling.
 */
const ICE_SPECKS = 16000;
const ICE_SLAB = 32000;
/** A speck's size (units, 3 m), drawn at no less than a pixel and no more than ICE_SPECK_PIXELS (device px), so one passing close by stays a speck. */
const ICE_SPECK_SIZE = 60;
const ICE_SPECK_PIXELS = 6;
/**
 * The grains of the ring's layer close by: GRAINS of them in a cube of GRAIN_BOX to each side
 * of the camera (units, 60 m), fixed in space, so they rush past a ship flying through and
 * wrap around to the far side of the cube (faded in and out from 30 m on); only those within
 * the layer show, thinning out over its outer fifth, so the cube is empty above and below it.
 * Each is GRAIN_SIZE across (units, 20 cm, drawn at 1 to GRAIN_PIXELS device px) and drawn
 * besides as a streak from where it is to where it was GRAIN_STREAK seconds before, seen from
 * the moving ship, from GRAIN_STREAK_START (units/s, 20 m/s) on, at full strength from
 * GRAIN_STREAK_FULL (200 m/s). Within GRAIN_NEAR of the camera (units, 6 to 15 m) the grains
 * fade out: one that close would sweep across the whole screen in a frame.
 */
const GRAINS = 32000;
const GRAIN_BOX = 1200;
const GRAIN_SIZE = 4;
const GRAIN_PIXELS = 3;
const GRAIN_STREAK = 0.025;
const GRAIN_STREAK_START = 400;
const GRAIN_STREAK_FULL = 4000;
const GRAIN_NEAR: readonly [number, number] = [120, 300];
/** A streak's brightness as a share of its grain's, at its head: the grain moves on, so the streak is a smear of its light. */
const GRAIN_STREAK_GLOW = 0.35;
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
/** The black hole's disk: from and to (units, 300 m to 1.4 km). */
const DISK_INNER = 6000;
const DISK_OUTER = 28000;
/**
 * How fast the disk's gas circles (see diskFragment): DISK_SPIN / (0.15 + t) rad/s, t from the
 * inner edge 0 to the outer 1, so once a second at the inner edge and once in about 8 s at the
 * outer. Its streaks lie in DISK_RINGS octaves of concentric rings, so many across the disk
 * (the finest left out below the full picture); each ring circles at its own speed, dark at its
 * edges where the next one slides past.
 */
const DISK_SPIN = 0.9;
const DISK_RINGS = [24, 60, 150] as const;
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

const diskVertex = /* glsl */ `
  varying vec2 vPlane;
  varying vec3 vToCamera;
  void main() {
    vPlane = position.xy;
    vToCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The black hole's disk: hot gas spiraling in, white-hot at the inner edge, orange and dark
 * further out, streaked in fine concentric rings (see DISK_RINGS). The gas circles
 * counterclockwise seen from above (as the arena's rocks do), the inner rings faster (see
 * DISK_SPIN); a ring turns as a whole, so the streaks never shear finer however long it turns.
 * An octave of rings evens out to its mean where its rings shrink below a pixel, so nothing
 * shimmers in the distance, and below the full picture the finest octave is left out (`fine`).
 * Where the gas streams towards the pilot it shines brighter and bluer, where it streams away
 * dimmer.
 */
const diskFragment = /* glsl */ `
  uniform float time;
  uniform float inner;
  uniform float outer;
  uniform float fine;
  varying vec2 vPlane;
  varying vec3 vToCamera;
  ${noise3}
  // \`count\` rings across the disk, each with its own brightness and clumps along it, turning at its own speed
  float rings(float angle, float t, float count) {
    float band = floor(t * count);
    float spin = angle - time * ${DISK_SPIN.toFixed(2)} / (0.15 + (band + 0.5) / count);
    // drawn on a circle, so the clumps close without a seam
    vec2 around = vec2(cos(spin), sin(spin));
    float clumps = noise(vec3(around * 3.0, band * 1.7 + count));
    float bright = hash(vec3(band, count, 0.0));
    float ring = sin(3.1416 * fract(t * count)) * (0.3 + 0.7 * bright) * (0.3 + 0.7 * clumps);
    // its mean (about 0.27) where its rings are finer than a pixel
    return mix(ring, 0.27, smoothstep(0.4, 0.8, fwidth(t * count)));
  }
  void main() {
    float r = length(vPlane);
    float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
    float angle = atan(vPlane.y, vPlane.x);
    float finest = mix(0.27, rings(angle, t, ${DISK_RINGS[2].toFixed(1)}), fine);
    float streaked = rings(angle, t, ${DISK_RINGS[0].toFixed(1)}) * 0.5 + rings(angle, t, ${DISK_RINGS[1].toFixed(1)}) * 0.3 + finest * 0.2;
    float heat = pow(1.0 - t, 2.2);
    vec3 color = mix(vec3(0.9, 0.25, 0.04), vec3(1.0, 0.85, 0.65), heat);
    float fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.6, 1.0, t));
    // dark lanes between the bright rings, so the streaks read
    float lanes = smoothstep(0.1, 0.5, streaked);
    // where the gas streams towards the pilot (counterclockwise seen from above) it shines brighter and bluer, where it streams away dimmer
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

/** What a speck of the ring's ice is drawn with: its size, the facet it glints with, where it is and how faded. */
const speckVertexPars = /* glsl */ `
  ${shadowVertexPars}
  uniform float size;
  uniform float viewport;
  attribute vec3 facet;
  varying vec3 vFacet;
  varying vec3 vWorld;
  varying float vFade;
`;

/** Draws a speck at `worldPosition`, `size` across in the world, from 1 to `pixels` device px, in the sun's shadows. */
const speckPlace = (pixels: number) => /* glsl */ `
    vec4 mvPosition = viewMatrix * worldPosition;
    vWorld = worldPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(size * projectionMatrix[1][1] * viewport * 0.5 / -mvPosition.z, 1.0, ${pixels.toFixed(1)});
    ${shadowVertex}
`;

const speckVertex = /* glsl */ `
  ${speckVertexPars}
  uniform float slab;
  void main() {
    vFacet = facet;
    // the square moves with the pilot: every speck within slab of the camera along the plane
    vec2 offset = mod(position.xz - cameraPosition.xz + slab, 2.0 * slab) - slab;
    vFade = 1.0 - smoothstep(0.7 * slab, slab, max(abs(offset.x), abs(offset.y)));
    vec4 worldPosition = vec4(cameraPosition.x + offset.x, position.y, cameraPosition.z + offset.y, 1.0);
    ${speckPlace(ICE_SPECK_PIXELS)}
  }
`;

/**
 * A grain of the ring's layer close by (see GRAINS): fixed in the world, in a cube that wraps
 * around the camera, shown only within the layer. With STREAK, the grain's streak: a line from
 * where it is (`tail` 0) to where it was a streak's time ago (`tail` 1, `trail` away), seen from
 * the moving ship, fading out towards its tail.
 */
const grainVertex = /* glsl */ `
  ${speckVertexPars}
  uniform float box;
  uniform float layer;
  uniform vec3 trail;
  uniform float strength;
  #ifdef STREAK
    attribute float tail;
  #endif
  void main() {
    vFacet = facet;
    vec3 offset = mod(position - cameraPosition + box, 2.0 * box) - box;
    vec4 worldPosition = vec4(cameraPosition + offset, 1.0);
    float reach = length(offset);
    vFade = smoothstep(${GRAIN_NEAR[0].toFixed(1)}, ${GRAIN_NEAR[1].toFixed(1)}, reach) * (1.0 - smoothstep(0.5 * box, box, reach)) * (1.0 - smoothstep(0.8 * layer, layer, abs(worldPosition.y)));
    #ifdef STREAK
      worldPosition.xyz += trail * tail;
      vFade *= strength * (1.0 - tail);
    #endif
    ${speckPlace(GRAIN_PIXELS)}
  }
`;

/**
 * The ice of the ring around the pilot, lit by the sun where nothing stands between it and the
 * sun (the sun's shadow map), its facet glinting when it mirrors the sun towards the eye.
 */
const iceFragmentPars = /* glsl */ `
  ${shadowFragmentPars}
  uniform vec3 sun;
  uniform vec3 light;
  uniform vec3 color;
  varying vec3 vFacet;
  varying vec3 vWorld;
  varying float vFade;
  ${glint}
  vec3 iceLit() {
    float sunny = getShadowMask();
    return color * light * (0.55 * sunny + 0.12) + vec3(1.0, 0.96, 0.88) * light * 2.0 * glint(vFacet, normalize(sun), normalize(cameraPosition - vWorld), 60.0) * sunny;
  }
`;

/** A speck or grain of the ring's ice: a soft round dot. */
const speckFragment = /* glsl */ `
  ${iceFragmentPars}
  void main() {
    vec2 at = gl_PointCoord - 0.5;
    float round = smoothstep(0.25, 0.1, dot(at, at)) * vFade;
    if (round <= 0.0) discard;
    gl_FragColor = vec4(iceLit(), round * 0.85);
  }
`;

/** A grain's streak, added to the picture: as bright as the grain is lit, fading towards its tail. */
const streakFragment = /* glsl */ `
  ${iceFragmentPars}
  void main() {
    if (vFade <= 0.0) discard;
    gl_FragColor = vec4(iceLit() * vFade * ${GRAIN_STREAK_GLOW.toFixed(2)}, 1.0);
  }
`;

/** `count` specks of ice, each where `place` puts it (x, y, z), with a facet of its own to glint with (see iceFragmentPars). */
function iceGeometry(count: number, r: Randomizer, place: () => number[]): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3);
  const facets = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions.set(place(), i * 3);
    facets.set([r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('facet', new THREE.BufferAttribute(facets, 3));
  return geometry;
}

/** The specks of `geometry` as streaks (see grainVertex): every speck twice, its head (`tail` 0) and its tail (`tail` 1). */
function streaksOf(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const streaks = new THREE.BufferGeometry();
  for (const name of ['position', 'facet']) {
    const from = geometry.getAttribute(name).array as Float32Array;
    const ends = new Float32Array(from.length * 2);
    for (let i = 0; i < from.length / 3; i++) {
      ends.set(from.subarray(i * 3, i * 3 + 3), i * 6);
      ends.set(from.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    }
    streaks.setAttribute(name, new THREE.BufferAttribute(ends, 3));
  }
  const tails = new Float32Array(geometry.getAttribute('position').count * 2);
  for (let i = 1; i < tails.length; i += 2) tails[i] = 1;
  streaks.setAttribute('tail', new THREE.BufferAttribute(tails, 1));
  return streaks;
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
  /** The derelict's break: its mist and its dead (see world/derelict). */
  private wreck!: Derelict;
  /** The Corona's sun, its spots, glow and prominences (see world/corona). */
  private sun!: Corona;
  /** How each planet's map is put on its material, which setDetail swaps between the page's and the sharp one. */
  private readonly planets = new Map<Planet, (map: THREE.Texture) => void>();
  /** The sharp maps (see loadPlanetMap), once asked for, and once loaded. */
  private sharpAsked = false;
  private readonly sharp = new Map<Planet, THREE.Texture>();
  private sharpWanted = false;
  /** What the sun gives the planets, the ring and its specks: its color times its strength over π (Lambert's diffuse light), the arena's (see show). */
  private readonly light = new THREE.Color();
  /** The materials of the ring's specks, which size them by the picture's height (see setViewport). */
  private readonly sized: THREE.ShaderMaterial[] = [];
  /** The black hole's disk, whose finest streaks holeDetail leaves out. */
  private disk!: THREE.ShaderMaterial;
  /** The grains of the ring's layer close by, and their streaks (see GRAINS). */
  private grains!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private streaks!: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(private readonly maps: PlanetMaps) {
    this.scenes.set('rings', this.rings());
    this.scenes.set('junkyard', this.junkyard());
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

  /** The picture's height in device pixels: the ring's specks, the derelict's mist and beacons keep their size in the world with it. */
  setViewport(height: number) {
    for (const material of this.sized) material.uniforms.viewport.value = height;
    this.wreck.setViewport(height);
    sizeBeacons(height);
  }

  /** How thick the mist escaping at the derelict's break is at `point` (0..1; 0 in every other arena). */
  mistAt(point: THREE.Vector3): number {
    return this.shown === 'derelict' ? mistDensity(point) : 0;
  }

  /**
   * The ring's grains around `camera`, drawn only while their cube reaches into the layer, and
   * streaking along `velocity`, the motion of whoever the camera rides with (none without), as
   * fast as it goes (see GRAIN_STREAK).
   */
  follow(camera: THREE.Camera, velocity: THREE.Vector3 | null) {
    const speed = velocity?.length() ?? 0;
    const strength = THREE.MathUtils.smoothstep(speed, GRAIN_STREAK_START, GRAIN_STREAK_FULL);
    this.grains.visible = Math.abs(camera.position.y) < RING_LAYER + GRAIN_BOX;
    this.streaks.visible = this.grains.visible && strength > 0;
    if (!velocity || !this.streaks.visible) return;
    const uniforms = this.streaks.material.uniforms;
    uniforms.strength.value = strength;
    // the tail lies where the grain was, seen from the ship: ahead along the ship's own motion
    uniforms.trail.value.copy(velocity).multiplyScalar(GRAIN_STREAK);
  }

  /** The share of the ring's grains drawn close by (see view/quality, Look.particles). */
  setGrains(share: number) {
    const count = Math.round(GRAINS * share);
    this.grains.geometry.setDrawRange(0, count);
    this.streaks.geometry.setDrawRange(0, count * 2);
    this.wreck.setParticles(share);
  }

  update(time: number) {
    for (const material of this.timed) material.uniforms.time.value = time;
    this.sun.update(time);
    // a neon sign stutters now and then, as a sign on emergency power does
    for (const sign of this.flicker) (sign.material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.03 ? 0.25 : 1;
    if (this.shown === 'derelict') this.wreck.update(time);
  }

  /**
   * The picture's quality (see view/quality, Look.landmark): Jupiter's cap at a share of its
   * full segment count (see JUPITER_SEGMENTS), and the planets' maps sharp (`-2k`, twice as wide)
   * from half the share on, else as the page loaded them (`-1k`). The sharp maps are fetched the first
   * time a rung asks for them and take over once they are there. The black hole's disk as
   * holeDetail says.
   */
  setDetail(share: number) {
    this.holeDetail(share);
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
    this.sun.setDetail(share);
    const tier = share >= 0.75 ? 0 : share >= 0.375 ? 1 : 2;
    if (tier === this.jupiterDetail) return;
    this.jupiterDetail = tier;
    this.jupiterMesh.geometry = this.jupiterCaps[tier];
    this.jupiter.setDetail(tier);
  }

  /** Each planet's map as setDetail wants it, the page's until the sharp one is there. */
  private useMaps() {
    for (const [planet, use] of this.planets) use((this.sharpWanted && this.sharp.get(planet)) || this.maps.maps[planet]);
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
    this.planets.set(planet, (map) => {
      material.uniforms.map.value = map;
      material.uniforms.texel.value = 1 / (map.image as { width: number }).width;
    });
    return material;
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
    const specks = iceGeometry(ICE_SPECKS, r, () => [r.range(-1, 1) * ICE_SLAB, r.range(-1, 1) * RING_LAYER, r.range(-1, 1) * ICE_SLAB]);
    const ice = new THREE.Points(specks, this.iceMaterial({ size: { value: ICE_SPECK_SIZE }, slab: { value: ICE_SLAB } }, speckVertex, speckFragment));
    // the grains close by, anywhere in their cube (the shader keeps those in the layer), and their streaks
    const grains = iceGeometry(GRAINS, r, () => [r.range(0, 2) * GRAIN_BOX, r.range(0, 2) * GRAIN_BOX, r.range(0, 2) * GRAIN_BOX]);
    const near = { box: { value: GRAIN_BOX }, layer: { value: RING_LAYER }, trail: { value: new THREE.Vector3() }, strength: { value: 0 } };
    this.grains = new THREE.Points(grains, this.iceMaterial({ size: { value: GRAIN_SIZE }, ...near }, grainVertex, speckFragment));
    const streakMaterial = this.iceMaterial({ size: { value: GRAIN_SIZE }, ...near }, grainVertex, streakFragment);
    streakMaterial.defines = { STREAK: '' };
    streakMaterial.blending = THREE.AdditiveBlending;
    this.streaks = new THREE.LineSegments(streaksOf(grains), streakMaterial);
    this.streaks.visible = false;
    for (const points of [ice, this.grains, this.streaks]) {
      points.receiveShadow = true;
      // the shaders place them around the camera, wherever it is
      points.frustumCulled = false;
    }
    group.add(planet, disk, ice, this.grains, this.streaks);
    return group;
  }

  /** A material for the ring's ice around the pilot (see iceFragmentPars), lit by the arena's sun, sized by the picture's height (see setViewport). */
  private iceMaterial(own: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: litUniforms({
        sun: { value: SUN_DIRECTION.clone() },
        light: { value: this.light },
        color: { value: new THREE.Color(0xe6e1d8) },
        viewport: { value: 1000 },
        ...own,
      }),
      vertexShader,
      fragmentShader,
      lights: true,
      transparent: true,
      depthWrite: false,
    });
    this.sized.push(material);
    return material;
  }

  /** The Satellite Junkyard (see world/junkyard): Earth below, its night and day maps swapped by quality like the other planets', and the junk beyond the arena. */
  private junkyard(): THREE.Group {
    const scene = junkyard(this.maps.maps.earth, this.maps.maps['earth-day'], this.light);
    this.planets.set('earth', (map) => (scene.earth.uniforms.map.value = map));
    this.planets.set('earth-day', (map) => (scene.earth.uniforms.dayMap.value = map));
    this.timed.push(...scene.timed);
    this.sized.push(...scene.sized);
    this.flicker.push(...scene.flicker);
    return scene.group;
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
    this.sun = new Corona();
    return this.sun.group;
  }

  private hole(): THREE.Group {
    const group = new THREE.Group();
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(HOLE_RADIUS, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    this.disk = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, inner: { value: DISK_INNER }, outer: { value: DISK_OUTER }, fine: { value: 1 } },
      vertexShader: diskVertex,
      fragmentShader: diskFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.timed.push(this.disk);
    const disk = new THREE.Mesh(new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 8), this.disk);
    disk.rotation.x = -Math.PI / 2;
    group.add(horizon, disk);
    return group;
  }

  /** The black hole's share of the picture's quality (see setDetail): the disk's finest streaks on the full picture only. */
  private holeDetail(share: number) {
    this.disk.uniforms.fine.value = share >= 0.75 ? 1 : 0;
  }

  /** The derelict's break (see world/derelict): the mist escaping from its torn ends, lit by the arena's sun, and its dead. */
  private derelict(): THREE.Group {
    this.wreck = new Derelict(this.light);
    return this.wreck.group;
  }
}
