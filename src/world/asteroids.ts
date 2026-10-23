import * as THREE from 'three';
import { colliderBox } from '../assets';
import { Randomizer, textSeed } from '../random';
import { Surface } from './surface';
import { boxContact, rayBox } from './boxes';
import { SHAPE_FILL } from './shapes';

/** Radius of the asteroid field (units, 2.25 km): ships spawn on its edge, the arena ends at 1.5 times it. */
export const FIELD_RADIUS = 45000;
/** How fast a rock of the belt turns about its own axis (rad/s, a turn in about 2.6 minutes): slow, but the tip of a long rock sweeps. */
export const SPIN_RATE = 0.04;
/** Fragments are this much smaller than their parent. */
const FRAGMENT_SCALE = 0.55;
/** A rock breaks twice at most: rock, fragments, and their fragments, which are gone when they break. */
const MAX_GENERATION = 2;
/** Speed fragments fly apart with (units/s, 7.5 m/s, 60 % to 140 % of it), on top of the parent's drift. */
const FRAGMENT_SPEED = 150;
/** Rocks farther than this many of their mean radii from the camera are drawn in less detail (about 5° of the view). */
const FAR_LEVEL = 12;
/** Surface gravity per unit of mean radius (1/s²): uniform density, so bigger rocks pull harder. */
const GRAVITY_PER_RADIUS = 0.004;

/** Points for breaking a rock, by generation: the big one is worth most, its fragments less. */
export const ASTEROID_POINTS = [200, 120, 80];
/** Hit points of a solid piece (the hulk of a wreck): beyond any number of shots in a round, and never counted down. */
const SOLID = 1000;

/** The kinds of shapes a field is built from: rocks, ice, the debris of a station, the hull sections of a wreck. */
export type TemplateKind = 'rock' | 'ice' | 'debris' | 'hull';

/** The shapes of one kind, in full detail and (optionally) in less detail for afar; `box` shapes collide as their collider box itself. */
export type TemplateSet = { near: THREE.Object3D[]; far: THREE.Object3D[]; box?: boolean };

/**
 * A massive body at the center of an arena or near it (a planet, a black hole): it pulls with
 * `surfaceGravity` (units/s²) at its `radius` (units), falling off with the square of the
 * distance, blocks beams and sight, and a ship that touches it is lost.
 */
export interface Well {
  position: THREE.Vector3;
  radius: number;
  surfaceGravity: number;
}

