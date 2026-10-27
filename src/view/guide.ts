import * as THREE from 'three';
import { bendRadius, type RacingLine } from '../game/racingline';
import { cornerSpeed } from '../ship/flight';
import type { AsteroidField } from '../world/asteroids';

/**
 * The line is a ribbon sampled every SAMPLE (units, 20 m), SAMPLES of them, 1.3 km ahead. Its
 * dashes lie on the line every DASH (units, 20 m), DASH_ON of each lit, fixed in space like the
 * marks of a track, so they rush past the faster the ship flies.
 */
const SAMPLES = 64;
const SAMPLE = 400;
const DASH = 400;
const DASH_ON = 0.6;
/** The first sample is this far ahead of the ship (units, 40 m), clear of its own hull. */
const LEAD = 800;
/** The line leaves the ship along its flight and joins the ideal line within JOIN_SECONDS of flight, at least JOIN_MIN (units, 150 m). */
const JOIN_SECONDS = 1;
const JOIN_MIN = 3000;
/** Pulses of light run along the line towards the gate, PULSE_GAP apart (units, 400 m) at PULSE_SPEED (units/s, 600 m/s), across the gaps too. */
const PULSE_GAP = 8000;
const PULSE_SPEED = 12000;
/** The time the pulses take to move on by one gap (s): after it the line looks the same again. */
const PULSE_PERIOD = PULSE_GAP / PULSE_SPEED;
/** Width of the ribbon (units, 4 m); on screen it keeps WIDTH_MIN to WIDTH_MAX pixels. */
const WIDTH = 80;
const WIDTH_MIN = 4;
const WIDTH_MAX = 10;
/**
 * A ship this far off the line (units, 50 m) sees it as usual; from there to OFF_FAR (250 m) the
 * line grows up to OFF_BOOST times brighter and wider, so a pilot under stress who lost it finds
 * it again.
 */
const OFF_NEAR = 1000;
const OFF_FAR = 5000;
const OFF_BOOST = 0.8;
/**
 * Brake zones: where the line bends tighter than the ship, at its speed now, can turn with path
 * steering (see cornerSpeed), the ribbon glows orange; measured over BEND_SPAN samples to either
 * side (60 m), and fading in from BRAKE_FROM to BRAKE_FULL of the speed that bend allows.
 */
const BEND_SPAN = 3;
const BRAKE_FROM = 0.95;
const BRAKE_FULL = 1.05;

/** The attributes laid out anew every frame. */
const CHANGING = ['position', 'next', 'along', 'fade', 'hot'] as const;

const onLine = new THREE.Vector3();
const point = new THREE.Vector3();
const previous = new THREE.Vector3();
const before = new THREE.Vector3();
const after = new THREE.Vector3();

/**
 * The racing line in the HUD: a dashed ribbon on the ideal line through the centers of the gates
 * (see RacingLine), from the own ship on, with pulses of light running along it towards the gate.
 * Where the ship is off the line, the ribbon leaves it along its flight and bends onto the line,
 * so it shows where to turn.
 */
export class GuideLine {
  readonly ribbon: THREE.Mesh;
  /** Two vertices a sample, one on each side of the line; each knows the next sample, for the ribbon's direction on screen. */
  private readonly positions = new Float32Array(SAMPLES * 2 * 3);
  private readonly next = new Float32Array(SAMPLES * 2 * 3);
  /** Where on the line a sample lies (units), for the dashes and the pulses; how far it has faded in (negative: beyond the end of an open line). */
  private readonly along = new Float32Array(SAMPLES * 2);
  private readonly fade = new Float32Array(SAMPLES * 2);
  /** How far a sample lies in a brake zone, 0..1 (see BRAKE_FROM). */
  private readonly hot = new Float32Array(SAMPLES * 2);
  private readonly uniforms = { time: { value: 0 }, boost: { value: 0 }, viewport: { value: new THREE.Vector2(1, 1) } };

