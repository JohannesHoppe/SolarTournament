import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { textSeed } from '../random';

/**
 * Holograms: in 2584 a thing that is not there is shown as light. A projector disc at the
 * bottom, a cone of light lines opening upwards from it, and above it the object in one color as
 * a see-through volume, its edges and the rims it turns away bright, scanlines drifting through
 * it, flickering, now and then a band of it torn sideways or the whole picture dropping out for a
 * moment, turning slowly. The sponsors present their products this way (game/satire-ads); any
 * geometry with a `tone` attribute (see view/products) can stand in it, a person's bust as well.
 *
 * One small renderer of its own, created the first time a hologram shows and kept for the
 * session: a hologram shows in a window of the DOM (the sponsor break's ad slot) over the
 * game's picture, and a WebGL context made anew for each would cost more than one kept. It
 * draws only while shown, at most HOLOGRAM_FPS times a second, in seven draw calls; hidden, it
 * stops and frees the object's geometry.
 */

/** Seconds for one turn of the object. */
const TURN_SECONDS = 14;
/** Frames a second at most: a slow turn and a flicker need no more. */
export const HOLOGRAM_FPS = 30;
/** With reduced motion the object stands still, turned this far (rad) for a three-quarter view, and the picture is drawn once a second. */
export const STILL_ANGLE = -0.65;
const STILL_FPS = 1;
/** The camera looks down on the object this steeply (rad). */
const ELEVATION = 0.3;
const FOV = 26;
/** The object fills a unit box around the origin; the projector's lens lies this far below its middle, the cone opens to CONE_TOP's radius at its top. */
const LENS_Y = -0.74;
const LENS_RADIUS = 0.26;
const CONE_TOP = 0.56;
const TOP_Y = 0.5;
/** Lines of light in the cone. */
const BEAM_LINES = 28;
/** A scanline pair is this many CSS pixels high; it drifts up this many pixels a second. */
const SCAN_PIXELS = 3;
const SCAN_SPEED = 9;
/** The time is cut into slots of this many seconds; a slot glitches or drops out by chance (GLITCH_CHANCE, DROPOUT_CHANCE), for its first GLITCH_SECONDS. */
const SLOT_SECONDS = 0.25;
const GLITCH_CHANCE = 0.06;
const DROPOUT_CHANCE = 0.025;
const GLITCH_SECONDS = 0.12;

/** What a hologram shows at a time: its turn, its brightness, the band torn sideways, the scanlines' drift. */
export interface HologramState {
  /** The object's turn about the vertical (rad). */
  angle: number;
  /** The picture's brightness, 1 steady; lower in a flicker, near nothing in a dropout. */
  level: number;
  /** A band of the object (heights in its unit box) shifted sideways by `shift` (units), or none. */
  glitch: { low: number; high: number; shift: number } | null;
  /** How far the scanlines have drifted (CSS pixels). */
  scroll: number;
}

/** A fixed chance (0..1) for a slot of time and a purpose: the same flicker on every call. */
const chance = (slot: number, salt: string) => textSeed(`${salt}${slot}`) / 2147483001;

/**
 * The hologram at `time` (s); `still` with reduced motion: no flicker, no glitch, no drift, no
 * turn. An object that `swing`s (rad) turns to and fro by that much instead of all the way round.
 */
export function hologramState(time: number, still: boolean, swing = 0): HologramState {
  if (still) return { angle: STILL_ANGLE, level: 1, glitch: null, scroll: 0 };
  const turn = ((time % TURN_SECONDS) / TURN_SECONDS) * Math.PI * 2;
  const slot = Math.floor(time / SLOT_SECONDS);
  const into = time - slot * SLOT_SECONDS;
  // the tube's own flicker, a little every frame of a slot, and the link's faults by chance
  const flicker = 0.88 + 0.12 * chance(Math.floor(time * HOLOGRAM_FPS), 'flicker');
  const dropout = into < GLITCH_SECONDS * 0.6 && chance(slot, 'dropout') < DROPOUT_CHANCE;
  const torn = into < GLITCH_SECONDS && chance(slot, 'glitch') < GLITCH_CHANCE;
  const low = chance(slot, 'band') * 0.85 - 0.5;
  const shift = (chance(slot, 'shift') < 0.5 ? -1 : 1) * (0.03 + 0.08 * chance(slot, 'width'));
  return {
    angle: swing ? swing * sin(turn) : turn,
    level: dropout ? 0.12 : flicker,
    glitch: torn ? { low, high: low + 0.06 + 0.14 * chance(slot, 'height'), shift } : null,
    scroll: time * SCAN_SPEED,
  };
}

