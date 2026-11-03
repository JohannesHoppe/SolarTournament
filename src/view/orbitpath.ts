import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { wellMu } from '../game/orbit';
import type { Well } from '../world/asteroids';

/**
 * The orbit the flight computer sees (see game/orbit): while the readout says ORBIT READY or
 * STABLE ORBIT, the whole ellipse free drift would fly about the well, drawn into space as a thin
 * line of the HUD's azure over everything, faint, so the Host sees where the ship will go and how
 * near the hole it comes. It is the conic of the ship's position and velocity alone, as the
 * readout reckons it: a burn changes it in the same frame.
 */
export class OrbitPath {
  readonly line: THREE.LineLoop;
  private readonly positions = new Float32Array(POINTS * 3);

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0x0062ff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, toneMapped: false });
    this.line = new THREE.LineLoop(geometry, material);
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
    for (let i = 0; i < POINTS; i++) {
      const angle = (i / POINTS) * Math.PI * 2;
      const radius = p / (1 + e * cos(angle));
      point.copy(well.position).addScaledVector(along, radius * cos(angle)).addScaledVector(across, radius * sin(angle));
      this.positions[i * 3] = point.x;
      this.positions[i * 3 + 1] = point.y;
      this.positions[i * 3 + 2] = point.z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
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