/** Something besides rocks that stands in the field, blocks the line of sight and sets off a torpedo (the President's battleship). */
export interface Obstacle {
  /** How far along the ray from `origin` along the normalized `direction` it lies, within `max`; null when not. */
  ray(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null;
  /** Its center, for whatever flies around it. */
  readonly position: THREE.Vector3;
  /** Whether a sphere touches it. */
  touches(center: THREE.Vector3, radius: number): boolean;
}

/** A piece placed by hand: a template of a kind at a position and turn, with the template's own size times `scale`. */
export interface Placement {
  kind: TemplateKind;
  type: number;
  scale: number;
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
  /** Solid pieces never break and give no points. */
  solid: boolean;
}

/**
 * How a field is built. Everything follows from it and the seed, so every browser builds the
 * same field for the same layout; `key` names it in snapshots.
 */
export interface FieldLayout {
  key: string;
  seed: number;
  kind: TemplateKind;
  count: number;
  /** Scale over the template (the templates have mean radii of 40 to 55 m). */
  minScale: number;
  maxScale: number;
  /** Rocks lie within this distance of the center (units), but not closer than `inner`. */
  radius: number;
  inner: number;
  /** Half the thickness of a flat disk in the horizon plane (units); a ball when absent. */
  flat?: number;
  /**
   * The rocks circle the center: about the vertical axis or each about an axis of its own
   * (crossing orbits), at `speed` (units/s) or, with a well, at the speed its gravity holds
   * them in (Kepler).
   */
  orbit?: { axis: 'vertical' | 'random'; speed?: number };
  /** How fast each rock turns about itself (rad/s). */
  spin: number;
  /** Hits a rock withstands: 4 plus one per this many units of mean radius. */
  toughness: number;
  /** Pieces placed by hand (the hulk of a wreck). */
  placements?: Placement[];
  well?: Well;
}
export interface Asteroid {
  id: string;
  object: THREE.Object3D;
  /** Radius of the bounding sphere. */
  radius: number;
  /** Average of the three semi-axes, used for gravity and effects. */
  meanRadius: number;
  /** Laser hits the rock withstands before it breaks apart. */
  hitPoints: number;
  generation: number;
  kind: TemplateKind;
  /** Never breaks and gives no points (see SOLID). */
  solid: boolean;
  /** Collides as a box (the hull of a wreck): `semiAxes` are its half extents; otherwise as its measured surface, or without one as an ellipsoid. */
  box: boolean;
  spinAxis: THREE.Vector3;
  spinRate: number;
  velocity: THREE.Vector3;
  /** The rock circles the field's center about this axis at this rate (rad/s); zero for a rock that only drifts. */
  orbitAxis: THREE.Vector3;
  orbitRate: number;
  /** Field time (s) the rock came into being, and its position and orientation then. */
  born: number;
  basePosition: THREE.Vector3;
  baseOrientation: THREE.Quaternion;
  /** Ellipsoid in the object's own coordinates. */
  center: THREE.Vector3;
  semiAxes: THREE.Vector3;
  /** A rock's measured surface around `center`, which its collisions and rays use; null for a piece that collides as its ellipsoid or box. */
  surface: Surface | null;
  /** World matrix inverse, refreshed every update. */
  inverse: THREE.Matrix4;
  /** The seed of the comet that last shoved this solid piece (see shove), or null. */
  shovedBy: number | null;
}

/**
 * A rock as it travels over the network: where it stands follows from the seed, the field
 * time and when it broke off its parent, so only those travel.
 */
export type AsteroidState = {
  id: string;
  hp: number;
  /** field time the rock was born (s) */
  b: number;
};

/** The whole field for a player who joins a running tournament. */
export type FieldState = {
  /** the layout's key (see FieldLayout) */
  k: string;
  /** field time (s) */
  t: number;
  a: AsteroidState[];
  /** every rock broken so far and the field time it broke, so its fragments start where they did */
  x: { id: string; b: number }[];
  /** the solid pieces a comet shoved (see AsteroidField.shove), with their motion since */
  m?: ShovedState[];
};

/** A solid piece's motion since a comet shoved it: the field time of the blow, its position, drift, orientation and spin then (axis and rate), and the comet's seed. */
export type ShovedState = { id: string; b: number; p: number[]; v: number[]; q: number[]; s: number[]; c: number };

interface Template {
  object: THREE.Object3D;
  center: THREE.Vector3;
  semiAxes: THREE.Vector3;
  /** Template scale, the object's own size factor before field scaling. */
  scale: number;
  /** The same shape in less detail, or null. */
  far: THREE.Object3D | null;
  /** Collides as its box (see Asteroid.box). */
  box: boolean;
  /** The measured surface of a shape without a collider box (see Asteroid.surface). */
  surface: Surface | null;
}

const u = new THREE.Vector3();
const v = new THREE.Vector3();
const point = new THREE.Vector3();
const pull = new THREE.Vector3();
const sight = new THREE.Vector3();
/** The rock of the last cast (see AsteroidField.cast), null for the well, an obstacle or nothing; and the center of what it hit. */
let castRock: Asteroid | null = null;
let castCenter: THREE.Vector3 | null = null;

/**
 * The field of an arena: few, huge rocks (or chunks of ice, or the debris of a station, or the
 * hull of a wreck) that take a lot of fire before they break apart and pull ships gently
 * towards them, and maybe a massive body (see Well). Layout and fragments come from seeded
 * randomness, so every client produces the same field and the same fragments for the same
 * rock id. Where a rock stands and how it is turned is computed from the field time, not
 * added up frame by frame, so browsers that share the field time see the same field whatever
 * their frame rate.
 */
export class AsteroidField {
  readonly group = new THREE.Group();
  readonly asteroids = new Map<string, Asteroid>();
  /** Field time (s): runs with the game; online, the lead browser's field time is shared. */
  clock = 0;
  /**
   * The share of FAR_LEVEL at which rocks switch to less detail (see view/quality): a cheaper
   * picture draws the full relief only closer up. Only the picture: collisions use the full shapes.
   */
  private detail = 1;
  /** Rocks broken so far, with the field time each broke (for snapshot). */
  private readonly broken = new Map<string, number>();
  private readonly templates: Record<TemplateKind, Template[]>;
  /** The layout of the field as generated, from which restore rebuilds it. */
  layout: FieldLayout | null = null;
  /** The massive body of the arena, if it has one. */
  well: Well | null = null;
  /** Something else in the field that blocks the line of sight and torpedoes, if a round has one. */
  obstacle: Obstacle | null = null;

