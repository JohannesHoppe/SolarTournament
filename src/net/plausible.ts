import * as THREE from 'three';
import { MAX_SPEED } from '../ship/flight';
import { ONLINE_LOAD as LOAD, TORPEDO_LIFETIME } from '../game/torpedoes';
import { HOOK_RANGE } from '../game/hook';
import { FINISH_GATES } from '../game/race';

/**
 * Rough plausibility checks on what other browsers report about their own ships. Every bound is
 * far beyond what a ship can do, so lag, lost packets and bursts of late messages never make an
 * honest browser look like a cheater; only the impossible does: a ship that jumps across the
 * arena, a nose that swings round faster than any thruster turns it, a beam that leaves where
 * the ship is not or along a nose it cannot have, a nova core nobody ever had, more torpedoes
 * than a clone can carry, kills nobody died for. Each check judges one event; a peer is only
 * reported for what its ship does again and again (see Strikes).
 */
export type Cheat = 'teleport' | 'nova' | 'torpedoes' | 'kills' | 'hit' | 'hook' | 'aim' | 'spin';
export const CHEATS: readonly Cheat[] = ['teleport', 'nova', 'torpedoes', 'kills', 'hit', 'hook', 'aim', 'spin'];

/**
 * No ship flies faster than this (units/s, 1 km/s): four times the tournament limit. An honest
 * ship comes to about 700 m/s at the most, and only for a moment: the limit, the overdrive's
 * shove and a dodge on top, or a winch reeling it in towards a ship flying the other way. A
 * fall into the black hole, which the limit does not hold back, ends at its horizon at about
 * 600 m/s, from the arena's edge with the overdrive's shove.
 */
export const PLAUSIBLE_SPEED = MAX_SPEED * 4;
/** On top of that, a ship may be off by this much (units, 500 m): prediction, rounding, a state that comes late. */
const PLAUSIBLE_SLACK = 10000;
/** After a new round or a nova a ship is printed somewhere else: its position and nose are not checked this long (s). */
const REPRINT_GRACE = 10;
/** A clone may launch this many torpedoes beyond what it had, for messages of a round change that cross. */
const TORPEDO_SLACK = 2;
/** A ship may claim this many kills beyond the deaths everyone saw, for reports that arrive after its state. */
const KILL_SLACK = 2;
/** Kills beyond that count only once they stay so long (s): a nova's victims are told of by their own browsers, a moment after the killer's state. */
const KILL_WAIT = 3;
/** A clone printed sooner than this after its death was seen (s) is not a new one: a Host's and a bot's next clone both take 9 s at the soonest (the respawn delay and the sponsor break's ad). */
const REPRINT_DELAY = 2;
/** A ship's state may say it holds a nova core within this long after it took a probe whose contents this browser did not know (s). */
const TAKE_WINDOW = 5;

/**
 * The nose of a ship turns as its reported spin says: between two states, along the mean of
 * their spins, off by at most NOSE_SLACK (rad, about 6°, rounding and the steps of a frame) and
 * by what the spin changed and SPIN_KICK over the time between them. SPIN_KICK (rad/s) is what a
 * blow adds to the spin at once: a shove up to 6 rad/s, the decompression of a hit about
 * 2.4 rad/s. The spin itself grows by at most SPIN_ACCEL (rad/s²) and SPIN_KICK between two
 * states: the flight computer's thrusters reach 24 rad/s² (26 with the upgrade allowed online)
 * and escaping air spins a hull with its thrusters shot to pieces by up to about 17 rad/s².
 * At 15 states a second a nose may swing round some 40° more than its spin says, never half way.
 */
const NOSE_SLACK = 0.1;
const SPIN_KICK = 10;
const SPIN_ACCEL = 60;
/** A beam leaves its muzzle up to this far off the line of the nose (units, 50 m): the muzzles sit a third of the hull's radius aside, and a short beam's direction shows it. */
const MUZZLE_REACH = 1000;
/** A beam starts within this much of where its ship was at the states before and after it (units, 100 m), on top of its flight between them. */
const MUZZLE_SLACK = 2000;
/** Beams kept per ship until its next state judges them: far more than a twin laser fires between two states. */
const BEAMS_KEPT = 16;
/** Where a ship was lately, for the kills of a shove: one point every TRAIL_STEP seconds, kept TRAIL_SECONDS (the knockout window and some). */
const TRAIL_STEP = 0.25;
const TRAIL_SECONDS = 5;

/** What the checks found closest to a cheat, as a share of each bound (1: on it). */
export type Margins = Partial<Record<Cheat, number>>;

