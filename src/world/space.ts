import * as THREE from 'three';
import { radialTexture } from '../view/textures';
import { IMPOSTOR_SUN } from '../view/impostor';
import { CLOUD_SHAPES, MAX_NEBULAE, cloudTexture, type Mood } from './nebula';
import { skyTurn, Starmap } from './starmap';
import type { SkyFiles } from '../assets';

const STAR_COUNT = 6000;
const SKY_RADIUS = 300000;
const DUST_COUNT = 1500;
/** Edge length of the dust volume that wraps around the camera. */
const DUST_SIZE = 12000;

/**
 * A room in space that motes stay out of: the matrix takes a point of the world into a box of
 * ±1 on every axis, and every mote drawn around the camera (the dust, the Rings' specks and
 * grains) is gone inside it, fading in over 3 % of its half sizes outside it, so none pops
 * where it crosses the box and none shows half faded against a wall within: motes against a
 * room's walls would read as stars seen through them. The President's battleship puts its
 * hangar deck here while it is shown (see game/fleet); otherwise the box sits nowhere (every
 * point lands outside it). Looks only.
 */
export const shelter = { value: new THREE.Matrix4() };
/** Puts the shelter nowhere: every point of the world lands at (2, 2, 2), outside the box. */
export function unshelter() {
  shelter.value.makeScale(0, 0, 0).setPosition(2, 2, 2);
}
unshelter();
/** GLSL: `outside(world)` is 1 for a point of the world outside the shelter, 0 inside, soft in between. */
export const shelterPars = /* glsl */ `
  uniform mat4 shelter;
  float outside(vec3 world) {
    vec3 at = abs((shelter * vec4(world, 1.0)).xyz);
    return smoothstep(1.0, 1.03, max(at.x, max(at.y, at.z)));
  }
`;

const dustVertex = /* glsl */ `
  uniform float size;
  varying float vFade;
  ${shelterPars}
  void main() {
    // the dust is fixed in the world; the volume wraps around the camera
    vec3 offset = mod(position - cameraPosition + size * 0.5, size) - size * 0.5;
    vFade = (1.0 - smoothstep(size * 0.25, size * 0.5, length(offset))) * outside(cameraPosition + offset);
    vec4 mvPosition = viewMatrix * vec4(cameraPosition + offset, 1.0);
    gl_PointSize = clamp(1500.0 / -mvPosition.z, 1.0, 3.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 tint;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(tint * vFade, 1.0);
  }
`;

/**
 * The same dust drawn as streaks: every mote is a line from where it is to where it was
 * STREAK_SECONDS ago, seen from the moving ship, so speed shows as the dust rushing past.
 */
const streakVertex = /* glsl */ `
  uniform float size;
  uniform vec3 velocity;
  uniform vec3 drift;
  uniform float strength;
  attribute float tail;
  varying float vFade;
  ${shelterPars}
  void main() {
    vec3 offset = mod(position + drift - cameraPosition + size * 0.5, size) - size * 0.5;
    vFade = (1.0 - smoothstep(size * 0.2, size * 0.45, length(offset))) * strength * (1.0 - tail * 0.85) * outside(cameraPosition + offset);
    vec3 world = cameraPosition + offset + velocity * tail;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const streakFragment = /* glsl */ `
  uniform vec3 tint;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(tint * vFade, 1.0);
  }
