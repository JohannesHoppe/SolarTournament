import * as THREE from 'three';

/** Particles per texture; the oldest is recycled when all are in use. */
const PARTICLE_CAPACITY = 6000;
/** Beams on screen at once; a flood of shots reuses the oldest instead of growing without end. */
const MAX_BEAMS = 64;

const particleVertex = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float pixelScale;
  void main() {
    vTint = tint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragment = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  void main() {
    vec4 texel = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(texel.rgb * vTint.rgb * vTint.a, 1.0);
  }
`;

/**
 * All particles of one texture live in a single buffer and render with one draw call.
 * Each particle has position, velocity, size, color and a lifetime after which it is recycled.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly position = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly velocity = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly size = new Float32Array(PARTICLE_CAPACITY);
  private readonly startSize = new Float32Array(PARTICLE_CAPACITY);
  private readonly endSize = new Float32Array(PARTICLE_CAPACITY);
  private readonly tint = new Float32Array(PARTICLE_CAPACITY * 4);
  private readonly color = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly age = new Float32Array(PARTICLE_CAPACITY);
  private readonly life = new Float32Array(PARTICLE_CAPACITY);
  private next = 0;
  /** Particles alive, and whether the GPU buffers still show particles that have died. */
  private live = 0;
  private dirty = false;
  private readonly material: THREE.ShaderMaterial;

  constructor(texture: THREE.Texture) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('tint', new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, pixelScale: { value: 1 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Converts world size to pixels for the current viewport height and field of view. */
  setViewport(heightPx: number, fovDeg: number) {
    this.material.uniforms.pixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(position: THREE.Vector3, velocity: THREE.Vector3, life: number, startSize: number, endSize: number, color: THREE.Color) {
    const i = this.next;
    this.next = (this.next + 1) % PARTICLE_CAPACITY;
    position.toArray(this.position, i * 3);
    velocity.toArray(this.velocity, i * 3);
    color.toArray(this.color, i * 3);
    // the ring may overwrite a particle that is still alive; only a free slot adds one
    if (this.life[i] <= 0) this.live++;
    this.age[i] = 0;
    this.life[i] = life;
    this.startSize[i] = startSize;
    this.endSize[i] = endSize;
  }

  update(dt: number) {
    // nothing alive and nothing that just died: the buffers on the GPU are still right
    if (this.live === 0 && !this.dirty) return;
    this.dirty = this.live > 0;
    for (let i = 0; i < PARTICLE_CAPACITY; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = 0;
        this.size[i] = 0;
        this.tint[i * 4 + 3] = 0;
        this.live--;
        continue;
      }
      for (let k = 0; k < 3; k++) this.position[i * 3 + k] += this.velocity[i * 3 + k] * dt;
      this.size[i] = this.startSize[i] + (this.endSize[i] - this.startSize[i]) * t;
      this.tint[i * 4] = this.color[i * 3];
      this.tint[i * 4 + 1] = this.color[i * 3 + 1];
      this.tint[i * 4 + 2] = this.color[i * 3 + 2];
      this.tint[i * 4 + 3] = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    }
    const attributes = this.points.geometry.attributes;
    attributes.position.needsUpdate = true;
    attributes.size.needsUpdate = true;
    attributes.tint.needsUpdate = true;
  }
}

const FIRE = new THREE.Color(0.9, 0.42, 0.12);
const SMOKE = new THREE.Color(0.12, 0.11, 0.11);
const VAPOR = new THREE.Color(0.35, 0.38, 0.42);
const ROCK = new THREE.Color(0.22, 0.19, 0.16);
/** The drive's exhaust: a faint, cool blue, added on top of whatever is behind it. */
const EXHAUST = new THREE.Color(0.2, 0.28, 0.5);
/** At most this many exhaust puffs per frame and ship, even at extreme speed. */
const TRAIL_MAX_PUFFS = 12;
const scratch = new THREE.Vector3();
const scratchVelocity = new THREE.Vector3();
const spread = new THREE.Vector3();

function randomDirection(target: THREE.Vector3) {
  return target.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
}

export class Effects {
  readonly group = new THREE.Group();
  private readonly fire: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly beams: Beam[] = [];

  constructor(textures: { smoke: THREE.Texture; spark: THREE.Texture }) {
    this.fire = new ParticleSystem(textures.spark);
    this.smoke = new ParticleSystem(textures.smoke);
    this.group.add(this.smoke.points, this.fire.points);
  }

  setViewport(heightPx: number, fovDeg: number) {
    this.fire.setViewport(heightPx, fovDeg);
    this.smoke.setViewport(heightPx, fovDeg);
  }

  explosion(center: THREE.Vector3, radius: number, drift: THREE.Vector3) {
    const count = Math.min(90, 24 + radius / 30);
    for (let i = 0; i < count; i++) {
      randomDirection(scratchVelocity).multiplyScalar(radius * (0.4 + Math.random() * 1.6)).add(drift);
      scratch.copy(center).addScaledVector(scratchVelocity, 0.05);
      this.fire.emit(scratch, scratchVelocity, 0.4 + Math.random() * 0.5, radius * 0.3, radius * 0.8, FIRE);
    }
    for (let i = 0; i < count * 0.6; i++) {
      randomDirection(scratchVelocity).multiplyScalar(radius * (0.2 + Math.random() * 0.6)).add(drift);
      scratch.copy(center).addScaledVector(randomDirection(spread), Math.random() * radius * 0.6);
      this.smoke.emit(scratch, scratchVelocity, 1.5 + Math.random() * 1.5, radius * 0.5, radius * 1.5, SMOKE);
    }
  }

  sparks(point: THREE.Vector3, color: THREE.Color, size: number) {
    for (let i = 0; i < 24; i++) {
      randomDirection(scratchVelocity).multiplyScalar(size * (2 + Math.random() * 6));
      this.fire.emit(point, scratchVelocity, 0.25 + Math.random() * 0.3, size, size * 0.2, color);
    }
  }

  /** Thruster exhaust or venting atmosphere: a short, pale puff. */
  puff(position: THREE.Vector3, velocity: THREE.Vector3, size: number) {
    this.smoke.emit(position, velocity, 0.35 + Math.random() * 0.2, size, size * 3, VAPOR);
  }

  /** Rock splinters and dust where a laser hits an asteroid. */
  debris(point: THREE.Vector3, normal: THREE.Vector3, size: number) {
    for (let i = 0; i < 14; i++) {
      randomDirection(scratchVelocity).add(normal).normalize().multiplyScalar(size * (1 + Math.random() * 3));
      this.smoke.emit(point, scratchVelocity, 1.2 + Math.random(), size * 0.6, size * 2.5, ROCK);
    }
  }

  /**
   * The drive's exhaust from one frame to the next: puffs laid evenly along the nozzle's path
   * from `from` to `to`, close enough to overlap, so a fast ship leaves a continuous, faint
   * blue plume instead of a string of beads.
   */
  engineTrail(from: THREE.Vector3, to: THREE.Vector3, velocity: THREE.Vector3, intensity: number) {
    const size = 70 * intensity;
    const steps = Math.min(TRAIL_MAX_PUFFS, Math.max(1, Math.ceil(from.distanceTo(to) / (size * 0.35))));
    scratchVelocity.copy(velocity).multiplyScalar(0.1);
    for (let i = 1; i <= steps; i++) {
      scratch.lerpVectors(from, to, i / steps);
      this.smoke.emit(scratch, scratchVelocity, 0.45, size, size * 2.5, EXHAUST);
    }
  }

  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color) {
    let beam: Beam | null = null;
    for (const b of this.beams) {
      if (b.age >= Beam.LIFE) {
        beam = b;
        break;
      }
      // with all beams in use, the oldest makes way
      if (this.beams.length >= MAX_BEAMS && (!beam || b.age > beam.age)) beam = b;
    }
    if (!beam) {
      beam = new Beam();
      this.beams.push(beam);
      this.group.add(beam.mesh);
    }
    beam.fire(from, to, color);
  }

  update(dt: number) {
    this.fire.update(dt);
    this.smoke.update(dt);
    for (const beam of this.beams) beam.update(dt);
  }
}

const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** A laser beam: bright core plus a soft halo, fading out quickly. */
class Beam {
  /** Seconds a beam glows before it is gone. */
  static readonly LIFE = 0.3;
  readonly mesh = new THREE.Group();
  age = Beam.LIFE;
  private readonly core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    const material = () => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.core = new THREE.Mesh(beamGeometry, material());
    this.halo = new THREE.Mesh(beamGeometry, material());
    this.core.scale.set(5, 5, 1);
    this.halo.scale.set(14, 14, 1);
    this.mesh.add(this.halo, this.core);
    this.mesh.visible = false;
  }

  fire(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color) {
    const direction = scratch.subVectors(to, from);
    this.mesh.position.copy(from);
    this.mesh.scale.set(1, 1, direction.length());
    this.mesh.quaternion.setFromUnitVectors(Z_AXIS, direction.normalize());
    this.core.material.color.set(0xffffff).lerp(color, 0.25).multiplyScalar(4);
    this.halo.material.color.copy(color).multiplyScalar(1.5);
    this.age = 0;
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.age >= Beam.LIFE) return;
    this.age += dt;
    const fade = Math.max(0, 1 - this.age / Beam.LIFE);
    this.core.material.opacity = fade;
    this.halo.material.opacity = fade * 0.35;
    const width = 0.5 + fade * 0.5;
    this.core.scale.set(5 * width, 5 * width, 1);
    if (this.age >= Beam.LIFE) this.mesh.visible = false;
  }
}
