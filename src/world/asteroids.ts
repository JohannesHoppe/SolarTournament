import * as THREE from 'three';
import { colliderBox } from '../assets';
import { Randomizer, textSeed } from '../random';
import { Surface, tangentDirections } from './surface';
import { boxContact, rayBox } from './boxes';
import { SHAPE_FILL } from './shapes';
import { opticalDepth, SIGHT_DEPTH, type Air } from './air';
import type { FractureSet } from './fracture';

/** Radius of the asteroid field (units, 2.25 km): ships spawn on its edge, the arena ends at 1.5 times it. */
export const FIELD_RADIUS = 45000;
/** How fast a rock of the belt turns about its own axis (rad/s, a turn in about 2.6 minutes): slow, but the tip of a long rock sweeps. */
export const SPIN_RATE = 0.04;
/** The fragments of a piece that breaks into smaller copies of whole shapes (the junk of the Satellite Junkyard) are this much smaller than their parent; rock and ice split into pieces of themselves instead (see world/fracture). */
const FRAGMENT_SCALE = 0.55;
/** A rock breaks twice at most: rock, fragments, and their fragments, which are gone when they break. */
const MAX_GENERATION = 2;
/** Speed fragments fly apart with (units/s, 7.5 m/s, 60 % to 140 % of it), on top of the parent's drift and its spin. */
const FRAGMENT_SPEED = 150;
/** How fast a piece of a broken rock tumbles besides its parent's spin: up to this share of the layout's spin, about an axis of its own. */
const FRAGMENT_TUMBLE = 1;
/** Rocks farther than this many of their mean radii from the camera are drawn in less detail (about 5° of the view). */
const FAR_LEVEL = 12;
/**
 * Rocks farther than this many of their mean radii, and at least IMPOSTOR_MIN, are drawn as a
 * billboard (see view/impostor): small enough on screen that a flat, camera-facing sprite looks
 * the same as the shape it stands in for.
 */
const IMPOSTOR_LEVEL = 80;
/**
 * The nearest a field piece switches to its billboard (units, 7 km), however small it is (a
 * fragment of a fragment, a chunk of ice): farther than a fight reaches across the largest
 * arena, so the switch is never seen. Within it a small piece draws its far mesh (a few hundred
 * triangles; the Rings' 136 ice chunks are the most of them). The belt beyond the arena chooses
 * its billboards by itself (see world/belt).
 */
export const IMPOSTOR_MIN = 140000;

/** How far (units) from the camera a field piece of `meanRadius` draws as its billboard (see IMPOSTOR_LEVEL, IMPOSTOR_MIN). */
export function impostorDistance(meanRadius: number): number {
  return Math.max(meanRadius * IMPOSTOR_LEVEL, IMPOSTOR_MIN);
}
/** Surface gravity per unit of mean radius (1/s²): uniform density, so bigger rocks pull harder. */
const GRAVITY_PER_RADIUS = 0.004;

/** Points for breaking a rock, by generation: the big one is worth most, its fragments less. */
export const ASTEROID_POINTS = [200, 120, 80];
/** Hit points of a solid piece (the hulk of a wreck): beyond any number of shots in a round, and never counted down. */
const SOLID = 1000;

/** The kinds of shapes a field is built from: rocks, ice, the debris of a station, the hull sections of a wreck. */
export type TemplateKind = 'rock' | 'ice' | 'debris' | 'hull';

/**
 * The shapes of one kind: `near` is what is drawn up close, `far` (optional) replaces it afar,
 * `impostor` (optional) a billboard for the farthest LOD level; `box` shapes collide as their
 * collider box itself. `collision` (optional), parallel to `near`, is what a shape's surface is
 * measured from (see world/surface): the full-detail geometry, so collisions stay identical
 * however light `near` is drawn; without it, `near` itself is measured (a shape that is never
 * simplified for drawing, or a test field that does not care).
 */
/** A ray's nearest hit (see AsteroidField.raycast): the rock (null for the well's body or an obstacle), the distance along the ray, and the center of what it hit. */
export type RayHit = { asteroid: Asteroid | null; distance: number; center: THREE.Vector3 };