  /** Each set's `far` holds the same shapes in less detail, drawn for rocks beyond FAR_LEVEL; collisions always use the full shapes. */
  constructor(sets: Record<TemplateKind, TemplateSet>) {
    const templates = (set: TemplateSet) =>
      set.near.map((object, i): Template => {
        const box = colliderBox(object);
        // rounded to whole units, so tiny floating point differences between browsers vanish;
        // a box piece is its whole box, a rock fills only part of it
        const center = box.getCenter(new THREE.Vector3()).round();
        let collider = false;
        object.traverse((o) => (collider ||= !!o.userData.collider));
        return {
          object,
          center,
          semiAxes: box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * (set.box ? 1 : SHAPE_FILL)).round(),
          scale: Math.max(object.scale.x, object.scale.y, object.scale.z),
          far: set.far[i] ?? null,
          box: !!set.box,
          // a shape without a computed collider is measured: a rock collides where it is seen
          surface: set.box || collider ? null : new Surface(object, center),
        };
      });
    this.templates = { rock: templates(sets.rock), ice: templates(sets.ice), debris: templates(sets.debris), hull: templates(sets.hull) };
  }

  generate(layout: FieldLayout) {
    this.layout = layout;
    this.well = layout.well ?? null;
    this.clear();
    this.clock = 0;
    const r = new Randomizer(layout.seed);
    const templates = this.templates[layout.kind];
    const direction = new THREE.Vector3();
    const position = new THREE.Vector3();
    for (let i = 0; i < layout.count; i++) {
      const type = r.nextInt() % templates.length;
      const scale = r.range(layout.minScale, layout.maxScale);
      const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      // a few attempts to keep the rocks apart; the sequence is seeded, so it stays deterministic
      for (let attempt = 0; attempt < 8; attempt++) {
        if (layout.flat === undefined) {
          direction.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
          const inner = layout.inner / layout.radius;
          position.copy(direction).multiplyScalar(layout.radius * Math.cbrt(inner ** 3 + (1 - inner ** 3) * r.nextFloat()));
        } else {
          // evenly over the disk's area
          const angle = r.range(0, Math.PI * 2);
          const distance = Math.sqrt(r.range(layout.inner ** 2, layout.radius ** 2));
          position.set(Math.cos(angle) * distance, r.range(-layout.flat, layout.flat), Math.sin(angle) * distance);
        }
        const clear = this.boundingRadius(layout.kind, type, scale) * 1.3;
        if (!this.overlap(position, clear) && !this.insideWell(position, clear)) break;
      }
      const orbitAxis = new THREE.Vector3(0, 1, 0);
      if (layout.orbit?.axis === 'random') {
        // an axis across the line to the center, so the rock circles at its distance
        orbitAxis.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).cross(position).normalize();
      }
      const orbitRate = layout.orbit ? this.orbitRate(position, layout.orbit.speed) : 0;
      this.add(String(i), layout.kind, type, scale, 0, 0, position, spinAxis, new THREE.Vector3(), orbitAxis, orbitRate);
    }
    for (const [i, piece] of (layout.placements ?? []).entries()) {
      const id = `h${i}`;
      this.add(id, piece.kind, piece.type, piece.scale, 0, 0, piece.position, new THREE.Vector3(0, 1, 0), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0, piece.solid);
      const asteroid = this.asteroids.get(id)!;
      asteroid.baseOrientation.copy(piece.orientation).multiply(asteroid.object.quaternion);
      this.place(asteroid);
    }
  }

  /** How fast a rock at a place circles the center: at `speed` (units/s), or as the well's gravity holds it. */
  private orbitRate(position: THREE.Vector3, speed?: number) {
    const distance = Math.max(position.length(), 1);
    if (speed !== undefined) return speed / distance;
    const well = this.well;
    return well ? Math.sqrt((well.surfaceGravity * well.radius * well.radius) / distance ** 3) : 0;
  }

  clear() {
    for (const asteroid of this.asteroids.values()) this.group.remove(asteroid.object);
    this.asteroids.clear();
    this.broken.clear();
  }

  private boundingRadius(kind: TemplateKind, type: number, scale: number) {
    const t = this.templates[kind][type];
    // a box reaches out to its corners, a rock as far as its surface does
    return (t.center.length() + (t.surface ? t.surface.reach : t.box ? t.semiAxes.length() : Math.max(t.semiAxes.x, t.semiAxes.y, t.semiAxes.z))) * t.scale * scale;
  }

  private add(
    id: string,
    kind: TemplateKind,
    type: number,
    scale: number,
    generation: number,
    born: number,
    position: THREE.Vector3,
    spinAxis: THREE.Vector3,
    velocity: THREE.Vector3,
    orbitAxis: THREE.Vector3,
    orbitRate: number,
    solid = false,
  ) {
    const template = this.templates[kind][type];
    const s = template.scale * scale;
    const meanRadius = ((template.semiAxes.x + template.semiAxes.y + template.semiAxes.z) / 3) * s;
    let object: THREE.Object3D = template.object.clone(true);
    if (template.far) {
      // the full relief up close, fewer triangles from afar, in the shadow pass as well
      const lod = new THREE.LOD();
      lod.addLevel(object, 0);
      lod.addLevel(template.far.clone(true), meanRadius * FAR_LEVEL * this.detail);
      lod.userData.far = meanRadius * FAR_LEVEL;
      lod.scale.copy(template.object.scale);
      object.scale.set(1, 1, 1);
      lod.children[1].scale.set(1, 1, 1);
      object = lod;
    }
    object.scale.multiplyScalar(scale);
    object.traverse((o) => (o.castShadow = o.receiveShadow = o instanceof THREE.Mesh));
    this.group.add(object);
    const asteroid: Asteroid = {
      id,
      object,
      radius: this.boundingRadius(kind, type, scale),
      meanRadius,
      hitPoints: solid ? SOLID : Math.round(4 + meanRadius / (this.layout?.toughness ?? 800)),
      generation,
      kind,
      solid,
      spinAxis,
      spinRate: solid ? 0 : (this.layout?.spin ?? 0),
      velocity,
      orbitAxis,
      orbitRate,
      born,
      basePosition: position.clone(),
      baseOrientation: object.quaternion.clone(),
      center: template.center,
      semiAxes: template.semiAxes,
      surface: template.surface,
      box: template.box,
      inverse: new THREE.Matrix4(),
      shovedBy: null,
    };
    this.asteroids.set(id, asteroid);
    object.userData.type = type;
    object.userData.scale = scale;
    this.place(asteroid);
  }

  /** Puts a rock where the field time says: drifted along its velocity, carried along its orbit, turned about its axis. */
  private place(a: Asteroid) {
    const age = this.clock - a.born;
    positionAt(a, this.clock, a.object.position);
    a.object.quaternion.setFromAxisAngle(a.spinAxis, a.spinRate * age).multiply(a.baseOrientation);
    a.object.updateMatrixWorld(true);
    a.inverse.copy(a.object.matrixWorld).invert();
  }

  /** Draws the full relief only within `share` of FAR_LEVEL (see detail); 0 draws every rock in less detail. */
  setDetail(share: number) {
    this.detail = share;
    for (const object of this.group.children) if (object instanceof THREE.LOD) object.levels[1].distance = object.userData.far * share;
  }

  update(dt: number) {
    this.setClock(this.clock + dt);
  }

  /** Moves the field to a field time, e.g. the lead browser's. */
  setClock(time: number) {
    this.clock = time;
    for (const asteroid of this.asteroids.values()) this.place(asteroid);
  }

  /**
   * One laser hit, at a field time (by default now; online, the shooter's). Returns the
   * asteroid when it breaks apart (its fragments are already in the field), otherwise undefined.
   */
  hit(id: string, at = this.clock): Asteroid | undefined {
    const asteroid = this.asteroids.get(id);
    if (!asteroid || asteroid.solid) return undefined;
    asteroid.hitPoints--;
    return asteroid.hitPoints <= 0 ? this.destroy(id, at) : undefined;
  }

  /** Where a rock is at a field time (see positionAt), for whatever must know it then, not now. */
  positionOf(asteroid: Asteroid, time: number, target: THREE.Vector3): THREE.Vector3 {
    return positionAt(asteroid, time, target);
  }

  /**
   * Breaks a rock at once at a field time, whatever its hits (a comet's head runs it down);
   * solid pieces stand. Returns the rock when it broke.
   */
  shatter(id: string, at: number): Asteroid | undefined {
    return this.asteroids.get(id)?.solid ? undefined : this.destroy(id, at);
  }

  /**
   * A comet (seeded `by`) shoves a solid piece at a field time: from where it stands then, it
   * drifts on with `kick` (units/s) added to its drift, keeps circling with its orbit, and turns
   * about `axis` at `rate` (rad/s) from its orientation then. Returns the piece when it moved.
   */
  shove(id: string, at: number, kick: THREE.Vector3, axis: THREE.Vector3, rate: number, by: number): Asteroid | undefined {
    const a = this.asteroids.get(id);
    if (!a?.solid) return undefined;
    const age = at - a.born;
    positionAt(a, at, a.basePosition);
    a.baseOrientation.premultiply(new THREE.Quaternion().setFromAxisAngle(a.spinAxis, a.spinRate * age));
    if (a.orbitRate) a.velocity.applyAxisAngle(a.orbitAxis, a.orbitRate * age);
    a.velocity.add(kick);
    a.spinAxis = axis.clone();
    a.spinRate = rate;
    a.born = at;
    a.shovedBy = by;
    this.place(a);
    return a;
  }

  /** Breaks a rock at a field time: the fragments start from where it stood then. */
  private destroy(id: string, at: number): Asteroid | undefined {
    const asteroid = this.asteroids.get(id);
    if (!asteroid) return undefined;
    this.group.remove(asteroid.object);
    this.asteroids.delete(id);
    this.broken.set(id, at);

    if (asteroid.generation < MAX_GENERATION) {
      const r = new Randomizer(textSeed(id));
      const count = 2 + (r.nextInt() % 2);
      const scale = asteroid.object.userData.scale * FRAGMENT_SCALE;
      // the fragments fly apart from where the rock stood, and keep circling with its orbit
      const origin = positionAt(asteroid, at, new THREE.Vector3());
      const drift = asteroid.velocity.clone();
      if (asteroid.orbitRate) drift.applyAxisAngle(asteroid.orbitAxis, asteroid.orbitRate * (at - asteroid.born));
      const templates = this.templates[asteroid.kind];
      for (let i = 0; i < count; i++) {
        const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        const speed = FRAGMENT_SPEED * r.range(0.6, 1.4);
        const type = r.nextInt() % templates.length;
        // a fragment starts within the rock's own reach, so a ship close by (in its shadow, on
        // a hook) never finds itself inside a piece of it
        const out = Math.min(asteroid.meanRadius * 0.6, Math.max(0, asteroid.radius - this.boundingRadius(asteroid.kind, type, scale)));
        const position = origin.clone().addScaledVector(direction, out);
        const velocity = direction.multiplyScalar(speed).add(drift);
        this.add(`${id}.${i}`, asteroid.kind, type, scale, asteroid.generation + 1, at, position, spinAxis, velocity, asteroid.orbitAxis, asteroid.orbitRate);
      }
    }
    return asteroid;
  }

  /** The field time and every rock's hits and birth, for a player who joins a running tournament. */
  snapshot(): FieldState {
    return {
      k: this.layout?.key ?? '',
      t: +this.clock.toFixed(3),
      a: [...this.asteroids.values()].map((a) => ({ id: a.id, hp: a.hitPoints, b: +a.born.toFixed(3) })),
      x: [...this.broken].map(([id, at]) => ({ id, b: +at.toFixed(3) })),
      m: [...this.asteroids.values()].flatMap((a) =>
        a.shovedBy === null ? [] : [{ id: a.id, b: a.born, p: a.basePosition.toArray(), v: a.velocity.toArray(), q: a.baseOrientation.toArray(), s: [...a.spinAxis.toArray(), a.spinRate], c: a.shovedBy }],
      ),
    };
  }

  /**
   * Rebuilds the field from a snapshot, starting over from the generated field (this browser
   * may have broken rocks the snapshot still holds): breaks every broken rock at the field time
   * it broke, parents first (the fragments are deterministic), removes rocks that are gone,
   * takes over the hits, the motion of the solid pieces a comet shoved, and the field time. A
   * fragment's birth is its parent's break time as well.
   */
  restore(state: FieldState, layout: FieldLayout) {
    this.generate(layout);
    const listed = new Map(state.a.map((s) => [s.id, s]));
    const breaks = new Map(state.x.map((s) => [s.id, s.b]));
    for (const rock of state.a) {
      const dot = rock.id.lastIndexOf('.');
      if (dot > 0 && !breaks.has(rock.id.slice(0, dot))) breaks.set(rock.id.slice(0, dot), rock.b);
    }
    const ensure = (id: string) => {
      if (this.asteroids.has(id)) return;
      const dot = id.lastIndexOf('.');
      if (dot < 0) return;
      const parent = id.slice(0, dot);
      ensure(parent);
      const at = breaks.get(parent);
      if (at !== undefined) this.destroy(parent, at);
    };
    for (const rock of state.a) ensure(rock.id);
    for (const id of [...this.asteroids.keys()]) {
      if (listed.has(id)) continue;
      this.group.remove(this.asteroids.get(id)!.object);
      this.asteroids.delete(id);
      this.broken.set(id, breaks.get(id) ?? state.t);
    }
    for (const rock of state.a) {
      const asteroid = this.asteroids.get(rock.id);
      if (asteroid) asteroid.hitPoints = rock.hp;
    }
    for (const moved of state.m ?? []) {
      const a = this.asteroids.get(moved.id);
      if (!a?.solid) continue;
      a.born = moved.b;
      a.basePosition.fromArray(moved.p);
      a.velocity.fromArray(moved.v);
      a.baseOrientation.fromArray(moved.q).normalize();
      a.spinAxis = new THREE.Vector3().fromArray(moved.s).normalize();
      a.spinRate = moved.s[3];
      a.shovedBy = moved.c;
    }
    this.setClock(state.t);
  }

  /**
   * Nearest rock hit by a ray, with the distance along the ray; the well's body counts too, as a
   * hit without a rock (null), and with `obstacles` the obstacle's hull (the battleship) as well.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, obstacles = false): { asteroid: Asteroid | null; distance: number; center: THREE.Vector3 } | null {
    const distance = this.cast(origin, direction, maxDistance, false, obstacles);
    return distance === null ? null : { asteroid: castRock, distance, center: castCenter! };
  }

  /** True when no rock (and not the well's body, nor an obstacle) lies between two points. */
  lineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const distance = from.distanceTo(to);
    if (distance < 1) return true;
    sight.subVectors(to, from).divideScalar(distance);
    return this.cast(from, sight, distance, true, true) === null;
  }

  /**
   * The distance of the nearest hit along a ray within `max` (the rock hit, if any, in castRock),
   * or with `any` of the first hit found, which is all a line of sight needs; null for none.
   * Rocks whose bounding sphere the ray enters beyond the best hit so far are skipped.
   */
  private cast(origin: THREE.Vector3, direction: THREE.Vector3, max: number, any: boolean, obstacles: boolean): number | null {
    let best: number | null = null;
    castRock = null;
    castCenter = null;
    const obstacle = obstacles ? this.obstacle : null;
    const hull = obstacle?.ray(origin, direction, max) ?? null;
    if (hull !== null) {
      if (any) return hull;
      best = hull;
      castCenter = obstacle!.position;
    }
    const well = this.well;
    if (well) {
      const distance = raySphere(origin, direction, well.position, well.radius);
      if (distance !== null && distance <= max && (best === null || distance < best)) {
        if (any) return distance;
        best = distance;
        castCenter = well.position;
      }
    }
    for (const asteroid of this.asteroids.values()) {
      const enter = raySphere(origin, direction, asteroid.object.position, asteroid.radius);
      if (enter === null || enter > (best ?? max)) continue;
      const distance = asteroid.box ? rayPiece(asteroid, origin, direction) : asteroid.surface ? raySurface(asteroid, asteroid.surface, origin, direction) : rayEllipsoid(asteroid, origin, direction);
      if (distance !== null && distance <= max && (best === null || distance < best)) {
        best = distance;
        castRock = asteroid;
        castCenter = asteroid.object.position;
        if (any) return best;
      }
    }
    return best;
  }

  /** Whether a sphere touches the well's body: a ship there is lost. */
  insideWell(center: THREE.Vector3, radius: number): boolean {
    const well = this.well;
    return !!well && center.distanceTo(well.position) < well.radius + radius;
  }

  /** First asteroid whose surface is closer than radius to a point. */
  overlap(center: THREE.Vector3, radius: number): Asteroid | null {
    for (const asteroid of this.asteroids.values()) {
      const reach = asteroid.radius + radius;
      if (asteroid.object.position.distanceToSquared(center) > reach * reach) continue;
      if (asteroid.box ? pieceContact(asteroid, center, radius, pull) : asteroid.surface ? surfaceContact(asteroid, asteroid.surface, center, radius) : ellipsoidContact(asteroid, center, radius)) return asteroid;
    }
    return null;
  }

  /**
   * Pushes a sphere out of an asteroid. Returns the outward surface normal when they
   * touched (and moves center onto the surface), otherwise null.
   */
  resolve(asteroid: Asteroid, center: THREE.Vector3, radius: number, normal = new THREE.Vector3()): THREE.Vector3 | null {
    if (asteroid.box) {
      const surface = pieceContact(asteroid, center, radius, normal);
      if (!surface) return null;
      normal.transformDirection(asteroid.object.matrixWorld);
      point.copy(surface).add(asteroid.center).applyMatrix4(asteroid.object.matrixWorld);
      center.copy(point).addScaledVector(normal, radius + 1);
      return normal;
    }
    if (asteroid.surface) {
      const contact = surfaceContact(asteroid, asteroid.surface, center, radius);
      if (!contact) return null;
      // out along the way from the center, onto the measured surface lifted by the sphere's radius
      surfaceNormal(asteroid.surface, contact.local, normal).transformDirection(asteroid.object.matrixWorld);
      point.copy(contact.local).multiplyScalar((contact.reach + 1 / contact.scale) / contact.length).add(asteroid.center).applyMatrix4(asteroid.object.matrixWorld);
      center.copy(point);
      return normal;
    }
    const contact = ellipsoidContact(asteroid, center, radius);
    if (!contact) return null;
    // gradient of the inflated ellipsoid, transformed back into the world
    normal.copy(contact.local).divide(contact.axes).divide(contact.axes).transformDirection(asteroid.object.matrixWorld);
    point.copy(contact.local).divideScalar(contact.length).add(asteroid.center).applyMatrix4(asteroid.object.matrixWorld);
    center.copy(point).addScaledVector(normal, 1);
    return normal;
  }

  /** Velocity of a rock's surface at a point (units/s): its drift and orbit plus its spin. */
  surfaceVelocity(asteroid: Asteroid, point: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
    const arm = pull.subVectors(point, asteroid.object.position);
    target.copy(asteroid.spinAxis).multiplyScalar(asteroid.spinRate).cross(arm);
    if (!asteroid.orbitRate) return target.add(asteroid.velocity);
    // the orbit carries the rock (and turns its drift) about the field's center
    target.add(v.copy(asteroid.velocity).applyAxisAngle(asteroid.orbitAxis, asteroid.orbitRate * (this.clock - asteroid.born)));
    return target.add(u.copy(asteroid.orbitAxis).multiplyScalar(asteroid.orbitRate).cross(asteroid.object.position));
  }

  /** Sum of the asteroids' gravitational pull at a point (units/s²). */
  gravity(position: THREE.Vector3, target = new THREE.Vector3()): THREE.Vector3 {
    target.set(0, 0, 0);
    for (const asteroid of this.asteroids.values()) {
      pull.subVectors(asteroid.object.position, position);
      const distance = Math.max(pull.length(), asteroid.meanRadius);
      const surfaceGravity = GRAVITY_PER_RADIUS * asteroid.meanRadius;
      const strength = (surfaceGravity * asteroid.meanRadius * asteroid.meanRadius) / (distance * distance);
      target.addScaledVector(pull.normalize(), strength);
    }
    const well = this.well;
    if (well) {
      pull.subVectors(well.position, position);
      const distance = Math.max(pull.length(), well.radius);
      target.addScaledVector(pull.normalize(), (well.surfaceGravity * well.radius * well.radius) / (distance * distance));
    }
    return target;
  }
}