interface Track {
  /** Where the ship was last seen alive, and when (on the clock of its sender, see SenderClock). */
  x: number;
  y: number;
  z: number;
  at: number;
  alive: boolean;
  /** When this browser saw the clone die (real time), or -Infinity: its next clone may be printed anywhere, with a fresh load. */
  diedAt: number;
  /** When it last took a probe this browser could not see the contents of. */
  tookAt: number;
  /** The probes it said it took this round: each counts once (see probe). */
  probes: Set<string>;
  /** No position or nose check before this (real time). */
  graceUntil: number;
  /** It took a nova core (or held one when first seen). */
  nova: boolean;
  /** Torpedoes launched by this clone, and how many it can have had. */
  launched: number;
  torpedoes: number;
  /** Its kills when first seen this round, and the kills everyone saw it make since. */
  kills: number | null;
  credits: number;
  /** Since when it claims more kills than that (real time), or null. */
  aheadSince: number | null;
  /** Orientation and spin (ship space, rad/s) of its last state; `turning` while they belong to the clone that flies now. */
  q: THREE.Quaternion;
  w: THREE.Vector3;
  turning: boolean;
  /** Beams it fired since its last state: the next one judges them. */
  beams: { from: THREE.Vector3; to: THREE.Vector3 }[];
  /** Where it was lately (real time), for the kills of a shove (see met). */
  trail: { at: number; p: THREE.Vector3 }[];
}

/** Whether a ship is farther from where it was last seen alive than it could have flown since. */
function tooFar(track: Track, [x, y, z]: number[], now: number): number {
  return Math.hypot(x - track.x, y - track.y, z - track.z) / (PLAUSIBLE_SPEED * Math.max(0, now - track.at) + PLAUSIBLE_SLACK);
}

/** What a browser knows about a ship from its state: where, alive, kills, a nova core held, orientation and spin. */
export interface Seen {
  p: number[];
  alive: boolean;
  kills?: number;
  nova?: boolean;
  q?: number[];
  w?: number[];
}

const nextQ = new THREE.Quaternion();
const nextW = new THREE.Vector3();
const mean = new THREE.Vector3();
const turnAxis = new THREE.Vector3();
const turnStep = new THREE.Quaternion();
const predicted = new THREE.Quaternion();
const noseA = new THREE.Vector3();
const noseB = new THREE.Vector3();
const beamDirection = new THREE.Vector3();
const flown = new THREE.Vector3();
const AHEAD = new THREE.Vector3(0, 0, -1);
/** Points along the turn between two states a beam is held against. */
const TURN_SAMPLES = 8;

/** The orientation `q` turned on by the spin `w` (ship space) for `seconds`, into `target`. */
function turned(q: THREE.Quaternion, w: THREE.Vector3, seconds: number, target: THREE.Quaternion) {
  target.copy(q);
  const rate = w.length();
  if (rate > 1e-9) target.multiply(turnStep.setFromAxisAngle(turnAxis.copy(w).divideScalar(rate), rate * seconds));
  return target;
}

export class Plausibility {
  private readonly tracks = new Map<string, Track>();
  /** The probes of the round some ship said it took (see probe). */
  private readonly namedProbes = new Set<string>();
  /** The most each check measured, as a share of its bound (see Margins): in honest play the margin to a cheat, above 1 a strike. */
  readonly margins: Margins = {};
  /** The share each check measured when it last failed (see measure), for the log; until it first fails, the last it measured. */
  readonly lastShares: Margins = {};

  private track(id: string, now: number): Track {
    let track = this.tracks.get(id);
    if (!track) {
      track = {
        x: 0,
        y: 0,
        z: 0,
        at: -Infinity,
        alive: false,
        diedAt: -Infinity,
        tookAt: -Infinity,
        probes: new Set(),
        graceUntil: now + REPRINT_GRACE,
        nova: false,
        launched: 0,
        torpedoes: LOAD,
        kills: null,
        credits: 0,
        aheadSince: null,
        q: new THREE.Quaternion(),
        w: new THREE.Vector3(),
        turning: false,
        beams: [],
        trail: [],
      };
      this.tracks.set(id, track);
    }
    return track;
  }

  /** Notes how close a check came to its bound; returns whether it was passed. */
  measure(cheat: Cheat, share: number): boolean {
    this.margins[cheat] = Math.max(this.margins[cheat] ?? 0, share);
    if (share > 1 || !((this.lastShares[cheat] ?? 0) > 1)) this.lastShares[cheat] = share;
    return share > 1;
  }

  /** A new round: every ship is printed again, its kills start over, no core is held, every probe is new. */
  newRound(now: number) {
    this.namedProbes.clear();
    for (const track of this.tracks.values()) {
      this.regrace(track, now);
      track.kills = null;
      track.credits = 0;
      track.aheadSince = null;
      track.diedAt = -Infinity;
      this.freshClone(track);
      track.nova = false;
      track.probes.clear();
    }
  }

  /**
   * This browser started over: it heard nothing for a while, so every ship may be anywhere now;
   * what they hold and did stands (the round goes on, and a new one is seen as such).
   */
  lostSight(now: number) {
    for (const track of this.tracks.values()) this.regrace(track, now);
  }

  /** A ship may be anywhere, pointing anywhere, for REPRINT_GRACE. */
  private regrace(track: Track, now: number) {
    track.graceUntil = now + REPRINT_GRACE;
    track.turning = false;
    track.beams.length = 0;
  }

  /** Ships are gone (their browser left): each one `gone` names is judged afresh when it shows again. */
  forget(gone: (id: string) => boolean) {
    for (const id of this.tracks.keys()) if (gone(id)) this.tracks.delete(id);
  }

  /**
   * A ship's browser started over: its clone may be printed again, anywhere, with a fresh load;
   * what it did before still counts, and a nova core it held it may still hold (a browser that
   * starts over in the same round keeps its clone).
   */
  reprint(id: string, now: number) {
    const track = this.tracks.get(id);
    if (!track) return;
    this.regrace(track, now);
    this.freshClone(track);
  }

