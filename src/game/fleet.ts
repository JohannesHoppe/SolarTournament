import * as THREE from 'three';
import { Randomizer } from '../random';
import { FIELD_RADIUS, raySphere, type Obstacle } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { boxContact, rayBox } from '../world/boxes';
import type { Homing } from './torpedoes';

/**
 * The President's Fleet: every Host on one side against a battleship of the President, one in
 * every round. The President wants blood and sends battleships into the ring, because he can.
 * The Hosts win the round when it goes down; when the time runs out first, it got away, and
 * the President wins.
 *
 * A battleship is 600 m long and circles the field along its outer rocks like a shark. It has
 * six laser batteries, two drives and a reactor under an armored dome; its hull itself takes
 * no harm. Every laser hit on a part counts; a part takes ZONE_HITS hits. Its phases follow
 * from what is left of it:
 *
 * - while more than half its batteries stand, it circles and its batteries fire;
 * - with half of them gone, it turns its stern on the nearest pilot and lights its drives: its
 *   drive plume, a kilometer and a half of plasma, burns whatever is in it;
 * - with every battery gone, the dome over the reactor opens; the reactor's end is the ship's.
 *
 * Without drives it drifts and burns nothing. A battleship that goes down takes every ship
 * within SINK_BLAST along.
 *
 * Its hull blocks the line of sight like a rock: a battery does not fire through it, and a pilot
 * on the far side is hidden from the others. A torpedo locks on a part as on a ship and goes off
 * on it, or on the hull; it counts TORPEDO_HITS hits on every part it goes off near.
 *
 * Online the lead browser flies the battleship and sends where it is with the round clock (see
 * Fleet.toState); every laser hit on a part goes to every browser, so all count the same hits.
 * Each browser fires the batteries at the ships it runs, and burns them in the plume.
 */
export type ZoneKind = 'battery' | 'drive' | 'reactor';
export const ZONE_NAMES: Record<ZoneKind, string> = { battery: 'Battery', drive: 'Drive', reactor: 'Reactor' };
/** Hits a part takes. */
export const ZONE_HITS: Record<ZoneKind, number> = { battery: 30, drive: 45, reactor: 90 };
/** A torpedo counts this many hits on every part it goes off within TORPEDO_REACH of (units, 20 m beyond the part): a third of a battery. */
export const TORPEDO_HITS = 10;
const TORPEDO_REACH = 400;
/** Points for a hit on a part, for the hit that breaks one, and for every ship of the side when the battleship goes down. */
export const FLEET_HIT_POINTS = 10;
export const ZONE_POINTS: Record<ZoneKind, number> = { battery: 150, drive: 200, reactor: 1000 };
export const SINK_POINTS = 500;
/** The battleship comes this long after the round starts (s of field time). */
export const ARRIVAL = 12;
/**
 * A battleship circles the center this far out (units, 2.5 km), along the outer rocks and
 * almost 1 km inside the arena's edge, so a pilot can attack it from every side, at
 * FLEET_SPEED (units/s, 30 m/s); it turns at FLEET_TURN (rad/s).
 */
const ORBIT = FIELD_RADIUS * 1.1;
const FLEET_SPEED = 600;
const FLEET_TURN = 0.12;
/** It comes in from this far out (units), just inside the arena's edge. */
const ENTRY = ARENA_LIMIT * 0.95;
/** A battery fires every BATTERY_PERIOD seconds at the nearest ship within BATTERY_RANGE (units, 1.5 km) it sees. */
export const BATTERY_PERIOD = 1.6;
export const BATTERY_RANGE = 30000;
/**
 * A battery's beam hits with a chance that falls with the target's speed and distance: at
 * rest and close BATTERY_AIM, at full tournament speed (BATTERY_DODGE_SPEED, units/s) and the
 * edge of its range a quarter of that. Moving is what saves a pilot.
 */