/** Where a rock is at a field time: drifted from where it was born, carried along its orbit about the center. */
function positionAt(a: Asteroid, time: number, target: THREE.Vector3): THREE.Vector3 {
  const age = time - a.born;
  target.copy(a.basePosition).addScaledVector(a.velocity, age);
  return a.orbitRate ? target.applyAxisAngle(a.orbitAxis, a.orbitRate * age) : target;
}

/**
 * Point in the asteroid's own coordinates relative to the ellipsoid center, with the semi-axes
 * inflated by the sphere radius; the sphere touches the rock when the scaled point lies inside
 * the unit sphere.
 */
function ellipsoidContact(asteroid: Asteroid, center: THREE.Vector3, radius: number) {
  const scale = asteroid.object.matrixWorld.getMaxScaleOnAxis();
  const axes = v.copy(asteroid.semiAxes).addScalar(radius / scale);
  const local = u.copy(center).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  const length = Math.hypot(local.x / axes.x, local.y / axes.y, local.z / axes.z);
  return length < 1 ? { local, axes, length } : null;
}

/**
 * A sphere against a rock's measured surface: the sphere's center in the rock's own
 * coordinates (relative to its center), its distance from the center, and how far the surface
 * lifted by the sphere's radius reaches that way, when the sphere touches the rock; else null.
 */
