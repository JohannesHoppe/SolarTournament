import * as THREE from 'three';
import { altitudeIn, HAZE_SHAPE, type Air } from '../world/air';

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
 */
const LIGHT_DEPTH = 24000;
const FLASH_REACH = 8000;
const FLASH_COLOR = new THREE.Color(0.75, 0.82, 1);

/** The haze's uniforms, shared by every material that draws it. */
export const HAZE_UNIFORMS = {
  hazeCenter: { value: new THREE.Vector3() },
  hazeRadius: { value: 0 },
  hazeDeck: { value: new THREE.Color() },
  hazeDeep: { value: new THREE.Color() },
  hazeFlash: { value: new THREE.Vector4() },
};

const f = (value: number) => value.toFixed(8);

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
    vec3 light = mix(hazeDeep, hazeDeck, exp(deep / ${f(LIGHT_DEPTH)}));
    vec3 closest = eye + ray * clamp(dot(hazeFlash.xyz - eye, ray) / max(dot(ray, ray), 1.0), 0.0, 1.0);
    light += vec3(${f(FLASH_COLOR.r)}, ${f(FLASH_COLOR.g)}, ${f(FLASH_COLOR.b)}) * hazeFlash.w * exp(-distance(closest, hazeFlash.xyz) / ${f(FLASH_REACH)});
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
