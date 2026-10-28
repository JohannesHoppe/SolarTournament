import * as THREE from 'three';
import { altitudeIn, HAZE_SHAPE, type Air } from '../world/air';
import { Randomizer } from '../random';

/**
 * The haze of an arena's air (see world/air) in the picture: a height fog computed in the
 * shader of everything drawn in the world (rocks, ships, gates, wreckage, effects, the sky), the
 * same sum of the haze along the view ray the game's senses use, so a ship fades from the eye
 * where its marker goes. It takes three.js's fog chunks: every material with `fog` on draws it
 * while the scene has a fog, which only an arena with air sets (see Haze.fog); elsewhere no
 * shader carries it. What the flight computer draws (the HUD, the racing line, the reference
 * plane's grid) keeps clear of it.
 *
 * The light the haze scatters towards the eye: hazeDeck right under the cloud deck, darkening to
 * hazeDeep LIGHT_DEPTH (units, 1.2 km) deeper, taken where the ray gathers most of its haze;
 * lightning (hazeFlash: where, and how bright) lights the haze around it within FLASH_REACH
 * (units, 400 m) in FLASH_COLOR. Additive materials (glows, beams, particles) only fade.
 *
 * Under the deck the haze's light is not one color: it is the light of the clouds the ray runs
 * into (see CLOUD_GLSL), lighter banks and darker belts and towers, brighter looking up towards
 * the deck and darker looking down. That only changes the light the haze scatters, never how
 * much of a point's own light gets through, so what the senses see is what the eye sees.
 */
export const LIGHT_DEPTH = 24000;
const FLASH_REACH = 8000;
export const FLASH_COLOR = new THREE.Color(0.75, 0.82, 1);

/**
 * The clouds in the haze: banks BANK_WIDTH across and BANK_HEIGHT tall right under the deck
 * (units, 300 m and 70 m, flat as layers of cloud are), dark towers TOWER_WIDTH across and
 * TOWER_HEIGHT tall (units, 200 m and 1.5 km), all smaller by e every CLOUD_SHRINK deeper (units,
 * 1.3 km: a tenth at 3 km), so they keep their size against what the eye sees there. They shift
 * the depth whose light the haze scatters by up to CLOUD_LIGHT (units, 650 m) up or down, a view
 * straight up by RISE_LIGHT up (units, 300 m), a view straight down as far down; the light's
 * share of the deck's grows past the deck's own up to LIGHTEST (the lighter zones, paler than
 * the haze right under the deck). They fade in over CLOUD_FADE under the deck (units, 25 m). The ray samples them where it gathers its haze: SAMPLE_NEAR and SAMPLE_FAR of
 * the distance at which the eye's haze reaches an optical depth of 1, never beyond the point,
 * so a point the haze hides has the light of what lies behind it.
 */
const BANK_WIDTH = 6000;
const BANK_HEIGHT = 1400;
const TOWER_WIDTH = 4000;
const TOWER_HEIGHT = 30000;
export const CLOUD_SHRINK = 26000;
const CLOUD_LIGHT = 13000;
const RISE_LIGHT = 6000;
const LIGHTEST = 1.3;
const CLOUD_FADE = 500;
/**
 * The cloud tops' eddies under the deck (see world/jupiter): the banks and towers are shoved about
 * by up to SWIRL_SHOVE (units, 300 m right under the deck, smaller deeper as the clouds are) on a
 * noise SWIRL_WIDTH across (units, 600 m), so they curl as the tops above them do.
 */
const SWIRL_WIDTH = 12000;
const SWIRL_SHOVE = 12000;
const SAMPLE_NEAR = 0.8;
const SAMPLE_FAR = 2;
/** The noise the clouds are made of: NOISE_SIZE² texels of value noise, the second channel the first shifted by NOISE_SHIFT per layer, so one lookup reads two layers of a 3D noise. */
const NOISE_SIZE = 256;
const NOISE_SHIFT = [37, 17];

