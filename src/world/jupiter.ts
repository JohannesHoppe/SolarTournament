import * as THREE from 'three';
import { fbm, noise3 } from './landmarks';
import { SUN_DIRECTION } from './space';
import type { Air } from './air';
import { CLOUD_SHRINK, FLASH_COLOR, HAZE_UNIFORMS, LIGHT_DEPTH } from '../view/haze';
import { Randomizer } from '../random';

/**
 * Jupiter around its arena, besides its map (see world/landmarks): the cloud deck as a
 * translucent sheet in the map's colors, two thinner sheets below it, the haze below them, wisps
 * of cloud streaming past under the deck, the wind that carries them, lightning in the clouds,
 * the auroras over the south pole and two of its moons in the sky. Scenery only; what the air
 * does is world/air's, what the haze hides is drawn by view/haze.
 */

/**
 * The sheets of cloud below the deck: how deep (units, 400 m and 1.2 km) and how much of the
 * light they hold back where they are thick (0..1); the cheaper rungs of the picture draw only
 * the first, then none (see setDetail).
 */
const SHEETS = [
  { depth: 8000, cover: 0.6 },
  { depth: 24000, cover: 0.75 },
];
/** The deck and the sheets fade out within this distance of the eye (units, 50 m, full at four times that), so a ship crossing them never meets a hard surface. */
const SHEET_NEAR = 1000;
/**
 * Under the sheets, FLOOR_DEPTH below the deck (units, 5 km, where the arena's well begins), a
 * sphere catches every view that goes down, out to FLOOR_CAP around the arena (rad, 57°): the
 * haze over it is so thick that only the haze's light shows, never the space behind. While the eye
 * is under the deck, a sphere BACKDROP around it (units, 15 km) takes the floor's place and
 * catches every view the sheets and the floor would leave empty (a shallow look down passes
 * under the floor and leaves the deck's cap), so every view ends in the haze and its clouds.
 */
const FLOOR_DEPTH = 100000;
const FLOOR_CAP = 1;
const BACKDROP = 300000;
/**
 * Lightning: a strike every STRIKE_EVERY seconds on average (visuals, by chance on each browser),
 * within STRIKE_REACH of the eye across (units, 3 km) and between STRIKE_TOP and STRIKE_BOTTOM
 * below the deck (units, 300 m to 2.5 km), flickering STROKES times over STRIKE_SECONDS.
 */
const STRIKE_EVERY = 5;
const STRIKE_REACH = 60000;
const STRIKE_TOP = 6000;
const STRIKE_BOTTOM = 50000;
const STROKES = 3;
const STRIKE_SECONDS = 0.45;
/** A stroke's light in the haze at its height (see view/haze's flash): the clouds around it light up without blinding. */
const FLASH_STRENGTH = 0.5;
/**
 * The auroras around the south pole, 77° from the arena across the planet: a glowing layer in
 * the thin shell of the upper air where Jupiter's auroras shine, a few hundred kilometers above
 * its clouds on a planet of 71,500 km (at the game's scale, about 1/1,750, some 150 to 300 m).
 * Its light is brightest at AURORA_FOOT and fades out towards AURORA_TOP over the deck (units,
 * 100 to 400 m, lifted a little so it shows), and below its foot it glows on down to the rim, so
 * no dark gap opens between the clouds and the light. It is seen as a thin band lying on the
 * planet's rim towards the pole: as high over the limb as that shell rises over it seen from the
 * eye, and from no lower than AURORA_LOWEST (units, 800 m), so it keeps its height near the deck.
 * A deliberate deviation: the oval itself lies beyond the horizon of a ship in the arena (whose
 * horizon is within 23°), so its light is drawn on the limb, AURORA_DISTANCE from the eye (units,
 * 30 km, inside the camera's reach), AURORA_SPAN to either side of the pole's direction (rad, 35°).
 */
const AURORA_DISTANCE = 600000;
const AURORA_SPAN = 0.6;
const AURORA_FOOT = 2000;
const AURORA_TOP = 8000;
const AURORA_LOWEST = 16000;
/**
 * The auroras are calm and smooth, as photographs from orbit show a limb's aurora: one continuous
 * band, its brightness and height varying only in broad stretches, AURORA_FOLD per degree along
 * the arc (a stretch some 12° long: the oval's folds seen edge-on, a little brighter and taller),
 * drifting as a noise in time advancing AURORA_DRIFT a second (most of a minute to change); the
 * band breathes, brightening and dimming gently, AURORA_PULSE a second (some 8 s from bright to
 * dim and back). A faint, broad striation, AURORA_STRIAE per degree, changes its brightness by
 * at most a tenth and fades into the even glow where it would be only a few pixels wide, so
 * nothing sparkles. With reduced motion the breathing holds still and only the folds drift.
 */
const AURORA_FOLD = 0.08;
const AURORA_STRIAE = 0.4;
const AURORA_DRIFT = 0.02;
const AURORA_PULSE = 0.12;
/** The layers of the band drawn one behind the other on each tier of the picture's quality (see setDetail). */
const AURORA_LAYERS = [3, 2, 1];
const reducedMotion = typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)');
/**
 * Two of its moons in the sky, drawn MOON_DISTANCE from the eye (units, 27.5 km): Io, sulphur
 * yellow with dark volcanic spots, and Europa, white ice with rust-red cracks, each in its
 * direction from the arena and its size on the sky (rad, both larger than from the real cloud
 * tops, as the planet itself is smaller).
 */
const MOON_DISTANCE = 550000;
const MOONS = [
  { direction: new THREE.Vector3(-0.35, 0.36, 0.86), size: 0.038, base: 0xe8d36a, mark: 0x7a3a12, cracks: 0 },
  { direction: new THREE.Vector3(-0.92, 0.18, -0.34), size: 0.024, base: 0xf1ece2, mark: 0x9a4a2a, cracks: 1 },
];
/** The deck's light from above, as a share of the lit map's (its haze: the light scattered under it); the depths', a share of that, tinted rust-brown. */
const DECK_LIGHT = 0.7;
const DEEP_LIGHT = new THREE.Color(0.32, 0.2, 0.13);
/** The wind under the deck carries the clouds (the haze's and the wisps') east at WIND (units/s, 30 m/s). */
const WIND = 600;
/**
 * Wisps of cloud under the deck, streaming past a ship: soft streaks drawn out along the wind,
 * WISP_MIN to WISP_MAX long (units, 50 to 180 m) right under the deck, shorter deeper as the
 * haze's clouds are (see view/haze, CLOUD_SHRINK, to no less than WISP_SMALLEST of it), a fourth
 * as tall, in a box WISP_BOX wide (units, 900 m) that wraps around the eye, fading out before its
 * edges, within WISP_NEAR of their own length of the eye, and above WISP_TOP under the deck (units,
 * 50 m, full from four times that). WISPS of them on the full picture, fewer on cheaper rungs
 * (see setDetail); they hold back at most WISP_OPACITY of what lies behind them.
 */
