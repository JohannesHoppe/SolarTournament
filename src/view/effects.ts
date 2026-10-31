import * as THREE from 'three';

/** Particles per texture; the oldest is recycled when all are in use. */
const PARTICLE_CAPACITY = 6000;
/** Beams on screen at once; a flood of shots reuses the oldest instead of growing without end. */
const MAX_BEAMS = 64;
/**
 * The share of the particles emitted (0..1, see view/quality): a cheaper picture lets the
 * others go by chance, so explosions and trails thin out evenly. Particles are only looks.
 */
let particleShare = 1;

export function setParticleShare(share: number) {
  particleShare = share;
}

const particleVertex = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float pixelScale;
  #include <fog_pars_vertex>
  void main() {
    vTint = tint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** A particle's glow, fading in the haze of an arena's air (see view/haze). */
const particleFragment = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  #include <fog_pars_fragment>
  void main() {
    vec4 texel = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(texel.rgb * vTint.rgb * vTint.a, 1.0);
    #include <fog_fragment>
  }
`;

/**
 * Points of one texture in a single buffer, drawn with one draw call: where each is, its size in
 * the world and its color with its brightness. Only the first `count` are drawn and uploaded.
 */
class PointCloud {
  readonly points: THREE.Points;
  protected readonly position: Float32Array;
  protected readonly size: Float32Array;
  protected readonly tint: Float32Array;
  private readonly material: THREE.ShaderMaterial;

  constructor(texture: THREE.Texture, capacity: number) {
    this.position = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.tint = new Float32Array(capacity * 4);
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
      fog: true,
    });
    geometry.setDrawRange(0, 0);
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Converts world size to pixels for the current viewport height and field of view. */
  setViewport(heightPx: number, fovDeg: number) {
    this.material.uniforms.pixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /** Nothing drawn now, and nothing to draw: the buffers on the GPU need nothing. */
  protected idle(count: number) {
    return count === 0 && this.points.geometry.drawRange.count === 0;
  }

  /** Draws the first `count` points, uploading only them. */
  protected upload(count: number) {
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, count);
    for (const [name, size] of UPLOADED) {
      const attribute = geometry.attributes[name] as THREE.BufferAttribute;
      attribute.clearUpdateRanges();
      if (count === 0) continue;
      attribute.addUpdateRange(0, count * size);
      attribute.needsUpdate = true;
    }
  }
}

/** The attributes of a point cloud, with their widths. */
const UPLOADED = [['position', 3], ['size', 1], ['tint', 4]] as const;

/**
 * All particles of one texture live in a single buffer and render with one draw call.
 * Each particle has position, velocity, size, color and a lifetime after which it is recycled.
 * The living particles are packed at the front of the buffers (a dying one takes the last
 * one's place; the blending is additive, so their order does not matter), and only they are
 * drawn and uploaded. When all slots are in use, a new particle replaces the slots in turn.
 */
class ParticleSystem extends PointCloud {
  private readonly velocity = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly startSize = new Float32Array(PARTICLE_CAPACITY);
  private readonly endSize = new Float32Array(PARTICLE_CAPACITY);
  private readonly color = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly age = new Float32Array(PARTICLE_CAPACITY);
  private readonly life = new Float32Array(PARTICLE_CAPACITY);
  /** The slot a new particle takes when all are in use. */
  private next = 0;
  /** Particles alive: the first `live` slots. */
  private live = 0;

  constructor(texture: THREE.Texture) {
    super(texture, PARTICLE_CAPACITY);
  }

  emit(position: THREE.Vector3, velocity: THREE.Vector3, life: number, startSize: number, endSize: number, color: THREE.Color) {
    if (particleShare < 1 && Math.random() >= particleShare) return;
    let i: number;
    if (this.live < PARTICLE_CAPACITY) {
      i = this.live++;
    } else {
      i = this.next;
      this.next = (this.next + 1) % PARTICLE_CAPACITY;
    }
    position.toArray(this.position, i * 3);
    velocity.toArray(this.velocity, i * 3);
    color.toArray(this.color, i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.startSize[i] = startSize;
    this.endSize[i] = endSize;
    this.size[i] = startSize;
    this.tint[i * 4 + 3] = 0;
  }

  update(dt: number) {
    if (this.idle(this.live)) return;
    // backwards, so the particle that takes a dying one's place has been moved already
    for (let i = this.live - 1; i >= 0; i--) {
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.move(--this.live, i);
        continue;
      }
      for (let k = 0; k < 3; k++) this.position[i * 3 + k] += this.velocity[i * 3 + k] * dt;
      this.size[i] = this.startSize[i] + (this.endSize[i] - this.startSize[i]) * t;
      this.tint[i * 4] = this.color[i * 3];
      this.tint[i * 4 + 1] = this.color[i * 3 + 1];
      this.tint[i * 4 + 2] = this.color[i * 3 + 2];
      this.tint[i * 4 + 3] = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
    }
    if (this.next >= this.live) this.next = 0;
    this.upload(this.live);
  }

  /** Moves the particle in slot `from` to slot `to`. */
  private move(from: number, to: number) {
    if (from === to) return;
    this.position.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.velocity.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.color.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.tint.copyWithin(to * 4, from * 4, from * 4 + 4);
    this.size[to] = this.size[from];
    this.startSize[to] = this.startSize[from];
    this.endSize[to] = this.endSize[from];
    this.age[to] = this.age[from];
    this.life[to] = this.life[from];
  }
}

/** Points of the thrusters' puffs drawn at once (see Jets): sixteen nozzles of every ship, a plume of three points each. */
const JET_CAPACITY = 2048;
/** A puff at full push: how far its gas reaches from the nozzle's mouth and how wide it spreads there (units, 5.5 m and 4 m). */
const JET_LENGTH = 110;
const JET_WIDTH = 80;
/** The gas of a maneuvering thruster: cold, white-blue, added on top of whatever is behind it. */
const JET_COLOR = new THREE.Color(0.7, 0.85, 1.25);

/** Points a puff is drawn with by the share of particles (see setParticleShare): a plume of three on a full picture, one on the cheapest. */
function jetPoints() {
  return particleShare >= 0.75 ? 3 : particleShare >= 0.4 ? 2 : 1;
}

/**
 * The maneuvering thrusters' puffs of gas: laid anew every frame at the mouths of the nozzles
 * that fire (see Game.showJets), a short plume of points widening away from the mouth, so they
 * sit on the hull however fast it flies and never flicker. One draw call for all ships, with the
 * particles' shaders.
 */
class Jets extends PointCloud {
  private count = 0;

  constructor(texture: THREE.Texture) {
    super(texture, JET_CAPACITY);
  }

  /** A puff at `mouth`, its gas leaving along `exhaust` (unit, world), at `strength` of the nozzle's full push. */
  add(mouth: THREE.Vector3, exhaust: THREE.Vector3, strength: number) {
    const n = jetPoints();
    // fewer points glow brighter each, so the puff keeps its light on a cheaper picture
    const light = strength * Math.sqrt(3 / n);
    for (let j = 0; j < n && this.count < JET_CAPACITY; j++) {
      const along = (j + 0.5) / n;
      const i = this.count++;
      scratch.copy(mouth).addScaledVector(exhaust, along * JET_LENGTH * (0.4 + 0.6 * strength)).toArray(this.position, i * 3);
      this.size[i] = JET_WIDTH * (0.3 + 0.7 * along) * (0.5 + 0.5 * strength);
      const fade = light * (1 - 0.6 * along);
      this.tint[i * 4] = JET_COLOR.r;
      this.tint[i * 4 + 1] = JET_COLOR.g;
      this.tint[i * 4 + 2] = JET_COLOR.b;
      this.tint[i * 4 + 3] = fade;
    }
  }

  /** Draws the puffs laid since the last frame, and starts the next frame's. */
  update() {
    if (!this.idle(this.count)) this.upload(this.count);
    this.count = 0;
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

export class Effects {
  readonly group = new THREE.Group();
  private readonly fire: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly jets: Jets;
  private readonly beams: Beam[] = [];

  constructor(textures: { smoke: THREE.Texture; spark: THREE.Texture; gas: THREE.Texture }) {
    this.fire = new ParticleSystem(textures.spark);
    this.smoke = new ParticleSystem(textures.smoke);
    this.jets = new Jets(textures.gas);
    this.group.add(this.smoke.points, this.jets.points, this.fire.points);
  }

  setViewport(heightPx: number, fovDeg: number) {
    for (const cloud of [this.fire, this.smoke, this.jets]) cloud.setViewport(heightPx, fovDeg);
  }

  /** A maneuvering thruster's puff this frame (see Jets): at `mouth`, its gas leaving along `exhaust` (unit, world), at `strength` of its push. */
  jet(mouth: THREE.Vector3, exhaust: THREE.Vector3, strength: number) {
    this.jets.add(mouth, exhaust, strength);
  }

  explosion(center: THREE.Vector3, radius: number, drift: THREE.Vector3) {
    const count = Math.min(90, 24 + radius / 30);
    for (let i = 0; i < count; i++) {
      scratchVelocity.randomDirection().multiplyScalar(radius * (0.4 + Math.random() * 1.6)).add(drift);
      scratch.copy(center).addScaledVector(scratchVelocity, 0.05);
      this.fire.emit(scratch, scratchVelocity, 0.4 + Math.random() * 0.5, radius * 0.3, radius * 0.8, FIRE);
    }
    for (let i = 0; i < count * 0.6; i++) {
      scratchVelocity.randomDirection().multiplyScalar(radius * (0.2 + Math.random() * 0.6)).add(drift);
      scratch.copy(center).addScaledVector(spread.randomDirection(), Math.random() * radius * 0.6);
      this.smoke.emit(scratch, scratchVelocity, 1.5 + Math.random() * 1.5, radius * 0.5, radius * 1.5, SMOKE);
    }
  }

  sparks(point: THREE.Vector3, color: THREE.Color, size: number) {
    for (let i = 0; i < 24; i++) {
      scratchVelocity.randomDirection().multiplyScalar(size * (2 + Math.random() * 6));
      this.fire.emit(point, scratchVelocity, 0.25 + Math.random() * 0.3, size, size * 0.2, color);
    }
  }

  /** Venting atmosphere or a torpedo's exhaust: a short, pale puff. */
  puff(position: THREE.Vector3, velocity: THREE.Vector3, size: number) {
    this.smoke.emit(position, velocity, 0.35 + Math.random() * 0.2, size, size * 3, VAPOR);
  }

  /** An ember blown off a solar flare's front, drifting with `velocity` as it cools. */
  ember(position: THREE.Vector3, velocity: THREE.Vector3, size: number) {
    this.fire.emit(position, velocity, 1.5 + Math.random() * 1.5, size, size * 0.2, FIRE);
  }

  /** A glowing particle of any kind (plasma, a burning flake): additive, `size` growing to `endSize` over `life` seconds. */
  glow(position: THREE.Vector3, velocity: THREE.Vector3, life: number, size: number, endSize: number, color: THREE.Color) {
    this.fire.emit(position, velocity, life, size, endSize, color);
  }

  /** A puff of smoke of any color (soot, a charred flake). */
  soot(position: THREE.Vector3, velocity: THREE.Vector3, life: number, size: number, endSize: number, color: THREE.Color) {
    this.smoke.emit(position, velocity, life, size, endSize, color);
  }

  /** Rock splinters and dust where a laser hits an asteroid. */
  debris(point: THREE.Vector3, normal: THREE.Vector3, size: number) {
    for (let i = 0; i < 14; i++) {
      scratchVelocity.randomDirection().add(normal).normalize().multiplyScalar(size * (1 + Math.random() * 3));
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
    this.jets.update();
    for (const beam of this.beams) beam.update(dt);
  }
}

const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** How far a beam's core leans from white to its shooter's tint (0 to 1), and how bright core and halo glow (times the tint). */
const CORE_TINT = 0.85;
const CORE_GLOW = 1.5;
const HALO_GLOW = 2.5;

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
    // a neon tube: the core keeps the shooter's tint (bright enough to bloom, not so bright it
    // burns out to white), the halo glows in it
    this.core.material.color.set(0xffffff).lerp(color, CORE_TINT).multiplyScalar(CORE_GLOW);
    this.halo.material.color.copy(color).multiplyScalar(HALO_GLOW);
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
