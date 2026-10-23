import * as THREE from 'three';
import { MAX_SPEED } from '../ship/flight';
import { TORPEDOES } from '../game/torpedoes';
import { HOOK_RANGE } from '../game/hook';
import { ONLINE_LEVEL, tubeTorpedoes } from '../game/hangar';

/** The most torpedoes a clone carries online: the standard load and its tubes up to the online cap. */
const LOAD = TORPEDOES + tubeTorpedoes(ONLINE_LEVEL);

/**
 * Rough plausibility checks on what other browsers report about their own ships. Every bound is
 * far beyond what a ship can do, so lag, lost packets and bursts of late messages never make an
 * honest browser look like a cheater; only the impossible does: a ship that jumps across the
 * arena, a nova core nobody ever had, more torpedoes than a clone can carry, kills nobody died for.
 */
export type Cheat = 'teleport' | 'nova' | 'torpedoes' | 'kills' | 'hit' | 'hook';
export const CHEATS: readonly Cheat[] = ['teleport', 'nova', 'torpedoes', 'kills', 'hit', 'hook'];

/** No ship flies faster than this (units/s, 750 m/s): three times the tournament limit, the overdrive and a gravity well included. */
const PLAUSIBLE_SPEED = MAX_SPEED * 3;
/** On top of that, a ship may be off by this much (units, 500 m): the jitter of messages that arrive late or bunched. */
const PLAUSIBLE_SLACK = 10000;
/** A jump only counts after this many within TELEPORT_WINDOW seconds, so a single odd state is forgiven. */
const TELEPORT_STRIKES = 2;
const TELEPORT_WINDOW = 30;
/** After a new round or a nova a ship is printed somewhere else: its position is not checked this long (s). */
const REPRINT_GRACE = 10;
/** A clone may launch this many torpedoes beyond what it had, for messages of a round change that cross. */
const TORPEDO_SLACK = 2;
/** A ship may claim this many kills beyond the deaths everyone saw, for reports that arrive after its state. */
const KILL_SLACK = 2;
/** A clone printed sooner than this after its death was seen (s) is not a new one: bots wait 3 s, a Host sits through the sponsor break. */
const REPRINT_DELAY = 2;
/** A ship's state may say it holds a nova core within this long after it took a probe whose contents this browser did not know (s). */
const TAKE_WINDOW = 5;

interface Track {
  /** Where the ship was last seen alive, and when (game time). */
  x: number;
  y: number;
  z: number;
  at: number;
  alive: boolean;
  /** When this browser saw the clone die (game time), or -Infinity: its next clone may be printed anywhere, with a fresh load. */
  diedAt: number;
  /** When it last took a probe this browser could not see the contents of. */
  tookAt: number;
  /** Jumps seen recently (times). */
  jumps: number[];
  /** No position check before this (game time). */
  graceUntil: number;
  /** It took a nova core (or held one when first seen). */
  nova: boolean;
  /** Torpedoes launched by this clone, and how many it can have had. */
  launched: number;
  torpedoes: number;
  /** Its kills when first seen this round, and the kills everyone saw it make since. */
  kills: number | null;
  credits: number;
}

/** Whether a ship is farther from where it was last seen alive than it could have flown since. */
function tooFar(track: Track, [x, y, z]: number[], now: number): boolean {
  return Math.hypot(x - track.x, y - track.y, z - track.z) > PLAUSIBLE_SPEED * (now - track.at) + PLAUSIBLE_SLACK;
}

/** What a browser knows about a ship from its state: where, alive, kills, a nova core held. */
export interface Seen {
  p: number[];
  alive: boolean;
  kills?: number;
  nova?: boolean;
}

export class Plausibility {
  private readonly tracks = new Map<string, Track>();

  private track(id: string, now: number): Track {
    let track = this.tracks.get(id);
    if (!track) {
      track = { x: 0, y: 0, z: 0, at: -Infinity, alive: false, diedAt: -Infinity, tookAt: -Infinity, jumps: [], graceUntil: now + REPRINT_GRACE, nova: false, launched: 0, torpedoes: LOAD, kills: null, credits: 0 };
      this.tracks.set(id, track);
    }
    return track;
  }