export type TemplateSet = { near: THREE.Object3D[]; far: THREE.Object3D[]; impostor?: THREE.Object3D[]; collision?: THREE.Object3D[]; box?: boolean; fracture?: FractureSet };

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
  /** Whether a point lies in a space open through it (a hangar of the battleship). */
  within(point: THREE.Vector3): boolean;
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
   * Pieces in the open space above and below the disk, after the disk's: `count` of them, of a
   * scale from `minScale` to `maxScale`, from `from` to `to` (units) above or below the horizon
   * plane (either side by chance), within `radius` of the center's vertical axis.
   */
  open?: { count: number; minScale: number; maxScale: number; from: number; to: number; radius: number };
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
  /** The air of a planet the arena dips into (see world/air): its haze hides, brakes and heats. */
  air?: Air;
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
  /** A billboard for the farthest LOD level, or null (see view/impostor). */
  impostor: THREE.Object3D | null;
  /** Collides as its box (see Asteroid.box). */
  box: boolean;
  /** The measured surface of a shape without a collider box (see Asteroid.surface). */
  surface: Surface | null;
  /** The mean of the semi-axes (template units, unscaled); a piece's from its share of the whole shape's volume. */
  mean: number;
  /** Where the object's origin lies in its whole shape's frame (template units): the shape's own origin for a whole shape, a piece's centroid for a piece (see world/fracture). */
  centroid: THREE.Vector3;
}