  /** This browser saw a ship's clone die (its owner said so to everyone): the next clone is printed anew. */
  died(id: string, now: number) {
    const track = this.track(id, now);
    track.diedAt = now;
    track.nova = false;
  }

  /** A clone printed anew: a fresh load of torpedoes. */
  private freshClone(track: Track) {
    track.launched = 0;
    track.torpedoes = LOAD;
  }

  /**
   * A state of a remote ship arrived, at `now` (real time), sent at `sent` (its sender's clock,
   * see SenderClock): what it shows that no ship can do. A jump too far to fly since it was last
   * seen alive; a nose that turned off its spin, or a spin that grew faster than thrusters and
   * blows make it; a beam since the last state that left where the ship was not, or along a nose
   * it could not have had between the two states; kills nobody saw it make. Only what this
   * browser saw makes a new clone (a death, a new round, a nova going off, a start over): a state
   * that only says the ship died and lives again changes nothing, nor one that says it holds a
   * nova core it never took.
   */
  state(id: string, seen: Seen, now: number, sent = now): Cheat[] {
    const track = this.track(id, now);
    const [x, y, z] = seen.p;
    const firstSight = !Number.isFinite(track.at);
    const cheats: Cheat[] = [];
    // a clone printed after a death this browser saw: anywhere, and with a fresh load once its
    // first state comes REPRINT_DELAY after the death (a state that comes earlier, bunched with
    // the death's report by lag, may still be the last clone's, so the death stays pending)
    const reprinted = seen.alive && Number.isFinite(track.diedAt);
    if (reprinted && now - track.diedAt >= REPRINT_DELAY) {
      this.freshClone(track);
      track.diedAt = -Infinity;
    }
    // a sender's clock only runs on: a state dated before the last gains no time
    const elapsed = Math.max(0, sent - track.at);
    const judged = !firstSight && now >= track.graceUntil;
    if (seen.alive && judged && !reprinted && this.measure('teleport', tooFar(track, seen.p, sent))) cheats.push('teleport');
    if (seen.q && seen.w) {
      nextQ.fromArray(seen.q).normalize();
      nextW.fromArray(seen.w);
      const before = judged && track.turning;
      const after = before && seen.alive && !reprinted;
      if (after && this.turnedOff(track, elapsed)) cheats.push('spin');
      if (before && this.beamsOff(track, seen, after, elapsed)) cheats.push('aim');
      track.q.copy(nextQ);
      track.w.copy(nextW);
    }
    track.beams.length = 0;
    track.turning = seen.alive && !!seen.q;
    // a core held when the ship is first seen (it took it before this browser came), or right
    // after it took a probe whose contents this browser did not know
    if (seen.nova && seen.alive && (firstSight || now - track.tookAt < TAKE_WINDOW)) track.nova = true;
    // kills only grow with the deaths everyone saw; fewer than at first sight is a new round
    if (seen.kills !== undefined) {
      if (track.kills === null || seen.kills < track.kills) {
        track.kills = seen.kills;
        track.credits = 0;
      }
      const ahead = seen.kills - track.kills - track.credits;
      this.measure('kills', ahead / KILL_SLACK);
      if (ahead <= KILL_SLACK) track.aheadSince = null;
      else if (now - (track.aheadSince ??= now) >= KILL_WAIT) cheats.push('kills');
    }
    if (seen.alive) {
      Object.assign(track, { x, y, z, at: Math.max(track.at, sent) });
      const last = track.trail[track.trail.length - 1];
      if (!last || now - last.at >= TRAIL_STEP) track.trail.push({ at: now, p: new THREE.Vector3(x, y, z) });
      while (track.trail.length && now - track.trail[0].at > TRAIL_SECONDS) track.trail.shift();
    }
    track.alive = seen.alive;
    return cheats;
  }

  /** Whether the nose turned between the last state and this one (`nextQ`, `nextW`) farther off its spin than any ship turns, or the spin grew faster. */
  private turnedOff(track: Track, elapsed: number): boolean {
    const change = mean.subVectors(nextW, track.w).length();
    const grew = this.measure('spin', change / (SPIN_ACCEL * elapsed + SPIN_KICK));
    mean.addVectors(track.w, nextW).multiplyScalar(0.5);
    noseA.copy(AHEAD).applyQuaternion(turned(track.q, mean, elapsed, predicted));
    noseB.copy(AHEAD).applyQuaternion(nextQ);
    const off = noseA.angleTo(noseB);
    return this.measure('spin', off / (NOSE_SLACK + (change + SPIN_KICK) * elapsed)) || grew;
  }

