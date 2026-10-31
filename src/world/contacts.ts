import * as THREE from 'three';
import { blowState, KNOCKED, outline, type Asteroid, type AsteroidField, type ShovedState } from './asteroids';
import { IMMOVABLE, share } from './bodies';
import { ringRim, ringSamples, touchRing } from './gates';

/**
 * The field's pieces meet each other and the rings of the tournament: rock on rock, a fragment
 * on its neighbour, junk on crossing junk, a hull section on the next, any of them on a race's
 * gate or a base of Capture the Flag. Where a piece is follows from the field time (see
 * world/asteroids), so contacts are looked for on a fixed grid of field time, CONTACT_STEP
 * apart, never by the frame: whatever the frames, the same contacts happen at the same field
 * times with the same outcome. One browser decides them (the lead browser, or the solo round's)
 * and sends each piece's motion since (see ShovedState), which every other browser takes; a
 * snapshot carries every piece a contact moved.
 *
 * Two pieces touching trade an impulse as two rigid bodies (see impulse): where they touch,
 * rock on rock keeps RESTITUTION of the speed it met at, sliding along each other loses FRICTION
 * times the blow, and each takes a tumble from where it was struck, the blow itself the softer
 * for the turn it gives; so no contact leaves them with more energy than they had. A ring is held in place by its
 * station (IMMOVABLE): a piece bounces off it. A piece keeps circling with its orbit, carried
 * by it as the battleship's rams and a comet's shoves leave it.
 */
export const CONTACT_STEP = 0.1;
/** Rock on rock keeps a fifth of the speed it met at: rubble and ice are no rubber. */
const RESTITUTION = 0.2;
const FRICTION = 0.3;
/**
 * Two pieces found deeper than SETTLE_DEPTH in each other while they part (units, 2 m: a tip
 * that slipped between the points of an outline, 13° apart, or a third piece's push) are pushed
 * apart at SETTLE (units/s, 15 m/s) without a blow: moved, never sped up, so no energy comes in.
 */
const SETTLE_DEPTH = 40;
const SETTLE = 300;
/** Pieces pushed apart are left this far clear of each other (units, 5 cm). */
const GAP = 1;
/**
 * A push apart goes at most as far as the two closed in a step and GAP: a fresh contact is
 * always found within one step of its touch, while two pieces the layout left overlapping (a
 * world ship's sections, joined) are held against each other, never flung apart.
 */
const PUSH_STEPS = 1;
/** The points a box piece is sampled by on each face, per side (a grid): a hull section's corners alone miss an edge cutting into the next. */
const BOX_GRID = 7;
/** And so is a box standing on a piece or reaching out of it (a rig's beam, a wing's panel, see AsteroidField.attach): smaller, its corners and edges are what meet. */
const PART_GRID = 4;

/**
 * A ring a piece of the field bounces off (a race's gate, a base of Capture the Flag): where it
 * stands, how far it reaches, whether a point touches it (moved out onto it, `normal` its outward
 * normal there), and points on its surface in the world (see world/gates, ringSamples), held
 * against the piece in turn: its struts are thinner than the gaps of a piece's outline.
 */
export interface Fixture {
  readonly position: THREE.Vector3;
  readonly reach: number;
  touch(point: THREE.Vector3, normal: THREE.Vector3): boolean;
  readonly points: Float32Array;
}

/** A ring of opening `radius` at `center`, facing `facing`, as a Fixture: its band, housings, struts and station (see world/gates, touchRing). */
export function ringFixture(center: THREE.Vector3, facing: THREE.Vector3, radius: number): Fixture {
  // a point as a sphere the least bit thick: one of no size touches nothing it lies in
  return { position: center, reach: ringRim(radius).outer, touch: (point, normal) => touchRing(center, facing, radius, point, 1e-3, normal), points: ringSamples(center, facing, radius) };
}

/** The world itself, for points already in it (see pointsInto). */
const WORLD = new THREE.Matrix4();

/** One piece in a step of the grid: where it is then, how heavy, whether it moves at all. */
interface Entry {
  piece: Asteroid;
  at: THREE.Vector3;
  low: number;
  mass: number;
  moving: boolean;
}

const samples = new WeakMap<object, Float32Array>();