const WISPS = [96, 56, 32];
const WISP_MIN = 1000;
const WISP_MAX = 3600;
const WISP_SMALLEST = 0.35;
const WISP_BOX = 9000;
const WISP_NEAR = 0.25;
const WISP_TOP = 1000;
const WISP_OPACITY = 0.55;
/** The texture of a wisp: WISP_TEXTURE wide, half as tall. */
const WISP_TEXTURE = 128;
/** How many samples a ray in the haze takes of its clouds on each tier of detail (see view/haze, hazeClouds). */
const CLOUD_SAMPLES = [2, 1, 1];

/**
 * The cloud tops' turbulence (see topsGlsl), on the deck and the sheets below it, on top of the
 * map's bands: everything in units on the deck, east (x) and north (y), drawn out east-west as the
 * winds shear it by its STRETCH (x as many times longer). The patterns are tiles of the noise
 * texture (TOPS_SIZE² texels, each channel noise whose coarsest cells are a quarter of the tile),
 * mipmapped, so a pattern finer than a pixel fades to its mean by itself; what is shaped beyond
 * the texture (an edge, a thread, a vortex) fades out where it is smaller than a few pixels.
 *
 * - WARP: the large eddies, a tile of WARP_TILE (units, 3 km north-south, eddies some 750 m
 *   across), shoving the clouds (and the map's colors) up to half of WARP_SHOVE (units, 550 m)
 *   aside; EDDY the small ones inside them (eddies some 175 m across, up to 200 m), on the full
 *   picture only.
 * - BILLOWS: the clouds' light and dark, a tile of 1.5 km, edged sharp where they rise above the
 *   rest; FINE their grain (tile 250 m), not on the cheapest rung; FILAMENT bright threads drawn
 *   out along the shear (tile 2 km).
 * - VORTEX_CELLS: on grids of cells 2 km and 600 m wide, about half the cells hold a vortex 12 to
 *   29 % of the cell tall, an oval OVAL times as wide as tall, whose clouds are wound into a
 *   spiral (TWIST rad more at its heart than at its rim) turning slowly (SPIN_RATE rad/s more at
 *   its heart, so the spiral winds no more than a few turns tighter in a long round); one in
 *   five of them, turning the other way, carries a white oval at its heart, ringed darker.
 * - GREAT_STORM: the great red storm on the map turns as one such spiral, GREAT_TWIST at its heart.
 * - POP_TILE: bright clouds that have risen above the tops, on a grid of cells POP_CELL across
 *   (units, 150 m), about a third of them with a cloud 35 to 95 m across, brighter over the light
 *   zones, each casting a soft shadow POP_SHADOW of a cell away from the low sun.
 * - RELIEF: the billows lit from the side by the low sun (their height compared RELIEF units,
 *   50 m, towards the sun), on the full picture only.
 * - SHEAR: the light zones drift east and the dark belts west, SHEAR (units/s, 2 m/s) each way,
 *   on top of the planet's turn.
 */
const TOPS_SIZE = 256;
const WARP_TILE = 60000;
const WARP_STRETCH = 2.5;
const WARP_SHOVE = 22000;
const EDDY_TILE = 14000;
const EDDY_STRETCH = 1.6;
const EDDY_SHOVE = 8000;
const BILLOWS_TILE = 30000;
const BILLOWS_STRETCH = 3;
const FINE_TILE = 5000;
const FINE_STRETCH = 2;
const FILAMENT_TILE = 40000;
const FILAMENT_STRETCH = 5;
const VORTEX_CELLS = [40000, 12000];
const OVAL = 1.6;
const TWIST = 7;
const SPIN_RATE = 0.004;
const GREAT_TWIST = 3;
const POP_TILE = 48000;
const POP_CELL = POP_TILE / 16;
const POP_SHADOW = 0.16;
const RELIEF = 1000;
const SHEAR = 40;
/** The great red storm where the map shows it: its latitude (rad, 22° south), its longitude west of the point below the arena (rad, see landmarks' JUPITER_LONGITUDE), half its height (units, 2.8 km; as an oval 9 km wide). */
const GREAT_STORM = { latitude: -0.38, longitude: 0.1, height: 56000 };

/**
 * The noise the cloud tops are made of (see TOPS_SIZE), tiling seamlessly, the same every time:
 * red, green and blue three octave sums of gradient noise (four cells per tile and up, each
 * spread to a mean of 0.5), alpha the pop-up clouds (see POP_UPS): soft round bumps, one in about
 * half of a grid of 16 by 16 cells, each its own size and height.
 */
