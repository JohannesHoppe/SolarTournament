import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { wellMu } from '../game/orbit';
import type { Well } from '../world/asteroids';
import { WIDE, WIDE_VERTEX, wideSegments } from './wide';

/**
 * The orbit the flight computer sees (see game/orbit): while the readout says ORBIT READY or
 * STABLE ORBIT, the whole ellipse free drift would fly about the well, drawn into space as a line
 * of the HUD's azure a few pixels wide (see view/wide) over everything, faint, so the Host sees where the ship will go and how
 * near the hole it comes. It is the conic of the ship's position and velocity alone, as the
 * readout reckons it: a burn changes it in the same frame.
 */
export class OrbitPath {
  readonly line: THREE.Mesh;
  private readonly starts: THREE.InstancedBufferAttribute;
  private readonly ends: THREE.InstancedBufferAttribute;

  constructor() {
    const { geometry, starts, ends } = wideSegments(POINTS, true);
    this.starts = starts;
    this.ends = ends;
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0x0062ff) }, opacity: { value: 0.55 }, ...WIDE },
      vertexShader: WIDE_VERTEX,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float opacity;
        void main() {
          gl_FragColor = vec4(color, opacity);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.line = new THREE.Mesh(geometry, material);
    // an overlay over everything, as the HUD's other lines in space are (see view/plane)
    this.line.renderOrder = 10;
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  /** Draws the ellipse a ship at `position` with `velocity` flies about `well` in free drift; none for no well, or a path that is no ellipse. */
  show(well: Well | null, position: THREE.Vector3, velocity: THREE.Vector3) {
    if (!well) {
      this.line.visible = false;
      return;
    }
    const mu = wellMu(well);
    arm.subVectors(position, well.position);
    const r = arm.length();
    momentum.crossVectors(arm, velocity);
    // the eccentricity vector points to the periapsis; its length is the eccentricity
    eccentricity.crossVectors(velocity, momentum).divideScalar(mu).addScaledVector(arm, -1 / Math.max(r, 1));
    const e = eccentricity.length();
    const h2 = momentum.lengthSq();
    if (e >= 1 || h2 < 1) {
      this.line.visible = false;
      return;
    }
    const p = h2 / mu;
    // the ellipse's own axes in its plane: towards the periapsis, and a quarter turn on along the flight
    if (e > 1e-6) along.copy(eccentricity).divideScalar(e);
    else along.copy(arm).divideScalar(Math.max(r, 1));
    across.crossVectors(momentum, along).normalize();
    // each point ends one segment and starts the next, the last closing the loop to the first
    for (let i = 0; i < POINTS; i++) {
      const angle = (i / POINTS) * Math.PI * 2;
      const radius = p / (1 + e * cos(angle));
      point.copy(well.position).addScaledVector(along, radius * cos(angle)).addScaledVector(across, radius * sin(angle));
      this.starts.setXYZ(i, point.x, point.y, point.z);
      this.ends.setXYZ((i + POINTS - 1) % POINTS, point.x, point.y, point.z);
    }
    this.starts.needsUpdate = true;
    this.ends.needsUpdate = true;
    this.line.visible = true;
  }
}

/** Points along the drawn ellipse: smooth at any size it is seen at. */
const POINTS = 192;
const arm = new THREE.Vector3();
const momentum = new THREE.Vector3();
const eccentricity = new THREE.Vector3();
const along = new THREE.Vector3();
const across = new THREE.Vector3();
const point = new THREE.Vector3();
