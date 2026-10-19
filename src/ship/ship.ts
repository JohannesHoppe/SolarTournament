import * as THREE from 'three';
import { colliderRadius, type Assets, type ShipType } from '../assets';
import { FlightModel } from './flight';
import type { Controls } from '../input/input';

/** Hull integrity of an intact ship. There are no shields: every hit stays. */
export const MAX_HULL = 100;
/**
 * The ships are heavily armored: a beam from the front or the side only scorches the armor
 * (this many hull points; fifty such hits wreck a ship). The drive is the weak spot.
 */
const ARMOR_DAMAGE = 2;
/**
 * A beam from behind, within REAR_CONE of the ship's axis, goes into the drive: each hit costs
 * this share of the thrust, and the hit that leaves nothing of it sends the drive's reactor
 * critical, so five hits from behind destroy a ship.
 */
const DRIVE_HIT = 0.2;
/** Half the opening angle of the cone behind a ship from which a beam reaches the drive (rad, 50°). */
const REAR_CONE = 0.87;
const REAR_CONE_COS = Math.cos(REAR_CONE);
/** Damage a beam into the flanks deals to the maneuvering thrusters (0..1), on top of the armor. */
const THRUSTER_HIT = 0.1;
const MAX_HOLES = 8;
/** Venting from a hole fades with this time constant (s): the compartment runs out of air. */
const VENT_TIME = 2.5;
/** Push of the escaping air right after the hit (units/s²). */
const VENT_THRUST = 120;
/** Spin the escaping air causes per unit of lever arm (rad/s²); it acts off-center, so the ship tumbles. */
const VENT_SPIN = 6;
/** Rotation kick of the explosive decompression at the moment of the hit (rad/s). */
const DECOMPRESSION_KICK = 1.2;
/** The exit hole tears wider than the entry hole and vents more. */
const ENTRY_HOLE = 0.4;
const EXIT_HOLE = 1;

/** Freshly spawned ships cannot be damaged for this long (s), long enough to get the bearings; firing ends it early. */
const SPAWN_PROTECTION = 5;

/** The laser heats the ship; radiators shed the heat, much better in the shadow of an asteroid. */
export const MAX_HEAT = 100;
const HEAT_PER_SHOT = 20;
const COOLING_SUN = 20;
const COOLING_SHADOW = 50;
/** An overheated laser stays locked until the ship has cooled down to this. */
const OVERHEAT_RESUME = 30;
/** Minimum time between two shots (s), so a full bank fires as a quick burst. */
const LASER_COOLDOWN = 0.18;

/** The engine flame slides this far (model units) into the hull at zero thrust. */
const FLAME_RETRACT = 16;
const GLOW_MAX_SCALE = 3;
/** Brightness of the drive glow at idle, as a share of full thrust. */
const GLOW_IDLE = 0.25;

export type Zone = 'reactor' | 'drive' | 'thrusters' | 'armor';
export type DamageStatus = 'protected' | 'hit' | 'destroyed';