  /**
   * Whether a beam since the last state left where the ship was not, or along a nose it could
   * not have had: off the turn between the two states (or after the last, when this one is no
   * longer the same clone's) by more than a nose strays from its spin.
   */
  private beamsOff(track: Track, seen: Seen, after: boolean, elapsed: number): boolean {
    let off = false;
    const change = after ? mean.subVectors(nextW, track.w).length() : SPIN_ACCEL * elapsed;
    if (after) mean.addVectors(track.w, nextW).multiplyScalar(0.5);
    else mean.copy(track.w);
    const reach = PLAUSIBLE_SPEED * elapsed + MUZZLE_SLACK;
    for (const { from, to } of track.beams) {
      // where it started: near the ship at both states
      const start = Math.max(Math.hypot(from.x - track.x, from.y - track.y, from.z - track.z), after ? flown.fromArray(seen.p).distanceTo(from) : 0) / reach;
      // which way it went: along the turn between them
      const length = beamDirection.subVectors(to, from).length();
      beamDirection.divideScalar(Math.max(length, 1e-6));
      let nearest = Infinity;
      for (let i = 0; i <= TURN_SAMPLES; i++) {
        noseA.copy(AHEAD).applyQuaternion(turned(track.q, mean, (elapsed * i) / TURN_SAMPLES, predicted));
        nearest = Math.min(nearest, noseA.angleTo(beamDirection));
      }
      if (after) nearest = Math.min(nearest, noseB.copy(AHEAD).applyQuaternion(nextQ).angleTo(beamDirection));
      const bound = NOSE_SLACK + Math.atan2(MUZZLE_REACH, length) + (change + SPIN_KICK) * elapsed;
      if (this.measure('aim', start) || this.measure('aim', nearest / bound)) off = true;
    }
    return off;
  }

  /** A ship fired a beam from one point to another: the next state of the ship judges it (see state). */
  beam(id: string, from: THREE.Vector3, to: THREE.Vector3) {
    const track = this.tracks.get(id);
    if (!track?.turning || track.beams.length >= BEAMS_KEPT) return;
    track.beams.push({ from: from.clone(), to: to.clone() });
  }

  /** Whether two ships came within `reach` of each other at about the same moment in the last TRAIL_SECONDS: one may have shoved the other into what killed it. */
  met(a: string, b: string, reach: number): boolean {
    const first = this.tracks.get(a)?.trail ?? [];
    const second = this.tracks.get(b)?.trail ?? [];
    return first.some((p) => second.some((q) => Math.abs(p.at - q.at) <= TRAIL_STEP * 2 && p.p.distanceTo(q.p) < reach));
  }

  /**
   * A ship took the probe `probe`: of a kind this browser knows, or null when it could not see
   * what it held (it no longer had the probe; it may have held either). `seen` is false for a
   * take this browser could not watch: the probe was no longer here, or the taker too far from it
   * as this browser sees them (lag may put an honest taker there; the kind is then what the probe
   * held here). A probe is taken once: each ship's word counts once per probe, and a take not
   * seen counts only for the first ship that names the probe at all; one of unknown contents
   * opens the window for a core and adds its torpedoes. A second honest taker of the same probe
   * (two that reached it at once, each first on its own screen) is left with TORPEDO_SLACK.
   */
  probe(id: string, probe: string, kind: string | null, now: number, seen = kind !== null) {
    const track = this.track(id, now);
    if (track.probes.has(probe)) return;
    track.probes.add(probe);
    const first = !this.namedProbes.has(probe);
    this.namedProbes.add(probe);
    if (!seen && !first) return;
    if (kind === null) track.tookAt = now;
    if (kind === 'nova') track.nova = true;
    if (kind === 'torpedoes' || kind === null) track.torpedoes += 2;
  }

  /** A ship killed another (`credit` kills), or lost one to a nova (-1), as everyone saw it. */
  credit(id: string, credit: number, now: number) {
    this.track(id, now).credits += credit;
  }

  /** A ship sets off a nova core at a place, at `now` (real time; `sent` on its sender's clock at the latest): only one that holds a core, and where it is. */
  nova(id: string, p: number[], now: number, sent = now): Cheat | null {
    const track = this.track(id, now);
    if (!track.nova || (Number.isFinite(track.at) && this.measure('nova', tooFar(track, p, sent)))) return 'nova';
    // its clone burns up and is printed again elsewhere
    this.freshClone(track);
    track.nova = false;
    this.regrace(track, now);
    return null;
  }

  /** A ship launches a torpedo: no more than its clone can carry. */
  torpedo(id: string, now: number): Cheat | null {
    const track = this.track(id, now);
    track.launched++;
    return this.measure('torpedoes', track.launched / (track.torpedoes + TORPEDO_SLACK)) ? 'torpedoes' : null;
  }
}

/**
 * When a peer sent its states, on its own clock: each state carries the seconds its page has
 * run, so a burst of states that waited in a jammed link counts the time between them as it
 * passed there, not as they arrived here. The clock is held to what arrives: a state is never
 * taken as sent later than LATE_SLACK (s, network jitter) after the earliest it could have been,
 * by the least delay of its peer's states before it, so a peer that says its states are newer
 * than they are gains next to no time to fly.
 */
const LATE_SLACK = 0.02;

export class SenderClock {
  /** The least delay seen per peer: real time minus its clock (s). */
  private readonly least = new Map<string, number>();

  /** A peer's state sent at `clock` (its own) arrived at `now`: the time it was sent, on the peer's clock. */
  sent(peer: string, clock: number, now: number): number {
    const least = this.least.get(peer);
    this.least.set(peer, Math.min(least ?? Infinity, now - clock));
    return least === undefined ? clock : Math.min(clock, now - least + LATE_SLACK);
  }

