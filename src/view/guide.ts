import * as THREE from 'three';

/** Dots of the guide line, from the own ship to the next gate. */
const DOTS = 48;
/** The line starts this far ahead of the ship (units, 40 m), clear of its own hull. */
const LEAD = 800;
/** Pulses on the line at a time, and how fast they run towards the gate (lines a second). */
const PULSES = 3;
const PULSE_SPEED = 0.45;
/** Size of a dot (units, 3 m); on screen it keeps 3.5 to 14 pixels (see the vertex shader). */
const DOT_SIZE = 60;

const p0 = new THREE.Vector3();
const p1 = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * The racing line in the HUD: a dashed line of glowing dots that leaves the own ship along its
 * flight and bends to the next gate, so it shows where to turn. Pulses run along it towards
 * the gate.
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
          gl_PointSize = clamp(size * 600.0 / -view.z, 3.5, 14.0) * (0.7 + 0.5 * glow);
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d);
          // the tournament's orange, white-hot where a pulse runs
          vec3 color = mix(vec3(1.0, 0.55, 0.0), vec3(1.0, 0.9, 0.7), vGlow * 0.6) * (0.25 + 1.6 * vGlow);
          gl_FragColor = vec4(color * a, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Lays the line from a ship at `from`, flying along `heading` (unit length), to the gate at `to`; `time` in seconds runs the pulses. */
  show(from: THREE.Vector3, heading: THREE.Vector3, to: THREE.Vector3, time: number) {
    const distance = from.distanceTo(to);
    // a curve that leaves along the flight and bends to the gate
    p0.copy(from).addScaledVector(heading, LEAD);
    p1.copy(p0).addScaledVector(heading, distance * 0.45);
    for (let i = 0; i < DOTS; i++) {
      const t = (i + 1) / (DOTS + 1);
      const u = 1 - t;
      point.copy(p0).multiplyScalar(u * u).addScaledVector(p1, 2 * u * t).addScaledVector(to, t * t);
      point.toArray(this.positions, i * 3);
      const wave = Math.max(0, Math.sin(2 * Math.PI * (t * PULSES - time * PULSE_SPEED)));
      // the first dots fade in, so the line grows out of the ship's path
      this.glow[i] = wave ** 6 * Math.min(1, t * 6);
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