/**
 * The points of a piece's surface a contact is looked for at, in its object's own coordinates:
 * its outline (see world/asteroids) for a rock, ice or junk, a grid over each face for a box; and
 * a grid over each face of what stands on it or reaches out of it (see AsteroidField.attach).
 */
function pointsOf(field: AsteroidField, piece: Asteroid): Float32Array {
  const parts = field.attachmentsOf(piece.id);
  const base = piece.box ? (samples.get(piece.semiAxes) ?? samples.set(piece.semiAxes, new Float32Array(boxGrid(piece.semiAxes, piece.center, BOX_GRID))).get(piece.semiAxes)!) : outline(piece);
  if (!parts.length) return base;
  let points = samples.get(parts);
  if (points) return points;
  const list = [...base];
  for (const part of parts) {
    const grid = boxGrid(part.half, ORIGIN, PART_GRID);
    for (let k = 0; k < grid.length; k += 3) list.push(...corner.set(grid[k], grid[k + 1], grid[k + 2]).applyMatrix4(part.matrix).toArray());
  }
  points = new Float32Array(list);
  samples.set(parts, points);
  return points;
}

const ORIGIN = new THREE.Vector3();
const corner = new THREE.Vector3();
const gapAt = new THREE.Vector3();
const gapOther = new THREE.Vector3();

/** A grid of `n` × `n` points over each face of a box of `half` extents about `center`, as a flat list (xyz). */
function boxGrid(h: THREE.Vector3, center: THREE.Vector3, n: number): number[] {
  const list: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const a = -1 + (2 * i) / (n - 1);
          const b = -1 + (2 * j) / (n - 1);
          const p = axis === 0 ? [sign, a, b] : axis === 1 ? [a, sign, b] : [a, b, sign];
          list.push(p[0] * h.x + center.x, p[1] * h.y + center.y, p[2] * h.z + center.z);
        }
      }
    }
  }
  return list;
}

/** Whether two pieces are carried alike (both resting, or both circling the same way without a drift), so they never meet anew. */
function together(a: Asteroid, b: Asteroid): boolean {
  if (a.velocity.lengthSq() > 0 || b.velocity.lengthSq() > 0 || a.spinRate !== 0 || b.spinRate !== 0) return false;
  if (a.orbitRate !== b.orbitRate) return false;
  return a.orbitRate === 0 || a.orbitAxis.equals(b.orbitAxis);
}

const toOther = new THREE.Matrix4();
const local = new THREE.Vector3();
const inPart = new THREE.Vector3();
const deepest = new THREE.Vector3();
const touchNormal = new THREE.Vector3();
const touchPoint = new THREE.Vector3();
const bestNormal = new THREE.Vector3();
const bestPoint = new THREE.Vector3();
const spinA = new THREE.Vector3();
const delta = new THREE.Vector3();
const center = new THREE.Vector3();
const orbit = new THREE.Vector3();
const beforeA = new THREE.Vector3();
const beforeB = new THREE.Vector3();

/**
 * How deep the points of `a` reach into `b` (world units, 0 when none does): the deepest one is
 * written into `point` (moved out onto b's surface) and b's outward normal there into `normal`.
 * Both are posed at the same field time.
 */
function reachInto(field: AsteroidField, a: Asteroid, b: Asteroid, point: THREE.Vector3, normal: THREE.Vector3): number {
  return pointsInto(field, pointsOf(field, a), a.object.matrixWorld, b, point, normal);
}

/**
 * How deep any of `points` (taken into the world by `matrix`) reaches into piece `b` (world
 * units, 0 when none does): the deepest one is written into `point` (moved out onto b's surface)
 * and b's outward normal there into `normal`.
 */