const VERTEX = /* glsl */ `
  uniform float uGlitchLow;
  uniform float uGlitchHigh;
  uniform float uGlitchShift;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vTone;
  varying float vHeight;
  #ifdef SURFACE
  attribute vec2 tone;
  #endif
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 view = viewMatrix * world;
    // the link's fault: a band of the picture torn sideways
    if (world.y > uGlitchLow && world.y < uGlitchHigh) view.x += uGlitchShift;
    vView = -view.xyz;
    vHeight = world.y;
    #ifdef SURFACE
    vNormal = normalize(normalMatrix * normal);
    vTone = tone;
    #else
    vNormal = vec3(0.0, 0.0, 1.0);
    vTone = vec2(1.0, 0.0);
    #endif
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uLevel;
  uniform float uScroll;
  uniform float uPixel;
  uniform float uGlow;
  uniform float uWhite;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vTone;
  varying float vHeight;
  void main() {
    float scan = 0.62 + 0.38 * step(0.5, fract((gl_FragCoord.y / uPixel - uScroll) / ${SCAN_PIXELS.toFixed(1)}));
    float glow = uGlow * vTone.x;
    float white = uWhite + vTone.y;
    #ifdef SURFACE
    // a volume of light: faint where it faces the eye, bright where it turns away, both sides alike
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - facing, 2.2);
    glow *= 0.1 + 1.1 * rim;
    white += rim * 0.35;
    #endif
    #ifdef BEAM
    // the projector's light fades as it rises
    float rise = clamp((vHeight - ${LENS_Y.toFixed(2)}) / ${(TOP_Y - LENS_Y).toFixed(2)}, 0.0, 1.0);
    glow *= (1.0 - rise) * (1.0 - rise);
    #endif
    vec3 color = mix(uColor, vec3(1.0), clamp(white, 0.0, 1.0)) * glow * scan * uLevel;
    // light added to what lies behind: the canvas's alpha as much as the brightest channel
    gl_FragColor = vec4(color, min(1.0, max(color.r, max(color.g, color.b))));
  }
`;

/** The uniforms every part of a hologram shares: its color, brightness, scanlines and glitch. */
type Shared = Record<'uColor' | 'uLevel' | 'uScroll' | 'uPixel' | 'uGlitchLow' | 'uGlitchHigh' | 'uGlitchShift', THREE.IUniform>;