`;

/**
 * Motes drawn as streaks (see streakVertex), one line each from `positions` (x, y, z per mote,
 * within a cube of edge `size` that wraps around the camera), in `tint`. The uniforms say how:
 * `velocity` the way a mote seems to have come in a streak's time (zero draws a point),
 * `strength` how bright, `drift` how far the motes have moved with what carries them (zero for
 * dust at rest).
 */
export function dustStreaks(positions: Float32Array, size: number, tint: THREE.Color): THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial> {
  // every mote twice: its head where it is, its tail where it was
  const count = positions.length / 3;
  const ends = new Float32Array(count * 6);
  const tails = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    ends.set(positions.subarray(i * 3, i * 3 + 3), i * 6);
    ends.set(positions.subarray(i * 3, i * 3 + 3), i * 6 + 3);
    tails[i * 2 + 1] = 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(ends, 3));
  geometry.setAttribute('tail', new THREE.BufferAttribute(tails, 1));
  const streaks = new THREE.LineSegments(geometry, new THREE.ShaderMaterial({
    uniforms: { size: { value: size }, velocity: { value: new THREE.Vector3() }, drift: { value: new THREE.Vector3() }, strength: { value: 0 }, tint: { value: tint }, shelter },
    vertexShader: streakVertex,
    fragmentShader: streakFragment,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  }));
  streaks.frustumCulled = false;
  streaks.visible = false;
  return streaks;
}
/** A streak is as long as the way the ship travels in this time (s): 250 m/s draws 12.5 m lines. */
const STREAK_SECONDS = 0.05;
/** Streaks show from this speed on (units/s, 20 m/s) and are at full strength from STREAK_FULL (units/s, 200 m/s). */
const STREAK_START = 400;
const STREAK_FULL = 4000;
/** Size of the area the sun's shadow map covers, centered on the field. */
const SHADOW_REACH = 140000;
/** Direction towards the sun; it sits in front of the ships at spawn. */
export const SUN_DIRECTION = new THREE.Vector3(0.25, 0.15, -1).normalize();

/** The dust's streaks are this much brighter than the dust's motes, in the dust's tint. */
const STREAK_GAIN = 1.2;

/** How much larger the sun looks at a solar flare's height. */
const FLARE_SWELL = 2.5;
/** How much brighter it lights the field then. */
const FLARE_GLARE = 2.2;
/** The color a flaring sun burns in. */
const WHITE_HOT = new THREE.Color(1, 0.97, 0.92);

/** A sharp Milky Way that was not baked is asked for again after this pause (ms), doubling with each failure. */
const SHARP_RETRY_MS = 10_000;

/** Star field, sun, nebula glow and lighting. Follows the camera so it is always at infinity. */
export class Space {
  readonly sky = new THREE.Group();
  readonly lights = new THREE.Group();
  /** Fine dust that stays in place, so drift and speed are visible even far from any rock. */
  readonly dust: THREE.Points;
  /** The dust's streaks at speed (see streakVertex). */
  readonly streaks: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly sun: THREE.Sprite;
  private readonly sunLight: THREE.DirectionalLight;
  /** The sky's faint light from all around (see shade), and the arena's own (see setMood). */
  private readonly skyLight = new THREE.HemisphereLight();
  private readonly skyColor = new THREE.Color();
  private readonly groundColor = new THREE.Color();
  private skyIntensity = 1;
  /** What the screen shows where nothing is drawn, in the arena's space (see setMood). */
  readonly background = new THREE.Color();
  /** The stars generated in code, for the arenas beyond the solar system (see Mood.starmap). */
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  /** The real sky of the arenas in the solar system and its parts (see setStarmap), its sharp Milky Way once asked for and baked, and the share of detail the rung asks for (see setDetail). */
  private starmap: Starmap | null = null;
  private files: SkyFiles | null = null;
  private sharpGlow: THREE.CubeTexture | null = null;
  private sharpAsked = false;
  private sharpFailures = 0;
  private detail = 0;
  /** Whether the arena's mood shows the real sky, and how bright its stars show (see setMood). */
  private realSky = false;
  private starShare = 1;
  /** The sky's nebulae, MAX_NEBULAE sprites: an arena shows as many as it has, the rest are hidden (see setMood). */
  private readonly nebulae: THREE.Sprite[] = [];
  /** The clouds' shapes, made once; each arena tints, places and turns them (see setMood). */
  private readonly clouds = Array.from({ length: CLOUD_SHAPES }, (_, shape) => cloudTexture(shape + 1));
  private readonly dustTint = new THREE.Color();
  private readonly streakTint = new THREE.Color();
  /** The share of the sun's light that reaches the camera through an arena's haze (see shade), and how bright the sun shines before it (see flare). */
  private sunShare = 1;
  private sunBright = 1;
  /** The arena's sun as setSun set it, which a solar flare heats up (see flare). */
  private readonly sunBase = { size: 30000, intensity: 3.2, color: new THREE.Color(0xfff0dd) };

  constructor() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const color = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < STAR_COUNT; i++) {
      v.randomDirection().multiplyScalar(SKY_RADIUS);
      positions.set([v.x, v.y, v.z], i * 3);
      const brightness = Math.pow(Math.random(), 3) * 0.9 + 0.1;
      color.setHSL(0.55 + Math.random() * 0.15 - (Math.random() < 0.2 ? 0.5 : 0), 0.4, brightness);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    stars.frustumCulled = false;
    this.sky.add(stars);
    this.stars = stars;

    for (let i = 0; i < MAX_NEBULAE; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.clouds[i % CLOUD_SHAPES], blending: THREE.AdditiveBlending, depthWrite: false }));
      sprite.visible = false;
      this.nebulae.push(sprite);
      this.sky.add(sprite);
    }

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      // seen from space the sun is white: a blinding disk in a pale glare, no orange of a sunset
      map: radialTexture([[0, '#ffffff'], [0.14, '#ffffff'], [0.22, 'rgba(255, 250, 238, 0.55)'], [0.5, 'rgba(255, 244, 225, 0.14)'], [1, 'rgba(255, 238, 215, 0)']]),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    sun.position.copy(SUN_DIRECTION).multiplyScalar(SKY_RADIUS * 0.8);
    sun.scale.setScalar(30000);
    this.sky.add(sun);
    this.sun = sun;
    this.sky.renderOrder = -1;

    const dustPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < dustPositions.length; i++) dustPositions[i] = Math.random() * DUST_SIZE;
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({
      uniforms: { size: { value: DUST_SIZE }, tint: { value: this.dustTint }, shelter },
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.dust.frustumCulled = false;

    this.streaks = dustStreaks(dustPositions, DUST_SIZE, this.streakTint);

    // The asteroids cast shadows over the whole field; a ship in their shadow goes dark.
    const sunLight = new THREE.DirectionalLight(0xfff0dd, 3.2);
    sunLight.position.copy(SUN_DIRECTION).multiplyScalar(SHADOW_REACH);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(4096, 4096);
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 40;
    Object.assign(sunLight.shadow.camera, {
      left: -SHADOW_REACH * 0.5,
      right: SHADOW_REACH * 0.5,
      top: SHADOW_REACH * 0.5,
      bottom: -SHADOW_REACH * 0.5,
      near: 1000,
      far: SHADOW_REACH * 2,
    });
    sunLight.shadow.camera.updateProjectionMatrix();
    this.lights.add(sunLight, sunLight.target);
    this.sunLight = sunLight;
    this.lights.add(this.skyLight);
    IMPOSTOR_SUN.direction.value.copy(SUN_DIRECTION);
    this.flare(0);
  }

  /**
   * The picture's quality (see view/quality): the sun's shadow map `shadows` px on an edge, 0
   * for no shadows (the rocks then leave the ships lit), and the share of the dust drawn.
   */
  setLook(shadows: number, dust: number) {
    const light = this.sunLight;
    light.castShadow = shadows > 0;
    if (shadows > 0 && light.shadow.mapSize.x !== shadows) {
      light.shadow.mapSize.set(shadows, shadows);
      // the map is made anew at its new size with the next frame
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    this.dust.geometry.setDrawRange(0, Math.round(DUST_COUNT * dust));
    this.streaks.geometry.setDrawRange(0, Math.round(DUST_COUNT * dust) * 2);
  }

  /**
   * The real sky (see world/starmap), once its stars are loaded and its Milky Way baked at the
   * smallest of MILKY_WAY_SIZES. Until then, and in the arenas beyond the solar system, the
   * stars generated in code show.
   */
  setStarmap(sky: SkyFiles) {
    this.files = sky;
    this.starmap = new Starmap(sky.stars, sky.glow, skyTurn(SUN_DIRECTION), SKY_RADIUS);
    this.sky.add(this.starmap.group);
    this.setDetail(this.detail);
  }

  /**
   * The share of the landmarks' detail (see view/quality, Look.landmark): from half the share on
   * the real sky's Milky Way shows from its sharp cube map (see MILKY_WAY_SIZES), baked the
   * first time it is asked for, so a phone on the cheaper rungs never spends the time and memory
   * on it.
   */
  setDetail(share: number) {
    this.detail = share;
    if (share >= 0.5 && this.files && !this.sharpAsked) {
      this.sharpAsked = true;
      this.files.sharp().then(
        (glow) => {
          this.sharpGlow = glow;
          this.showSky();
        },
        (error: unknown) => {
          console.warn('The sharp Milky Way was not baked', error);
          // asked again after a pause, doubling with each failure
          if (this.sharpAsked) setTimeout(() => this.setDetail(this.detail), SHARP_RETRY_MS * 2 ** this.sharpFailures++);
          this.sharpAsked = false;
        },
      );
    }
    this.showSky();
  }

  /** Shows the real sky or the generated stars as the mood asks, the glow as sharp as wanted and loaded. */
  private showSky() {
    const real = this.realSky && !!this.starmap;
    this.stars.visible = !real;
    this.stars.material.color.setScalar(this.starShare);
    if (!this.starmap || !this.files) return;
    this.starmap.group.visible = real;
    this.starmap.setBrightness(this.starShare);
    this.starmap.setGlow((this.detail >= 0.5 && this.sharpGlow) || this.files.glow);
  }

  /** The sun of an arena: its size in the sky, and how bright and in which color it lights the field. */
  setSun(sun: { size: number; intensity: number; color: number }) {
    this.sunBase.size = sun.size;
    this.sunBase.intensity = sun.intensity;
    this.sunBase.color.set(sun.color);
    this.flare(0);
  }

  /**
   * An arena's light and color mood (see Mood): its space's color, the sky's light, its
   * nebulae, how bright its stars show, the dust's tint. The color grade is the output pass's
   * (see view/grade).
   */
  setMood(mood: Mood) {
    this.background.set(mood.space);
    this.skyColor.set(mood.sky);
    this.groundColor.set(mood.ground);
    this.skyIntensity = mood.ambient;
    this.skyLight.position.copy(mood.sunward ? SUN_DIRECTION : THREE.Object3D.DEFAULT_UP);
    this.realSky = mood.starmap;
    this.starShare = mood.stars;
    this.showSky();
    this.nebulae.forEach((sprite, i) => {
      const nebula = mood.nebulae[i];
      sprite.visible = !!nebula;
      if (!nebula) return;
      const material = sprite.material;
      material.map = this.clouds[nebula.shape % CLOUD_SHAPES];
      material.color.setRGB(...nebula.color);
      material.rotation = nebula.turn;
      sprite.position.set(...nebula.at).normalize().multiplyScalar(SKY_RADIUS * 0.9);
      sprite.scale.setScalar(nebula.size);
    });
    this.dustTint.setRGB(...mood.dust);
    this.streakTint.copy(this.dustTint).multiplyScalar(STREAK_GAIN);
    this.shade(1, 1, null, null);
  }

  /**
   * The sun in a solar flare, `heat` from 0 (calm) to 1 (the flare at its height): it swells to
   * FLARE_SWELL times its size and burns FLARE_GLARE times as bright, white-hot, so every rock
   * throws a long hard shadow across the field.
   */
  flare(heat: number) {
    const base = this.sunBase;
    this.sun.scale.setScalar(base.size * (1 + (FLARE_SWELL - 1) * heat));
    this.sun.material.color.copy(base.color).lerp(WHITE_HOT, heat);
    this.sunBright = base.intensity * (1 + (FLARE_GLARE - 1) * heat);
    this.sunLight.color.copy(base.color).lerp(WHITE_HOT, heat * 0.6);
    this.shine();
  }

  /**
   * The light in an arena's haze (see view/haze): `sun` of the sun's light and `sky` of the sky's
   * reach the camera; where the sun's light is lost, the sky's light takes the haze's colors, `deck`
   * from above and `deep` from below (none outside any haze).
   */
  shade(sun: number, sky: number, deck: THREE.Color | null, deep: THREE.Color | null) {
    this.sunShare = sun;
    const light = this.skyLight;
    light.intensity = this.skyIntensity * sky;
    light.color.copy(this.skyColor);
    light.groundColor.copy(this.groundColor);
    if (deck && deep) {
      light.color.lerp(deck, 1 - sun);
      light.groundColor.lerp(deep, 1 - sun);
    }
    this.shine();
  }

  /** The sun's light as the flare and the haze leave it; the billboards take the sun's and the sky's light as the lights give them (see view/impostor). */
  private shine() {
    this.sunLight.intensity = this.sunBright * this.sunShare;
    IMPOSTOR_SUN.color.value.copy(this.sunLight.color).multiplyScalar(this.sunLight.intensity);
    const sky = this.skyLight;
    IMPOSTOR_SUN.sky.value.copy(sky.color).multiplyScalar(sky.intensity);
    IMPOSTOR_SUN.ground.value.copy(sky.groundColor).multiplyScalar(sky.intensity);
    IMPOSTOR_SUN.up.value.copy(sky.position).normalize();
  }

  /** Keeps the sky at infinity; the dust streaks along `velocity`, the motion of whoever the camera rides with. */
  follow(camera: THREE.Camera, velocity: THREE.Vector3 | null) {
    this.sky.position.copy(camera.position);
    const speed = velocity?.length() ?? 0;
    const strength = THREE.MathUtils.smoothstep(speed, STREAK_START, STREAK_FULL);
    this.streaks.visible = strength > 0;
    if (!velocity || !this.streaks.visible) return;
    const uniforms = this.streaks.material.uniforms;
    uniforms.strength.value = strength;
    // the tail lies where the mote was, seen from the ship: ahead along the ship's own motion
    uniforms.velocity.value.copy(velocity).multiplyScalar(STREAK_SECONDS);
  }
}