function pointsInto(field: AsteroidField, points: Float32Array, matrix: THREE.Matrix4, b: Asteroid, point: THREE.Vector3, normal: THREE.Vector3): number {
  toOther.multiplyMatrices(b.inverse, matrix);
  const e = toOther.elements;
  const scale = b.object.matrixWorld.getMaxScaleOnAxis();
  const h = b.semiAxes;
  const parts = field.attachmentsOf(b.id);
  let best = 0;
  let index = -1;
  for (let k = 0; k < points.length; k += 3) {
    const x = points[k];
    const y = points[k + 1];
    const z = points[k + 2];
    local.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]).sub(b.center);
    let depth: number;
    if (b.box) depth = Math.min(h.x - Math.abs(local.x), h.y - Math.abs(local.y), h.z - Math.abs(local.z));
    else if (b.surface) depth = b.surface.radius(local) - local.length();
    else depth = (1 - Math.hypot(local.x / h.x, local.y / h.y, local.z / h.z)) * Math.min(h.x, h.y, h.z);
    // or in what stands on it (a rig, a buoy), in its piece's units
    for (const part of parts) {
      inPart.copy(local).add(b.center).applyMatrix4(part.inverse);
      const q = part.half;
      depth = Math.max(depth, Math.min(q.x - Math.abs(inPart.x), q.y - Math.abs(inPart.y), q.z - Math.abs(inPart.z)) * part.matrix.getMaxScaleOnAxis());
    }
    if (depth > best) {
      best = depth;
      index = k;
    }
  }
  if (index < 0) return 0;
  point.set(points[index], points[index + 1], points[index + 2]).applyMatrix4(matrix);
  deepest.copy(point);
  // a point as a sphere the least bit thick: one of no size touches nothing it lies in
  if (!field.resolve(b, point, 1e-3, normal)) return 0;
  return Math.max(deepest.distanceTo(point), best * scale);
}

/** How deep two pieces, posed at the same field time, reach into each other (world units, 0 when apart). */
export function depthBetween(field: AsteroidField, a: Asteroid, b: Asteroid): number {
  return Math.max(reachInto(field, a, b, touchPoint, touchNormal), reachInto(field, b, a, touchPoint, touchNormal));
}

/**
 * The contacts of a field's pieces on the grid of field time (see CONTACT_STEP). `run` meets
 * them on every step of the grid the field's clock passed since the last run, and returns the
 * motions it gave pieces, to be sent to the other browsers; they are already in the field.
 */
export class FieldContacts {
  /** The last step of the grid met (its index: field time over CONTACT_STEP), or null before the first run. */
  private last: number | null = null;
  private readonly entries: Entry[] = [];
  private readonly pool: Entry[] = [];
  /** The rings pieces bounce off, set for the round (see Fixture). */
  fixtures: readonly Fixture[] = [];
  /** The motions given since the last run, for the other browsers. */
  readonly moved: ShovedState[] = [];
  /** How many contacts were met (for tests). */
  contacts = 0;

  /** Starts over on a new field or a field restored from a snapshot: the next run starts at its clock. */
  reset() {
    this.last = null;
    this.siblings.clear();
  }

  /** Meets the field's pieces on every step of the grid up to its clock; the motions given, for the other browsers. */
  run(field: AsteroidField): ShovedState[] {
    this.moved.length = 0;
    const now = Math.floor(field.clock / CONTACT_STEP + 1e-9);
    // a fresh start takes the steps up to now as met (by the lead before, or a snapshot's)
    if (this.last === null || now < this.last) {
      this.last = now;
      this.fresh = true;
    }
    // a long gap (a tab in the background) is met on its last steps only, as the frames would have
    const first = Math.max(this.last + 1, now - 20);
    for (let step = first; step <= now; step++) {
      this.step(field, step * CONTACT_STEP);
      this.fresh = false;
    }
    if (now >= first) for (const entry of this.entries) field.pose(entry.piece, field.clock);
    this.last = now;
    return this.moved;
  }

  /**
   * How far a piece's bounding sphere stood off the nearest other piece's or ring's at field
   * time `time` (units, 0 where they meet): a contact the lead reports needs something there for
   * the piece to have struck (see net/plausible, knockShare).
   */
  gap(field: AsteroidField, piece: Asteroid, time: number): number {
    const at = field.positionOf(piece, time, gapAt);
    let gap = Infinity;
    for (const other of field.asteroids.values()) {
      if (other === piece) continue;
      gap = Math.min(gap, at.distanceTo(field.positionOf(other, time, gapOther)) - piece.radius - other.radius);
    }
    for (const fixture of this.fixtures) gap = Math.min(gap, at.distanceTo(fixture.position) - piece.radius - fixture.reach);
    return Math.max(0, gap);
  }