  /** How long ago (s, real time) a state the peer sent at `sent` (its clock, see sent) left it, beyond the least delay of its states: the time it waited in a jammed link or a browser that stood still. */
  age(peer: string, sent: number, now: number): number {
    const least = this.least.get(peer);
    return least === undefined ? 0 : Math.max(0, now - sent - least);
  }

  /** The time it is now on a peer's clock, at the latest (for what it sends without its age). */
  now(peer: string, now: number): number {
    const least = this.least.get(peer);
    return least === undefined ? now : now - least + LATE_SLACK;
  }

  forget(peer: string) {
    this.least.delete(peer);
  }
}

/**
 * A peer is reported for a kind of cheat only once its ship did it STRIKES times, each at
 * least STRIKE_SPACING (s) after the last, within STRIKE_WINDOW (s): one odd event (a lag
 * spike, messages that cross, a burst of beams through a jammed link) never names anyone; a
 * cheater does it again and again. A new round starts over.
 */
const STRIKES = 3;
const STRIKE_SPACING = 1;
const STRIKE_WINDOW = 30;

export class Strikes {
  private readonly seen = new Map<string, number[]>();

  /** The ship did it once more: whether that makes STRIKES. */
  add(ship: string, cheat: Cheat, now: number): boolean {
    const key = `${ship}|${cheat}`;
    const list = (this.seen.get(key) ?? []).filter((at) => now - at < STRIKE_WINDOW);
    if (!list.length || now - list[list.length - 1] >= STRIKE_SPACING) list.push(now);
    this.seen.set(key, list);
    return list.length >= STRIKES;
  }

  /** How many strikes a ship has of a kind. */
  count(ship: string, cheat: Cheat): number {
    return this.seen.get(`${ship}|${cheat}`)?.length ?? 0;
  }

  newRound() {
    this.seen.clear();
  }

  /** The strikes of the ships `gone` names go: their browser left. */
  forget(gone: (ship: string) => boolean) {
    for (const key of this.seen.keys()) if (gone(key.slice(0, key.lastIndexOf('|')))) this.seen.delete(key);
  }
}

/** A report about the own ship may be off this far from where this browser has it (units, 1 km): the shooter saw it up to half a second late. */
export const AIM_SLACK = 20000;
/** How far behind the shooter's last known place a beam may start (units): AIM_SLACK and half a second at full speed. */
export const ORIGIN_SLACK = AIM_SLACK + PLAUSIBLE_SPEED * 0.5;
const toTarget = new THREE.Vector3();

/** How close a laser hit on the own ship comes to a cheat (above 1: one): the beam starts near its shooter and passes near the ship, ahead of the muzzle. */
export function beamShare(origin: THREE.Vector3, direction: THREE.Vector3, shooter: THREE.Vector3, target: THREE.Vector3): number {
  toTarget.subVectors(target, origin);
  const along = toTarget.dot(direction);
  const behind = along < -AIM_SLACK ? Infinity : 0;
  return Math.max(origin.distanceTo(shooter) / ORIGIN_SLACK, toTarget.addScaledVector(direction, -along).length() / AIM_SLACK, behind);
}

/** A torpedo hit on the own ship: the torpedo went off near it. */
export function plausibleBlast(at: THREE.Vector3, target: THREE.Vector3): boolean {
  return at.distanceTo(target) < AIM_SLACK;
}

/**
 * A torpedo or a sponsor probe claimed by a ship's hook lay within the hook's reach of the
 * ship, as this browser sees them, up to AIM_SLACK of lag: the share of that bound (above 1:
 * out of reach, a strike, see Strikes).
 */
export function hookShare(ship: THREE.Vector3, held: THREE.Vector3): number {
  return ship.distanceTo(held) / (HOOK_RANGE + AIM_SLACK);
}

/**
 * A piece the lead's battleship rams aside is pushed out of its hull by no more than RAM_PUSH
 * (units, 100 m: its hull plows a few meters into a piece in a frame), and leaves it no faster
 * than RAM_SPEED (units/s, 500 m/s): a blow of the hull at its fastest, 100 m/s, sends a piece
 * off at about twice that and its own drift.
 */
const RAM_PUSH = 2000;
const RAM_SPEED = 10000;
/**
 * The field time of a blow the lead reports (a ram, a contact) lies no farther from this
 * browser's field clock than BLOW_AGE (s): the lead sends a blow the frame it meets it, a step of
 * the contacts' grid or up to 2 s of them after a tab stood still, and this browser's field clock
 * follows the lead's up to FIELD_SNAP (half a second) and the lag. A blow dated far back would
 * move a piece from where it lay then, as far as it drifted since.
 */
const BLOW_AGE = 3;

/**
 * How close a ram the lead browser reports comes to a lie (above 1: one this browser does not
 * take): dated `age` (s) off this browser's field clock, no more than BLOW_AGE; the piece lay at
 * the battleship's hull as this browser sees them, no farther from its center than the hull
 * reaches (`reach`, the piece's own reach in it) and AIM_SLACK (this browser glides after the
 * lead's battleship), it was pushed out from `before` to `after` no farther than RAM_PUSH, and it
 * drifts away no faster than RAM_SPEED.
 */