function surfaceContact(asteroid: Asteroid, surface: Surface, center: THREE.Vector3, radius: number) {
  const scale = asteroid.object.matrixWorld.getMaxScaleOnAxis();
  const local = u.copy(center).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  const length = local.length();
  const reach = surface.radius(local) + radius / scale;
  return length < reach ? { local, length, reach, scale } : null;
}

const side = new THREE.Vector3();
const across = new THREE.Vector3();
const there = new THREE.Vector3();
const here = new THREE.Vector3();
const nearby = new THREE.Vector3();
const base = new THREE.Vector3();

/**
 * The outward normal of a measured surface in the direction of `local`, from the surface
 * points a little to either side: a slope of the rock bounces a ship along its slope.
 */
function surfaceNormal(surface: Surface, local: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  const direction = here.copy(local).normalize();
  // two directions across the way out
  side.set(Math.abs(direction.x) < 0.9 ? 1 : 0, Math.abs(direction.x) < 0.9 ? 0 : 1, 0).cross(direction).normalize();
  across.crossVectors(direction, side);
  const point0 = base.copy(direction).multiplyScalar(surface.radius(direction));
  nearby.copy(direction).addScaledVector(side, NORMAL_STEP).normalize();
  const point1 = there.copy(nearby).multiplyScalar(surface.radius(nearby)).sub(point0);
  nearby.copy(direction).addScaledVector(across, NORMAL_STEP).normalize();
  const point2 = nearby.multiplyScalar(surface.radius(nearby)).sub(point0);
  normal.crossVectors(point1, point2).normalize();
  // the cross product's sign depends on the order of the two: outward is away from the center
  if (normal.dot(direction) < 0) normal.negate();
  return normal;
}