  /** The pieces at field time `time`, sorted along x by where their bounding spheres begin (ties by id), each posed then. */
  private gather(field: AsteroidField, time: number) {
    const entries = this.entries;
    entries.length = 0;
    let i = 0;
    for (const piece of field.asteroids.values()) {
      const entry = (this.pool[i] ??= { piece, at: new THREE.Vector3(), low: 0, mass: 0, moving: false });
      entry.piece = piece;
      field.positionOf(piece, time, entry.at);
      entry.low = entry.at.x - piece.radius;
      entry.mass = field.bodyMass(piece);
      entry.moving = piece.velocity.lengthSq() > 0 || piece.orbitRate !== 0 || piece.spinRate !== 0;
      entries.push(entry);
      i++;
    }
    entries.sort((a, b) => a.low - b.low || (a.piece.id < b.piece.id ? -1 : 1));
  }

  /** One step of the grid at field time `time`: every pair whose bounding spheres meet, and every piece near a ring, looked at closely. */
  private step(field: AsteroidField, time: number) {
    this.gather(field, time);
    const entries = this.entries;
    for (const entry of entries) field.pose(entry.piece, time);
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      const high = a.at.x + a.piece.radius;
      for (let j = i + 1; j < entries.length && entries[j].low <= high; j++) {
        const b = entries[j];
        if (!a.moving && !b.moving) continue;
        const reach = a.piece.radius + b.piece.radius;
        if (a.at.distanceToSquared(b.at) > reach * reach || together(a.piece, b.piece) || (a.piece.weld !== null && a.piece.weld === b.piece.weld)) continue;
        this.meet(field, a, b, time);
      }
    }
    for (const fixture of this.fixtures) {
      for (const entry of entries) {
        if (!entry.moving) continue;
        const reach = fixture.reach + entry.piece.radius;
        if (entry.at.distanceToSquared(fixture.position) > reach * reach) continue;
        this.bounce(field, entry, fixture, time);
      }
    }
  }

  /** Two pieces whose bounding spheres meet: if one reaches into the other while they close, they trade momentum. */
  private meet(field: AsteroidField, a: Entry, b: Entry, time: number) {
    let depth = reachInto(field, a.piece, b.piece, touchPoint, touchNormal);
    bestPoint.copy(touchPoint);
    bestNormal.copy(touchNormal);
    const back = reachInto(field, b.piece, a.piece, touchPoint, touchNormal);
    if (back > depth) {
      depth = back;
      bestPoint.copy(touchPoint);
      // the normal points from b to a
      bestNormal.copy(touchNormal).negate();
    }
    if (depth <= 0 || this.parting(field, a.piece, b.piece, time)) return;
    this.strike(field, a, b, bestPoint, bestNormal, depth, time);
  }

  /**
   * Siblings of one break still in each other (two pieces of junk thrown out of the same spot,
   * pieces of a rock along their fracture faces) fly apart through each other, from the step
   * they were born on as long as every step finds them touching: they were one piece a moment
   * ago, not two that met.
   */
  private parting(field: AsteroidField, a: Asteroid, b: Asteroid, time: number): boolean {
    if (a.generation !== b.generation || a.generation === 0) return false;
    const dot = a.id.lastIndexOf('.');
    if (dot < 0 || dot !== b.id.lastIndexOf('.') || a.id.slice(0, dot) !== b.id.slice(0, dot)) return false;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const step = Math.round(time / CONTACT_STEP);
    const seen = this.siblings.get(key);
    // the first step after a fresh start cannot know: siblings found in each other then are
    // taken as parting, as they are unless they met again right then
    const age = time - (field.splitSince(a.id.slice(0, dot)) ?? -Infinity);
    if (age > CONTACT_STEP + 1e-9 && seen !== step - 1 && !this.fresh) return false;
    this.siblings.set(key, step);
    return true;
  }

  /** The pairs of siblings still in each other (see parting), with the last step that found them so. */
  private readonly siblings = new Map<string, number>();
  /** The first step after a fresh start (see run, parting). */
  private fresh = false;

  /** A piece near a ring: if it reaches into the ring while closing, it bounces off. */
  private bounce(field: AsteroidField, entry: Entry, fixture: Fixture, time: number) {
    const points = pointsOf(field, entry.piece);
    const matrix = entry.piece.object.matrixWorld;
    let depth = 0;
    for (let k = 0; k < points.length; k += 3) {
      touchPoint.set(points[k], points[k + 1], points[k + 2]).applyMatrix4(matrix);
      deepest.copy(touchPoint);
      if (!fixture.touch(touchPoint, touchNormal)) continue;
      const d = deepest.distanceTo(touchPoint);
      if (d <= depth) continue;
      depth = d;
      bestPoint.copy(deepest);
      // the normal points from the ring to the piece
      bestNormal.copy(touchNormal);
    }
    // and the ring's points in the piece: its normal there points from the piece out, the
    // other way
    const back = pointsInto(field, fixture.points, WORLD, entry.piece, touchPoint, touchNormal);
    if (back > depth) {
      depth = back;
      bestPoint.copy(touchPoint);
      bestNormal.copy(touchNormal).negate();
    }
    if (depth <= 0) return;
    this.strike(field, entry, null, bestPoint, bestNormal, depth, time);
  }

  /**
   * Piece `a` and piece `b` (or a ring, null) touch at `point`, `depth` deep along `normal`
   * (from b to a): when they close, they trade an impulse (see impulse), are pushed apart by
   * their shares and take its tumble; each moved piece's motion since goes into the field and
   * into `moved`.
   */
  private strike(field: AsteroidField, a: Entry, b: Entry | null, point: THREE.Vector3, normal: THREE.Vector3, depth: number, time: number) {
    // the blow goes by how they close: the surfaces where they touch (a spinning tip sweeping
    // into a piece) or their centers (drift and orbit), whichever closes faster, so the deepest
    // point sampled sweeping away never lets two closing pieces sink into each other
    field.surfaceVelocity(a.piece, point, beforeA, time);
    if (b) field.surfaceVelocity(b.piece, point, beforeB, time);
    else beforeB.set(0, 0, 0);
    const surfaces = -relative.subVectors(beforeA, beforeB).dot(normal);
    field.surfaceVelocity(a.piece, a.piece.object.position, centerA, time);
    if (b) field.surfaceVelocity(b.piece, b.piece.object.position, centerB, time);
    else centerB.set(0, 0, 0);
    const centers = -relative.subVectors(centerA, centerB).dot(normal);
    const atSurface = surfaces >= centers;
    if (!atSurface) relative.subVectors(centerA, centerB);
    else relative.subVectors(beforeA, beforeB);
    const approach = Math.max(surfaces, centers);
    // parting, but found deep in each other (the gaps of an outline let a piece in unseen): only
    // pushed apart, at the most a step of SETTLE takes
    const settling = approach <= 0 && depth > SETTLE_DEPTH;
    if (approach <= 0 && !settling) return;
    // struck where they touch, each piece turns as well as drifts; struck along the centers'
    // closing, only drifts (a tip sampled sweeping away is no lever)
    armA.subVectors(point, a.piece.object.position);
    if (b) armB.subVectors(point, b.piece.object.position);
    const turnA = atSurface ? turning(a) : 0;
    const turnB = atSurface && b ? turning(b) : 0;
    if (settling) blow.set(0, 0, 0);
    else impulse(relative, normal, approach, centers, 1 / a.mass, b ? 1 / b.mass : 0, turnA, turnB, blow);
    this.contacts++;
    const toA = share(a.mass, b ? b.mass : IMMOVABLE);
    const push = Math.min(depth, Math.max(approach, SETTLE) * CONTACT_STEP * PUSH_STEPS) + GAP;
    this.give(field, a.piece, a.mass, armA, blow, turnA, normal, push * toA, time);
    if (b) this.give(field, b.piece, b.mass, armB, blow.negate(), turnB, normal, -push * (1 - toA), time);
  }

  /**
   * A piece of `mass` (its whole structure's when welded) takes the impulse `blow` (kg·units/s)
   * at `arm` from its center: its drift changes by the blow over its mass, its spin by the blow's
   * moment over its moment of inertia (`turn` its inverse, 0 for none), and
   * it is pushed `push` along `normal`; its motion since `time` goes into the field and into
   * `moved`. A welded piece moves its whole structure alike, without a tumble.
   */
  private give(field: AsteroidField, piece: Asteroid, mass: number, arm: THREE.Vector3, blow: THREE.Vector3, turn: number, normal: THREE.Vector3, push: number, time: number) {
    delta.copy(blow).divideScalar(mass);
    spinChange.crossVectors(arm, blow).multiplyScalar(turn);
    if (delta.lengthSq() === 0 && push === 0) return;
    if (piece.weld === null) this.shift(field, piece, delta, spinChange, normal, push, time);
    else for (const member of field.welded(piece)) this.shift(field, member, delta, ZERO, normal, push, time);
  }

  /** One piece of a blow (see give): its center's velocity changes by `change`, its spin by `spin`. */
  private shift(field: AsteroidField, piece: Asteroid, change: THREE.Vector3, spin: THREE.Vector3, normal: THREE.Vector3, push: number, time: number) {
    field.positionOf(piece, time, center);
    // its center's velocity before: the surface's at its center (drift and orbit, no spin)
    field.surfaceVelocity(piece, center, orbit, time);
    orbit.add(change);
    spinA.copy(piece.spinAxis).multiplyScalar(piece.spinRate).add(spin);
    center.addScaledVector(normal, push);
    const state = blowState(piece, time, center, orbit, spinA, piece.shovedBy ?? KNOCKED);
    field.move(state);
    field.pose(piece, time);
    this.moved.push(state);
  }
}