export function ramShare(before: THREE.Vector3, after: THREE.Vector3, speed: number, hull: THREE.Vector3, reach: number, age: number): number {
  return Math.max(Math.abs(age) / BLOW_AGE, before.distanceTo(hull) / (reach + AIM_SLACK), before.distanceTo(after) / RAM_PUSH, speed / RAM_SPEED);
}

/**
 * A piece of the field the lead browser reports struck by another or by a ring (see
 * world/contacts) is pushed apart by no more than KNOCK_PUSH (units, 50 m: the most two pieces
 * close in a step of the contacts' grid, the tips of spinning junk crossing at full speed, with
 * room), and drifts on no faster than KNOCK_SPEED (units/s, 250 m/s: twice the fastest a piece of
 * the field moves, its orbit, a fragment's push and a spinning tip together).
 */
const KNOCK_PUSH = 1000;
const KNOCK_SPEED = 5000;

/**
 * How close a contact the lead browser reports comes to a lie (above 1: one this browser does not
 * take): dated `age` (s) off this browser's field clock, no more than BLOW_AGE; the piece, where
 * this browser has it at the contact's field time (`before`), lay within KNOCK_PUSH of something
 * it could have struck (`gap`: how far its bounding sphere stood off the nearest other piece's or
 * ring's then, see FieldContacts.gap), was pushed to `after` no farther than KNOCK_PUSH, and
 * drifts on no faster than KNOCK_SPEED.
 */
export function knockShare(before: THREE.Vector3, after: THREE.Vector3, speed: number, age: number, gap: number): number {
  return Math.max(Math.abs(age) / BLOW_AGE, gap / KNOCK_PUSH, before.distanceTo(after) / KNOCK_PUSH, speed / KNOCK_SPEED);
}

/** What a ship's beams and torpedoes did counts as evidence this long (s), its torpedo launches as long as a torpedo flies and a little more. */
const EVIDENCE_SECONDS = 5;
const LAUNCH_EVIDENCE = TORPEDO_LIFETIME + 3;
/**
 * A nova core's hits on a part of the battleship are judged as if it had gone off this much
 * closer to the part (units, 200 m): the battleship as two browsers see it lies apart by its lag,
 * a second of its 30 m/s and the corrections of its course, far less than that.
 */
const NOVA_SLACK = 4000;
/** Beams and blasts kept per ship: far more than fit into EVIDENCE_SECONDS of a twin laser's bursts. */
const EVIDENCE_KEPT = 32;
const closest = new THREE.Vector3();

/** How far a point lies from the stretch between two others. */
function offSegment(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): number {
  const length = from.distanceToSquared(to);
  const along = length > 0 ? THREE.MathUtils.clamp(closest.subVectors(point, from).dot(toTarget.subVectors(to, from)) / length, 0, 1) : 0;
  return point.distanceTo(closest.copy(from).addScaledVector(toTarget.subVectors(to, from), along));
}

/**
 * What every browser sees of the other browsers' ships: the beams they fire (everyone is told of
 * every beam), where their torpedoes went off and when they launched. A report of what a ship
 * did elsewhere (a rock it broke, a torpedo it shot down, a part of the battleship it hit, a ship
 * it killed) only counts with the evidence that it could have: a beam that ended there, a
 * torpedo that went off there. Every bound is generous for lag.
 */
export class Evidence {
  private readonly beams = new Map<string, { at: number; from: THREE.Vector3; to: THREE.Vector3 }[]>();
  /** Where each ship's torpedoes went off, and on which parts of the battleship each was already counted (see fleetHit). */
  private readonly blasts = new Map<string, Blow[]>();
  /** Where each ship's nova cores went off, and on which parts each was already counted. */
  private readonly novas = new Map<string, Blow[]>();
  private readonly launches = new Map<string, number>();

  beam(ship: string, from: THREE.Vector3, to: THREE.Vector3, now: number) {
    keep(this.beams, ship, { at: now, from: from.clone(), to: to.clone() }, now);
  }

  /** A torpedo of the ship went off there: once per torpedo, a second word of the same one adds nothing. */
  blast(ship: string, torpedo: string, position: THREE.Vector3, now: number) {
    if (this.blasts.get(ship)?.some((blast) => blast.torpedo === torpedo)) return;
    keep(this.blasts, ship, { at: now, position: position.clone(), torpedo, parts: new Set<number>() }, now);
  }

  launch(ship: string, now: number) {
    this.launches.set(ship, now);
  }

  /** A beam of the ship ended within `reach` of a point lately: it hit what lies there. */
  beamEnded(ship: string, point: THREE.Vector3, reach: number, now: number): boolean {
    return (this.beams.get(ship) ?? []).some((beam) => now - beam.at < EVIDENCE_SECONDS && beam.to.distanceTo(point) < reach);
  }

  /** A beam of the ship passed near a point lately (AIM_SLACK): it may have hit a ship there. */
  beamPassed(ship: string, point: THREE.Vector3, now: number): boolean {
    return (this.beams.get(ship) ?? []).some((beam) => now - beam.at < EVIDENCE_SECONDS && offSegment(point, beam.from, beam.to) < AIM_SLACK);
  }