export const BATTERY_AIM = 0.7;
/** A battery's beam is heavier than a ship's laser: on top of what a laser does where it strikes, it takes this much hull. */
export const BATTERY_DAMAGE = 10;
const BATTERY_DODGE_SPEED = 5000;
/** The drive plume: PLUME_REACH long (units, 1.5 km), spreading by PLUME_SPREAD per unit; PLUME_HEAT heat and PLUME_BURN hull per second at the nozzles, fading to nothing at its end. */
export const PLUME_REACH = 30000;
const PLUME_SPREAD = 0.12;
export const PLUME_HEAT = 150;
export const PLUME_BURN = 40;
/** It lights its drives once its stern points within PLUME_AIM (rad) of its target, a pilot within PLUME_HUNT (units, 1.8 km). */
const PLUME_AIM = 0.25;
const PLUME_HUNT = 36000;
/** A battleship going down burns SINK_SECONDS with its reactor critical, then goes up and destroys every ship within SINK_BLAST of it (units, 1 km). */
export const SINK_SECONDS = 4;
export const SINK_BLAST = 20000;
/** Nothing of a battleship lies farther than this from its center (units): its stern's nozzles at 400 m, and room. */
const REACH = 8500;

type Zone = { kind: ZoneKind; at: THREE.Vector3; radius: number; mesh: THREE.Object3D };
type Box = { center: THREE.Vector3; half: THREE.Vector3 };

/** What the lead browser sends: whether the battleship went down, the hits on each part, where it is, its motion and turn, whom its stern hunts and whether its drives burn. */
export type FleetState = { d: number; h: number[]; p: number[]; v: number[]; q: number[]; t: string | null; u: number };

/** What the fleet needs to know of a ship. */
export interface Target {
  readonly id: string;
  readonly alive: boolean;
  readonly flight: { readonly position: THREE.Vector3 };
}

/** A part was hit (or broken, or the ship went down) where. */
export type FleetEvent = { kind: 'broken' | 'sunk' | 'phase'; zone: number; position: THREE.Vector3 };

const local = new THREE.Vector3();
const step = new THREE.Vector3();
const closest = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const want = new THREE.Vector3();
const look = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** The chance a battery's beam hits a target this fast (units/s) this far away (units). */
export const batteryChance = (speed: number, distance: number) => BATTERY_AIM * (1 - 0.5 * Math.min(1, speed / BATTERY_DODGE_SPEED)) * (1 - 0.5 * Math.min(1, distance / BATTERY_RANGE));

/** A part of the battleship as a torpedo homes on it: where it is, and whether it can still be hit. */
class Beacon implements Homing {
  readonly id: string;
  readonly name: string;
  readonly radius: number;
  readonly flight: { position: THREE.Vector3; velocity: THREE.Vector3 };

  constructor(
    private readonly fleet: Fleet,
    private readonly zone: number,
  ) {
    const part = fleet.zones[zone];
    this.id = `battleship.${zone}`;
    this.name = ZONE_NAMES[part.kind];
    this.radius = part.radius;
    this.flight = { position: new THREE.Vector3(), velocity: fleet.velocity };
  }

  get alive() {
    return this.fleet.targetable(this.zone);
  }
}

export class Fleet implements Obstacle {
  readonly root = new THREE.Group();
  /** When the battleship comes (field time), and whether it went down. */
  arrivesAt = ARRIVAL;
  down = false;
  readonly hits: number[];
  readonly zones: Zone[] = [];
  /** Each part, as a torpedo locks on it. */
  readonly beacons: Beacon[];
  readonly velocity = new THREE.Vector3();
  /** The ship its stern hunts in its second phase, and whether its drives burn. */
  target: string | null = null;
  burning = false;
  /** Where the lead browser last said it was, which the others glide towards. */
  private readonly heard = new THREE.Vector3();
  private readonly heardTurn = new THREE.Quaternion();
  private heardFresh = false;
  private readonly colliders: Box[] = [];
  private readonly dome: THREE.Mesh;
  private readonly flame: THREE.Mesh;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly burnt: THREE.MeshStandardMaterial;
  private readonly reactorGlow: THREE.MeshBasicMaterial;
  private readonly driveGlow: THREE.MeshBasicMaterial;
  private lastClock = 0;
  /** The field time of the frame it was last shown in (see update). */
  private clock = 0;
  /** When the battleship went down (field time). */
  private sunkAt = -Infinity;

