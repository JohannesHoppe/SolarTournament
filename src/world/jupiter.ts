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
 * The auroras around the south pole, 77° from the arena across the planet: a band of curtains on
 * the sky over the southern horizon, AURORA_DISTANCE from the eye (units, 30 km, inside the
 * camera's reach), AURORA_SPAN to either side of the pole's direction (rad, 35°), rising
 * AURORA_RISE over the horizon (rad, 4°).
 */
const AURORA_DISTANCE = 600000;
const AURORA_SPAN = 0.6;
const AURORA_RISE = 0.07;
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
 * map's sphere: see landmarks' gasFragment). DECK is the cloud deck: the map sharp, drawn out
 * by the winds within `reach` of the eye, with gaps where it thins; seen from above lit by the
 * sun as cloud tops are, from below glowing dimly with the light that comes through. A sheet
 * below it is the map blurred, in the light the haze lets down to it (`glow`), with wider gaps.
 * The thicker a sheet looks the more slanted the view through it; it fades out up close; the
 * lightning lights it from within; the haze (see view/haze) lies over it as over everything.
 * Built when first used, as landmarks (whose noise it takes) imports this module.
 */
const sheetFragment = () => /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  uniform vec3 light;
  uniform mat3 frame;
  uniform sampler2D map;
  uniform float texel;
  uniform float longitude;
  uniform float reach;
  uniform float cover;
  uniform float glow;
  uniform vec4 sheet;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  ${noise3}
  ${fbm}
  void main() {
    vec3 planet = normalize(frame * vLocal);
    float turn = time * 0.0004;
    vec3 q = vec3(cos(turn) * planet.x - sin(turn) * planet.z, planet.y, sin(turn) * planet.x + cos(turn) * planet.z);
    float latitude = asin(clamp(q.y, -1.0, 1.0));
    vec2 uv = vec2(longitude - atan(q.z, q.x) / 6.2831853, 0.5 + latitude / 3.14159265);
    // the map's seam: the longitude whose change across the pixel is smaller
    float wrapped = fract(uv.x + 0.5) - 0.5;
    uv.x = fwidth(fract(uv.x)) <= fwidth(wrapped) ? fract(uv.x) : wrapped;
    // from above, a view that dipped through the sheet rises out of it again farther on: the
    // sheet's underside there is the same cloud, already drawn where the view went in
    if (!gl_FrontFacing && distance(cameraPosition, sheet.xyz) > sheet.w) discard;
    float away = distance(cameraPosition, vWorld);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    // gaps in the sheet, on a pattern that evens out where its cells shrink to a few pixels
    #if DECK_SHEET
      vec3 cells = q * 260.0 + vec3(0.0, 0.0, time * 0.002);
    #else
      vec3 cells = q * 120.0 + vec3(0.0, 0.0, time * 0.001);
    #endif
    float blur = length(fwidth(cells));
    float thick = mix(fbm(cells, 0.0), 0.5, smoothstep(0.25, 0.8, blur));
    float alpha = cover * mix(0.55, 1.0, smoothstep(0.32, 0.62, thick));
    #if DECK_SHEET
      float fine = reach > 0.0 ? clamp(1.0 - away / reach, 0.0, 1.0) : 0.0;
      float streaks = fine > 0.0 ? fbm(vec3(q.x * 50.0, latitude * 1200.0, q.z * 50.0) + time * 0.001, fine) : 0.5;
      vec3 color = texture2D(map, uv).rgb * mix(1.0, 0.8 + 0.4 * streaks, fine);
    #else
      vec3 color = texture2D(map, uv, 4.0).rgb;
    #endif
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
 * The auroras: curtains of light on a band of the sky (see AURORA_DISTANCE), rising from the
 * horizon (`horizon`, the elevation where the planet's limb lies as seen from the eye, rad) and
 * fading upwards, green at their foot and violet above, rippling slowly along the band, fading
 * out at its ends. Added to what lies behind; the haze dims it to nothing below the deck.
 */
const auroraVertex = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying float vElevation;
  void main() {
    vUv = uv;
    vElevation = atan(position.y, length(position.xz));
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const auroraFragment = () => /* glsl */ `
  uniform float time;
  uniform float horizon;
  varying vec2 vUv;
  varying float vElevation;
  #include <fog_pars_fragment>
  ${noise3}
  void main() {
    float above = vElevation - horizon;
    float ripple = noise(vec3(vUv.x * 9.0, time * 0.12, 0.0));
    float rays = 0.55 + 0.45 * sin(vUv.x * 170.0 + ripple * 9.0 + time * 0.4);
    float rise = ${AURORA_RISE.toFixed(3)} * (0.6 + 0.8 * noise(vec3(vUv.x * 4.0, time * 0.05, 3.0)));
    float height = smoothstep(-0.004, 0.006, above) * (1.0 - smoothstep(0.0, rise, above));
    float ends = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    vec3 color = mix(vec3(0.15, 1.0, 0.55), vec3(0.75, 0.25, 1.0), smoothstep(0.0, rise * 0.7, above));
    gl_FragColor = vec4(color * rays * height * ends * 0.55, 1.0);
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
  /** How far from the eye the deck draws the winds' fine streaks, on the rungs that do (units). */
  private readonly fineReach: number;
  /** How many samples a ray in the haze takes of its clouds (see CLOUD_SAMPLES). */
  private samples = CLOUD_SAMPLES[0];

  constructor(
    private readonly air: Air,
    deck: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>,
    caps: readonly THREE.BufferGeometry[],
    private readonly light: THREE.Color,
  ) {
    const material = deck.material;
    this.fineReach = material.uniforms.reach.value as number;
    const fragmentShader = sheetFragment();
    // the map's sphere becomes the deck: see-through where it thins, seen from both sides
    Object.assign(material, { vertexShader: sheetVertex, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
    material.defines = { DECK_SHEET: 1 };
    Object.assign(material.uniforms, { cover: { value: 0.88 }, glow: { value: 1 }, sheet: { value: new THREE.Vector4(air.center.x, air.center.y, air.center.z, air.radius) } });
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
      uniforms: { time: material.uniforms.time, horizon: { value: 0 } },
      vertexShader: auroraVertex,
      fragmentShader: auroraFragment(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    // the band faces the south pole: its direction from the arena (the map's frame turns the
    // planet's axis), laid flat; it spans the elevations from 26° below the horizontal to 14° above
    const frame = material.uniforms.frame.value as THREE.Matrix3;
    const pole = new THREE.Vector3(0, -1, 0).applyMatrix3(frame.clone().transpose());
    const bottom = Math.tan(-0.45);
    const top = Math.tan(0.25);
    const band = new THREE.CylinderGeometry(AURORA_DISTANCE, AURORA_DISTANCE, AURORA_DISTANCE * (top - bottom), 48, 1, true, Math.atan2(pole.x, pole.z) - AURORA_SPAN, AURORA_SPAN * 2);
    band.translate(0, (AURORA_DISTANCE * (top + bottom)) / 2, 0);
    const aurora = new THREE.Mesh(band, this.aurora);
    aurora.frustumCulled = false;
    // drawn before the sheets of cloud (see update), which hide its foot behind the planet's limb
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
   * the deck, the first, or none; on the cheapest the deck without the winds' fine streaks; fewer
   * wisps, and the haze's clouds sampled once instead of twice along a ray (see view/haze).
   */
  setDetail(tier: number) {
    this.sheets.forEach((sheet, i) => (sheet.mesh.visible = sheet.depth === 0 || i < SHEETS.length - tier));
    const deck = this.sheets.at(-1)!.mesh.material;
    deck.uniforms.reach.value = tier < 2 ? this.fineReach : 0;
    this.wisps.geometry.setDrawRange(0, WISPS[tier] * 6);
    this.samples = CLOUD_SAMPLES[tier];
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
    this.aurora.uniforms.horizon.value = altitude > 0 ? -Math.acos(this.air.radius / (this.air.radius + altitude)) : 0;
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