export function topsTexture(): THREE.DataTexture {
  const size = TOPS_SIZE;
  const random = new Randomizer(0x10ff7);
  const channels = [5, 5, 6].map((octaves) => {
    const sums = new Float32Array(size * size);
    let amplitude = 1;
    for (let octave = 0, cells = 4; octave < octaves; octave++, cells *= 2, amplitude *= 0.55) {
      const angles = Float32Array.from({ length: cells * cells }, () => random.nextFloat() * Math.PI * 2);
      const dot = (i: number, j: number, x: number, y: number) => {
        const angle = angles[((j + cells) % cells) * cells + ((i + cells) % cells)];
        return Math.cos(angle) * x + Math.sin(angle) * y;
      };
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x / size) * cells;
          const v = (y / size) * cells;
          const i = Math.floor(u);
          const j = Math.floor(v);
          const fu = u - i;
          const fv = v - j;
          const su = fu * fu * fu * (fu * (fu * 6 - 15) + 10);
          const sv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
          const top = dot(i, j, fu, fv) + (dot(i + 1, j, fu - 1, fv) - dot(i, j, fu, fv)) * su;
          const bottom = dot(i, j + 1, fu, fv - 1) + (dot(i + 1, j + 1, fu - 1, fv - 1) - dot(i, j + 1, fu, fv - 1)) * su;
          sums[y * size + x] += amplitude * (top + (bottom - top) * sv);
        }
      }
    }
    // spread to a mean of 0.5 and a deviation of an eighth
    let mean = 0;
    for (const value of sums) mean += value / sums.length;
    let spread = 0;
    for (const value of sums) spread += (value - mean) ** 2 / sums.length;
    const scale = 0.125 / Math.sqrt(spread);
    return sums.map((value) => THREE.MathUtils.clamp(0.5 + (value - mean) * scale, 0, 1));
  });
  const grid = 16;
  const cell = size / grid;
  const bumps = Array.from({ length: grid * grid }, () => {
    const present = random.nextFloat() < 0.3;
    return { x: random.nextFloat(), y: random.nextFloat(), radius: 0.12 + 0.2 * random.nextFloat(), height: 0.6 + 0.4 * random.nextFloat(), present };
  });
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) data[o + k] = Math.round(channels[k][y * size + x] * 255);
      let pop = 0;
      const ci = Math.floor(x / cell);
      const cj = Math.floor(y / cell);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const bump = bumps[((cj + dj + grid) % grid) * grid + ((ci + di + grid) % grid)];
          if (!bump.present) continue;
          // the bump's center inside its cell, kept clear of the cell's edges by its radius
          const bx = (ci + di + bump.radius + bump.x * (1 - 2 * bump.radius)) * cell;
          const by = (cj + dj + bump.radius + bump.y * (1 - 2 * bump.radius)) * cell;
          const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / (bump.radius * cell);
          if (d < 1) pop = Math.max(pop, bump.height * (1 - d * d) ** 2);
        }
      }
      data[o + 3] = Math.round(pop * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const g = (value: number) => value.toFixed(6);
/** A tile's scale for a texture lookup: across the tile's width east-west (`stretch` times longer) and its height north-south. */
const tile = (size: number, stretch = 1) => `vec2(${g(1 / (size * stretch))}, ${g(1 / size)})`;

/**
 * The cloud tops (see TOPS_SIZE) at a point of the deck, `s` (units, east and north, in the
 * planet's own frame, so it turns with it), seen with `pixel` units to a pixel; `zone` how light
 * the map's band is there (0 a dark belt, 1 a white zone), `sunFlat` the way to the sun along the
 * deck (east, north). `level` 0 is the full picture, 1 without the small eddies and the relief, 2
 * without the grain and the pop-ups' shadows. Returns the shove of the map's colors (xy, units),
 * how much lighter or darker the tops are (z, around 0) and how white (w, 0..1).
 */
const topsGlsl = /* glsl */ `
  uniform sampler2D tops;
  uniform float level;
  // a feature size units across shows in full from 8 pixels, fades out below 3
  float shows(float size, float pixel) { return smoothstep(3.0, 8.0, size / pixel); }
  // turns s around the center of an oval vortex of half height r (wider by OVAL), wound by twist at its heart
  vec2 wind(vec2 s, vec2 center, float r, float twist, out float heart) {
    vec2 d = (s - center) / vec2(${g(OVAL)} * r, r);
    float rim = 1.0 - length(d);
    heart = max(rim, 0.0);
    if (rim <= 0.0) return s;
    float a = twist * rim * rim;
    d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d;
    return center + d * vec2(${g(OVAL)} * r, r);
  }
  // the vortex of s's cell on a grid cell units wide, if it holds one (seed tells the grids apart); white the share of a white oval
  vec2 vortex(vec2 s, float cell, float seed, float pixel, inout float white, inout float ring) {
    vec2 id = floor(s / cell);
    float a = hash(vec3(id, seed));
    if (a < 0.45) return s;
    float b = hash(vec3(id, seed + 3.1));
    float c = hash(vec3(id, seed + 5.7));
    float r = cell * (0.06 + 0.085 * b);
    // the oval inside its cell, its rim clear of the cell's edges
    vec2 room = vec2(0.5 * cell - ${g(OVAL)} * r, 0.5 * cell - r);
    vec2 center = (id + 0.5) * cell + (vec2(c, fract(c * 7.3)) - 0.5) * 2.0 * room;
    float sense = a < 0.72 ? 1.0 : -1.0;
    float heart;
    vec2 wound = wind(s, center, r, sense * (${g(TWIST)} + ${g(SPIN_RATE)} * time) * shows(2.0 * r, pixel), heart);
    // anticyclones (turning the other way) now and then carry a white oval, ringed darker
    float oval = sense < 0.0 && b > 0.62 ? shows(2.0 * r, pixel) : 0.0;
    white = max(white, oval * 0.7 * smoothstep(0.05, 0.7, heart));
    ring = max(ring, oval * smoothstep(0.02, 0.12, heart) * (1.0 - smoothstep(0.14, 0.26, heart)));
    return wound;
  }
  vec4 cloudTops(vec2 s, float pixel, float zone, vec2 sunFlat, vec2 storm) {
    vec2 start = s;
    float white = 0.0;
    float ring = 0.0;
    float heart;
    // the great storm turns as one spiral; the vortices wind the clouds around them
    s = wind(s, storm, ${g(GREAT_STORM.height)}, ${g(GREAT_TWIST)}, heart);
    s = vortex(s, ${g(VORTEX_CELLS[0])}, 1.0, pixel, white, ring);
    s = vortex(s, ${g(VORTEX_CELLS[1])}, 2.0, pixel, white, ring);
    // the eddies shove the clouds about, the large ones first
    s += (texture2D(tops, s * ${tile(WARP_TILE, WARP_STRETCH)}).rg - 0.5) * ${g(WARP_SHOVE)};
    if (level < 0.5) s += (texture2D(tops, s * ${tile(EDDY_TILE, EDDY_STRETCH)} + 0.37).gr - 0.5) * ${g(EDDY_SHOVE)} * shows(${g(EDDY_TILE / 4)}, pixel);
    vec2 shove = s - start;
    float billows = texture2D(tops, s * ${tile(BILLOWS_TILE, BILLOWS_STRETCH)}).b - 0.5;
    float rise = billows;
    if (level < 1.5) rise += (texture2D(tops, s * ${tile(FINE_TILE, FINE_STRETCH)} + 0.61).r - 0.5) * 0.7 * shows(${g(FINE_TILE / 8)}, pixel);
    // the clouds that rise above the rest, edged as sharp as the pixels allow
    float edge = max(0.03, 1.5 * fwidth(rise));
    float cover = smoothstep(-edge, edge, rise);
    float light = rise * 1.7 + (cover - 0.5) * 0.35;
    white = max(white, cover * zone * 0.3);
    // bright threads along the shear where the noise crosses its middle
    float thread = 1.0 - abs(texture2D(tops, s * ${tile(FILAMENT_TILE, FILAMENT_STRETCH)} + 0.13).g - 0.5) * 8.0;
    white = max(white, clamp(thread, 0.0, 1.0) * 0.6 * shows(${g(FILAMENT_TILE / 40)}, pixel) * (0.4 + 0.6 * zone));
    if (level < 0.5) {
      // lit from the side by the low sun: brighter where the billows rise towards it
      float towards = texture2D(tops, (s + sunFlat * ${g(RELIEF)}) * ${tile(BILLOWS_TILE, BILLOWS_STRETCH)}).b - 0.5;
      light += (billows - towards) * 6.0 * shows(${g(RELIEF * 2)}, pixel);
    }
    // the pop-up clouds, white, and their shadows away from the sun
    vec2 pops = mix(start, s, 0.25) * ${tile(POP_TILE)};
    float shown = shows(${g(POP_CELL / 2)}, pixel) * (0.5 + 0.5 * zone);
    float pop = texture2D(tops, pops).a * shown;
    white = max(white, smoothstep(0.0, 0.7, pop));
    light += pop * 0.5;
    if (level < 1.5) {
      float over = texture2D(tops, pops + sunFlat * ${g(POP_SHADOW / 16)}).a * shown;
      light -= max(over - pop, 0.0) * 1.6;
    }
    light -= ring * 0.25;
    return vec4(shove, light, white);
  }
`;

/** The vertex stage of the sheets and moons: their own point, their normal and place in the world, and the haze's (see view/haze). */
const sheetVertex = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = viewMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/**
 * A sheet of Jupiter's clouds from its map (in the planet's frame, slowly spinning east, as the
 * map's sphere: see landmarks' gasFragment). DECK is the cloud deck: the map sharp, its colors
 * stirred and its tops built up by the turbulence of cloudTops (see TOPS_SIZE), the light zones
 * whiter and a little bluer, the dark belts browner, with gaps where it thins; seen from above
 * lit by the sun as cloud tops are, from below glowing dimly with the light that comes through.
 * A sheet below it is the map blurred and shoved about by the large eddies only, in the light the
 * haze lets down to it (`glow`), with wider gaps. The thicker a sheet looks the more slanted the
 * view through it; it fades out up close; the lightning lights it from within; the haze (see
 * view/haze) lies over it as over everything. `meridian` is the longitude of the cap's middle in
 * the map's frame before it turns (rad), from which the deck's own coordinates are measured, so
 * they never cross the map's seam; `zones` the map's mean brightness there, between belts and
 * zones. Built when first used, as landmarks (whose noise it takes) imports this module.
 */
const sheetFragment = () => /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  uniform vec3 light;
  uniform mat3 frame;
  uniform sampler2D map;
  uniform float longitude;
  uniform float meridian;
  uniform float zones;
  uniform float cover;
  uniform float glow;
  uniform vec4 sheet;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${noise3}
  ${topsGlsl}
  void main() {
    vec3 planet = normalize(frame * vLocal);
    float turn = time * 0.0004;
    vec3 q = vec3(cos(turn) * planet.x - sin(turn) * planet.z, planet.y, sin(turn) * planet.x + cos(turn) * planet.z);
    float latitude = asin(clamp(q.y, -1.0, 1.0));
    vec2 uv = vec2(longitude - atan(q.z, q.x) / 6.2831853, 0.5 + latitude / 3.14159265);
    // the deck's own coordinates (units east and north), turning with the planet
    float span = sheet.w * cos(latitude);
    float around = mod(atan(planet.z, planet.x) - meridian + 3.14159265, 6.2831853) - 3.14159265;
    vec2 s = vec2(-(around + turn) * span, latitude * sheet.w);
    float pixel = length(fwidth(s));
    // from above, a view that dipped through the sheet rises out of it again farther on: the
    // sheet's underside there is the same cloud, already drawn where the view went in
    if (!gl_FrontFacing && distance(cameraPosition, sheet.xyz) > sheet.w) discard;
    float away = distance(cameraPosition, vWorld);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    // the map's seam: the longitude whose change across the pixel is smaller
    float wrapped = fract(uv.x + 0.5) - 0.5;
    uv.x = fwidth(fract(uv.x)) <= fwidth(wrapped) ? fract(uv.x) : wrapped;
    vec2 toMap = vec2(1.0 / (6.2831853 * span), 1.0 / (3.14159265 * sheet.w));
    #if DECK_SHEET
      // a belt or a zone: the map's brightness around the point against its mean
      vec3 broad = texture2D(map, uv, 5.0).rgb;
      float zone = smoothstep(-0.06, 0.06, dot(broad, vec3(0.2126, 0.7152, 0.0722)) - zones);
      // the light zones drift east against the dark belts, the turbulence with them
      s.x += ${g(SHEAR)} * time * (2.0 * zone - 1.0);
      vec2 east = normalize(vec2(planet.z, -planet.x));
      vec3 toSunHere = frame * normalize(sun);
      vec2 sunFlat = vec2(dot(toSunHere.xz, east), toSunHere.y * length(planet.xz) - dot(planet.xz, toSunHere.xz) * planet.y / max(length(planet.xz), 0.001));
      sunFlat /= max(length(sunFlat), 0.001);
      float stormAround = mod(${g(GREAT_STORM.longitude)} - meridian + 3.14159265, 6.2831853) - 3.14159265;
      vec2 storm = vec2(-stormAround * span, ${g(GREAT_STORM.latitude)} * sheet.w);
      vec4 cloud = cloudTops(s, pixel, zone, sunFlat, storm);
      vec3 color = texture2D(map, uv + cloud.xy * toMap).rgb;
      // pushed a little towards the look of the close-ups: richer, the tops lighter and darker
      float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = max(mix(vec3(grey), color, 1.4) * (1.0 + 0.6 * cloud.z), 0.0);
      // the white clouds a cool blue-white over the zones, cream over the belts
      vec3 white = mix(vec3(1.0, 0.88, 0.7), vec3(0.84, 0.92, 1.0), zone) * clamp(grey * 2.4, 0.55, 0.95);
      color = mix(color, white, cloud.w * 0.85);
      float thick = texture2D(tops, s * ${tile(12000)}).r;
    #else
      vec2 shove = (texture2D(tops, s * ${tile(WARP_TILE, WARP_STRETCH)}).rg - 0.5) * ${g(WARP_SHOVE)};
      vec3 color = texture2D(map, uv + shove * toMap, 4.0).rgb;
      float thick = texture2D(tops, s * ${tile(26000)}).r;
    #endif
    // gaps in the sheet, on a pattern that evens out where it shrinks to a few pixels
    float alpha = cover * mix(0.55, 1.0, smoothstep(0.32, 0.62, thick));
    vec3 toSun = normalize(sun);
    float facing = dot(n, toSun);
    float incidence = clamp((facing + 0.04) / 1.04, 0.0, 1.0);
    float day = min(2.0 * incidence / (incidence + max(dot(n, view), 0.05)), 1.0) * smoothstep(0.0, 0.08, incidence);
    // from above the sun lights it; from below only what comes through, dimmer the thicker it is
    vec3 lit = gl_FrontFacing ? color * light * (day * glow + 0.02) : color * light * glow * (0.4 - 0.25 * alpha) * (0.3 + 0.7 * day);
    #ifdef USE_FOG
      // lightning lights the sheet from within, around the strike
      lit += vec3(0.75, 0.82, 1.0) * hazeFlash.w * exp(-distance(vWorld, hazeFlash.xyz) / 15000.0) * (gl_FrontFacing ? 0.5 : 1.0);
    #endif
    // seen at a slant the sheet is thicker: what it holds back straight on, along the longer way
    alpha = 1.0 - pow(1.0 - min(alpha, 0.98), 1.0 / max(abs(dot(n, view)), 0.03));
    alpha *= smoothstep(${SHEET_NEAR.toFixed(1)}, ${(SHEET_NEAR * 4).toFixed(1)}, away);
    gl_FragColor = vec4(lit, alpha);
    #include <fog_fragment>
  }
`;

/**
 * The auroras (see AURORA_FOOT): a strip of the sky along the limb, laid in the vertex shader
 * from the limb (`limb`, rad above the horizontal, see update) up past the shell's top (`top`)
 * with a margin, so only the band itself is shaded. In it, `layers` glowing layers one behind the
 * other, each smooth along the arc: from the rim up to its foot (`foot`) a steady pale
 * blue-white glow, brightest at the foot, and above it violet and magenta fading out smoothly
 * upwards, its height and brightness varying only in broad, slowly drifting stretches, the
 * whole band breathing over seconds (see AURORA_FOLD; `motion` 0 holds the breathing still).
 * The layers behind reach higher and fainter, a veil over the band. Added to what lies behind,
 * cut softly at the rim and fading out at the strip's ends; the haze dims it to nothing below
 * the deck.
 */
const auroraVertex = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float limb;
  uniform float top;
  varying vec2 vUv;
  varying float vElevation;
  void main() {
    vUv = uv;
    float span = top - limb;
    vElevation = mix(limb - 0.15 * span, top + 0.4 * span, uv.y);
    vec3 placed = vec3(position.x, ${AURORA_DISTANCE.toFixed(1)} * tan(vElevation), position.z);
    vec4 mvPosition = modelViewMatrix * vec4(placed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const auroraFragment = /* glsl */ `
  uniform float time;
  uniform float limb;
  uniform float foot;
  uniform float top;
  uniform float layers;
  uniform float motion;
  varying vec2 vUv;
  varying float vElevation;
  #include <fog_pars_fragment>
  // value noise in 2D on a hash without sines, steady for the large arguments a long round's clock gives
  float hash2(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    // degrees along the arc; the height in the shell (0 at the foot, 1 at the top); the way up from the rim to the foot (0 to 1)
    float along = vUv.x * ${((AURORA_SPAN * 2 * 180) / Math.PI).toFixed(2)};
    float height = (vElevation - foot) / (top - foot);
    float rising = clamp((vElevation - limb) / max(foot - limb, 1e-6), 0.0, 1.0);
    // cut softly a little below the rim, so the glow reaches down to the cap's facets, which lie
    // just inside the round limb; the sheets of cloud hide what lies below
    float rim = smoothstep(0.0, 1.5 * fwidth(vElevation), vElevation - limb + 0.12 * (top - limb));
    float breath = time * motion * ${AURORA_PULSE.toFixed(2)};
    float drift = time * ${AURORA_DRIFT.toFixed(3)};
    // the faint broad striation, fading into the even glow where it would be only a few pixels wide
    float fine = 1.0 - smoothstep(0.08, 0.2, fwidth(along * ${AURORA_STRIAE.toFixed(2)}));
    float striae = 1.0 + 0.2 * fine * (noise2(vec2(along * ${AURORA_STRIAE.toFixed(2)}, drift)) - 0.5);
    float wide = along * ${AURORA_FOLD.toFixed(3)};
    vec3 light = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float layer = float(i);
      if (layer >= layers) break;
      // a fold seen edge-on: a broad stretch a little brighter and taller
      float fold = noise2(vec2(wide + layer * 7.3, drift + layer * 2.0));
      float pulse = 0.8 + 0.4 * noise2(vec2(wide * 0.7 + layer * 9.0, breath + layer * 3.0));
      float reach = (0.25 + 0.3 * fold) * (1.0 + 0.8 * layer);
      float y = max(height, 0.0);
      float profile = mix(0.75, 1.0, rising) * exp(-y / reach) * (1.0 - smoothstep(0.75, 1.35, y));
      vec3 color = mix(vec3(0.75, 0.84, 1.0), vec3(0.92, 0.38, 1.0), smoothstep(-0.1, 0.45, height));
      color = mix(color, vec3(0.5, 0.25, 1.0), smoothstep(0.45, 1.1, height));
      light += color * profile * (0.55 + 0.8 * fold) * pulse / (1.0 + 1.5 * layer);
    }
    float ends = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    gl_FragColor = vec4(light * striae * rim * ends * 0.45, 1.0);
    #include <fog_fragment>
  }