  constructor(private readonly seed: number) {
    const hull = this.material(new THREE.MeshStandardMaterial({ color: 0x5a606c, metalness: 0.4, roughness: 0.55 }));
    const dark = this.material(new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.4, roughness: 0.7 }));
    this.burnt = this.material(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1 }));
    // the regime's neon is red, the color of danger
    const neon = this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0.12).multiplyScalar(2.2), toneMapped: false }));
    this.reactorGlow = this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.4).multiplyScalar(2.5), toneMapped: false }));
    const driveGlow = (this.driveGlow = this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.6, 1).multiplyScalar(2), toneMapped: false })));
    const flame = this.material(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.2).multiplyScalar(1.5), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));

    // the hull: a long armored body with a bridge tower aft and the drive block at the stern
    // (the bow points along -z, as every ship's nose); it collides as these boxes
    const box = (center: [number, number, number], size: [number, number, number], material: THREE.Material, solid = true) => {
      const mesh = new THREE.Mesh(this.geometry(new THREE.BoxGeometry(...size)), material);
      mesh.position.set(...center);
      this.root.add(mesh);
      if (solid) this.colliders.push({ center: new THREE.Vector3(...center), half: new THREE.Vector3(...size).multiplyScalar(0.5) });
      return mesh;
    };
    box([0, 0, 0], [2400, 1600, 12000], hull);
    box([0, 0, -6400], [1600, 1000, 800], hull);
    box([0, 1300, 2500], [1000, 1000, 1800], dark);
    box([0, 0, 6600], [2800, 2000, 1200], dark);
    // neon along its flanks, ribs around the hull every 75 m, and a band around the bridge:
    // seen from a kilometer, its outline glows red
    for (const side of [-1, 1]) box([side * 1215, 300, 0], [30, 140, 11000], neon, false);
    for (let z = -4500; z <= 4500; z += 1500) {
      box([0, 815, z], [2440, 30, 80], neon, false);
      box([0, -815, z], [2440, 30, 80], neon, false);
    }
    box([0, 1500, 2500], [1040, 80, 1840], neon, false);
    // the dome over the reactor: armor while it is closed (see open)
    this.dome = box([0, 1000, -1200], [1300, 400, 1300], dark);

    const barrel = this.geometry(new THREE.CylinderGeometry(60, 60, 900, 8).rotateX(Math.PI / 2).translate(0, 0, -450));
    const mount = this.geometry(new THREE.BoxGeometry(500, 300, 500));
    const batteries: [number, number, number][] = [[0, 950, -4200], [0, 950, -2700], [0, -950, -4200], [0, -950, -2700], [1350, 0, 300], [-1350, 0, 300]];
    for (const at of batteries) {
      const turret = new THREE.Group();
      turret.position.set(...at);
      turret.add(new THREE.Mesh(mount, dark), new THREE.Mesh(barrel, neon));
      this.root.add(turret);
      this.zones.push({ kind: 'battery', at: new THREE.Vector3(...at), radius: 300, mesh: turret });
    }
    const nozzle = this.geometry(new THREE.CylinderGeometry(420, 520, 600, 16).rotateX(Math.PI / 2));
    for (const side of [-1, 1]) {
      const drive = new THREE.Mesh(nozzle, driveGlow);
      drive.position.set(side * 700, 0, 7400);
      this.root.add(drive);
      this.zones.push({ kind: 'drive', at: drive.position.clone(), radius: 480, mesh: drive });
    }
    const reactor = new THREE.Mesh(this.geometry(new THREE.IcosahedronGeometry(420, 1)), this.reactorGlow);
    reactor.position.set(0, 1000, -1200);
    this.root.add(reactor);
    this.zones.push({ kind: 'reactor', at: reactor.position.clone(), radius: 450, mesh: reactor });
    // the plume behind the drives, while they burn
    this.flame = new THREE.Mesh(this.geometry(new THREE.ConeGeometry(PLUME_REACH * PLUME_SPREAD, PLUME_REACH, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 7700 + PLUME_REACH / 2)), flame);
    this.flame.visible = false;
    this.root.add(this.flame);
    this.hits = this.zones.map(() => 0);
    this.beacons = this.zones.map((_, i) => new Beacon(this, i));
    this.enter();
  }

  get position() {
    return this.root.position;
  }

  get quaternion() {
    return this.root.quaternion;
  }

  /** The battleship is in the fight: it has come, and has not gone down. */
  present(clock: number) {
    return clock >= this.arrivesAt && !this.down;
  }

  /** It went down and has gone up: the Hosts have won the round. */
  sunk(clock: number) {
    return this.down && !this.dying(clock);
  }

  /** Hits a part takes. */
  hitsOf(zone: number) {
    return ZONE_HITS[this.zones[zone].kind];
  }

  broken(zone: number) {
    return this.hits[zone] >= this.hitsOf(zone);
  }

  /** Batteries still firing. */
  get batteries() {
    return this.zones.filter((zone, i) => zone.kind === 'battery' && !this.broken(i)).length;
  }

  get drives() {
    return this.zones.filter((zone, i) => zone.kind === 'drive' && !this.broken(i)).length;
  }

  /** The battleship's phase: 1 while more than half its batteries stand, 2 below, 3 with all of them gone (the reactor open). */
  get phase() {
    const all = this.zones.filter((zone) => zone.kind === 'battery').length;
    const left = this.batteries;
    return left === 0 ? 3 : left * 2 <= all ? 2 : 1;
  }

  /** A part can be hit: it stands, and the reactor only once its dome is open. */
  open(zone: number) {
    return !this.broken(zone) && (this.zones[zone].kind !== 'reactor' || this.phase === 3);
  }

  /** A torpedo can lock on a part: the battleship is in the fight, and the part can be hit. */
  targetable(zone: number) {
    return this.present(this.clock) && this.open(zone);
  }

  /** A part in world space. */
  zoneAt(zone: number, target = new THREE.Vector3()) {
    return target.copy(this.zones[zone].at).applyMatrix4(this.root.matrixWorld);
  }

  /**
   * The part to go for from a point, or -1: the nearest battery while one stands (they fire,
   * and they open the reactor), then the nearest drive or the reactor. Bots aim at it, and the
   * HUD marks it.
   */
  nearestZone(from: THREE.Vector3): number {
    let best = -1;
    let distance = Infinity;
    const batteries = this.batteries > 0;
    for (let i = 0; i < this.zones.length; i++) {
      if (!this.open(i) || (batteries && this.zones[i].kind !== 'battery')) continue;
      const d = this.zoneAt(i, local).distanceTo(from);
      if (d < distance) {
        distance = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Hits on a part (one for a laser, TORPEDO_HITS for a torpedo), from here or another browser;
   * returns the events they set off: the part broken, a new phase, the ship gone down. A hit on
   * a part already broken or still sealed, or on a battleship that went down, counts nothing.
   */
  hit(zone: number, count = 1): FleetEvent[] {
    if (this.down || !this.open(zone)) return [];
    const phase = this.phase;
    this.hits[zone] = Math.min(this.hits[zone] + count, this.hitsOf(zone));
    return this.after(zone, phase);
  }

  /** The parts a torpedo going off at `point` hits (see TORPEDO_HITS). */
  blast(point: THREE.Vector3): number[] {
    return this.zones.flatMap((zone, i) => (this.targetable(i) && this.zoneAt(i, local).distanceTo(point) < zone.radius + TORPEDO_REACH ? [i] : []));
  }

  /**
   * Where a ray (from `origin` along the normalized `direction`, up to `max`) meets the
   * battleship: the distance and the part it hits (-1: the armor); null when it misses.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, max: number, clock: number): { distance: number; zone: number } | null {
    if (!this.present(clock) || raySphere(origin, direction, this.position, REACH) === null) return null;
    const armor = this.rayHull(origin, direction, max);
    let best = armor === null ? null : { distance: armor, zone: -1 };
    this.zones.forEach((zone, i) => {
      if (!this.open(i)) return;
      const d = raySphere(local, step, zone.at, zone.radius);
      if (d !== null && d <= max && (!best || d <= best.distance)) best = { distance: d, zone: i };
    });
    return best;
  }

  /** Its hull lies on a ray, while it is in the field (see Obstacle). */
  blocks(origin: THREE.Vector3, direction: THREE.Vector3, distance: number): boolean {
    return this.standing && raySphere(origin, direction, this.position, REACH) !== null && this.rayHull(origin, direction, distance) !== null;
  }

  /** A sphere touches its hull, while it is in the field (see Obstacle). */
  touches(center: THREE.Vector3, radius: number): boolean {
    if (!this.standing || center.distanceTo(this.position) > REACH + radius) return false;
    return this.colliders.some((box) => this.solid(box) && boxContact(this.toLocal(center, local).sub(box.center), box.half, radius, step, closest) !== null);
  }

  /** Pushes a sphere out of the hull; returns the outward normal when they touched (and moves `center` onto the hull), otherwise null. */
  resolve(center: THREE.Vector3, radius: number, clock: number, normal = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.present(clock) || center.distanceTo(this.position) > REACH + radius) return null;
    for (const box of this.colliders) {
      if (!this.solid(box)) continue;
      this.toLocal(center, local).sub(box.center);
      if (!boxContact(local, box.half, radius, normal, closest)) continue;
      normal.applyQuaternion(this.quaternion);
      closest.add(box.center).applyMatrix4(this.root.matrixWorld);
      center.copy(closest).addScaledVector(normal, radius + 1);
      return normal;
    }
    return null;
  }

  /** How strongly a point lies in the drive plume, 0..1 (1 at the nozzles), while the drives burn. */
  plumeAt(point: THREE.Vector3, radius: number): number {
    if (!this.burning) return 0;
    const along = this.plume(point, radius);
    return along < 0 ? 0 : 1 - along / PLUME_REACH;
  }

  /**
   * While its stern hunts a pilot, burning or turning to: the point on the plume's axis abreast
   * of `point` (into `target`) when `point` lies within `margin` of the plume, otherwise null.
   * Bots fly away from it, out to the side.
   */
  plumeNear(point: THREE.Vector3, margin: number, target: THREE.Vector3): THREE.Vector3 | null {
    if (this.target === null) return null;
    const along = this.plume(point, margin);
    return along < 0 ? null : target.copy(want).addScaledVector(toTarget, along);
  }

  /** The batteries that fire this frame, each with the number of its shot: the same moments and numbers on every browser, by the field time. */
  firing(clock: number): { zone: number; shot: number }[] {
    const fired: { zone: number; shot: number }[] = [];
    if (this.present(clock) && clock > this.lastClock) {
      this.zones.forEach((zone, i) => {
        if (zone.kind !== 'battery' || this.broken(i)) return;
        const offset = i * 0.27;
        const shot = Math.floor((clock + offset) / BATTERY_PERIOD);
        if (shot > Math.floor((this.lastClock + offset) / BATTERY_PERIOD)) fired.push({ zone: i, shot });
      });
    }
    this.lastClock = clock;
    return fired;
  }

  /**
   * The lead browser flies the battleship: in on its orbit around the field, its stern turned on
   * the nearest pilot in its second phase, adrift without drives.
   */
  lead(dt: number, clock: number, ships: readonly Target[]) {
    if (!this.present(clock)) return;
    const position = this.position;
    if (this.drives > 0) {
      // the orbit: along its circle around the center, back towards it when off
      const radial = local.copy(position).setY(0);
      const r = radial.length() || 1;
      want.crossVectors(UP, radial).divideScalar(r).multiplyScalar(FLEET_SPEED).addScaledVector(radial, ((ORBIT - r) / r) * 0.05);
      want.y = -position.y * 0.05;
      this.velocity.lerp(want, Math.min(1, dt * 0.3));
    } else this.velocity.multiplyScalar(Math.max(0, 1 - dt * 0.2));
    position.addScaledVector(this.velocity, dt);
    // its bow along its course, or in its second phase its stern on the nearest pilot
    let prey: Target | null = null;
    if (this.phase >= 2 && this.drives > 0) {
      let nearest = PLUME_HUNT;
      for (const ship of ships) {
        const d = ship.alive ? ship.flight.position.distanceTo(position) : Infinity;
        if (d < nearest) {
          nearest = d;
          prey = ship;
        }
      }
    }
    this.target = prey?.id ?? null;
    const bow = prey ? want.subVectors(position, prey.flight.position) : want.copy(this.velocity);
    if (bow.lengthSq() > 1) {
      turn.setFromRotationMatrix(look.lookAt(local.set(0, 0, 0), bow.normalize(), UP));
      this.quaternion.rotateTowards(turn, FLEET_TURN * dt);
    }
    this.burning = !!prey && this.quaternion.angleTo(turn) < PLUME_AIM;
    this.root.updateMatrixWorld();
  }

  /** The lead's state, for the other browsers. */
  toState(): FleetState {
    const round = (v: number) => +v.toFixed(3);
    return {
      d: this.down ? 1 : 0,
      h: [...this.hits],
      p: this.position.toArray().map(Math.round),
      v: this.velocity.toArray().map(Math.round),
      q: this.quaternion.toArray().map(round),
      t: this.target,
      u: this.burning ? 1 : 0,
    };
  }

  /** Takes the lead's state: the battleship went down there first, the hits it counts, where it is. */
  follow(state: FleetState): FleetEvent[] {
    if (this.down) return [];
    if (state.d) return this.sink();
    const events: FleetEvent[] = [];
    // hits only add up: the lead's count fills in hits not heard here
    const phase = this.phase;
    state.h.forEach((hits, zone) => {
      if (hits <= this.hits[zone] || zone >= this.hits.length) return;
      const was = this.broken(zone);
      this.hits[zone] = Math.min(hits, this.hitsOf(zone));
      if (!was && this.broken(zone)) events.push({ kind: 'broken', zone, position: this.zoneAt(zone) });
    });
    if (this.phase !== phase) events.push({ kind: 'phase', zone: -1, position: this.position.clone() });
    this.heard.fromArray(state.p);
    this.heardTurn.fromArray(state.q).normalize();
    this.velocity.fromArray(state.v);
    if (!this.heardFresh) {
      this.position.copy(this.heard);
      this.quaternion.copy(this.heardTurn);
    }
    this.heardFresh = true;
    this.target = state.t;
    this.burning = state.u === 1;
    return events;
  }

  /** A browser that does not lead glides towards the lead's battleship, moving it on with its velocity meanwhile. */
  glide(dt: number) {
    if (!this.heardFresh) return;
    this.heard.addScaledVector(this.velocity, dt);
    this.position.lerp(this.heard, Math.min(1, dt * 4));
    this.quaternion.slerp(this.heardTurn, Math.min(1, dt * 4));
    this.root.updateMatrixWorld();
  }

  /** The battleship that went down burns this long before it goes up (s). */
  dying(clock: number) {
    return clock < this.sunkAt + SINK_SECONDS;
  }

  /**
   * The battleship as it looks this frame: broken parts burnt out, the dome open, the reactor
   * pulsing, the plume burning; once it went down it stays until it goes up.
   */
  update(clock: number, now: number) {
    this.clock = clock;
    const dying = this.dying(clock);
    this.root.visible = this.present(clock) || dying;
    this.beacons.forEach((beacon, i) => this.zoneAt(i, beacon.flight.position));
    // a broken drive is burnt out; a broken battery or reactor is gone
    this.zones.forEach((zone, i) => {
      if (zone.kind === 'drive') (zone.mesh as THREE.Mesh).material = this.broken(i) ? this.burnt : this.driveGlow;
      else zone.mesh.visible = !this.broken(i);
    });
    this.dome.visible = this.phase < 3 && !dying;
    this.reactorGlow.color.setRGB(1, 0.75, 0.4).multiplyScalar(dying ? 3 + 2 * Math.sin(now * 30) : this.phase === 3 ? 2 + Math.sin(now * 8) : 1.5);
    this.flame.visible = this.burning;
    if (this.burning) this.flame.scale.set(1 + 0.08 * Math.sin(now * 40), 1 + 0.08 * Math.sin(now * 37), 1);
  }

  dispose() {
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
  }

  /** The battleship went down (here, or on the lead browser first): its reactor goes critical, and SINK_SECONDS later it goes up. */
  sink(): FleetEvent[] {
    this.down = true;
    this.sunkAt = this.lastClock;
    this.target = null;
    this.burning = false;
    return [{ kind: 'sunk', zone: -1, position: this.position.clone() }];
  }

  /** Where the battleship comes in: on the arena's edge, from a side that follows from the arena, heading along its orbit. */
  private enter() {
    const r = new Randomizer(this.seed * 13 + 101);
    const angle = r.range(0, Math.PI * 2);
    this.position.set(Math.cos(angle) * ENTRY, r.range(-4000, 4000), Math.sin(angle) * ENTRY);
    this.velocity.crossVectors(UP, this.position).setLength(FLEET_SPEED);
    this.quaternion.setFromRotationMatrix(look.lookAt(local.set(0, 0, 0), want.copy(this.velocity).normalize(), UP));
    this.target = null;
    this.burning = false;
    this.root.updateMatrixWorld();
  }

  /** What a hit that took a part from standing to `broken` (or not) set off. */
  private after(zone: number, phase: number): FleetEvent[] {
    const events: FleetEvent[] = [];
    if (!this.broken(zone)) return events;
    events.push({ kind: 'broken', zone, position: this.zoneAt(zone) });
    if (this.zones[zone].kind === 'reactor') return [...events, ...this.sink()];
    if (this.phase !== phase) events.push({ kind: 'phase', zone, position: this.position.clone() });
    return events;
  }

  private toLocal(point: THREE.Vector3, target: THREE.Vector3) {
    return target.copy(point).sub(this.position).applyQuaternion(turn.copy(this.quaternion).invert());
  }

  /** It is in the field as of the last frame shown: in the fight, or burning before it goes up. */
  private get standing() {
    return this.present(this.clock) || this.dying(this.clock);
  }

  /** A collider is there: every box of the hull, the dome's only while it is closed. */
  private solid(box: Box) {
    return box !== this.colliders[this.colliders.length - 1] || this.phase < 3;
  }

  /** Where a ray (up to `max`) meets the hull, or null; leaves the ray in the battleship's frame in `local` and `step`. */
  private rayHull(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
    this.toLocal(origin, local);
    step.copy(direction).applyQuaternion(turn.copy(this.quaternion).invert());
    let best: number | null = null;
    for (const box of this.colliders) {
      if (!this.solid(box)) continue;
      const d = rayBox(closest.subVectors(local, box.center), step, box.half);
      if (d !== null && d <= max && (best === null || d < best)) best = d;
    }
    return best;
  }

  /** How far behind the nozzles a sphere lies in the plume's cone, or -1 outside it; leaves the stern's direction in `toTarget` and the nozzles in `want`. */
  private plume(point: THREE.Vector3, radius: number): number {
    const back = toTarget.set(0, 0, 1).applyQuaternion(this.quaternion);
    const nozzle = want.set(0, 0, 7700).applyMatrix4(this.root.matrixWorld);
    const away = local.subVectors(point, nozzle);
    const along = away.dot(back);
    if (along <= 0 || along > PLUME_REACH) return -1;
    const across = away.addScaledVector(back, -along).length();
    return across > radius + 1400 + along * PLUME_SPREAD ? -1 : along;
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
}