/** The clouds' noise texture (see NOISE_SIZE), the same on every browser. */
function cloudNoise(): THREE.DataTexture {
  const random = new Randomizer(0x5a17c0d);
  const values = Float32Array.from({ length: NOISE_SIZE * NOISE_SIZE }, () => random.nextFloat());
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const o = (y * NOISE_SIZE + x) * 4;
      const shifted = ((y + NOISE_SHIFT[1]) % NOISE_SIZE) * NOISE_SIZE + ((x + NOISE_SHIFT[0]) % NOISE_SIZE);
      data[o] = Math.round(values[shifted] * 255);
      data[o + 1] = Math.round(values[y * NOISE_SIZE + x] * 255);
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The haze's uniforms, shared by every material that draws it. hazeClouds: how far the wind has
 * carried the clouds (xyz, units) and how many samples a ray takes of them (w: 0 none, 1 or 2;
 * see Jupiter.setDetail).
 */
export const HAZE_UNIFORMS = {
  hazeCenter: { value: new THREE.Vector3() },
  hazeRadius: { value: 0 },
  hazeDeck: { value: new THREE.Color() },
  hazeDeep: { value: new THREE.Color() },
  hazeFlash: { value: new THREE.Vector4() },
  hazeClouds: { value: new THREE.Vector4() },
  hazeNoise: { value: cloudNoise() },
};

const f = (value: number) => value.toFixed(8);

/**
 * The clouds in the haze (see BANK_WIDTH): hazeCloud(p, up) is how much lighter (up to 1) or
 * darker (down to about -2) the clouds at a point make the haze's light, `up` the deck's normal
 * near the eye.
 */
const CLOUD_GLSL = /* glsl */ `
  float hazeNoise3(vec3 x) {
    vec3 p = floor(x);
    vec3 s = fract(x);
    s = s * s * (3.0 - 2.0 * s);
    vec2 uv = p.xy + vec2(${f(NOISE_SHIFT[0])}, ${f(NOISE_SHIFT[1])}) * p.z + s.xy;
    vec2 layers = texture2D(hazeNoise, (uv + 0.5) / ${f(NOISE_SIZE)}).yx;
    return mix(layers.x, layers.y, s.z);
  }
  // two layers of the noise at once, smooth across a cell (as hazeNoise3 at a whole layer)
  vec2 hazeNoise2(vec2 x) {
    vec2 s = fract(x);
    return texture2D(hazeNoise, (floor(x) + s * s * (3.0 - 2.0 * s) + 0.5) / ${f(NOISE_SIZE)}).yx;
  }
  float hazeCloud(vec3 point, vec3 up, float altitude) {
    vec3 q = point - hazeClouds.xyz;
    vec3 across = q - up * dot(q, up);
    float grow = exp(-min(altitude, 0.0) / ${f(CLOUD_SHRINK)});
    // the eddies of the cloud tops reach down: the banks shoved about in swirls across the deck's plane
    vec3 side = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 ahead = cross(up, side);
    vec2 eddy = hazeNoise2(vec2(dot(across, side), dot(across, ahead)) * (grow / ${f(SWIRL_WIDTH)})) - 0.5;
    across += (side * eddy.x + ahead * eddy.y) * (${f(SWIRL_SHOVE)} / grow);
    // the height's coordinate grows as the clouds shrink, so a bank keeps its height in its own depth
    float level = -grow * ${f(CLOUD_SHRINK / BANK_HEIGHT)};
    vec3 bank = across * (grow / ${f(BANK_WIDTH)}) + up * level;
    float banks = 0.65 * hazeNoise3(bank) + 0.35 * hazeNoise3(bank * 2.7 + 11.3);
    vec3 tower = across * (grow / ${f(TOWER_WIDTH)}) + up * (level * ${f(BANK_HEIGHT / TOWER_HEIGHT)}) + 37.0;
    return 2.6 * (banks - 0.5) - 1.6 * smoothstep(0.58, 0.85, hazeNoise3(tower));
  }
`;

/**
 * The haze along a ray from `eye` to `point` (both in the world): the light it scatters towards
 * the eye (rgb) and how much of the point's own light gets through (a). The sum of the haze is
 * world/air's opticalDepth, written out in GLSL.
 */
export const HAZE_GLSL = /* glsl */ `
  uniform vec3 hazeCenter;
  uniform float hazeRadius;
  uniform vec3 hazeDeck;
  uniform vec3 hazeDeep;
  uniform vec4 hazeFlash;
  uniform vec4 hazeClouds;
  uniform sampler2D hazeNoise;
  ${CLOUD_GLSL}
  float hazeHeight(float altitude) { return altitude > 0.0 ? ${f(HAZE_SHAPE.top)} : ${f(HAZE_SHAPE.scale)}; }
  float hazeShare(float altitude) { return altitude > 0.0 ? ${f(HAZE_SHAPE.topDensity)} : 1.0; }
  float hazeFalloff(float altitude) { return exp(-max(altitude, ${f(-HAZE_SHAPE.deepest * HAZE_SHAPE.scale)}) / hazeHeight(altitude)); }
  float hazeDensity(float altitude) { return hazeShare(altitude) * hazeFalloff(altitude); }
  float hazeColumn(float altitude) { return hazeShare(altitude) * hazeHeight(altitude) * (1.0 - hazeFalloff(altitude)); }
  vec4 hazeAlong(vec3 eye, vec3 point) {
    float from = distance(eye, hazeCenter) - hazeRadius;
    float to = distance(point, hazeCenter) - hazeRadius;
    float rise = to - from;
    float mean = abs(rise) < 10.0 ? hazeDensity(0.5 * (from + to)) : (hazeColumn(to) - hazeColumn(from)) / rise;
    vec3 ray = point - eye;
    float depth = ${f(HAZE_SHAPE.haze)} * length(ray) * mean;
    float deep = min(mix(from, to, 0.5 / max(depth, 1.0)), 0.0);
    float cloud = 0.0;
    if (hazeClouds.w > 0.5 && from < 0.0) {
      // the clouds where the ray gathers its haze, and the light from above
      float far = length(ray);
      vec3 view = ray / max(far, 1.0);
      vec3 up = normalize(eye - hazeCenter);
      float gather = 1.0 / (${f(HAZE_SHAPE.haze)} * hazeDensity(from));
      float near = min(${f(SAMPLE_NEAR)} * gather, far);
      cloud = hazeCloud(eye + view * near, up, from + dot(view, up) * near);
      if (hazeClouds.w > 1.5) {
        float beyond = min(${f(SAMPLE_FAR)} * gather, far);
        cloud = mix(cloud, hazeCloud(eye + view * beyond, up, from + dot(view, up) * beyond), 0.45);
      }
      cloud *= smoothstep(0.0, ${f(-CLOUD_FADE)}, from);
      deep += cloud * ${f(CLOUD_LIGHT)} + smoothstep(0.0, ${f(-CLOUD_FADE)}, from) * dot(view, up) * ${f(RISE_LIGHT)};
    }
    vec3 light = mix(hazeDeep, hazeDeck, min(exp(deep / ${f(LIGHT_DEPTH)}), ${f(LIGHTEST)}));
    // lightning lights the clouds around it, the dense ones most
    vec3 closest = eye + ray * clamp(dot(hazeFlash.xyz - eye, ray) / max(dot(ray, ray), 1.0), 0.0, 1.0);
    light += vec3(${f(FLASH_COLOR.r)}, ${f(FLASH_COLOR.g)}, ${f(FLASH_COLOR.b)}) * hazeFlash.w * max(1.0 + 0.6 * cloud, 0.2) * exp(-distance(closest, hazeFlash.xyz) / ${f(FLASH_REACH)});
    return vec4(light, exp(-depth));
  }
`;

/** three.js's fog chunks, as the haze: the vertex's place in the world, and the haze between it and the eye. */
const CHUNKS = {
  fog_pars_vertex: /* glsl */ `
    #ifdef USE_FOG
      varying vec3 vHazeWorld;
    #endif
  `,
  // the view matrix is a turn and a shift: its turn transposed brings the view's point back
  fog_vertex: /* glsl */ `
    #ifdef USE_FOG
      vHazeWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
    #endif
  `,
  fog_pars_fragment: /* glsl */ `
    #ifdef USE_FOG
      varying vec3 vHazeWorld;
      uniform float hazeAdditive;
      ${HAZE_GLSL}
    #endif
  `,
  fog_fragment: /* glsl */ `
    #ifdef USE_FOG
      vec4 hazed = hazeAlong( cameraPosition, vHazeWorld );
      gl_FragColor.rgb = hazeAdditive > 0.5 ? gl_FragColor.rgb * hazed.a : mix( hazed.rgb, gl_FragColor.rgb, hazed.a );
    #endif
  `,
};

/**
 * Gives a material's shader the haze's uniforms (shared) and its own blending's (an additive
 * glow only fades), and the fog uniforms three.js refreshes for any material with `fog` on. Every
 * material calls it before it compiles (see installHaze); one with an onBeforeCompile of its own
 * calls it there.
 */
export function hazeUniforms(shader: { uniforms: Record<string, THREE.IUniform> }, material: THREE.Material) {
  Object.assign(shader.uniforms, HAZE_UNIFORMS);
  shader.uniforms.hazeAdditive = { value: material.blending === THREE.AdditiveBlending ? 1 : 0 };
  shader.uniforms.fogColor ??= { value: new THREE.Color() };
  shader.uniforms.fogNear ??= { value: 1 };
  shader.uniforms.fogFar ??= { value: 1000 };
}

let installed = false;

/** Puts the haze into three.js's fog chunks and every material's compile, once for the page. */
export function installHaze() {
  if (installed) return;
  installed = true;
  Object.assign(THREE.ShaderChunk, CHUNKS);
  THREE.Material.prototype.onBeforeCompile = function (this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
    hazeUniforms(shader, this);
  };
}

/** The sky's diffuse light falls off with the haze above as if it were SKY_SPREAD times thinner (scattered light finds its way down), to no less than SKY_FLOOR of it. */
const SKY_SPREAD = 1.5;
const SKY_FLOOR = 0.06;

/** How much of the sun's light and the sky's reaches a place in the haze, for the lights of the scene (see Space.shade). */
export interface Shade {
  sun: number;
  sky: number;
}

/**
 * The haze of the arena in play: the scene's fog while it has air, its shape and colors in the
 * shared uniforms, a flash of lightning, and how much light reaches the eye's altitude: the
 * sun's direct light falls off with the haze above it along the sun's low path, the sky's
 * diffuse light more gently, down to SKY_FLOOR of it (units).
 */
export class Haze {
  /** Set on the scene while the arena has air (three.js then compiles the fog chunks in). */
  readonly fog = new THREE.Fog(0x000000, 1, 2);
  air: Air | null = null;
  private readonly shade: Shade = { sun: 1, sky: 1 };

  /** The arena's air, or none; the light the haze scatters at the deck and in the depths. */
  setAir(air: Air | null, deck?: THREE.Color, deep?: THREE.Color) {
    this.air = air;
    if (!air) return;
    HAZE_UNIFORMS.hazeCenter.value.copy(air.center);
    HAZE_UNIFORMS.hazeRadius.value = air.radius;
    if (deck) HAZE_UNIFORMS.hazeDeck.value.copy(deck);
    if (deep) HAZE_UNIFORMS.hazeDeep.value.copy(deep);
  }

  /** How much of the sun's and the sky's light reaches `eye` through the haze above it. */
  shadeAt(eye: THREE.Vector3, sunHeight: number): Shade {
    const shade = this.shade;
    if (!this.air) {
      shade.sun = shade.sky = 1;
      return shade;
    }
    const altitude = altitudeIn(this.air, eye);
    shade.sun = Math.exp(-hazeAbove(altitude) / Math.max(sunHeight, 0.05));
    shade.sky = skyLight(altitude);
    return shade;
  }
}

/** The haze from an altitude (units) straight up to space: the optical depth of the air and the deck above it (see world/air), leaving out the faint haze over the deck. */
const hazeAbove = (altitude: number) => (altitude >= 0 ? 0 : HAZE_SHAPE.deck + HAZE_SHAPE.haze * HAZE_SHAPE.scale * (Math.exp(-altitude / HAZE_SHAPE.scale) - 1));

/** The share of the sky's diffuse light that reaches an altitude (units) through the haze above it. */
export const skyLight = (altitude: number) => SKY_FLOOR + (1 - SKY_FLOOR) * Math.exp(-hazeAbove(altitude) / SKY_SPREAD);
