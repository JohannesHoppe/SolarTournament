import * as THREE from 'three';
import { motionOf, type Asteroid, type AsteroidField, type ShovedState } from './asteroids';

/**
 * The lead browser's sync of the field. Every browser computes the field alike from the field
 * time, and the messages that change it (a rock's break, a contact's knock, a ram) travel to
 * every browser; but a message can come late, out of order or not at all (a newcomer between
 * the snapshot and its first round, a link that dropped a moment), and a piece that drifted
 * apart stays apart for the round. So the lead sends its field again and again, a slice at a
 * time, and every other browser sets its own to it.
 *
 * The field is cut into families: a piece the layout placed (a root, see AsteroidField.roots)
 * and every piece it breaks into. A family's state is all that can drift: which of its pieces
 * broke and when (their pieces follow from that, unless one went to dust: crumbled or ground by
 * a comet's head, see AsteroidField.crumble), their hits, and the motion of each piece
 * something moved (a knock, a ram, a comet's shove, see ShovedState). A piece that moves as the
 * layout or its break gave it follows from the field time and is not sent.
 *
 * The lead sends one slice of the families every SYNC_EVERY seconds, SYNC_SLICES of them in
 * turn, so the whole field comes round every SYNC_SLICES · SYNC_EVERY seconds: a piece that
 * drifted apart is set right within that. A follower takes a family as the lead has it: a family
 * whose breaks differ is built again from its root (see AsteroidField.rebuildFamily), a piece
 * whose motion differs takes the lead's. Where that moves a piece no farther than EASE_REACH, it
 * glides there over EASE_SECONDS (see Asteroid.ease); farther, it is set at once and a ship it
 * lands on is pushed out of it, as out of the pieces of a rock breaking beside it.
 */

/** The field's families come round in this many slices: the Rings' 136 families, heavily broken, in slices of some 14 (a few kilobytes, far below a message's 64 KB). */
export const SYNC_SLICES = 20;
/** The lead sends a slice this often (s): the whole field every 10 s, a few kilobytes a second at most. */
export const SYNC_EVERY = 0.5;
/**
 * A break within this much field time of the slice (s), on either side, is still on its way to
 * one browser or the other (a shooter's break dated when it fired, a round trip and the jitter of
 * the clocks): a family with one is left to the messages in flight and set right a cycle later.
 */
export const SYNC_GRACE = 2;
/** Two browsers' break times of a rock agree within this (s): the field times travel to the millisecond. */
const BREAK_SLACK = 0.002;
/** A piece the lead has within this of where this browser has it (units, 5 cm, and a thousandth of a radian), now and 30 s on, has its motion already. */
const SAME_PLACE = 1;
const SAME_TURN = 1e-3;
const LOOK_AHEAD = 30;
/** A correction that moves a piece no farther than this (units, 50 m) and turns it no more than EASE_TURN (rad, 20°) glides in (see EASE_SECONDS); a larger one is set at once. */
export const EASE_REACH = 1000;
const EASE_TURN = 0.35;

/** A family of pieces as the lead sends it: its root, its breaks (id, field time), which of them went to dust without pieces (crumbled, or ground by a comet), its pieces standing (id, hits) and the motion of each of them something moved. */
export type FamilyState = { r: string; x: [string, number][]; d: string[]; a: [string, number][]; m: ShovedState[] };
/** A slice of the field: the lead's field time, which slice, and its families. */
export type FieldSlice = { t: number; i: number; f: FamilyState[] };

/** The families of slice `index` of a field. */
export function sliceRoots(field: AsteroidField, index: number): string[] {
  return field.roots.filter((_, k) => k % SYNC_SLICES === index);
}

/** The lead's state of slice `index` of its field (see FieldSlice). */
export function fieldSlice(field: AsteroidField, index: number): FieldSlice {
  return {
    t: field.clock,
    i: index,
    f: sliceRoots(field, index).map((root) => {
      const { alive, broken, dust } = field.familyOf(root);
      return { r: root, x: broken.map(([id, at]) => [id, at]), d: dust, a: alive.map((a) => [a.id, a.hitPoints]), m: alive.flatMap((a) => (a.shovedBy === null ? [] : [motionOf(a)])) };
    }),
  };
}

/** What a sync set right: families built again, pieces eased in or set at once (for tests and the development log). */
export type SyncResult = { rebuilt: number; eased: number; set: number };

const before = new THREE.Vector3();
const after = new THREE.Vector3();
const turnBefore = new THREE.Quaternion();
const ahead = new THREE.Vector3();
const aheadThere = new THREE.Vector3();

/**
 * Sets a follower's field to the lead's slice of it (see the header): `take` says whether a
 * motion of the lead's may be taken at all (the follower's check of the lead, see net/plausible);
 * one it refuses leaves its family as it is.
 */