`;

/**
 * The floor under the sheets (see FLOOR_DEPTH): only the light of the haze over it, whose sum
 * there is always deep (see view/haze). Its far parts are drawn at the camera's far reach
 * instead of being cut off there, so no view down ever ends in space.
 */
const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    gl_Position.z = min(gl_Position.z, gl_Position.w * 0.999999);
  }
`;
const floorFragment = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_FOG
      gl_FragColor.rgb = hazeAlong(cameraPosition, vWorld).rgb;
    #endif
  }
`;

/**
 * The wisps (see WISPS): each quad's corner (position.xy), its place in the box and its size,
 * shade and mirror (`seed`); laid where the box wraps around the eye, carried by the wind (`drift`),
 * drawn out along the wind as the eye sees it and turned to face the eye. In the light of its
 * depth (the haze's, see view/haze), lighter on top, a lighter or darker cloud by its seed, lit
 * from within by lightning nearby; the haze lies over it as over everything.
 */
const wispVertex = /* glsl */ `
  attribute vec4 seed;
  uniform vec3 eye;
  uniform vec3 drift;
  uniform vec3 wind;
  uniform vec3 planet;
  uniform float radius;
  varying vec2 vUv;
  varying float vFade;
  varying float vAltitude;
  varying float vTone;
  varying vec3 vCenter;
  #include <fog_pars_vertex>
  void main() {
    vec3 center = eye + mod(seed.xyz * ${WISP_BOX.toFixed(1)} + drift - eye, ${WISP_BOX.toFixed(1)}) - ${(WISP_BOX / 2).toFixed(1)};
    vec3 up = normalize(center - planet);
    float altitude = length(center - planet) - radius;
    float size = mix(${WISP_MIN.toFixed(1)}, ${WISP_MAX.toFixed(1)}, fract(seed.w * 7.0)) * clamp(exp(altitude / ${CLOUD_SHRINK.toFixed(1)}), ${WISP_SMALLEST}, 1.0);
    vec3 toEye = eye - center;
    float away = length(toEye);
    toEye /= max(away, 1.0);
    vec3 along = wind - toEye * dot(wind, toEye);
    float across = length(along);
    along /= max(across, 0.001);
    vec3 side = cross(toEye, along);
    vec3 world = center + along * (position.x * size) + side * (position.y * size * 0.25);
    vUv = vec2(fract(seed.w * 13.0) < 0.5 ? position.x : -position.x, position.y) * 0.5 + 0.5;
    vFade = smoothstep(${(WISP_BOX * 0.5).toFixed(1)}, ${(WISP_BOX * 0.38).toFixed(1)}, away)
      * smoothstep(${WISP_NEAR.toFixed(2)} * size, ${(WISP_NEAR * 3).toFixed(2)} * size, away)
      * smoothstep(${(-WISP_TOP).toFixed(1)}, ${(-WISP_TOP * 4).toFixed(1)}, altitude)
      * smoothstep(0.15, 0.5, across);
    vAltitude = altitude;
    vTone = (seed.w < 0.35 ? 0.45 : 1.3) * (1.0 + 0.3 * position.y * sign(dot(side, up)));
    vCenter = center;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const wispFragment = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vFade;
  varying float vAltitude;
  varying float vTone;
  varying vec3 vCenter;
  #include <fog_pars_fragment>
  void main() {
    float thick = texture2D(map, vUv).r;
    float alpha = thick * vFade * ${WISP_OPACITY.toFixed(2)};
    if (alpha < 0.004) discard;
    vec3 color = vec3(0.3, 0.22, 0.16) * vTone;
    #ifdef USE_FOG
      // its depth's light, the darker for a denser core seen from below
      color = mix(hazeDeep, hazeDeck, clamp(exp(vAltitude / ${LIGHT_DEPTH.toFixed(1)}) * vTone * (1.1 - 0.25 * thick), 0.0, 1.4));
      color += vec3(${FLASH_COLOR.r.toFixed(3)}, ${FLASH_COLOR.g.toFixed(3)}, ${FLASH_COLOR.b.toFixed(3)}) * hazeFlash.w * 1.5 * exp(-distance(vCenter, hazeFlash.xyz) / 12000.0);
    #endif
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }
`;

/** A wisp's texture: a soft streak, ragged at its edges and streaked along its length (value noise, the same every time). */
function wispTexture(): THREE.DataTexture {
  const width = WISP_TEXTURE;
  const height = WISP_TEXTURE / 2;
  const random = new Randomizer(0x77157);
  const grid = Float32Array.from({ length: 64 * 64 }, () => random.nextFloat());
  const value = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sx = x - ix;
    const sy = y - iy;
    const at = (i: number, j: number) => grid[(((j & 63) * 64) + (i & 63))];
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return top + (bottom - top) * sy;
  };
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      // streaks drawn out along the length, billows across
      const streaks = 0.5 * value(u * 4, v * 14) + 0.3 * value(u * 9 + 20, v * 28) + 0.2 * value(u * 20 + 40, v * 40);
      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2 + 0.35 * (value(u * 3 + 7, 3) - 0.5);
      const edge = Math.sqrt(dx * dx + dy * dy * 1.3) + 0.45 * (streaks - 0.5);
      // nothing at the texture's border, so no quad shows its edge
      const border = THREE.MathUtils.smoothstep(1 - Math.abs(dx), 0, 0.2) * THREE.MathUtils.smoothstep(1 - Math.abs((v - 0.5) * 2), 0, 0.3);
      const shape = THREE.MathUtils.smoothstep(1 - edge, 0, 0.6) * border;
      const o = (y * width + x) * 4;
      data[o] = Math.round(255 * shape * THREE.MathUtils.clamp(0.35 + streaks, 0, 1));
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** The wisps' quads (see WISPS): their corners and seeds, the same every time. */
function wispGeometry(): THREE.BufferGeometry {
  const count = WISPS[0];
  const random = new Randomizer(0x3c1d);
  const corners = new Float32Array(count * 12);
  const seeds = new Float32Array(count * 16);
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    const seed = [random.nextFloat(), random.nextFloat(), random.nextFloat(), random.nextFloat()];
    [-1, -1, 1, -1, 1, 1, -1, 1].forEach((value, k) => (corners[i * 12 + Math.floor(k / 2) * 3 + (k % 2)] = value));
    for (let k = 0; k < 4; k++) seeds.set(seed, i * 16 + k * 4);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(corners, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geometry.setIndex(index);
  return geometry;
}

/** A moon: its surface in two tones (and with `cracks`, lines across its ice), lit by the sun. */
const moonFragment = () => /* glsl */ `
  uniform vec3 sun;
  uniform vec3 light;
  uniform vec3 base;
  uniform vec3 mark;
  uniform float cracks;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${noise3}
  ${fbm}
  void main() {
    vec3 p = normalize(vLocal);
    float ground = fbm(p * 5.0 + cracks * 7.0, 1.0);
    float spots = cracks > 0.5 ? 1.0 - smoothstep(0.0, 0.03, abs(noise(p * 6.0) - 0.5)) : smoothstep(0.58, 0.66, ground);
    vec3 color = mix(base * (0.85 + 0.3 * ground), mark, spots * 0.8);
    float day = max(dot(normalize(vNormal), normalize(sun)), 0.0);
    gl_FragColor = vec4(color * light * (day * 1.2 + 0.015), 1.0);
    #include <fog_fragment>
  }
`;


/** A strike of lightning as it goes on: where, since when, the moments of its strokes. */
interface Strike {
  position: THREE.Vector3;
  at: number;
  strokes: number[];
}

const across = new THREE.Vector3();

/**
 * Jupiter's clouds, sky and weather around the arena (see the top of the file). Built from the
 * mesh of its map (`deck`, landmarks' Jupiter, at each of `caps`' detail), whose shader it
 * makes into the cloud deck; `light` is the arena's sun as the planets get it.
 */
export class Jupiter {
  readonly group = new THREE.Group();
  /** The light the haze scatters at the deck and in the depths (linear), from the map's colors around the arena (see shine). */
  readonly deckLight = new THREE.Color();
  readonly deepLight = new THREE.Color();
  /** A strike that has just begun, for its thunder: where it is (see update). */
  readonly strikePoint = new THREE.Vector3();
  /** Follows the eye, so the auroras and the moons stay on the sky. */
  private readonly sky = new THREE.Group();
  /** The sheets below the deck, then the deck, each with how deep it lies (units). */
  private readonly sheets: { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; depth: number }[] = [];
  private readonly timed: THREE.ShaderMaterial[] = [];
  private readonly aurora: THREE.ShaderMaterial;
  /** The wisps streaming past under the deck (see WISPS), and the way the wind blows (east, a unit vector). */
  private readonly wisps: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly wind = new THREE.Vector3();
  /** The depths under the sheets, and the haze around the eye that takes their place under the deck (see BACKDROP). */
  private readonly floor: THREE.Mesh;
  private readonly backdrop: THREE.Mesh;
  private strike: Strike | null = null;
  private nextStrike = STRIKE_EVERY;
  /** The map's mean color around the point below the arena (linear). */
  private readonly cloudColor = new THREE.Color(0.55, 0.42, 0.3);
  /** How many samples a ray in the haze takes of its clouds (see CLOUD_SAMPLES). */
  private samples = CLOUD_SAMPLES[0];

  constructor(
    private readonly air: Air,
    deck: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    caps: readonly THREE.BufferGeometry[],
    private readonly light: THREE.Color,
  ) {
    const material = deck.material;
    const fragmentShader = sheetFragment();
    // the map's sphere becomes the deck: see-through where it thins, seen from both sides
    Object.assign(material, { vertexShader: sheetVertex, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    material.defines = { DECK_SHEET: 1 };
    // the cap's middle (its top, straight below the arena) in the map's frame, whence the deck's own coordinates run
    const middle = new THREE.Vector3(0, 1, 0).applyMatrix3(material.uniforms.frame.value as THREE.Matrix3);
    Object.assign(material.uniforms, {
      cover: { value: 0.88 },
      glow: { value: 1 },
      sheet: { value: new THREE.Vector4(air.center.x, air.center.y, air.center.z, air.radius) },
      tops: { value: topsTexture() },
      level: { value: 0 },
      meridian: { value: Math.atan2(middle.z, middle.x) },
      zones: { value: 0.3 },
    });
    for (const sheet of SHEETS) {
      // the same map, frame and clock as the deck's (the uniforms are shared), its own cover and light
      const below = new THREE.ShaderMaterial({
        uniforms: { ...material.uniforms, cover: { value: sheet.cover }, glow: { value: 1 }, sheet: { value: new THREE.Vector4(air.center.x, air.center.y, air.center.z, air.radius - sheet.depth) } },
        defines: { DECK_SHEET: 0 },
        vertexShader: sheetVertex,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(caps[1] ?? caps[0], below);
      mesh.scale.setScalar((air.radius - sheet.depth) / air.radius);
      mesh.position.copy(air.center);
      this.sheets.push({ mesh, depth: sheet.depth });
      this.group.add(mesh);
    }
    this.sheets.push({ mesh: deck, depth: 0 });

    this.aurora = new THREE.ShaderMaterial({
      uniforms: { time: material.uniforms.time, limb: { value: 0 }, foot: { value: 0.01 }, top: { value: 0.03 }, layers: { value: AURORA_LAYERS[0] }, motion: { value: 1 } },
      vertexShader: auroraVertex,
      fragmentShader: auroraFragment,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    // the strip faces the south pole: its direction from the arena (the map's frame turns the
    // planet's axis), laid flat; its height is set in the vertex shader
    const frame = material.uniforms.frame.value as THREE.Matrix3;
    const pole = new THREE.Vector3(0, -1, 0).applyMatrix3(frame.clone().transpose());
    const band = new THREE.CylinderGeometry(AURORA_DISTANCE, AURORA_DISTANCE, 1, 48, 1, true, Math.atan2(pole.x, pole.z) - AURORA_SPAN, AURORA_SPAN * 2);
    const aurora = new THREE.Mesh(band, this.aurora);
    aurora.frustumCulled = false;
    // drawn before the sheets of cloud (see update), which hide what of it lies behind the planet's limb
    aurora.renderOrder = -Number.MAX_SAFE_INTEGER;
    this.sky.add(aurora);
    const moonShader = moonFragment();
    for (const moon of MOONS) {
      const surface = new THREE.ShaderMaterial({
        uniforms: { sun: { value: SUN_DIRECTION.clone() }, light: { value: light }, base: { value: new THREE.Color(moon.base) }, mark: { value: new THREE.Color(moon.mark) }, cracks: { value: moon.cracks } },
        vertexShader: sheetVertex,
        fragmentShader: moonShader,
        fog: true,
      });
      const body = new THREE.Mesh(new THREE.SphereGeometry(MOON_DISTANCE * Math.tan(moon.size / 2), 32, 16), surface);
      body.position.copy(moon.direction).normalize().multiplyScalar(MOON_DISTANCE);
      this.sky.add(body);
    }
    this.group.add(this.sky);
    // the depths under the sheets, wherever a view goes down: all haze (see view/haze), its color the haze's
    const floor = new THREE.Mesh(
      new THREE.SphereGeometry(air.radius - FLOOR_DEPTH, 64, 24, 0, Math.PI * 2, 0, FLOOR_CAP),
      new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, fog: true }),
    );
    // its far reaches lie beyond the camera's reach, where its haze still shows
    floor.frustumCulled = false;
    floor.position.copy(air.center);
    this.floor = floor;
    // under the deck, the haze all around the eye instead (see BACKDROP)
    this.backdrop = new THREE.Mesh(
      new THREE.SphereGeometry(BACKDROP, 32, 16),
      new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, fog: true, side: THREE.BackSide }),
    );
    this.backdrop.frustumCulled = false;
    this.backdrop.visible = false;
    this.group.add(floor, this.backdrop);
    // the wind blows east around the planet's axis (the pole's direction turned back), over the point below the arena
    this.wind.crossVectors(pole.clone().negate(), across.copy(air.center).negate().normalize()).normalize();
    this.wisps = new THREE.Mesh(
      wispGeometry(),
      new THREE.ShaderMaterial({
        uniforms: {
          eye: { value: new THREE.Vector3() },
          drift: { value: new THREE.Vector3() },
          wind: { value: this.wind },
          planet: { value: air.center },
          radius: { value: air.radius },
          map: { value: wispTexture() },
        },
        vertexShader: wispVertex,
        fragmentShader: wispFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    // the quads are laid in the vertex shader around the eye
    this.wisps.frustumCulled = false;
    this.group.add(this.wisps);
    this.timed.push(material, this.aurora);
    this.colors(material);
  }

  /**
   * The clouds' own colors: the map's mean over a patch around the point below the arena (where
   * the deck's frame and longitude put it), from which the haze takes its light.
   */
  private colors(material: THREE.ShaderMaterial) {
    const map = material.uniforms.map.value as THREE.Texture;
    const image = map.image as CanvasImageSource & { width: number; height: number };
    const below = across.copy(this.air.center).negate().normalize().applyMatrix3(material.uniforms.frame.value as THREE.Matrix3);
    const u = (material.uniforms.longitude.value as number) - Math.atan2(below.z, below.x) / (Math.PI * 2);
    const v = 0.5 + Math.asin(THREE.MathUtils.clamp(below.y, -1, 1)) / Math.PI;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 16;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      // a tenth of the map's width and 6 % of its height (about 11° by 11°), the map's rows from the top
      context.drawImage(image, THREE.MathUtils.euclideanModulo(u - 0.05, 1) * image.width, (1 - v - 0.03) * image.height, 0.1 * image.width, 0.06 * image.height, 0, 0, 32, 16);
      const data = context.getImageData(0, 0, 32, 16).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += data[i + k];
      const count = (data.length / 4) * 255;
      this.cloudColor.setRGB(sum[0] / count, sum[1] / count, sum[2] / count, THREE.SRGBColorSpace);
      material.uniforms.zones.value = this.cloudColor.r * 0.2126 + this.cloudColor.g * 0.7152 + this.cloudColor.b * 0.0722;
    } catch {
      // where the map cannot be read, the colors stay as set
    }
  }

  /** The haze's light at the deck and in the depths, under the arena's sun (call once the planets' light is set). */
  shine() {
    this.deckLight.copy(this.cloudColor).multiply(this.light).multiplyScalar(DECK_LIGHT);
    this.deepLight.copy(this.deckLight).multiply(DEEP_LIGHT);
  }

  /**
   * The picture's quality (tier 0 the full picture, see Landmarks.setDetail): both sheets below
   * the deck, the first, or none; the cloud tops at the tier's level (see topsGlsl); fewer wisps,
   * the haze's clouds sampled once instead of twice along a ray (see view/haze), and fewer
   * layers of the auroras (see AURORA_LAYERS).
   */
  setDetail(tier: number) {
    this.sheets.forEach((sheet, i) => (sheet.mesh.visible = sheet.depth === 0 || i < SHEETS.length - tier));
    this.sheets.at(-1)!.mesh.material.uniforms.level.value = tier;
    this.wisps.geometry.setDrawRange(0, WISPS[tier] * 6);
    this.samples = CLOUD_SAMPLES[tier];
    this.aurora.uniforms.layers.value = AURORA_LAYERS[tier];
  }

  /**
   * One frame at field time `time`: the sheets drawn from the farthest to the nearest as seen
   * from `eye`, each in the light `shade` says reaches its depth (units); the sky kept around the
   * eye, the auroras on its horizon; lightning. Returns whether a strike began (its place in
   * strikePoint), for its thunder.
   */
  update(time: number, dt: number, eye: THREE.Vector3, shade: (depth: number) => number): boolean {
    for (const material of this.timed) material.uniforms.time.value = time;
    const altitude = eye.distanceTo(this.air.center) - this.air.radius;
    for (const { mesh, depth } of this.sheets) {
      mesh.renderOrder = -Math.round(Math.abs(altitude + depth));
      mesh.material.uniforms.glow.value = shade(depth);
    }
    this.sky.position.copy(eye);
    // the clouds carried by the wind, the wisps around the eye while it is under the deck
    const clouds = HAZE_UNIFORMS.hazeClouds.value;
    clouds.set(this.wind.x * WIND * time, this.wind.y * WIND * time, this.wind.z * WIND * time, this.samples);
    const wisps = this.wisps.material.uniforms;
    this.wisps.visible = altitude < -WISP_TOP;
    this.backdrop.visible = altitude < 0;
    this.floor.visible = !this.backdrop.visible;
    this.backdrop.position.copy(eye);
    this.wisps.position.copy(eye);
    wisps.eye.value.copy(eye);
    wisps.drift.value.set(clouds.x, clouds.y, clouds.z);
    this.auroraHeights(altitude);
    this.nextStrike -= dt;
    let begun = false;
    if (this.nextStrike <= 0) {
      this.nextStrike = STRIKE_EVERY * (0.3 + 1.4 * Math.random());
      this.begin(time, eye);
      begun = true;
    }
    this.flicker(time);
    return begun;
  }

  /**
   * Where the auroras' foot and top lie on the sky seen from `altitude` over the deck (units): on
   * the limb (rad below the horizontal), and over it by as much as the shell from AURORA_FOOT to
   * AURORA_TOP rises over the limb seen from that height, at least from AURORA_LOWEST.
   */
  private auroraHeights(altitude: number) {
    const radius = this.air.radius;
    const limb = altitude > 0 ? -Math.acos(radius / (radius + altitude)) : 0;
    const eye = radius + Math.max(altitude, AURORA_LOWEST);
    const over = (height: number) => Math.acos(radius / eye) - Math.acos((radius + height) / eye);
    const uniforms = this.aurora.uniforms;
    uniforms.limb.value = limb;
    uniforms.foot.value = limb + over(AURORA_FOOT);
    uniforms.top.value = limb + over(AURORA_TOP);
    uniforms.motion.value = reducedMotion?.matches ? 0 : 1;
  }

  /** A strike from `time` on: at `at`, or by chance somewhere around and below `eye`. The screenshots start one by hand. */
  begin(time: number, eye: THREE.Vector3, at?: THREE.Vector3) {
    const strike = (this.strike ??= { position: new THREE.Vector3(), at: 0, strokes: [] });
    if (at) strike.position.copy(at);
    else {
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.sqrt(Math.random()) * STRIKE_REACH;
      // beside the eye, then down to its depth along the planet's radius
      across.set(Math.cos(angle) * reach, 0, Math.sin(angle) * reach).add(eye).sub(this.air.center);
      strike.position.copy(across).setLength(this.air.radius - STRIKE_TOP - (STRIKE_BOTTOM - STRIKE_TOP) * Math.random()).add(this.air.center);
    }
    strike.at = time;
    strike.strokes = Array.from({ length: STROKES }, (_, i) => (i === 0 ? 0 : Math.random() * STRIKE_SECONDS));
    this.strikePoint.copy(strike.position);
  }

  /** The strike's strokes, each a flash that dies within a tenth of a second, into the haze's flash (see view/haze). */
  private flicker(time: number) {
    const strike = this.strike;
    const flash = HAZE_UNIFORMS.hazeFlash.value;
    if (!strike) {
      flash.w = 0;
      return;
    }
    const since = time - strike.at;
    let strength = 0;
    for (const stroke of strike.strokes) if (since >= stroke) strength = Math.max(strength, Math.exp(-(since - stroke) / 0.06));
    flash.set(strike.position.x, strike.position.y, strike.position.z, strength * FLASH_STRENGTH);
    if (since > STRIKE_SECONDS + 0.5) this.strike = null;
  }

  /** Nothing of the weather goes on while the arena is not shown. */
  calm() {
    this.strike = null;
    HAZE_UNIFORMS.hazeFlash.value.w = 0;
  }
}