/** A material of light: `kind` a surface (with its tone), lines or the projector's beam. */
function light(shared: Shared, kind: 'SURFACE' | 'LINES' | 'BEAM', glow: number, white = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uGlow: { value: glow }, uWhite: { value: white } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: { [kind]: '' },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

/** The hologram's look on a rung of the picture's quality (see view/quality, Look.showcase): its pixel ratio, and every how many frames it is drawn. */
let look = { pixelRatio: 2, every: 1 };
let shared: Hologram | null | undefined;

/** Sets the holograms' look (see Graphics.apply). */
export function setHologramLook(next: { pixelRatio: number; every: number }) {
  look = { pixelRatio: next.pixelRatio, every: next.every };
}

export class Hologram {
  readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
  private readonly still = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly uniforms: Shared = {
    uColor: { value: new THREE.Vector3(1, 1, 1) },
    uLevel: { value: 1 },
    uScroll: { value: 0 },
    uPixel: { value: 1 },
    uGlitchLow: { value: 0 },
    uGlitchHigh: { value: 0 },
    uGlitchShift: { value: 0 },
  };
  private readonly surface = light(this.uniforms, 'SURFACE', 1);
  private readonly edges = light(this.uniforms, 'LINES', 0.75, 0.45);
  private readonly cone: THREE.Group;
  /** A ring of light rising through the cone, again and again. */
  private readonly sweep: THREE.LineLoop;
  private readonly object = new THREE.Group();
  private frame = 0;
  private drawn = -Infinity;
  private frames = 0;
  private swing = 0;

  /** The shared hologram, made the first time; null where WebGL cannot be had. */
  static shared(): Hologram | null {
    if (shared === undefined) {
      try {
        shared = new Hologram();
      } catch (error) {
        console.warn('No hologram without WebGL', error);
        shared = null;
      }
    }
    return shared;
  }

  private constructor() {
    this.canvas.className = 'hologram';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    const { cone, sweep } = this.projector();
    this.cone = cone;
    this.sweep = sweep;
    this.scene.add(cone, this.object);
  }

  /**
   * Shows `model` (see view/products: centered in a unit box, with its tone) in `color` (CSS
   * hex) inside `host`, until stop(); turning all the way round, or to and fro by `swing` (rad).
   */
  show(host: HTMLElement, model: THREE.BufferGeometry, color: string, swing = 0) {
    this.stop();
    this.swing = swing;
    const rgb = new THREE.Color(color);
    // the brand's color as it is written, without the renderer's conversion: the shader writes display values
    rgb.convertLinearToSRGB();
    (this.uniforms.uColor.value as THREE.Vector3).set(rgb.r, rgb.g, rgb.b);
    this.object.add(new THREE.Mesh(model, this.surface), new THREE.LineSegments(new THREE.EdgesGeometry(model, 24), this.edges));
    host.replaceChildren(this.canvas);
    this.drawn = -Infinity;
    this.frame = requestAnimationFrame(this.loop);
  }

  /** Stops drawing and frees the object shown; the renderer stays for the next. */
  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const child of [...this.object.children]) {
      this.object.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) child.geometry.dispose();
    }
    this.canvas.remove();
    this.renderer.renderLists.dispose();
  }

  private readonly loop = (now: number) => {
    this.frame = requestAnimationFrame(this.loop);
    const fps = this.still.matches ? STILL_FPS : HOLOGRAM_FPS;
    if (now - this.drawn < 1000 / fps - 2) return;
    if (++this.frames % look.every) return;
    this.drawn = now;
    this.draw(now / 1000);
  };

  /** Draws the hologram at `time` (s). */
  private draw(time: number) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const ratio = Math.min(window.devicePixelRatio, look.pixelRatio);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(width, height, false);
      this.aim(width / height);
    }
    const still = this.still.matches;
    const state = hologramState(time, still, this.swing);
    this.object.rotation.y = state.angle;
    this.object.position.y = still ? 0 : 0.015 * sin(time * 1.4);
    this.cone.rotation.y = -state.angle * 0.25;
    const rise = still ? 0.35 : (time / 2.2) % 1;
    this.sweep.position.y = LENS_Y + rise * (TOP_Y - LENS_Y);
    this.sweep.scale.setScalar((LENS_RADIUS + rise * (CONE_TOP - LENS_RADIUS)) / LENS_RADIUS);
    (this.sweep.material as THREE.ShaderMaterial).uniforms.uGlow.value = 2.4 * (1 - rise) * rise;
    const u = this.uniforms;
    u.uLevel.value = state.level;
    u.uScroll.value = state.scroll;
    u.uPixel.value = ratio;
    u.uGlitchLow.value = state.glitch ? state.glitch.low + this.object.position.y : 0;
    u.uGlitchHigh.value = state.glitch ? state.glitch.high + this.object.position.y : 0;
    u.uGlitchShift.value = state.glitch ? state.glitch.shift : 0;
    this.renderer.render(this.scene, this.camera);
  }

  /** Puts the camera where the whole of the projector and the object fit a picture of `aspect`. */
  private aim(aspect: number) {
    const camera = this.camera;
    camera.aspect = aspect;
    const middle = (LENS_Y - 0.12 + TOP_Y + 0.08) / 2;
    const half = (TOP_Y + 0.08 - (LENS_Y - 0.12)) / 2;
    const slope = THREE.MathUtils.degToRad(FOV / 2);
    const reach = sin(slope) / cos(slope);
    const distance = Math.max(half / reach, 0.74 / (reach * aspect)) + 0.5;
    camera.position.set(0, middle + sin(ELEVATION) * distance, cos(ELEVATION) * distance);
    camera.lookAt(0, middle, 0);
    camera.updateProjectionMatrix();
  }

  /**
   * The projector: a squat housing of dark steel, its lens rings of light on top, and the cone
   * of light lines opening from the lens up past the object, with a faint veil between them.
   */
  private projector() {
    const cone = new THREE.Group();
    const housing = new THREE.Mesh(
      new THREE.LatheGeometry([[0, -0.12], [0.36, -0.12], [0.4, -0.09], [0.38, -0.03], [0.3, 0], [0, 0]].map(([r, y]) => new THREE.Vector2(r, y + LENS_Y)), 48),
      new THREE.MeshBasicMaterial({ color: 0x0b0f18 }),
    );
    // its edge and its lens: rings of light, one draw call
    const rings: number[] = [];
    const ring = (radius: number, y: number) => {
      for (let i = 0; i < 48; i++) {
        const a0 = (i / 48) * Math.PI * 2;
        const a1 = ((i + 1) / 48) * Math.PI * 2;
        rings.push(sin(a0) * radius, y, cos(a0) * radius, sin(a1) * radius, y, cos(a1) * radius);
      }
    };
    ring(0.4, LENS_Y - 0.09);
    ring(0.3, LENS_Y);
    ring(LENS_RADIUS, LENS_Y + 0.002);
    ring(0.16, LENS_Y + 0.002);
    ring(0.08, LENS_Y + 0.002);
    const lens = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rings, 3)), light(this.uniforms, 'LINES', 1.3, 0.4));
    // the beam's lines, from the lens's rim up and out
    const lines: number[] = [];
    for (let i = 0; i < BEAM_LINES; i++) {
      const a = (i / BEAM_LINES) * Math.PI * 2;
      lines.push(sin(a) * LENS_RADIUS, LENS_Y, cos(a) * LENS_RADIUS, sin(a) * CONE_TOP, TOP_Y, cos(a) * CONE_TOP);
    }
    const beam = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)), light(this.uniforms, 'BEAM', 0.9, 0.2));
    const veil = new THREE.Mesh(new THREE.CylinderGeometry(CONE_TOP, LENS_RADIUS, TOP_Y - LENS_Y, 48, 1, true).translate(0, (TOP_Y + LENS_Y) / 2, 0), light(this.uniforms, 'BEAM', 0.14));
    const loop: number[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      loop.push(sin(a) * LENS_RADIUS, 0, cos(a) * LENS_RADIUS);
    }
    const sweep = new THREE.LineLoop(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(loop, 3)), light(this.uniforms, 'LINES', 1, 0.3));
    cone.add(housing, lens, beam, veil);
    this.scene.add(sweep);
    return { cone, sweep };
  }
}