export function syncField(field: AsteroidField, slice: FieldSlice, take: (state: ShovedState) => boolean = () => true): SyncResult {
  const result: SyncResult = { rebuilt: 0, eased: 0, set: 0 };
  const roots = new Set(sliceRoots(field, slice.i));
  for (const family of slice.f) {
    if (!roots.has(family.r) || family.m.some((state) => !take(state))) continue;
    const mine = field.familyOf(family.r);
    if (inFlight(mine.broken, family.x, slice.t) || !field.familyReady(family.r, family.x, family.d)) continue;
    // what each piece standing looks like now, to glide from there
    const was = new Map(mine.alive.map((a) => [a.id, { position: a.object.position.clone(), turn: a.object.quaternion.clone() }]));
    const moved = new Map(family.m.map((state) => [state.id, state]));
    const sameDust = mine.dust.length === family.d.length && family.d.every((id) => mine.dust.includes(id));
    if (!sameBreaks(mine.broken, family.x) || !sameDust || !sameStanding(mine.alive, family.a) || mine.alive.some((a) => a.shovedBy !== null && !moved.has(a.id) && a.generation > 0)) {
      field.rebuildFamily(family.r, family.x, family.d);
      result.rebuilt++;
    }
    const hits = new Map(family.a);
    for (const a of field.familyOf(family.r).alive) {
      a.hitPoints = hits.get(a.id) ?? a.hitPoints;
      const state = moved.get(a.id) ?? (a.shovedBy !== null ? field.originOf(a.id) : null);
      if (state && !sameMotion(field, a, state)) {
        field.move(state);
        if (!moved.has(a.id)) a.shovedBy = null;
      }
      const old = was.get(a.id);
      if (!old) continue;
      const glide = glideFrom(field, a, old.position, old.turn);
      if (glide === 'eased') result.eased++;
      else if (glide === 'set') result.set++;
    }
  }
  return result;
}

/** Whether a break newer than SYNC_GRACE before the slice, on either side, makes two families' breaks differ: a message still on its way. */
function inFlight(mine: readonly [string, number][], theirs: readonly [string, number][], time: number): boolean {
  const recent = (list: readonly [string, number][], other: readonly [string, number][]) => list.some(([id, at]) => at > time - SYNC_GRACE && !other.some(([o, t]) => o === id && Math.abs(t - at) <= BREAK_SLACK));
  return recent(mine, theirs) || recent(theirs, mine);
}

function sameBreaks(mine: readonly [string, number][], theirs: readonly [string, number][]): boolean {
  if (mine.length !== theirs.length) return false;
  const times = new Map(mine);
  return theirs.every(([id, at]) => {
    const t = times.get(id);
    return t !== undefined && Math.abs(t - at) <= BREAK_SLACK;
  });
}

function sameStanding(mine: readonly Asteroid[], theirs: readonly [string, number][]): boolean {
  if (mine.length !== theirs.length) return false;
  const ids = new Set(mine.map((a) => a.id));
  return theirs.every(([id]) => ids.has(id));
}

/** Whether a piece already moves as `state` would have it: the same place and turn now and LOOK_AHEAD on. */
function sameMotion(field: AsteroidField, a: Asteroid, state: ShovedState): boolean {
  const there = { ...a, born: state.b, basePosition: new THREE.Vector3().fromArray(state.p), velocity: new THREE.Vector3().fromArray(state.v), spinAxis: new THREE.Vector3().fromArray(state.s).normalize(), spinRate: state.s[3], baseOrientation: new THREE.Quaternion().fromArray(state.q).normalize() };
  for (const time of [field.clock, field.clock + LOOK_AHEAD]) {
    if (field.positionOf(a, time, ahead).distanceTo(field.positionOf(there, time, aheadThere)) > SAME_PLACE) return false;
    if (turnAt(a, time, turnBefore).angleTo(turnAt(there, time, turnThere)) > SAME_TURN) return false;
  }
  return true;
}

const turnThere = new THREE.Quaternion();

/** How a piece is turned at a field time by its motion (see AsteroidField's place). */
function turnAt(a: Pick<Asteroid, 'spinAxis' | 'spinRate' | 'born' | 'baseOrientation'>, time: number, target: THREE.Quaternion): THREE.Quaternion {
  return target.setFromAxisAngle(a.spinAxis, a.spinRate * (time - a.born)).multiply(a.baseOrientation);
}

/**
 * A piece that stood at `position`, turned `turn`, before the sync moved it: within EASE_REACH
 * and EASE_TURN it glides from there to where its motion puts it (see Asteroid.ease), farther it
 * stays where it was set and counts as appeared (see AsteroidField.revision). Null when it did not move.
 */
function glideFrom(field: AsteroidField, a: Asteroid, position: THREE.Vector3, turn: THREE.Quaternion): 'eased' | 'set' | null {
  a.ease = null;
  field.pose(a, field.clock);
  const offset = before.subVectors(position, a.object.position);
  const angle = turn.angleTo(a.object.quaternion);
  if (offset.length() < SAME_PLACE && angle < SAME_TURN) return null;
  if (offset.length() > EASE_REACH || angle > EASE_TURN) {
    a.appeared = ++field.revision;
    return 'set';
  }
  a.ease = { offset: after.copy(offset).clone(), turn: turn.clone().multiply(turnBefore.copy(a.object.quaternion).invert()), from: field.clock };
  field.pose(a, field.clock);
  return 'eased';
}