  /** A new round: every ship is printed again, its kills start over, no core is held. */
  newRound(now: number) {
    for (const track of this.tracks.values()) {
      track.graceUntil = now + REPRINT_GRACE;
      track.kills = null;
      track.credits = 0;
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
    for (const track of this.tracks.values()) track.graceUntil = now + REPRINT_GRACE;
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
    track.graceUntil = now + REPRINT_GRACE;
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
   * A state of a remote ship arrived: a jump too far to fly since it was last seen alive is a
   * cheat. Only what this browser saw makes a new clone (a death, a new round, a nova going off,
   * a start over): a state that only says the ship died and lives again changes nothing, nor
   * one that says it holds a nova core it never took.
   */
  state(id: string, seen: Seen, now: number): Cheat | null {
    const track = this.track(id, now);
    const [x, y, z] = seen.p;
    const firstSight = !Number.isFinite(track.at);
    let cheat: Cheat | null = null;
    // a clone printed after a death this browser saw: anywhere, and with a fresh load once its
    // first state comes REPRINT_DELAY after the death (a state that comes earlier, bunched with
    // the death's report by lag, may still be the last clone's, so the death stays pending)
    const reprinted = seen.alive && Number.isFinite(track.diedAt);
    if (reprinted && now - track.diedAt >= REPRINT_DELAY) {
      this.freshClone(track);
      track.diedAt = -Infinity;
    }
    if (seen.alive && !firstSight && !reprinted && now >= track.graceUntil && tooFar(track, seen.p, now)) {
      track.jumps = track.jumps.filter((at) => now - at < TELEPORT_WINDOW);
      track.jumps.push(now);
      if (track.jumps.length >= TELEPORT_STRIKES) cheat = 'teleport';
    }
    // a core held when the ship is first seen (it took it before this browser came), or right
    // after it took a probe whose contents this browser did not know
    if (seen.nova && seen.alive && (firstSight || now - track.tookAt < TAKE_WINDOW)) track.nova = true;
    // kills only grow with the deaths everyone saw; fewer than at first sight is a new round
    if (seen.kills !== undefined) {
      if (track.kills === null || seen.kills < track.kills) {
        track.kills = seen.kills;
        track.credits = 0;
      } else if (seen.kills > track.kills + track.credits + KILL_SLACK) cheat ??= 'kills';
    }
    if (seen.alive) Object.assign(track, { x, y, z, at: now });
    track.alive = seen.alive;
    return cheat;
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

  /** A ship sets off a nova core at a place: only one that holds a core, and where it is. */
  nova(id: string, p: number[], now: number): Cheat | null {
    const track = this.track(id, now);
    if (!track.nova || (Number.isFinite(track.at) && tooFar(track, p, now))) return 'nova';
    // its clone burns up and is printed again elsewhere
    this.freshClone(track);
    track.nova = false;
    track.graceUntil = now + REPRINT_GRACE;
    return null;
  }

  /** A ship launches a torpedo: no more than its clone can carry. */
  torpedo(id: string, now: number): Cheat | null {
    const track = this.track(id, now);
    track.launched++;
    return track.launched > track.torpedoes + TORPEDO_SLACK ? 'torpedoes' : null;
  }
}

/** A report about the own ship may be off this far from where this browser has it (units, 1 km): the shooter saw it up to half a second late. */
export const AIM_SLACK = 20000;
/** How far behind the shooter's last known place a beam may start (units): AIM_SLACK and half a second at full speed. */
const ORIGIN_SLACK = AIM_SLACK + PLAUSIBLE_SPEED * 0.5;
const toTarget = new THREE.Vector3();

/** A laser hit on the own ship: the beam starts near its shooter and passes near the ship, ahead of the muzzle. */
export function plausibleBeam(origin: THREE.Vector3, direction: THREE.Vector3, shooter: THREE.Vector3, target: THREE.Vector3): boolean {
  if (origin.distanceTo(shooter) > ORIGIN_SLACK) return false;
  toTarget.subVectors(target, origin);
  const along = toTarget.dot(direction);
  return along > -AIM_SLACK && toTarget.addScaledVector(direction, -along).length() < AIM_SLACK;
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
const LAUNCH_EVIDENCE = 15;
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