  /** A torpedo of the ship went off within `reach` of a point lately. */
  blasted(ship: string, point: THREE.Vector3, reach: number, now: number): boolean {
    return (this.blasts.get(ship) ?? []).some((blast) => now - blast.at < EVIDENCE_SECONDS && blast.position.distanceTo(point) < reach);
  }

  /**
   * A report of a hit on a part of the battleship stands: a laser's (one hit) needs a living
   * shooter whose beam ended on the part; a torpedo's (`count` > 1) one of its torpedoes that went
   * off there, its shooter alive or not, for a torpedo launched by a living clone flies on after
   * that clone died and counts where it lands; a nova core's (`nova`: the hits it deals a part
   * by distance) one the ship set off near enough (see novaReached), its clone reprinted since.
   * A torpedo's blast and a nova core each count once on a part (`zone`, where it lies here,
   * `part`): their hits on it are told once, so a report said again finds its evidence used up.
   * A browser that has only just come takes the hit on trust.
   */
  fleetHit(ship: string, alive: boolean, zone: number, part: THREE.Vector3, count: number, reach: number, trusting: boolean, now: number, nova: ((distance: number) => number) | null = null): boolean {
    if (count <= 1 && !alive && !nova) return false;
    if (trusting) return true;
    if (nova) return this.novaReached(ship, zone, part, count, nova, now);
    return count > 1 ? useBlow(this.blasts.get(ship), zone, now, (blast) => blast.position.distanceTo(part) < reach) : this.beamEnded(ship, part, reach, now);
  }

  /** The ship set off a nova core there. */
  nova(ship: string, position: THREE.Vector3, now: number) {
    keep(this.novas, ship, { at: now, position: position.clone(), torpedo: null, parts: new Set<number>() }, now);
  }

  /**
   * A nova core's hits on a part of the battleship stand: a nova core of the ship went off
   * lately, not counted on this part yet, near enough to it to deal `count` hits (`dealt`, by
   * the distance from it to the part's center), that distance shortened by NOVA_SLACK. Where the
   * core went off is the holder's own word, checked against where its ship flies (see
   * Plausibility.nova); only the battleship lies a little elsewhere on each browser.
   */
  private novaReached(ship: string, zone: number, part: THREE.Vector3, count: number, dealt: (distance: number) => number, now: number): boolean {
    return useBlow(this.novas.get(ship), zone, now, (nova) => count <= dealt(Math.max(0, nova.position.distanceTo(part) - NOVA_SLACK)));
  }

  /** The ship launched a torpedo that may still fly. */
  launched(ship: string, now: number): boolean {
    return now - (this.launches.get(ship) ?? -Infinity) < LAUNCH_EVIDENCE;
  }

  /** What the ships `gone` names did goes: their browser left. */
  forget(gone: (ship: string) => boolean) {
    for (const map of [this.beams, this.blasts, this.novas, this.launches]) for (const ship of map.keys()) if (gone(ship)) map.delete(ship);
  }
}

/** A torpedo's blast (by its id) or a nova core going off: where and when, and the parts of the battleship it was counted on. */
interface Blow {
  at: number;
  position: THREE.Vector3;
  torpedo: string | null;
  parts: Set<number>;
}

/** Counts a recent blow of a ship on a part, the first that `fits` and was not counted there yet; whether there was one. */
function useBlow(blows: Blow[] | undefined, zone: number, now: number, fits: (blow: Blow) => boolean): boolean {
  const blow = blows?.find((b) => now - b.at < EVIDENCE_SECONDS && !b.parts.has(zone) && fits(b));
  blow?.parts.add(zone);
  return blow !== undefined;
}

/**
 * Keeps a ship's latest entries, the stale ones dropped. A ship heard of for the first time also
 * clears out the ships whose entries all went stale: evidence is kept for any id its peer may run
 * (a bot adopted under a new id fires before its first state), and an id made up costs nothing
 * once its time is over.
 */
function keep<T extends { at: number }>(map: Map<string, T[]>, ship: string, entry: T, now: number) {
  if (!map.has(ship)) for (const [id, old] of map) if (old.every((e) => now - e.at >= LAUNCH_EVIDENCE)) map.delete(id);
  const list = (map.get(ship) ?? []).filter((old) => now - old.at < LAUNCH_EVIDENCE);
  list.push(entry);
  if (list.length > EVIDENCE_KEPT) list.shift();
  map.set(ship, list);
}

/**
 * A ship's score as other browsers take it rises by at most SCORE_RATE points a second, in
 * bursts of up to SCORE_BURST: far beyond honest play (a nova core that takes seven ships at once
 * is 7,000 points, a streak of seven kills with its bonus 6,250, the battleship's reactor and its
 * sinking 1,500, a race's win 1,000), and a score said to be higher shows as high as that
 * allows. It falls as it likes (deaths cost points).
 */
const SCORE_RATE = 200;
const SCORE_BURST = 10000;
/**
 * It passes at most GATE_RATE gates a second, two at once for states that come bunched: the
 * gates lie 1 to 1.9 km apart, some two seconds even at 450 m/s, more than a ship flies but for
 * a moment.
 */