/** The step to either side for a surface normal (share of the way out, about 3°). */
const NORMAL_STEP = 0.05;

const closest = new THREE.Vector3();

/**
 * A sphere against a box piece, in the piece's own coordinates: the point of the box closest
 * to the sphere's center (on its surface; for a center inside, on the face nearest to it) and
 * the outward normal there, when the sphere touches the box; otherwise null.
 */
function pieceContact(asteroid: Asteroid, center: THREE.Vector3, radius: number, normal: THREE.Vector3) {
  const scale = asteroid.object.matrixWorld.getMaxScaleOnAxis();
  const local = u.copy(center).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  return boxContact(local, asteroid.semiAxes, radius / scale, normal, closest);
}

const localOrigin = new THREE.Vector3();
/** One world unit along the ray, in the rock's own coordinates. */
const localStep = new THREE.Vector3();

/** A ray into the rock's own coordinates, relative to its center: into localOrigin and localStep. */
function toLocalRay(asteroid: Asteroid, origin: THREE.Vector3, direction: THREE.Vector3) {
  localOrigin.copy(origin).applyMatrix4(asteroid.inverse).sub(asteroid.center);
  localStep.copy(origin).add(direction).applyMatrix4(asteroid.inverse).sub(asteroid.center).sub(localOrigin);
}

