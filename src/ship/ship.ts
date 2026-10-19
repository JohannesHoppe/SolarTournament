import * as THREE from 'three';
import { colliderRadius, type Assets, type ShipType } from '../assets';
import { FlightModel } from './flight';
import type { Controls } from '../input/input';

/** Hull integrity of an intact ship. There are no shields: every hit stays. */
export const MAX_HULL = 100;
const LASER_HULL_DAMAGE = 34;
/** Damage a laser hit deals to the drive or the maneuvering thrusters (0..1). */
const DRIVE_HIT = 0.5;
const THRUSTER_HIT = 0.4;
/** A beam passing closer than this (fraction of the radius) to the center hits the reactor. */
const REACTOR_ZONE = 0.15;
const MAX_HOLES = 8;
/** Venting from a hole fades with this time constant (s): the compartment runs out of air. */
const VENT_TIME = 2.5;
/** Push of the escaping air right after the hit (units/s²). */
const VENT_THRUST = 120;
/** Spin the escaping air causes per unit of lever arm (rad/s²); it acts off-center, so the ship tumbles. */
const VENT_SPIN = 6;
/** Rotation kick of the explosive decompression at the moment of the hit (rad/s). */
const DECOMPRESSION_KICK = 2;
/** The exit hole tears wider than the entry hole and vents more. */
const ENTRY_HOLE = 0.4;
const EXIT_HOLE = 1;

/** Freshly spawned ships cannot be damaged for this long (s). */
const SPAWN_PROTECTION = 2.5;

/** The laser heats the ship; radiators shed the heat, much better in the shadow of an asteroid. */
export const MAX_HEAT = 100;
const HEAT_PER_SHOT = 30;
const COOLING_SUN = 20;
const COOLING_SHADOW = 50;
/** An overheated laser stays locked until the ship has cooled down to this. */
const OVERHEAT_RESUME = 30;
/** Minimum time between two shots (s), so a full bank fires as a quick burst. */
const LASER_COOLDOWN = 0.18;

/** The engine flame slides this far (model units) into the hull at zero thrust. */
const FLAME_RETRACT = 16;
const GLOW_MAX_SCALE = 3.5;

export type Zone = 'reactor' | 'drive' | 'thrusters' | 'hull';
export type DamageStatus = 'protected' | 'hit' | 'destroyed';

interface EngineParts {
  flame: THREE.Mesh | null;
  flameMaterial: THREE.MeshBasicMaterial | null;
  flameZ: number;
  glows: THREE.Object3D[];
  light: THREE.PointLight;
}

interface Hole {
  /** Position in ship space. */
  point: THREE.Vector3;
  /** Direction the air escapes, in ship space. */
  vent: THREE.Vector3;
  size: number;
  at: number;
}

/** A ship as it travels over the network; short keys keep the 15 Hz updates small. */
export type ShipState = {
  id: string;
  /** name and ship type */
  n: string;
  k: ShipType;
  /** position, velocity, orientation (quaternion), rotation rate in ship space */
  p: number[];
  v: number[];
  q: number[];
  w: number[];
  /** visible drive output */
  th: number;
  a: boolean;
  /** hull, drive and thruster health */
  h: number;
  dr: number;
  tr: number;
  /** score, kills, deaths */
  s: number;
  ki: number;
  de: number;
  /** remaining spawn protection (s) */
  pr: number;
};

let shipCounter = 0;
const force = new THREE.Vector3();
const torque = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const local = new THREE.Vector3();
const offset = new THREE.Vector3();
const spinStep = new THREE.Quaternion();

/** Both ship types share one hit radius, so the skin makes no difference in combat. */
function sharedRadius(assets: Assets): number {
  return Math.max(colliderRadius(assets.ships.human), colliderRadius(assets.ships.alien)) * 0.8;
}

export class Ship {
  readonly flight = new FlightModel();
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly radius: number;
  readonly color: THREE.Color;
  /** Laser holes; they vent air for a few seconds and spark until the ship respawns. */
  readonly holes: Hole[] = [];
  /** Push and spin from venting air, in ship space, applied in the next update. */
  private readonly ventForce = new THREE.Vector3();
  private readonly ventSpin = new THREE.Vector3();