const GATE_RATE = 1;
const GATE_BURST = 2;
/**
 * A finish counts once all FINISH_GATES are, at a time on the race clock no later than
 * FINISH_SLACK (s, the clocks' offset, lag and the slow part's second) after this browser's own,
 * and no earlier than FINISH_SLACK before the last state that showed the ship still racing, nor
 * than the gates could have been passed at GATE_RATE.
 */
const FINISH_SLACK = 3;
const FASTEST_RACE = (FINISH_GATES - 1) / GATE_RATE;

/** What a ship's state says of its standing: score, gates passed in a race, and its finish on the race clock (-1 while racing). */
export interface Standing {
  s: number;
  g: number;
  fi: number;
}

interface Tally extends Standing {
  /** When the last state came (real time), and what score and gates it may still rise by. */
  at: number;
  points: number;
  passes: number;
  /** The race clock of the last state that showed the ship racing. */
  racing: number;
}

/** Takes up `claimed` from the `held` value with the allowance `tokens`: falls at once, rises by what the allowance holds. */
function rise(held: number, claimed: number, tokens: number): [number, number] {
  if (claimed <= held) return [claimed, tokens];
  const step = Math.min(claimed - held, tokens);
  return [held + step, tokens - step];
}

/**
 * How far each ship of another browser stands in the round as this browser takes it: score and
 * gates rise no faster than a ship makes them, and a finish only counts once the gates are passed,
 * at a time that fits when this browser saw the ship racing (see the bounds above). A ship first
 * seen in a round may have made what the time since the round started allows.
 */
export class Standings {
  private readonly ships = new Map<string, Tally>();

  /**
   * A state of a ship with its standing `claimed`, arriving at `now` (real time), `round` seconds
   * into the round, sent at `race` on this browser's race clock (a state that waited in a jammed
   * link, or while this browser stood still, counts from when it was sent): the standing this
   * browser takes.
   */
  take(id: string, claimed: Standing, now: number, round: number, race: number): Standing {
    let ship = this.ships.get(id);
    if (!ship) {
      ship = { at: now, s: Math.min(0, claimed.s), g: 0, fi: -1, points: SCORE_BURST + SCORE_RATE * Math.max(0, round), passes: GATE_BURST + GATE_RATE * Math.max(0, round), racing: FASTEST_RACE };
      this.ships.set(id, ship);
    }
    const dt = Math.max(0, now - ship.at);
    ship.at = now;
    ship.points = Math.min(Math.max(ship.points, SCORE_BURST), ship.points + SCORE_RATE * dt);
    ship.passes = Math.min(Math.max(ship.passes, GATE_BURST), ship.passes + GATE_RATE * dt);
    [ship.s, ship.points] = rise(ship.s, claimed.s, ship.points);
    [ship.g, ship.passes] = rise(ship.g, Math.min(claimed.g, FINISH_GATES), ship.passes);
    if (claimed.fi < 0) {
      ship.fi = -1;
      ship.racing = Math.max(ship.racing, race);
    } else if (ship.fi < 0 && ship.g >= FINISH_GATES && claimed.fi <= race + FINISH_SLACK && claimed.fi >= Math.max(FASTEST_RACE, ship.racing - FINISH_SLACK)) {
      ship.fi = claimed.fi;
    }
    return { s: ship.s, g: ship.g, fi: ship.fi };
  }

  /** A new round: every ship starts from nothing. */
  newRound() {
    this.ships.clear();
  }

  /** The ships `gone` names left with their browser. */
  forget(gone: (id: string) => boolean) {
    for (const id of this.ships.keys()) if (gone(id)) this.ships.delete(id);
  }
}

/** Accusations: a peer counts as a cheater once at least ACCUSERS Hosts who fly, the own one included, say so. */
const ACCUSERS = 2;

/**
 * How many accusers it takes among `pilots` Hosts who fly (the own one included, if it flies):
 * a majority of them besides the accused, at least ACCUSERS, so two tabs of one Host cannot
 * vote an honest one out of a round of five or more (in one of three or four they can, which is
 * why the accused never casts itself out, see Online.accuse). Watching Hosts neither vote nor count.
 */
export function accusersNeeded(pilots: number): number {
  return Math.max(ACCUSERS, Math.floor((pilots - 1) / 2) + 1);
}

export class Accusations {
  private readonly accusers = new Map<string, Set<string>>();
  private readonly announced = new Set<string>();

  /** `accuser` says `accused` cheats, among `pilots` Hosts who fly; it counts only if it `flies` itself. True once enough say so, the first time. */
  add(accused: string, accuser: string, flies: boolean, pilots: number): boolean {
    if (accused === accuser || !flies) return false;
    const set = this.accusers.get(accused) ?? new Set<string>();
    set.add(accuser);
    this.accusers.set(accused, set);
    if (set.size < accusersNeeded(pilots) || this.announced.has(accused)) return false;
    this.announced.add(accused);
    return true;
  }

  /**
   * A new round: what was said in the last one goes, so a single false report (a browser that
   * caught an honest one through lag) never adds up with another one rounds later; a cheater is
   * caught again soon enough.
   */
  newRound() {
    this.accusers.clear();
  }

  /** A peer left: its accusations and the ones against it go with it. */
  forget(peer: string) {
    this.accusers.delete(peer);
    this.announced.delete(peer);
    for (const set of this.accusers.values()) set.delete(peer);
  }
}
