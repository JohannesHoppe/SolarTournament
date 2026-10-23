import * as THREE from 'three';
import { MAX_SPEED } from '../ship/flight';
import { TORPEDO_LIFETIME, TORPEDOES } from '../game/torpedoes';
import { HOOK_RANGE } from '../game/hook';
import { ONLINE_LEVEL, tubeTorpedoes } from '../game/hangar';

/** The most torpedoes a clone carries online: the standard load and its tubes up to the online cap. */
const LOAD = TORPEDOES + tubeTorpedoes(ONLINE_LEVEL);

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
 * shove and a dodge on top, or a winch reeling it in towards a ship flying the other way.
 */
const PLAUSIBLE_SPEED = MAX_SPEED * 4;
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

  /** A new round: every ship is printed again, its kills start over, no core is held. */
  newRound(now: number) {
    for (const track of this.tracks.values()) {
      this.regrace(track, now);
      track.kills = null;
      track.credits = 0;
      track.aheadSince = null;
      track.diedAt = -Infinity;
      this.freshClone(track);
      track.nova = false;
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

  /** A ship is gone (its browser left): it is judged afresh when it shows again. */
  forget(id: string) {
    this.tracks.delete(id);
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

  /** A ship took a probe: of a kind this browser knows, or null when it could not see what it held (it may have been either). */
  probe(id: string, kind: string | null, now: number) {
    const track = this.track(id, now);
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

  forget(ship: string) {
    for (const key of this.seen.keys()) if (key.startsWith(`${ship}|`)) this.seen.delete(key);
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

/** A torpedo claimed by a ship's hook: it lay within the hook's reach of the ship, as this browser sees them, up to AIM_SLACK of lag. */
export function plausibleHook(ship: THREE.Vector3, torpedo: THREE.Vector3): boolean {
  return ship.distanceTo(torpedo) < HOOK_RANGE + AIM_SLACK;
}

/** What a ship's beams and torpedoes did counts as evidence this long (s), its torpedo launches as long as a torpedo flies and a little more. */
const EVIDENCE_SECONDS = 5;
const LAUNCH_EVIDENCE = TORPEDO_LIFETIME + 3;
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
  private readonly blasts = new Map<string, { at: number; position: THREE.Vector3 }[]>();
  private readonly launches = new Map<string, number>();

  beam(ship: string, from: THREE.Vector3, to: THREE.Vector3, now: number) {
    keep(this.beams, ship, { at: now, from: from.clone(), to: to.clone() }, now);
  }

  blast(ship: string, position: THREE.Vector3, now: number) {
    keep(this.blasts, ship, { at: now, position: position.clone() }, now);
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

  /** The ship launched a torpedo that may still fly. */
  launched(ship: string, now: number): boolean {
    return now - (this.launches.get(ship) ?? -Infinity) < LAUNCH_EVIDENCE;
  }

  forget(ship: string) {
    this.beams.delete(ship);
    this.blasts.delete(ship);
    this.launches.delete(ship);
  }
}

/** Keeps a ship's latest entries, the stale ones dropped. */
function keep<T extends { at: number }>(map: Map<string, T[]>, ship: string, entry: T, now: number) {
  const list = (map.get(ship) ?? []).filter((old) => now - old.at < LAUNCH_EVIDENCE);
  list.push(entry);
  if (list.length > EVIDENCE_KEPT) list.shift();
  map.set(ship, list);
}

/** Accusations: a peer counts as a cheater once at least ACCUSERS Hosts who fly, the own one included, say so. */
const ACCUSERS = 2;

/**
 * How many accusers it takes among `pilots` Hosts who fly (the own one included, if it flies):
 * a majority of them besides the accused, at least ACCUSERS, so two tabs of one Host cannot
 * vote an honest one out of a fuller round. Watching Hosts neither vote nor count.
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