/** The path of a piece in its shape's fracture tree from its id (`12.2.0`: piece 0 of piece 2 of rock 12), [] for a whole rock. */
export const piecePath = (id: string): number[] => id.split('.').slice(1).map(Number);

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
   * picture draws the full relief only closer up. The switch to a billboard (IMPOSTOR_LEVEL)
   * stays fixed regardless, far enough out that it is never seen happening. Only the picture:
   * collisions use the full shapes.
   */
  private detail = 1;
  /** Rocks broken so far, with the field time each broke (for snapshot). */
  private readonly broken = new Map<string, number>();
  private readonly templates: Record<TemplateKind, Template[]>;
  /** The layout of the field as generated, from which restore rebuilds it. */
  layout: FieldLayout | null = null;
  /** The massive body of the arena, if it has one. */
  well: Well | null = null;
  /** The air of the arena, if it dips into a planet's (see world/air). */
  air: Air | null = null;
  /** Something else in the field that blocks the line of sight and torpedoes, if a round has one. */
  obstacle: Obstacle | null = null;

  /**
   * Each set's `far` holds the same shapes in less detail, drawn for rocks beyond FAR_LEVEL;
   * `impostor`, a billboard drawn beyond IMPOSTOR_LEVEL. Collisions always use the full shapes
   * (`collision`, or `near` itself without one).
   */
  constructor(sets: Record<TemplateKind, TemplateSet>) {
    const templates = (set: TemplateSet) =>
      set.near.map((object, i): Template => {
        // the surface is measured from the full-detail shape when one is given, so collisions
        // stay identical however light the drawn mesh is; a box piece is its whole box, a rock
        // fills only part of it
        const reference = set.collision?.[i] ?? object;
        const box = colliderBox(reference);
        // rounded to whole units, so tiny floating point differences between browsers vanish
        const center = box.getCenter(new THREE.Vector3()).round();
        let collider = false;
        object.traverse((o) => (collider ||= !!o.userData.collider));
        return {
          object,
          center,
          semiAxes: box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * (set.box ? 1 : SHAPE_FILL)).round(),
          scale: Math.max(object.scale.x, object.scale.y, object.scale.z),
          far: set.far[i] ?? null,
          impostor: set.impostor?.[i] ?? null,
          box: !!set.box,
          // a shape without a computed collider is measured: a rock collides where it is seen
          surface: set.box || collider ? null : new Surface(reference, center),
          mean: 0,
          centroid: new THREE.Vector3(),
        };
      });
    this.templates = { rock: templates(sets.rock), ice: templates(sets.ice), debris: templates(sets.debris), hull: templates(sets.hull) };
    for (const list of Object.values(this.templates)) for (const t of list) t.mean = (t.semiAxes.x + t.semiAxes.y + t.semiAxes.z) / 3;
    this.fractures = { rock: sets.rock.fracture, ice: sets.ice.fracture, debris: sets.debris.fracture, hull: sets.hull.fracture };
  }

  /** How each kind breaks along its shapes' fracture trees, if it does (see world/fracture). */
  private readonly fractures: Record<TemplateKind, FractureSet | undefined>;
  /** The templates of the pieces placed so far, by kind, shape and path. */
  private readonly pieces = new Map<string, Template>();

  /** The template of a piece of a shape (see world/fracture): its meshes, measured surface and mean radius from its share of the whole shape's volume. */
  private pieceTemplate(kind: TemplateKind, type: number, path: number[]): Template {
    const key = `${kind}:${type}:${path.join('.')}`;
    let template = this.pieces.get(key);
    if (template) return template;
    const whole = this.templates[kind][type];
    const piece = this.fractures[kind]!.piece(type, path);
    template = {
      object: piece.near,
      center: new THREE.Vector3(),
      semiAxes: piece.semiAxes,
      scale: whole.scale,
      far: piece.far,
      impostor: null,
      box: false,
      surface: piece.surface,
      mean: whole.mean * Math.cbrt(piece.share),
      centroid: piece.centroid,
    };
    this.pieces.set(key, template);
    return template;
  }

  generate(layout: FieldLayout) {
    this.layout = layout;
    this.well = layout.well ?? null;
    this.air = layout.air ?? null;
    this.clear();
    this.clock = 0;
    const r = new Randomizer(layout.seed);
    const direction = new THREE.Vector3();
    this.scatter(r, layout, 0, layout.count, layout.minScale, layout.maxScale, (position) => {
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
    });
    const open = layout.open;
    if (open) {
      // above or below the disk, evenly over the area within the open pieces' radius
      this.scatter(r, layout, layout.count, open.count, open.minScale, open.maxScale, (position) => {
        const angle = r.range(0, Math.PI * 2);
        const distance = Math.sqrt(r.nextFloat()) * open.radius;
        const height = r.range(open.from, open.to) * (r.nextFloat() < 0.5 ? -1 : 1);
        position.set(Math.cos(angle) * distance, height, Math.sin(angle) * distance);
      });
    }
    // the pieces of the shapes in the field are cut in the background, before any of them breaks
    const fracture = this.fractures[layout.kind];
    if (fracture) for (const type of new Set([...this.asteroids.values()].map((a) => a.object.userData.type as number))) fracture.prefetch(type, []);
    for (const [i, piece] of (layout.placements ?? []).entries()) {
      const id = `h${i}`;
      this.add(id, piece.kind, piece.type, this.templates[piece.kind][piece.type], piece.scale, 0, 0, piece.position, new THREE.Vector3(0, 1, 0), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0, piece.solid);
      const asteroid = this.asteroids.get(id)!;
      asteroid.baseOrientation.copy(piece.orientation).multiply(asteroid.object.quaternion);
      this.place(asteroid);
    }
  }

  /**
   * Adds `count` pieces of the layout's kind, ids from `first` on, of a scale between `min` and
   * `max`, each where `place` puts it, with a few attempts to keep them apart; the sequence is
   * seeded, so it stays deterministic.
   */
  private scatter(r: Randomizer, layout: FieldLayout, first: number, count: number, min: number, max: number, place: (position: THREE.Vector3) => void) {
    const templates = this.templates[layout.kind];
    const position = new THREE.Vector3();
    for (let i = first; i < first + count; i++) {
      const type = r.nextInt() % templates.length;
      const scale = r.range(min, max);
      const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      for (let attempt = 0; attempt < 8; attempt++) {
        place(position);
        const clear = this.boundingRadius(templates[type], scale) * 1.3;
        if (!this.overlap(position, clear) && !this.insideWell(position, clear)) break;
      }
      const orbitAxis = new THREE.Vector3(0, 1, 0);
      if (layout.orbit?.axis === 'random') {
        // an axis across the line to the center, so the rock circles at its distance
        orbitAxis.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).cross(position).normalize();
      }
      const orbitRate = layout.orbit ? this.orbitRate(position, layout.orbit.speed) : 0;
      this.add(String(i), layout.kind, type, templates[type], scale, 0, 0, position, spinAxis, new THREE.Vector3(), orbitAxis, orbitRate);
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

  private boundingRadius(t: Template, scale: number) {
    // a box reaches out to its corners, a rock as far as its surface does
    return (t.center.length() + (t.surface ? t.surface.reach : t.box ? t.semiAxes.length() : Math.max(t.semiAxes.x, t.semiAxes.y, t.semiAxes.z))) * t.scale * scale;
  }

  private add(
    id: string,
    kind: TemplateKind,
    type: number,
    template: Template,
    scale: number,
    generation: number,
    born: number,
    position: THREE.Vector3,
    spinAxis: THREE.Vector3,
    velocity: THREE.Vector3,
    orbitAxis: THREE.Vector3,
    orbitRate: number,
    solid = false,
    spinRate = solid ? 0 : (this.layout?.spin ?? 0),
  ): Asteroid {
    const s = template.scale * scale;
    const meanRadius = template.mean * s;
    let object: THREE.Object3D = template.object.clone(true);
    if (template.far) {
      // fewer triangles from afar (in the shadow pass as well), a billboard farther yet
      const lod = new THREE.LOD();
      lod.addLevel(object, 0);
      lod.addLevel(template.far.clone(true), meanRadius * FAR_LEVEL * this.detail);
      lod.userData.far = meanRadius * FAR_LEVEL;
      if (template.impostor) {
        // fixed, never scaled down by the "rocks" quality knob (see setDetail): a billboard
        // must never show up close, whatever the rung, or the switch would be seen
        const billboard = impostorDistance(meanRadius);
        lod.addLevel(template.impostor.clone(), billboard);
        lod.userData.impostor = billboard;
      }
      lod.scale.copy(template.object.scale);
      object.scale.set(1, 1, 1);
      lod.children[1].scale.set(1, 1, 1);
      if (lod.children[2]) lod.children[2].scale.set(1, 1, 1);
      object = lod;
    }
    object.scale.multiplyScalar(scale);
    // what is see-through (glass, paint) casts no shadow
    object.traverse((o) => {
      o.receiveShadow = o instanceof THREE.Mesh;
      o.castShadow = o.receiveShadow && !o.userData.shadowless;
    });
    // a billboard is too thin and flat to cast or receive a believable shadow
    if (object instanceof THREE.LOD && object.children[2]) object.children[2].castShadow = object.children[2].receiveShadow = false;
    this.group.add(object);
    const asteroid: Asteroid = {
      id,
      object,
      radius: this.boundingRadius(template, scale),
      meanRadius,
      hitPoints: solid ? SOLID : Math.round(4 + meanRadius / (this.layout?.toughness ?? 800)),
      generation,
      kind,
      solid,
      spinAxis,
      spinRate,
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
    object.userData.template = template;
    this.place(asteroid);
    return asteroid;
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
    for (const object of this.group.children) {
      if (!(object instanceof THREE.LOD)) continue;
      object.levels[1].distance = object.userData.far * share;
    }
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

    if (asteroid.generation >= MAX_GENERATION) return asteroid;
    if (this.fractures[asteroid.kind]) {
      this.split(asteroid, at);
      return asteroid;
    }
    const r = new Randomizer(textSeed(id));
    const count = 2 + (r.nextInt() % 2);
    const scale = asteroid.object.userData.scale * FRAGMENT_SCALE;
    // the fragments fly apart from where the piece stood, and keep circling with its orbit
    const origin = positionAt(asteroid, at, new THREE.Vector3());
    const drift = asteroid.velocity.clone();
    if (asteroid.orbitRate) drift.applyAxisAngle(asteroid.orbitAxis, asteroid.orbitRate * (at - asteroid.born));
    const templates = this.templates[asteroid.kind];
    for (let i = 0; i < count; i++) {
      const direction = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      const spinAxis = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      const speed = FRAGMENT_SPEED * r.range(0.6, 1.4);
      const type = r.nextInt() % templates.length;
      // a fragment starts within the piece's own reach, so a ship close by (in its shadow, on
      // a hook) never finds itself inside a fragment of it
      const out = Math.min(asteroid.meanRadius * 0.6, Math.max(0, asteroid.radius - this.boundingRadius(templates[type], scale)));
      const position = origin.clone().addScaledVector(direction, out);
      const velocity = direction.multiplyScalar(speed).add(drift);
      this.add(`${id}.${i}`, asteroid.kind, type, templates[type], scale, asteroid.generation + 1, at, position, spinAxis, velocity, asteroid.orbitAxis, asteroid.orbitRate);
    }
    return asteroid;
  }

  /**
   * Splits a rock at a field time into the pieces of its shape's fracture tree (see
   * world/fracture): each starts exactly where it lay in the rock then, turned as the rock was,
   * with the rock's drift and the speed its spin gave that spot, plus a push straight away from
   * the rock's center and a tumble of its own; it keeps circling with the rock's orbit. A ship
   * outside the rock is outside every piece of it.
   */
  private split(rock: Asteroid, at: number) {
    const fracture = this.fractures[rock.kind]!;
    const type = rock.object.userData.type as number;
    const scale = rock.object.userData.scale as number;
    const parent = rock.object.userData.template as Template;
    const path = piecePath(rock.id);
    const r = new Randomizer(textSeed(rock.id));
    const age = at - rock.born;
    const origin = positionAt(rock, at, new THREE.Vector3());
    const drift = rock.velocity.clone();
    if (rock.orbitRate) drift.applyAxisAngle(rock.orbitAxis, rock.orbitRate * age);
    const turn = new THREE.Quaternion().setFromAxisAngle(rock.spinAxis, rock.spinRate * age).multiply(rock.baseOrientation);
    const spin = rock.spinAxis.clone().multiplyScalar(rock.spinRate);
    const tumble = (this.layout?.spin ?? SPIN_RATE) * FRAGMENT_TUMBLE;
    const s = parent.scale * scale;
    for (let i = 0; i < fracture.count(type, path); i++) {
      const own = [...path, i];
      const template = this.pieceTemplate(rock.kind, type, own);
      const arm = template.centroid.clone().sub(parent.centroid).multiplyScalar(s).applyQuaternion(turn);
      const away = arm.lengthSq() > 1 ? arm.clone().normalize() : new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      const velocity = new THREE.Vector3().crossVectors(spin, arm).add(drift).addScaledVector(away, FRAGMENT_SPEED * r.range(0.6, 1.4));
      const turning = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(tumble).add(spin);
      const rate = turning.length();
      const axis = rate > 1e-9 ? turning.divideScalar(rate) : new THREE.Vector3(0, 1, 0);
      const piece = this.add(`${rock.id}.${i}`, rock.kind, type, template, scale, rock.generation + 1, at, origin.clone().add(arm), axis, velocity, rock.orbitAxis, rock.orbitRate, false, rate);
      piece.baseOrientation.copy(turn);
      this.place(piece);
      if (piece.generation < MAX_GENERATION) fracture.prefetch(type, own);
    }
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
   * The hit is written into `into`: a caller in a hot loop passes one of its own it reuses (and
   * reads it before the next cast), the others get a fresh one.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, obstacles = false, into?: RayHit): RayHit | null {
    const distance = this.cast(origin, direction, maxDistance, false, obstacles);
    if (distance === null) return null;
    const hit = into ?? { asteroid: null, distance: 0, center: castCenter! };
    hit.asteroid = castRock;
    hit.distance = distance;
    hit.center = castCenter!;
    return hit;
  }

  /**
   * True when no rock (and not the well's body, nor an obstacle) lies between two points, and
   * the haze of the arena's air between them sums up to no more than `haze` (see world/air: the
   * eye's reach by default; the radar's or a lock's shorter or longer, Infinity for cover alone).
   */
  lineOfSight(from: THREE.Vector3, to: THREE.Vector3, haze = SIGHT_DEPTH): boolean {
    const distance = from.distanceTo(to);
    if (distance < 1) return true;
    if (this.air && opticalDepth(this.air, from, to) > haze) return false;
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
  if (length >= 1) return null;
  ellipsoidTouch.length = length;
  return ellipsoidTouch;
}

/**
 * The contacts the two functions report, reused: every caller reads one before the next
 * contact is asked for, and a ship's collisions ask for many every step.
 */
const ellipsoidTouch = { local: u, axes: v, length: 0 };
const surfaceTouch = { local: u, length: 0, reach: 0, scale: 1 };

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
  if (length >= reach) return null;
  surfaceTouch.length = length;
  surfaceTouch.reach = reach;
  surfaceTouch.scale = scale;
  return surfaceTouch;
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
  tangentDirections(direction, side, across);
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
