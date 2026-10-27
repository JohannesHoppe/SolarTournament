import * as THREE from 'three';
import { fbm, noise3 } from './landmarks';
import { SUN_DIRECTION } from './space';
import type { Air } from './air';
import { HAZE_UNIFORMS } from '../view/haze';

/**
 * Jupiter around its arena, besides its map (see world/landmarks): the cloud deck as a
 * translucent sheet in the map's colors, two thinner sheets below it, lightning in the clouds,
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
 * haze over it is so thick that only the haze's light shows, never the space behind.
 */
const FLOOR_DEPTH = 100000;
const FLOOR_CAP = 1;
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
  private strike: Strike | null = null;
  private nextStrike = STRIKE_EVERY;
  /** The map's mean color around the point below the arena (linear). */
  private readonly cloudColor = new THREE.Color(0.55, 0.42, 0.3);
  /** How far from the eye the deck draws the winds' fine streaks, on the rungs that do (units). */
  private readonly fineReach: number;

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
    this.group.add(floor);
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
   * the deck, the first, or none; on the cheapest the deck without the winds' fine streaks.
   */
  setDetail(tier: number) {
    this.sheets.forEach((sheet, i) => (sheet.mesh.visible = sheet.depth === 0 || i < SHEETS.length - tier));
    const deck = this.sheets.at(-1)!.mesh.material;
    deck.uniforms.reach.value = tier < 2 ? this.fineReach : 0;
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