const ZERO = new THREE.Vector3();
const relative = new THREE.Vector3();
const centerA = new THREE.Vector3();
const centerB = new THREE.Vector3();
const armA = new THREE.Vector3();
const armB = new THREE.Vector3();
const blow = new THREE.Vector3();
const spinChange = new THREE.Vector3();
const lever = new THREE.Vector3();
const slide = new THREE.Vector3();

/** The inverse of a piece's moment of inertia (1/(kg·units²)): a ball of its mean radius, 2/5 m r²; 0 for a welded one, which never tumbles. */
function turning(entry: Entry): number {
  if (entry.piece.weld !== null) return 0;
  return 1 / (0.4 * entry.mass * entry.piece.meanRadius ** 2);
}

/**
 * The impulse on `a` (into `target`, kg·units/s) of two rigid bodies meeting at a point: `velocity`
 * how fast a's point moves against b's, `approach` how fast they close along `normal` (from b to
 * a), `centers` how fast their centers close along it, `inverseA` and `inverseB` their inverse
 * masses, `turnA` and `turnB` the inverses of their moments of inertia about their centers,
 * struck at armA and armB from them (see response). Along the normal it turns the closing of the
 * points around with RESTITUTION, and at least that of the centers: a blow that only set them
 * turning would let them sink into each other step by step. It never goes beyond turning the
 * closing around in full, and across the normal friction takes at most FRICTION times it and
 * never more than stops the sliding left after it: each part leaves the two with no more
 * energy than they had.
 */
