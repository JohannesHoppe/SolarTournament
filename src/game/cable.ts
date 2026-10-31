import * as THREE from 'three';
import type { Asteroid, AsteroidField, RayHit } from '../world/asteroids';
import { IMMOVABLE, type Body } from '../world/bodies';

/**
 * A cable wrapped around the field's pieces: a chain of straight stretches from its start (the
 * anchor's end: a hook's bite, the ship it holds, a core in tow) over wrap points on the
 * surfaces of rock, ice, junk or a hull section to its end (the ship that runs the winch, or
 * the carrier's stern). A stretch that would cut into a piece lies on it instead: a wrap point
 * is added where it touches, kept in that piece's own frame, so it turns and drifts with it.
 * Where the cable lies on a piece it presses on it; once the cable swings back so far that it
 * would lift off (the two stretches at a point no longer bent around the piece), the point is
 * let go. The wrap is frictionless: rock and steel polished by nothing, a cable of the Games
 * sheathed to slide, and with friction a winch could never take in cable wrapped round a rock.
 * So the tension is the same all along the chain, and each end feels it along its own
 * stretch (see ropeOver in world/bodies).
 *
 * The cable snaps where wrapping is no answer: on the well's body or the battleship's hull (a
 * hull under its own drive, flying, turning and ramming through the field, drags whatever lies
 * on it with millions of tonnes, and its boxes only roughly follow its plating, so wrap points
 * on them would hang in the air beside the hull: it cuts the cable), on a piece that swept
 * deeper than WRAP_DEPTH into a stretch in one step (it struck through it faster than the
 * cable could slide around it; a piece that only appeared there, the pieces of a rock broken
 * under it or one the lead's sync set at once, is wrapped instead), and beyond WRAP_MAX wrap
 * points. Every browser follows the
 * wraps of every cable it draws; only the one that runs the cable lets it snap.
 */
/** Most wrap points a cable holds: a cable round a rock needs twelve to fifteen for a whole turn, so it winds once round its rock before it snaps. */
export const WRAP_MAX = 16;
/** A stretch is cut by something solid lying across it more than this far in from either end (units, 15 m, less than a hull's radius): an end that scrapes along a surface, or rests on one, does not cut it. */
export const CUT_MARGIN = 300;
/** A piece reaching deeper than this into a stretch in one step (units, 30 m) swept through the cable: a ship swinging at 300 m/s moves its stretch by 5 m a frame at 60 frames a second. */
const WRAP_DEPTH = 600;
/** A wrap point lies this share of its piece's reach off its surface (at least WRAP_GAP_MIN, units, 1 m): a cable round a rock of 100 m runs 2 m above it and needs a wrap point every 50 m or so of its way around. */
const WRAP_GAP = 0.02;
const WRAP_GAP_MIN = 20;

/** Where the cable lies on a piece: in the piece's frame, with the piece's outward normal there, and where both are in the world now. */
class WrapPoint {
  rock!: Asteroid;
  readonly local = new THREE.Vector3();
  readonly outward = new THREE.Vector3();
  /** Where it is and how fast it moves, as a body of the rope (see world/bodies): a piece does not move for a cable. */
  readonly body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: IMMOVABLE };
  readonly normal = new THREE.Vector3();
}

/** What a rope's ends pull towards (see pullOn in game/hook): the wrap points next to each end, the pieces they lie on, and the length of cable between them. */
export interface CablePath {
  /** The wrap point the pulled body's stretch runs to, and its piece. */
  readonly near: Body;
  readonly nearRock: Asteroid;
  /** The wrap point the other end's stretch runs to, and its piece. */
  readonly far: Body;
  readonly farRock: Asteroid;
  /** The cable from `near` to `far`, over the wrap points between. */
  readonly between: number;
  /** How close the other end's winch reels it to `far` (see pullOn). */
  floor: number;
}

