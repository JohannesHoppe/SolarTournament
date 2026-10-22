import * as THREE from 'three';
import type { RacingLine } from '../game/racingline';
import type { AsteroidField } from '../world/asteroids';

/**
 * The dots sit on the ideal line every SPACING (units, 20 m), fixed in space like the marks of a
 * track, so they rush past the faster the ship flies; DOTS of them show 1.3 km ahead.
 */
const DOTS = 64;
const SPACING = 400;
/** The first dot is this far ahead of the ship (units, 40 m), clear of its own hull. */
const LEAD = 800;
/** The line leaves the ship along its flight and joins the ideal line within JOIN_SECONDS of flight, at least JOIN_MIN (units, 150 m). */
const JOIN_SECONDS = 1;
const JOIN_MIN = 3000;
/** Pulses run along the line towards the gate, PULSE_GAP apart (units, 400 m) at PULSE_SPEED (units/s, 600 m/s). */
const PULSE_GAP = 8000;
const PULSE_SPEED = 12000;
/** Size of a dot (units, 3 m); on screen it keeps 5 to 16 pixels (see the vertex shader). */
const DOT_SIZE = 60;

const onLine = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * The racing line in the HUD: glowing dots on the ideal line through the centers of the gates
 * (see RacingLine), from the own ship on. Where the ship is off the line, the dots leave it
 * along its flight and bend onto the line, so they show where to turn; pulses run along it
 * towards the gate.
 */
export class GuideLine {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(DOTS * 3);
  private readonly glow = new Float32Array(DOTS);

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('glow', new THREE.BufferAttribute(this.glow, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    const material = new THREE.ShaderMaterial({
      uniforms: { size: { value: DOT_SIZE } },
      vertexShader: /* glsl */ `
        uniform float size;
        attribute float glow;
        varying float vGlow;
        void main() {
          vGlow = glow;
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          // a dot beyond the end of an open line is not drawn
          gl_PointSize = glow < 0.0 ? 0.0 : clamp(size * 600.0 / -view.z, 5.0, 16.0) * (0.8 + 0.4 * glow);
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float core = smoothstep(0.75, 0.5, d);
          // the tournament's orange, white-hot where a pulse runs, in a dark rim that keeps it
          // readable on a bright disk or a sunlit rock
          vec3 color = mix(vec3(1.0, 0.55, 0.0), vec3(1.0, 0.9, 0.7), vGlow * 0.6) * (1.0 + 1.2 * vGlow);
          gl_FragColor = vec4(color * core, mix(0.5, 1.0, core));
        }
      `,
      // the dots write depth, so the black hole's lens sees them in front of it and leaves them be
      transparent: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /**
   * Lays the line for a ship at `from`, flying along `heading` (unit length) at `speed`
   * (units/s), on its way to gate `next` of the ideal `line`; `time` in seconds runs the pulses.
   * A ship that `missed` the gate is led back to it, onto the line well before the gate.
   */
  show(from: THREE.Vector3, heading: THREE.Vector3, speed: number, line: RacingLine, field: AsteroidField, next: number, missed: boolean, time: number) {
    const join = Math.max(JOIN_MIN, speed * JOIN_SECONDS);
    const at = line.progress(from, next, missed ? join : 0);
    // the dots lie on a grid every SPACING from the start of each lap, so they stay where they
    // are when the ship crosses into the next lap
    const ahead = at + LEAD;
    const lapStart = line.closed ? Math.floor(ahead / line.length) * line.length : 0;
    let lapEnd = line.closed ? lapStart + line.length : Infinity;
    let s = lapStart + Math.ceil((ahead - lapStart) / SPACING) * SPACING;
    for (let i = 0; i < DOTS; i++, s += SPACING) {
      if (s >= lapEnd) {
        s = lapEnd + Math.ceil((s - lapEnd) / SPACING) * SPACING;
        lapEnd += line.length;
      }
      const along = s - at;
      const blend = THREE.MathUtils.smoothstep(along / join, 0, 1);
      point.copy(from).addScaledVector(heading, along).lerp(line.clear(s, field, onLine), blend);
      point.toArray(this.positions, i * 3);
      const wave = Math.max(0, Math.sin(2 * Math.PI * (s - time * PULSE_SPEED) / PULSE_GAP));
      // the first dots fade in, so the line grows out of the ship's path
      this.glow[i] = !line.closed && s > line.length ? -1 : wave ** 6 * Math.min(1, (along - LEAD) / (SPACING * 4));
    }
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.glow.needsUpdate = true;
    this.points.visible = true;
  }

  hide() {
    this.points.visible = false;
  }
}