function impulse(velocity: THREE.Vector3, normal: THREE.Vector3, approach: number, centers: number, inverseA: number, inverseB: number, turnA: number, turnB: number, target: THREE.Vector3): THREE.Vector3 {
  const stiff = response(normal, inverseA, inverseB, turnA, turnB, spinChange).dot(normal);
  const centered = ((1 + RESTITUTION) * Math.max(centers, 0)) / (inverseA + inverseB);
  const along = Math.min(Math.max(((1 + RESTITUTION) * approach) / stiff, centered), (2 * approach) / stiff);
  target.copy(normal).multiplyScalar(along);
  // the sliding left once the push along the normal is in
  slide.copy(velocity).addScaledVector(spinChange, along);
  slide.addScaledVector(normal, -slide.dot(normal));
  const sliding = slide.length();
  if (sliding < 1e-6) return target;
  slide.divideScalar(sliding);
  const across = Math.min(FRICTION * along, sliding / response(slide, inverseA, inverseB, turnA, turnB, lever).dot(slide));
  return target.addScaledVector(slide, -across);
}

/** How fast the struck point of a moves against b's (into `target`) per impulse of one on a along `direction`: by both drifts, and by each turn about its center (`turnA`, `turnB`, the inverses of the moments of inertia, struck at armA and armB). */
function response(direction: THREE.Vector3, inverseA: number, inverseB: number, turnA: number, turnB: number, target: THREE.Vector3): THREE.Vector3 {
  target.copy(direction).multiplyScalar(inverseA + inverseB);
  target.addScaledVector(turned.crossVectors(armA, direction).cross(armA), turnA);
  return target.addScaledVector(turned.crossVectors(armB, direction).cross(armB), turnB);
}

const turned = new THREE.Vector3();
