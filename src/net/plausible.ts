import * as THREE from 'three';
import { MAX_SPEED } from '../ship/flight';
import { TORPEDOES } from '../game/torpedoes';
import { ONLINE_LEVEL, tubeTorpedoes } from '../game/hangar';

/** The most torpedoes a clone carries online: the standard load and its tubes up to the online cap. */
const LOAD = TORPEDOES + tubeTorpedoes(ONLINE_LEVEL);

/**
 * Rough plausibility checks on what other browsers report about their own ships. Every bound is
 * far beyond what a ship can do, so lag, lost packets and bursts of late messages never make an
 * honest browser look like a cheater; only the impossible does: a ship that jumps across the
 * arena, a nova core nobody ever had, more torpedoes than a clone can carry, kills nobody died for.
 */
export type Cheat = 'teleport' | 'nova' | 'torpedoes' | 'kills' | 'hit';
export const CHEATS: readonly Cheat[] = ['teleport', 'nova', 'torpedoes', 'kills', 'hit'];

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

interface Track {
  x: number;
  y: number;
  z: number;
  at: number;
  alive: boolean;
  deaths: number;
  /** Jumps seen recently (times). */
  jumps: number[];
  /** No position check before this (game time). */
  graceUntil: number;
  /** It took a nova core, or its state says it holds one. */
  nova: boolean;
  /** Torpedoes launched by this clone, and how many it can have had. */
  launched: number;
  torpedoes: number;
  /** Its kills when first seen this round, and the kills everyone saw it make since. */
  kills: number | null;
  credits: number;
}

/** What a browser knows about a ship from its state: where, alive, deaths, kills, a nova core held. */
export interface Seen {
  p: number[];
  alive: boolean;
  deaths?: number;
  kills?: number;
  nova?: boolean;
}

export class Plausibility {
  private readonly tracks = new Map<string, Track>();

  private track(id: string, now: number): Track {
    let track = this.tracks.get(id);
    if (!track) {
      track = { x: 0, y: 0, z: 0, at: -Infinity, alive: false, deaths: -1, jumps: [], graceUntil: now + REPRINT_GRACE, nova: false, launched: 0, torpedoes: LOAD, kills: null, credits: 0 };
      this.tracks.set(id, track);
    }
    return track;
  }

  /** A new round: every ship is printed again, its kills start over. */
  newRound(now: number) {
    for (const track of this.tracks.values()) {
      track.graceUntil = now + REPRINT_GRACE;
      track.kills = null;
      track.credits = 0;
      this.freshClone(track);
    }
  }

  /** A ship is gone (its browser left or started over): it is judged afresh when it shows again. */
  forget(id: string) {
    this.tracks.delete(id);
  }

  private freshClone(track: Track) {
    track.launched = 0;
    track.torpedoes = LOAD;
    track.nova = false;
  }

  /** A state of a remote ship arrived: a jump too far to fly since the last one is a cheat. */
  state(id: string, seen: Seen, now: number): Cheat | null {
    const track = this.track(id, now);
    const [x, y, z] = seen.p;
    const deaths = seen.deaths ?? track.deaths;
    let cheat: Cheat | null = null;
    // a new clone, or the first sight of the ship: its place is where it starts
    const continuous = track.alive && seen.alive && deaths === track.deaths && now >= track.graceUntil;
    if (continuous) {
      const flown = Math.hypot(x - track.x, y - track.y, z - track.z);
      if (flown > PLAUSIBLE_SPEED * (now - track.at) + PLAUSIBLE_SLACK) {
        track.jumps = track.jumps.filter((at) => now - at < TELEPORT_WINDOW);
        track.jumps.push(now);
        if (track.jumps.length >= TELEPORT_STRIKES) cheat = 'teleport';
      }
    }
    if (deaths !== track.deaths || (seen.alive && !track.alive)) this.freshClone(track);
    if (!seen.alive) track.nova = false;
    if (seen.nova) track.nova = true;
    // kills only grow with the deaths everyone saw; fewer than at first sight is a new round
    if (seen.kills !== undefined) {
      if (track.kills === null || seen.kills < track.kills) {
        track.kills = seen.kills;
        track.credits = 0;
      } else if (seen.kills > track.kills + track.credits + KILL_SLACK) cheat ??= 'kills';
    }
    Object.assign(track, { x, y, z, at: now, alive: seen.alive, deaths });
    return cheat;
  }

  /** A ship took a probe whose kind this browser knows. */
  probe(id: string, kind: string, now: number) {
    const track = this.track(id, now);
    if (kind === 'nova') track.nova = true;
    if (kind === 'torpedoes') track.torpedoes += 2;
  }

  /** A ship killed another (`credit` kills), or lost one to a nova (-1), as everyone saw it. */
  credit(id: string, credit: number, now: number) {
    this.track(id, now).credits += credit;
  }

  /** A ship sets off a nova core at a place: only one that holds a core, and where it is. */
  nova(id: string, p: number[], now: number): Cheat | null {
    const track = this.track(id, now);
    const far = Math.hypot(p[0] - track.x, p[1] - track.y, p[2] - track.z) > PLAUSIBLE_SPEED * (now - track.at) + PLAUSIBLE_SLACK;
    if (!track.nova || (Number.isFinite(track.at) && far)) return 'nova';
    // its clone burns up and is printed again elsewhere
    this.freshClone(track);
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
const AIM_SLACK = 20000;
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

/** Accusations: a peer counts as a cheater once at least ACCUSERS Hosts who fly, the own one included, say so. */
export const ACCUSERS = 2;

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

  /** A peer left: its accusations and the ones against it go with it. */
  forget(peer: string) {
    this.accusers.delete(peer);
    this.announced.delete(peer);
    for (const set of this.accusers.values()) set.delete(peer);
  }
}