  hull = MAX_HULL;
  /** Health of the main drive and of the maneuvering thrusters, 0..1. */
  drive = 1;
  thrusters = 1;
  heat = 0;
  overheated = false;
  /** Set by the game: an asteroid blocks the sun. */
  inShadow = false;
  alive = true;
  score = 0;
  kills = 0;
  deaths = 0;
  respawnAt = 0;
  protectedUntil = 0;
  /** Time the ship left the arena, or null while inside. */
  outsideSince: number | null = null;
  /** Peer that simulates this ship in an online tournament; null when this browser does. */
  owner: string | null = null;

  /** Last state received for a ship another peer simulates, and when it arrived. */
  private readonly remote = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    orientation: new THREE.Quaternion(),
    spin: new THREE.Vector3(),
    at: 0,
  };
  private lastShotAt = -Infinity;
  private readonly engine: EngineParts;
  private flameTime = 0;
  private readonly frames: THREE.Texture[];

  constructor(
    readonly id: string,
    public name: string,
    readonly type: ShipType,
    assets: Assets,
    readonly isLocal: boolean,
  ) {
    this.model = assets.ships[type].clone(true);
    // Materials are shared between clones; the engine flame animates its own copy.
    this.model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name.toLowerCase().startsWith('drive')) o.material = (o.material as THREE.Material).clone();
      o.castShadow = o.receiveShadow = !(o.material as THREE.Material).transparent;
    });
    this.radius = sharedRadius(assets);
    this.frames = assets.textures.flameFrames;
    this.color = new THREE.Color().setHSL((shipCounter++ * 0.137 + (type === 'alien' ? 0.33 : 0.55)) % 1, 0.8, 0.6);
    this.root.add(this.model);
    this.engine = this.findEngine(assets.textures.glow);
    this.root.name = 'ship:' + id;
  }

  private findEngine(glowTexture: THREE.Texture): EngineParts {
    let flame: THREE.Mesh | null = null;
    const glows: THREE.Object3D[] = [];
    this.model.traverse((o) => {
      const name = o.name.toLowerCase();
      if (name.startsWith('drive') && o instanceof THREE.Mesh) flame = o;
      if (name.includes('glow')) glows.push(o);
    });
    // The glow texture is baked onto black, so additive blending leaves no visible quad edges.
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const glow of glows) if (glow instanceof THREE.Mesh) glow.material = glowMaterial;
    const light = new THREE.PointLight(0x88bbff, 0, 2500, 2);
    light.position.set(0, 0, 400);
    this.root.add(light);
    const flameMesh = flame as THREE.Mesh | null;
    return {
      flame: flameMesh,
      flameMaterial: flameMesh ? (flameMesh.material as THREE.MeshBasicMaterial) : null,
      flameZ: flameMesh ? flameMesh.position.z : 0,
      glows,
      light,
    };
  }

  spawn(position: THREE.Vector3, orientation: THREE.Quaternion, now: number) {
    this.protectedUntil = now + SPAWN_PROTECTION;
    this.flight.reset(position, orientation);
    this.hull = MAX_HULL;
    this.drive = this.thrusters = 1;
    this.holes.length = 0;
    this.heat = 0;
    this.overheated = false;
    this.alive = true;
    this.outsideSince = null;
    this.root.visible = true;
    this.syncTransform();
  }

  /** The ship's state as it travels over the network. */
  toState(now: number): ShipState {
    const f = this.flight;
    const round = (v: { toArray(): number[] }, digits = 0) => v.toArray().map((x) => +x.toFixed(digits));
    return {
      id: this.id,
      n: this.name,
      k: this.type,
      p: round(f.position),
      v: round(f.velocity, 1),
      q: round(f.orientation, 4),
      w: round(f.angularVelocity, 3),
      th: +f.throttle.toFixed(2),
      a: this.alive,
      h: Math.round(this.hull),
      dr: +this.drive.toFixed(2),
      tr: +this.thrusters.toFixed(2),
      s: this.score,
      ki: this.kills,
      de: this.deaths,
      pr: +Math.max(0, this.protectedUntil - now).toFixed(1),
    };
  }

  /** Takes over the state another peer sent for its ship. */
  applyState(state: ShipState, now: number) {
    const r = this.remote;
    r.position.fromArray(state.p);
    r.velocity.fromArray(state.v);
    r.orientation.fromArray(state.q).normalize();
    r.spin.fromArray(state.w);
    r.at = now;
    this.flight.velocity.copy(r.velocity);
    this.flight.throttle = state.th;
    this.hull = state.h;
    this.drive = state.dr;
    this.thrusters = state.tr;
    this.score = state.s;
    this.kills = state.ki;
    this.deaths = state.de;
    this.protectedUntil = now + state.pr;
    this.name = state.n;
    if (state.a && !this.alive) {
      // the owner booted a new clone
      this.alive = true;
      this.holes.length = 0;
      this.root.visible = true;
      this.flight.position.copy(r.position);
      this.flight.orientation.copy(r.orientation);
    } else if (!state.a && this.alive) {
      this.alive = false;
      this.root.visible = false;
    }
  }

  /**
   * Moves a ship another peer simulates: Newtonian prediction from the last state (a ship
   * without thrust flies straight on), blended in smoothly so corrections do not jump.
   */
  updateRemote(dt: number, now: number) {
    if (!this.alive) return;
    const r = this.remote;
    const age = Math.min(now - r.at, 1);
    local.copy(r.position).addScaledVector(r.velocity, age);
    const blend = 1 - Math.exp(-12 * dt);
    if (this.flight.position.distanceToSquared(local) > 4000 * 4000) this.flight.position.copy(local);
    else this.flight.position.lerp(local, blend);
    const spin = r.spin.length();
    inverse.copy(r.orientation);
    if (spin > 1e-6) inverse.multiply(spinStep.setFromAxisAngle(offset.copy(r.spin).divideScalar(spin), spin * age));
    this.flight.orientation.slerp(inverse, blend);
    this.model.visible = now >= this.protectedUntil || Math.floor(now * 8) % 2 === 0;
    this.syncTransform();
    this.animateEngine(dt);
  }

  /** Advances flight and laser; returns true when the ship fires this frame. */
  update(dt: number, now: number, controls: Controls, gravity: THREE.Vector3): boolean {
    if (!this.alive) return false;
    this.flight.driveFactor = this.drive;
    this.flight.thrusterFactor = 0.25 + 0.75 * this.thrusters;
    this.vent(now);
    this.flight.update(dt, controls, gravity, this.ventForce, this.ventSpin);
    // blink while spawn protection is active
    this.model.visible = now >= this.protectedUntil || Math.floor(now * 8) % 2 === 0;
    this.syncTransform();
    this.animateEngine(dt);

    this.heat = Math.max(0, this.heat - (this.inShadow ? COOLING_SHADOW : COOLING_SUN) * dt);
    if (this.overheated && this.heat <= OVERHEAT_RESUME) this.overheated = false;
    if (controls.fire && !this.overheated && now - this.lastShotAt >= LASER_COOLDOWN) {
      this.heat += HEAT_PER_SHOT;
      if (this.heat >= MAX_HEAT) this.overheated = true;
      this.lastShotAt = now;
      return true;
    }
    return false;
  }

  /** Strength of a hole's venting, 1 right after the hit, fading to 0. */
  ventStrength(hole: Hole, now: number) {
    return hole.size * Math.exp(-(now - hole.at) / VENT_TIME);
  }

  private vent(now: number) {
    this.ventForce.set(0, 0, 0);
    this.ventSpin.set(0, 0, 0);
    for (const hole of this.holes) {
      const strength = this.ventStrength(hole, now);
      if (strength < 0.01) continue;
      // the air rushes out one way, the ship is pushed the other way
      force.copy(hole.vent).multiplyScalar(-strength);
      this.ventForce.addScaledVector(force, VENT_THRUST);
      torque.copy(hole.point).divideScalar(this.radius).cross(force);
      this.ventSpin.addScaledVector(torque, VENT_SPIN);
    }
  }

  /**
   * A laser beam passes through the ship. The point where it comes closest to the center
   * decides which part it destroys; entry and exit leave holes.
   */
  laserHit(origin: THREE.Vector3, direction: THREE.Vector3, now: number): { status: DamageStatus; zone: Zone } {
    if (!this.alive || now < this.protectedUntil) return { status: 'protected', zone: 'hull' };
    offset.subVectors(this.flight.position, origin);
    const along = offset.dot(direction);
    inverse.copy(this.flight.orientation).invert();
    local.copy(origin).addScaledVector(direction, along).sub(this.flight.position).applyQuaternion(inverse).divideScalar(this.radius);

    const half = Math.sqrt(Math.max(0, 1 - local.lengthSq())) * this.radius;
    const localDirection = direction.clone().applyQuaternion(inverse);
    const center = local.clone().multiplyScalar(this.radius);
    const entry = this.addHole(center.clone().addScaledVector(localDirection, -half * 0.8), localDirection.clone().negate(), ENTRY_HOLE, now);
    const exit = this.addHole(center.clone().addScaledVector(localDirection, half * 0.8), localDirection.clone(), EXIT_HOLE, now);
    for (const hole of [entry, exit]) {
      torque.copy(hole.point).divideScalar(this.radius).cross(force.copy(hole.vent).multiplyScalar(-hole.size));
      this.flight.angularVelocity.addScaledVector(torque, DECOMPRESSION_KICK);
    }

    let zone: Zone = 'hull';
    if (local.length() < REACTOR_ZONE) zone = 'reactor';
    else if (local.z > 0.35) zone = 'drive';
    else if (Math.abs(local.x) > 0.4 || Math.abs(local.y) > 0.35) zone = 'thrusters';

    if (zone === 'drive') this.drive = Math.max(0, this.drive - DRIVE_HIT);
    if (zone === 'thrusters') this.thrusters = Math.max(0, this.thrusters - THRUSTER_HIT);
    const status = this.structural(zone === 'reactor' ? Infinity : LASER_HULL_DAMAGE, now);
    return { status, zone };
  }

  /** Hull damage, e.g. from a collision. */
  structural(amount: number, now: number): DamageStatus {
    if (!this.alive || now < this.protectedUntil) return 'protected';
    this.hull -= amount;
    if (this.hull > 0) return 'hit';
    this.hull = 0;
    this.alive = false;
    this.deaths++;
    this.root.visible = false;
    return 'destroyed';
  }

  private addHole(point: THREE.Vector3, vent: THREE.Vector3, size: number, now: number): Hole {
    const hole = { point, vent, size, at: now };
    this.holes.push(hole);
    if (this.holes.length > MAX_HOLES) this.holes.shift();
    return hole;
  }

  /** Converts a point in ship space to world space. */
  toWorld(point: THREE.Vector3, target = new THREE.Vector3()) {
    return target.copy(point).applyQuaternion(this.flight.orientation).add(this.flight.position);
  }

  /** Muzzle position in world space: alternating between the left and right side of the nose. */
  muzzle(shotIndex: number, target = new THREE.Vector3()) {
    const side = shotIndex % 2 === 0 ? -1 : 1;
    return this.toWorld(local.set(side * this.radius * 0.35, -this.radius * 0.1, -this.radius * 0.6), target);
  }

  /** Point on the nose where the beam's line of fire starts; the crosshair sits on this line. */
  nose(target = new THREE.Vector3()) {
    return this.toWorld(local.set(0, 0, -this.radius * 0.6), target);
  }

  syncTransform() {
    this.root.position.copy(this.flight.position);
    this.root.quaternion.copy(this.flight.orientation);
  }

  private animateEngine(dt: number) {
    const { flame, flameMaterial, flameZ, glows, light } = this.engine;
    // A damaged drive sputters.
    const sputter = this.drive < 1 ? 0.6 + 0.4 * Math.random() : 1;
    const throttle = this.flight.throttle * sputter;
    this.flameTime += dt;
    if (flame && flameMaterial) {
      flame.visible = throttle > 0.02;
      flame.position.z = flameZ - FLAME_RETRACT * (1 - throttle);
      flameMaterial.map = this.frames[Math.floor(this.flameTime * 10) % this.frames.length];
      flameMaterial.opacity = throttle;
    }
    const glowScale = GLOW_MAX_SCALE * (0.15 + 0.85 * throttle);
    for (const glow of glows) {
      glow.visible = this.drive > 0;
      glow.scale.set(glowScale, glowScale, 1);
      glow.rotateZ(dt * 2);
    }
    light.intensity = 1.5e5 * throttle;
  }
}