const hit: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };
const along = new THREE.Vector3();
const origin = new THREE.Vector3();
const back = new THREE.Vector3();
const entry = new THREE.Vector3();
const middle = new THREE.Vector3();
const out = new THREE.Vector3();
const toPrevious = new THREE.Vector3();
const toNext = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];

export class Cable {
  /** The wrap points from the start to the end; only the first `count` hold. */
  private readonly points: WrapPoint[] = Array.from({ length: WRAP_MAX }, () => new WrapPoint());
  count = 0;
  /** The path as one end sees it (see path), kept. */
  private readonly seen: { near: Body; nearRock: Asteroid; far: Body; farRock: Asteroid; between: number; floor: number } = { near: this.points[0].body, nearRock: null!, far: this.points[0].body, farRock: null!, between: 0, floor: 0 };

  /** The field's revision when the cable last followed it (see AsteroidField.revision), null before it did. */
  private revision: number | null = null;

  /** The cable lies on nothing (a new hook, a core taken). */
  clear() {
    this.count = 0;
    this.revision = null;
  }

  /** Where wrap point `i` (from the start) is now. */
  at(i: number): THREE.Vector3 {
    return this.points[i].body.position;
  }

  /**
   * The cable stretched from `start` to `end` after a step: its wrap points follow their pieces
   * (a piece broken lets its point go), those the cable lifts off let go, and each stretch that
   * something solid cuts lies on it from now on. False when it snapped (only `strict`, on the
   * browser that runs the cable; elsewhere it is drawn as well as it goes).
   */
  follow(field: AsteroidField, start: THREE.Vector3, end: THREE.Vector3, strict: boolean): boolean {
    // a piece that appeared or jumped since the last step (the pieces of a rock broken under the
    // cable, a piece the lead's sync set at once) did not sweep through it: it lies on them
    const since = this.revision ?? field.revision;
    this.revision = field.revision;
    for (let i = 0; i < this.count; i++) {
      const point = this.points[i];
      const object = point.rock.object;
      if (!object.parent || field.asteroids.get(point.rock.id) !== point.rock) {
        this.remove(i--);
        continue;
      }
      point.body.position.copy(point.local).applyQuaternion(object.quaternion).add(object.position);
      point.normal.copy(point.outward).applyQuaternion(object.quaternion);
      field.surfaceVelocity(point.rock, point.body.position, point.body.velocity);
    }
    // a point the cable lifts off: its two stretches no longer press it onto its piece
    for (let i = 0; i < this.count; i++) {
      const point = this.points[i].body.position;
      toPrevious.subVectors(i > 0 ? this.points[i - 1].body.position : start, point).normalize();
      toNext.subVectors(i < this.count - 1 ? this.points[i + 1].body.position : end, point).normalize();
      if (toPrevious.add(toNext).dot(this.points[i].normal) <= 0) continue;
      this.remove(i);
      i = Math.max(-1, i - 2);
    }
    // a stretch something solid lies across, from the end's: it lies on that piece
    let whole = true;
    let checks = WRAP_MAX * 3;
    for (let k = this.count; k >= 0 && checks-- > 0; k--) {
      const from = k > 0 ? this.points[k - 1].body.position : start;
      const to = k < this.count ? this.points[k].body.position : end;
      if (!cut(field, from, to)) continue;
      if (!hit.asteroid || this.count === WRAP_MAX) {
        // the well's body, the battleship's hull, or a cable wound round too much
        whole = false;
        continue;
      }
      const deep = this.wrap(field, hit.asteroid, from, to, k);
      if (deep > WRAP_DEPTH && hit.asteroid.appeared <= since) whole = false;
      // the two new stretches are looked at in turn
      k += 2;
    }
    return whole || !strict;
  }

  /** The length of the cable from `start` over its wrap points to `end`. */
  length(start: THREE.Vector3, end: THREE.Vector3): number {
    let sum = 0;
    let last = start;
    for (let i = 0; i < this.count; i++) {
      sum += last.distanceTo(this.points[i].body.position);
      last = this.points[i].body.position;
    }
    return sum + last.distanceTo(end);
  }

