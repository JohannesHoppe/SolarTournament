import * as THREE from 'three';
import type { Ship } from '../ship/ship';
import type { Homing, Torpedo } from './torpedoes';

/**
 * Decoys: hot lures a clone drops (an item, two from a sponsor probe, see game/items). One flies
 * off the ship's stern, DECOY_BACK slower than the ship (units/s, 30 m/s), and burns for
 * DECOY_LIFE seconds; every torpedo homing on that ship within DECOY_LURE of it (units, 1 km)
 * turns to it instead and goes off on it as on its target (see Torpedoes.update). Every browser
 * drops the decoys every other one tells of, so every torpedo turns alike, and the shooter's
 * browser decides where it goes off, as ever.
 */
export const DECOY_LIFE = 6;
export const DECOY_LURE = 20000;
export const DECOY_BACK = 600;
/** A probe carries this many, a clone holds at most this many. */
export const DECOYS_PER_PROBE = 2;
export const DECOYS_HELD = 3;
/** The decoy's size as a torpedo's seeker and fuse see it (units, 10 m), and as it glows. */
const DECOY_RADIUS = 200;

/** A decoy as a torpedo homes on it. */
export class Decoy implements Homing {
  readonly radius = DECOY_RADIUS;
  readonly flight: { position: THREE.Vector3; velocity: THREE.Vector3 };
  alive = true;
  constructor(
    readonly id: string,
    readonly name: string,
    /** The ship that dropped it: the torpedoes homing on that one turn to it. */
    readonly owner: Ship,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    readonly bornAt: number,
    readonly glow: THREE.Sprite,
  ) {
    this.flight = { position: position.clone(), velocity: velocity.clone() };
    glow.position.copy(position);
  }
}

/** Where a ship drops a decoy and how it flies off: from its stern, its velocity less DECOY_BACK along its nose. */
export function decoyLaunch(ship: Ship, position: THREE.Vector3, velocity: THREE.Vector3) {
  const back = ship.flight.forward(new THREE.Vector3()).negate();
  position.copy(ship.flight.position).addScaledVector(back, ship.radius * 1.5);
  velocity.copy(ship.flight.velocity).addScaledVector(back, DECOY_BACK);
}

/** Turns every torpedo homing on the decoy's ship within DECOY_LURE of it to the decoy; returns how many turned. */
export function lure(decoy: Decoy, torpedoes: readonly Torpedo[]): number {
  let turned = 0;
  for (const torpedo of torpedoes) {
    if (torpedo.target !== decoy.owner) continue;
    if (torpedo.position.distanceTo(decoy.flight.position) > DECOY_LURE) continue;
    torpedo.target = decoy;
    turned++;
  }
  return turned;
}

/** The decoys in flight: they drift and glow, and go out after DECOY_LIFE. */
export class Decoys {
  readonly group = new THREE.Group();
  readonly list: Decoy[] = [];
  private readonly material: THREE.SpriteMaterial;

  constructor(texture: THREE.Texture) {
    this.material = new THREE.SpriteMaterial({ map: texture, color: new THREE.Color(1, 0.55, 0.85).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  }

  /** A decoy dropped by `owner` at a point, flying with a velocity; it lures at once (see lure). */
  drop(id: string, owner: Ship, position: THREE.Vector3, velocity: THREE.Vector3, now: number, torpedoes: readonly Torpedo[]): Decoy {
    const glow = new THREE.Sprite(this.material);
    glow.scale.setScalar(DECOY_RADIUS * 6);
    this.group.add(glow);
    const decoy = new Decoy(id, owner.name, owner, position, velocity, now, glow);
    this.list.push(decoy);
    lure(decoy, torpedoes);
    return decoy;
  }

  update(dt: number, now: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const decoy = this.list[i];
      decoy.flight.position.addScaledVector(decoy.flight.velocity, dt);
      decoy.glow.position.copy(decoy.flight.position);
      // it flickers as it burns down
      const left = 1 - (now - decoy.bornAt) / DECOY_LIFE;
      decoy.glow.scale.setScalar(DECOY_RADIUS * (4 + 2 * left + Math.random()));
      if (left <= 0) this.remove(decoy);
    }
  }

  remove(decoy: Decoy) {
    decoy.alive = false;
    this.group.remove(decoy.glow);
    const index = this.list.indexOf(decoy);
    if (index >= 0) this.list.splice(index, 1);
  }

  clear() {
    for (const decoy of [...this.list]) this.remove(decoy);
  }
}
