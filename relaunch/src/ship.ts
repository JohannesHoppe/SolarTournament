import * as THREE from 'three';
import { colliderRadius, type Assets, type ShipType } from './assets';
import { FlightModel } from './flight';
import type { Controls } from './input';

export const MAX_SHIELD = 100;
const SHIELD_REGEN = 6;
const SHIELD_REGEN_DELAY = 3;

/** Freshly spawned ships cannot be damaged for this long (s). */
const SPAWN_PROTECTION = 2.5;

export const LASER_CAPACITY = 100;
export const LASER_SHOT_COST = 34;
const LASER_RECHARGE = 40;
/** Minimum time between two shots (s), so a full bank fires as a quick burst. */
const LASER_COOLDOWN = 0.18;

/** The engine flame slides this far (model units) into the hull at minimum throttle. */
const FLAME_RETRACT = 16;
const GLOW_MAX_SCALE = 3.5;

interface EngineParts {
  flame: THREE.Mesh | null;
  flameMaterial: THREE.MeshBasicMaterial | null;
  flameZ: number;
  glows: THREE.Object3D[];
  light: THREE.PointLight;
}

let shipCounter = 0;

export class Ship {
  readonly flight = new FlightModel();
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly radius: number;
  readonly color: THREE.Color;

  shield = MAX_SHIELD;
  laser = LASER_CAPACITY;
  alive = true;
  score = 0;
  kills = 0;
  deaths = 0;
  respawnAt = 0;
  protectedUntil = 0;

  private lastDamageAt = -Infinity;
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
      if (o instanceof THREE.Mesh && o.name.toLowerCase().startsWith('drive')) o.material = (o.material as THREE.Material).clone();
    });
    this.radius = colliderRadius(this.model) * 0.8;
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
    this.shield = MAX_SHIELD;
    this.laser = LASER_CAPACITY;
    this.alive = true;
    this.root.visible = true;
    this.syncTransform();
  }

  /** Advances flight, shield and laser; returns true when the ship fires this frame. */
  update(dt: number, now: number, controls: Controls): boolean {
    if (!this.alive) return false;
    this.flight.update(dt, controls);
    // blink while spawn protection is active
    this.model.visible = now >= this.protectedUntil || Math.floor(now * 8) % 2 === 0;
    this.syncTransform();
    this.animateEngine(dt);

    if (now - this.lastDamageAt > SHIELD_REGEN_DELAY) this.shield = Math.min(MAX_SHIELD, this.shield + SHIELD_REGEN * dt);
    this.laser = Math.min(LASER_CAPACITY, this.laser + LASER_RECHARGE * dt);

    if (controls.fire && this.laser >= LASER_SHOT_COST && now - this.lastShotAt >= LASER_COOLDOWN) {
      this.laser -= LASER_SHOT_COST;
      this.lastShotAt = now;
      return true;
    }
    return false;
  }

  damage(amount: number, now: number): 'protected' | 'hit' | 'destroyed' {
    if (!this.alive || now < this.protectedUntil) return 'protected';
    this.lastDamageAt = now;
    this.shield -= amount;
    if (this.shield > 0) return 'hit';
    this.shield = 0;
    this.alive = false;
    this.deaths++;
    this.root.visible = false;
    return 'destroyed';
  }

  /** Muzzle position in world space: alternating between the left and right side of the nose. */
  muzzle(shotIndex: number, target = new THREE.Vector3()) {
    const side = shotIndex % 2 === 0 ? -1 : 1;
    return target.set(side * this.radius * 0.35, -this.radius * 0.1, -this.radius * 0.6)
      .applyQuaternion(this.flight.orientation)
      .add(this.flight.position);
  }

  syncTransform() {
    this.root.position.copy(this.flight.position);
    this.root.quaternion.copy(this.flight.visualOrientation);
  }

  private animateEngine(dt: number) {
    const { flame, flameMaterial, flameZ, glows, light } = this.engine;
    const throttle = this.flight.throttle;
    this.flameTime += dt;
    if (flame && flameMaterial) {
      flame.position.z = flameZ - FLAME_RETRACT * (1 - throttle);
      flameMaterial.map = this.frames[Math.floor(this.flameTime * 10) % this.frames.length];
      flameMaterial.opacity = 0.35 + 0.65 * throttle;
    }
    const glowScale = GLOW_MAX_SCALE * (0.25 + 0.75 * throttle);
    for (const glow of glows) {
      glow.scale.set(glowScale, glowScale, 1);
      glow.rotateZ(dt * 2);
    }
    light.intensity = 1.5e5 * throttle;
  }
}