/** Distance along a normalized ray to a box piece's surface (slabs), or null. */
function rayPiece(asteroid: Asteroid, origin: THREE.Vector3, direction: THREE.Vector3): number | null {
  toLocalRay(asteroid, origin, direction);
  return rayBox(localOrigin, localStep, asteroid.semiAxes);
}

/** Distance along a normalized ray to the asteroid's ellipsoid surface, or null. */
function rayEllipsoid(asteroid: Asteroid, origin: THREE.Vector3, direction: THREE.Vector3): number | null {
  toLocalRay(asteroid, origin, direction);
  // both scaled into the unit sphere
  const d = localStep.divide(asteroid.semiAxes);
  const o = localOrigin.divide(asteroid.semiAxes);
  const a = d.dot(d);
  const b = 2 * o.dot(d);
  const c = o.dot(o) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  if (near >= 0) return near;
  return (-b + root) / (2 * a) >= 0 ? 0 : null;
}

/** A ray marches through a rock's measured surface in this many steps across its reach, then narrows the hit down in RAY_REFINE halvings. */
const RAY_STEPS = 24;
const RAY_REFINE = 8;
const marching = new THREE.Vector3();

/**
 * Distance along a normalized ray to a rock's measured surface, or null: through the sphere
 * the surface reaches to, step by step, until a point lies inside the surface, then narrowed
 * down between that step and the one before.
 */