  constructor() {
    const geometry = new THREE.BufferGeometry();
    const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', dynamic(this.positions, 3));
    geometry.setAttribute('next', dynamic(this.next, 3));
    geometry.setAttribute('along', dynamic(this.along, 1));
    geometry.setAttribute('fade', dynamic(this.fade, 1));
    geometry.setAttribute('hot', dynamic(this.hot, 1));
    const side = new Float32Array(SAMPLES * 2).map((_, i) => (i % 2 ? 1 : -1));
    geometry.setAttribute('side', new THREE.BufferAttribute(side, 1));
    const index: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) index.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    geometry.setIndex(index);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform vec2 viewport;
        uniform float boost;
        attribute vec3 next;
        attribute float side;
        attribute float along;
        attribute float fade;
        attribute float hot;
        varying float vAlong;
        varying float vSide;
        varying float vFade;
        varying float vHot;
        void main() {
          vAlong = along;
          vSide = side;
          vFade = fade;
          vHot = hot;
          vec4 here = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 there = projectionMatrix * modelViewMatrix * vec4(next, 1.0);
          // the ribbon's direction on screen, and its width across it in pixels
          vec2 direction = there.w > 0.0 && here.w > 0.0 ? (there.xy / there.w - here.xy / here.w) * viewport : vec2(1.0, 0.0);
          direction = length(direction) > 1e-6 ? normalize(direction) : vec2(1.0, 0.0);
          float pixels = clamp(${WIDTH.toFixed(1)} * projectionMatrix[1][1] * viewport.y * 0.5 / max(here.w, 1.0), ${WIDTH_MIN.toFixed(1)}, ${WIDTH_MAX.toFixed(1)}) * (1.0 + boost);
          here.xy += vec2(-direction.y, direction.x) * side * pixels / viewport * here.w;
          gl_Position = here;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float boost;
        varying float vAlong;
        varying float vSide;
        varying float vFade;
        varying float vHot;
        void main() {
          // beyond the end of an open line nothing is drawn
          if (vFade < 0.0) discard;
          bool dash = fract(vAlong / ${DASH.toFixed(1)}) < ${DASH_ON};
          float pulse = pow(max(0.0, sin(6.2831853 * (vAlong - time * ${PULSE_SPEED.toFixed(1)}) / ${PULSE_GAP.toFixed(1)})), 4.0);
          // the gaps stay dark until a pulse runs through them, so the light travels unbroken
          float lit = dash ? 1.0 : pulse * 0.8;
          if (lit < 0.02) discard;
          float core = smoothstep(1.0, 0.45, abs(vSide));
          // the flight computer's projection draws it: its azure (#4d91ff), the orange of acting
          // now (#ff9d00) in a brake zone, white where a pulse runs, in a dark rim that keeps it
          // readable on a bright disk or a sunlit rock
          vec3 tint = mix(vec3(0.3, 0.57, 1.0), vec3(1.0, 0.616, 0.0), vHot);
          vec3 color = mix(tint, vec3(0.9, 0.95, 1.0), pulse) * (1.0 + 1.3 * pulse + boost);
          gl_FragColor = vec4(color * core * lit, mix(0.55, 1.0, core) * lit * vFade);
        }
      `,
      // the ribbon writes depth, so the black hole's lens sees it in front of it and leaves it be
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.ribbon = new THREE.Mesh(geometry, material);
    this.ribbon.frustumCulled = false;
    this.ribbon.visible = false;
  }

  /** The size of the picture in pixels, so the ribbon keeps its width on screen. */
  setViewport(width: number, height: number) {
    this.uniforms.viewport.value.set(width, height);
  }

  /**
   * Lays the line for a ship at `from`, flying along `heading` (unit length) at `speed`
   * (units/s), on its way to gate `next` of the ideal `line`; `time` in seconds runs the pulses.
   * A ship that `missed` the gate is led back to it, onto the line well before the gate. Where
   * the line bends tighter than a ship of that speed turns with `grip` (units/s², see gripOf),
   * it glows orange.
   */
  show(from: THREE.Vector3, heading: THREE.Vector3, speed: number, grip: number, line: RacingLine, field: AsteroidField, next: number, missed: boolean, time: number) {
    const join = Math.max(JOIN_MIN, speed * JOIN_SECONDS);
    const at = line.progress(from, next, missed ? join : 0);
    // the samples lie on a grid every SAMPLE from the start of each lap, so the dashes stay where
    // they are when the ship crosses into the next lap
    const ahead = at + LEAD;
    const lapStart = line.closed ? Math.floor(ahead / line.length) * line.length : 0;
    let lapEnd = line.closed ? lapStart + line.length : Infinity;
    let s = lapStart + Math.ceil((ahead - lapStart) / SAMPLE) * SAMPLE;
    for (let i = 0; i < SAMPLES; i++, s += SAMPLE) {
      if (s >= lapEnd) {
        s = lapEnd + Math.ceil((s - lapEnd) / SAMPLE) * SAMPLE;
        lapEnd += line.length;
      }
      const along = s - at;
      const blend = THREE.MathUtils.smoothstep(along / join, 0, 1);
      point.copy(from).addScaledVector(heading, along).lerp(line.clear(s, field, onLine), blend);
      // the dashes count from the start of a lap, so they sit at the same places lap after lap
      const onLap = line.closed ? s - (lapEnd - line.length) : s;
      // the first samples fade in, so the ribbon grows out of the ship's path
      const fade = !line.closed && s > line.length ? -1 : Math.min(1, (along - LEAD) / (SAMPLE * 4));
      point.toArray(this.positions, 2 * i * 3);
      point.toArray(this.positions, (2 * i + 1) * 3);
      this.along[2 * i] = this.along[2 * i + 1] = onLap;
      this.fade[2 * i] = this.fade[2 * i + 1] = fade;
      // each sample points at the next: the last one on along the way from the one before
      if (i > 0) {
        point.toArray(this.next, (2 * i - 2) * 3);
        point.toArray(this.next, (2 * i - 1) * 3);
      }
      if (i === SAMPLES - 1) {
        previous.subVectors(point, previous).add(point);
        previous.toArray(this.next, 2 * i * 3);
        previous.toArray(this.next, (2 * i + 1) * 3);
      }
      previous.copy(point);
    }
    // the brake zones: how tight the ribbon bends at each sample, against the speed now
    const positions = this.positions;
    for (let i = 0; i < SAMPLES; i++) {
      const a = Math.max(0, i - BEND_SPAN);
      const b = Math.min(SAMPLES - 1, i + BEND_SPAN);
      before.fromArray(positions, 2 * a * 3);
      point.fromArray(positions, 2 * i * 3);
      after.fromArray(positions, 2 * b * 3);
      const radius = a < i && i < b ? bendRadius(before, point, after) : Infinity;
      this.hot[2 * i] = this.hot[2 * i + 1] = THREE.MathUtils.smoothstep(speed / cornerSpeed(radius, grip), BRAKE_FROM, BRAKE_FULL);
    }
    // off the line, the line shows brighter and wider
    const off = from.distanceTo(line.clear(at, field, onLine));
    this.uniforms.boost.value = OFF_BOOST * THREE.MathUtils.smoothstep(off, OFF_NEAR, OFF_FAR);
    // the pulses repeat every PULSE_GAP / PULSE_SPEED seconds: the shader gets the time within
    // that period, so a float in the GPU keeps its precision however long the page has run
    this.uniforms.time.value = time % PULSE_PERIOD;
    const attributes = this.ribbon.geometry.attributes;
    for (const name of CHANGING) attributes[name].needsUpdate = true;
    this.ribbon.visible = true;
  }

  hide() {
    this.ribbon.visible = false;
  }
}