  /**
   * The path the rope of the end (`fromEnd`) or the start pulls along (see pullOn in game/hook):
   * null while the cable lies on nothing.
   */
  path(fromEnd: boolean): CablePath | null {
    if (!this.count) return null;
    const first = this.points[0];
    const last = this.points[this.count - 1];
    const seen = this.seen;
    seen.near = (fromEnd ? last : first).body;
    seen.nearRock = (fromEnd ? last : first).rock;
    seen.far = (fromEnd ? first : last).body;
    seen.farRock = (fromEnd ? first : last).rock;
    let between = 0;
    for (let i = 1; i < this.count; i++) between += this.points[i - 1].body.position.distanceTo(this.points[i].body.position);
    seen.between = between;
    return seen;
  }

  /**
   * Lays the stretch from `from` to `to` (the k-th) on `rock`, which lies across it: the wrap
   * point goes where the piece reaches farthest towards the side it is pushed to, a little
   * off its surface. Returns how deep the piece reached into the stretch.
   */
  private wrap(field: AsteroidField, rock: Asteroid, from: THREE.Vector3, to: THREE.Vector3, k: number): number {
    along.subVectors(to, from).normalize();
    // where the stretch enters the piece and where it leaves it; the wrap point is above the middle
    entry.copy(origin).addScaledVector(along, hit.distance);
    back.copy(to).addScaledVector(along, -CUT_MARGIN);
    const exit = field.rayInto(rock, back, along.negate());
    along.negate();
    middle.copy(entry);
    if (exit !== null) middle.add(back.addScaledVector(along, -exit)).multiplyScalar(0.5);
    // pushed off the piece's center, square to the stretch
    out.subVectors(middle, rock.object.position);
    out.addScaledVector(along, -out.dot(along));
    if (out.lengthSq() < 1e-6) out.crossVectors(along, Math.abs(along.x) < 0.9 ? AXES[0] : AXES[1]);
    out.normalize();
    // its surface there, seen from outside
    const reach = rock.radius * 2 + middle.distanceTo(rock.object.position);
    origin.copy(middle).addScaledVector(out, reach);
    const surface = field.rayInto(rock, origin, out.negate());
    out.negate();
    const depth = surface === null ? 0 : reach - surface;
    const point = this.insert(k);
    point.rock = rock;
    point.body.position.copy(middle).addScaledVector(out, depth + Math.max(WRAP_GAP_MIN, rock.radius * WRAP_GAP));
    point.normal.copy(out);
    field.surfaceVelocity(rock, point.body.position, point.body.velocity);
    inverse.copy(rock.object.quaternion).invert();
    point.local.subVectors(point.body.position, rock.object.position).applyQuaternion(inverse);
    point.outward.copy(out).applyQuaternion(inverse);
    return depth;
  }

  /** A free point put in at index `k`, the later ones moved up. */
  private insert(k: number): WrapPoint {
    const spare = this.points[this.count];
    for (let i = this.count; i > k; i--) this.points[i] = this.points[i - 1];
    this.points[k] = spare;
    this.count++;
    return spare;
  }

  /** The point at index `i` let go, the later ones moved down. */
  private remove(i: number) {
    const gone = this.points[i];
    for (let j = i; j < this.count - 1; j++) this.points[j] = this.points[j + 1];
    this.points[this.count - 1] = gone;
    this.count--;
  }
}

/**
 * Whether something solid lies across the stretch from `from` to `to`, more than CUT_MARGIN in
 * from either end: rock, ice, junk, a hull section, the well's body or the battleship's hull.
 * The first one is left in `hit` (its piece null for the well or the hull), and where the cast
 * started in `origin`.
 */
function cut(field: AsteroidField, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const length = from.distanceTo(to);
  if (length <= CUT_MARGIN * 2) return false;
  along.subVectors(to, from).divideScalar(length);
  origin.copy(from).addScaledVector(along, CUT_MARGIN);
  return field.raycast(origin, along, length - CUT_MARGIN * 2, true, hit) !== null;
}