function raySurface(asteroid: Asteroid, surface: Surface, origin: THREE.Vector3, direction: THREE.Vector3): number | null {
  toLocalRay(asteroid, origin, direction);
  const a = localStep.dot(localStep);
  const b = 2 * localOrigin.dot(localStep);
  const c = localOrigin.dot(localOrigin) - surface.reach * surface.reach;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const far = (-b + root) / (2 * a);
  if (far < 0) return null;
  const near = Math.max(0, (-b - root) / (2 * a));
  if (insideAlong(surface, near)) return near;
  const stride = (far - near) / RAY_STEPS;
  for (let i = 1; i <= RAY_STEPS; i++) {
    let hit = near + i * stride;
    if (!insideAlong(surface, hit)) continue;
    let miss = hit - stride;
    for (let k = 0; k < RAY_REFINE; k++) {
      const middle = (hit + miss) / 2;
      if (insideAlong(surface, middle)) hit = middle;
      else miss = middle;
    }
    return hit;
  }
  return null;
}

/** Whether the point `t` world units along the ray of raySurface (see toLocalRay) lies inside the surface. */
function insideAlong(surface: Surface, t: number) {
  marching.copy(localOrigin).addScaledVector(localStep, t);
  return marching.length() < surface.radius(marching);
}

const offset = new THREE.Vector3();

/** Distance along a normalized ray to the first intersection with a sphere, or null. */
export function raySphere(origin: THREE.Vector3, direction: THREE.Vector3, center: THREE.Vector3, radius: number): number | null {
  offset.subVectors(center, origin);
  const along = offset.dot(direction);
  const distSq = offset.lengthSq() - along * along;
  const radiusSq = radius * radius;
  if (distSq > radiusSq) return null;
  const half = Math.sqrt(radiusSq - distSq);
  const near = along - half;
  if (near >= 0) return near;
  return along + half >= 0 ? 0 : null;
}