interface EngineParts {
  flame: THREE.Mesh | null;
  flameMaterial: THREE.MeshBasicMaterial | null;
  flameZ: number;
  glows: THREE.Object3D[];
  glowMaterial: THREE.MeshBasicMaterial;
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
  /** Where the ship was before this frame's move, for the swept collision test. */
  readonly previous = new THREE.Vector3();
  /** Where the drive's exhaust was laid last frame, and whether the drive was burning then. */
  readonly trailFrom = new THREE.Vector3();
  trailing = false;
  /**
   * Who flies the ship, read from its id, which no Host can choose: a bot, a real Host, or
   * nobody (the flight school's target drone). The HUD marks names with it (see view/marks).
   */
  get kind(): 'bot' | 'host' | null {
    if (this.id === 'drone') return null;
    return /^(?:bot\d+|b:|sparring$)/.test(this.id) ? 'bot' : 'host';
  }

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
  /** The drive's light on nearby rocks, lent by the game from a fixed pool (see Game.lendLight). */
  engineLight: THREE.PointLight | null = null;

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
    const flameMesh = flame as THREE.Mesh | null;
    return {
      flame: flameMesh,
      flameMaterial: flameMesh ? (flameMesh.material as THREE.MeshBasicMaterial) : null,
      flameZ: flameMesh ? flameMesh.position.z : 0,
      glows,
      glowMaterial,
    };
  }

  spawn(position: THREE.Vector3, orientation: THREE.Quaternion, now: number) {
    this.trailing = false;
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
    this.previous.copy(this.flight.position);
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
    if (!this.alive || now < this.protectedUntil) return { status: 'protected', zone: 'armor' };
    if (!this.tailToward(direction)) {
      // the armor takes it: a scorch mark and a few points, no hole; a beam into the flanks
      // also shakes the maneuvering thrusters
      inverse.copy(this.flight.orientation).invert();
      offset.subVectors(this.flight.position, origin);
      local.copy(origin).addScaledVector(direction, offset.dot(direction)).sub(this.flight.position).applyQuaternion(inverse).divideScalar(this.radius);
      const flank = Math.abs(local.x) > 0.4 || Math.abs(local.y) > 0.35;
      if (flank) this.thrusters = Math.max(0, this.thrusters - THRUSTER_HIT);
      return { status: this.structural(ARMOR_DAMAGE, now), zone: flank ? 'thrusters' : 'armor' };
    }
    offset.subVectors(this.flight.position, origin);
    const along = offset.dot(direction);
    inverse.copy(this.flight.orientation).invert();
    local.copy(origin).addScaledVector(direction, along).sub(this.flight.position).applyQuaternion(inverse).divideScalar(this.radius);
    // a beam that only grazed the hit sphere on a lagging screen still hits the hull, not empty space
    if (local.lengthSq() > 1) local.normalize();

    const half = Math.sqrt(Math.max(0, 1 - local.lengthSq())) * this.radius;
    const localDirection = direction.clone().applyQuaternion(inverse);
    const center = local.clone().multiplyScalar(this.radius);
    const entry = this.addHole(center.clone().addScaledVector(localDirection, -half * 0.8), localDirection.clone().negate(), ENTRY_HOLE, now);
    const exit = this.addHole(center.clone().addScaledVector(localDirection, half * 0.8), localDirection.clone(), EXIT_HOLE, now);
    for (const hole of [entry, exit]) {
      torque.copy(hole.point).divideScalar(this.radius).cross(force.copy(hole.vent).multiplyScalar(-hole.size));
      this.flight.angularVelocity.addScaledVector(torque, DECOMPRESSION_KICK);
    }

    // into the drive: it loses thrust, and once nothing is left its reactor goes critical
    this.drive = Math.max(0, this.drive - DRIVE_HIT);
    if (this.drive > 1e-6) return { status: this.structural(ARMOR_DAMAGE, now), zone: 'drive' };
    return { status: this.structural(Infinity, now), zone: 'reactor' };
  }

  /**
   * Whether a beam travelling in `direction` comes from behind this ship, within REAR_CONE of
   * its axis: then it goes into the drive instead of the armor.
   */
  tailToward(direction: THREE.Vector3): boolean {
    return direction.dot(this.flight.forward(offset)) / direction.length() > REAR_CONE_COS;
  }

  /** The overdrive dumps the reactor's heat into the ship: the laser locks until it has cooled down. */
  overheat() {
    this.heat = MAX_HEAT;
    this.overheated = true;
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
    const { flame, flameMaterial, flameZ, glows, glowMaterial } = this.engine;
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
    // the glow grows and brightens with the drive; idle it is a faint pilot light
    const glowScale = GLOW_MAX_SCALE * (0.3 + 0.7 * throttle);
    glowMaterial.color.setScalar(GLOW_IDLE + (1 - GLOW_IDLE) * throttle);
    for (const glow of glows) {
      glow.visible = this.drive > 0;
      glow.scale.set(glowScale, glowScale, 1);
    }
    if (this.engineLight) this.engineLight.intensity = 1.5e5 * throttle;
  }
}
