import * as THREE from 'three';
import { Randomizer } from '../random';
import { FIELD_RADIUS, type AsteroidField } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';

/**
 * Capture the Flag: two sides, Orange and Blue, each with a base on opposite sides of the
 * field and a sponsor core (the flag) at home in it. A ship that touches the other side's core
 * takes it in tow; brought into its own base while its own core is at home, it captures. A
 * carrier that dies loses the core: it drifts where the carrier broke up until someone takes
 * it, its own side touches it (and it goes home), or ADRIFT_SECONDS have passed. The first
 * side with CAPTURES_TO_WIN captures wins at once; otherwise the one with more when the time
 * is up.
 *
 * The lead browser decides (see Flags.lead): who is on which side, who takes, returns and
 * captures a core. Every other browser follows the lead's state (see Flags.follow), which
 * travels with the round clock.
 */
export const TEAM_NAMES = ['Orange', 'Blue'] as const;
/** The sides' colors in the HUD: the tournament's orange, and the blue of information made readable. */
export const TEAM_TINTS = ['#ff9d00', '#4d91ff'] as const;
export const CAPTURES_TO_WIN = 3;
/** The bases lie this far from the field's center (units, 1.8 km), opposite each other. */
const BASE_DISTANCE = FIELD_RADIUS * 0.8;
/** A base's ring (units, 80 m radius, a gate's): a carrier inside it captures. It keeps twice that clear of rock. */
export const BASE_RADIUS = 1600;
/** A ship whose hull comes this close to a core (units, 40 m) takes it, or sends its own home. */
export const GRAB_REACH = 800;
/** A core adrift goes home by itself after this long (s), or at once beyond the arena's edge. */
export const ADRIFT_SECONDS = 30;
/** A core adrift keeps this share of its carrier's velocity. */
const DROP_DRIFT = 0.3;
/** Points for taking the other side's core, for sending the own one home, and for a capture. */
export const GRAB_POINTS = 100;
export const RETURN_POINTS = 150;
export const CAPTURE_POINTS = 1000;
/** Radius of a core (units, 12 m). */
const CORE_RADIUS = 240;
/** Recent events the lead keeps in its state, so a follower that missed a state still hears of them. */
const EVENT_KEEP = 6;

/** What a side's core does: at home in its base, in tow behind a ship, or adrift. */
type Core = { carrier: string | null; home: boolean; readonly position: THREE.Vector3; readonly velocity: THREE.Vector3; droppedAt: number };
export type FlagEventKind = 'grab' | 'return' | 'capture' | 'drop';
const EVENT_KINDS: readonly FlagEventKind[] = ['grab', 'return', 'capture', 'drop'];
/** Something happened to the core of side `team`; `ship` did it (none: a core adrift went home by itself). */
export type FlagEvent = { seq: number; kind: FlagEventKind; ship: string | null; team: number };

/** What the lead browser sends: the ship ids of each side, the captures, each core (null at home, a carrier's id, or position and velocity adrift), and the recent events. */
export type FlagsState = {
  t: string[][];
  c: number[];
  f: (string | number[] | null)[];
  e: [number, number, string | null, number][];
};

/** What a side needs to know of a ship. */
export interface Flier {
  readonly id: string;
  readonly alive: boolean;
  readonly radius: number;
  readonly kind: 'bot' | 'host' | null;
  readonly flight: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 };
}

const tow = new THREE.Vector3();

export class Flags {
  readonly root = new THREE.Group();
  readonly bases: THREE.Vector3[] = [];
  readonly cores: Core[] = [];
  readonly captures = [0, 0];
  private readonly teams = new Map<string, number>();
  private readonly events: FlagEvent[] = [];
  /** The last event known, and the last one the game took (see takeEvents). */
  private seq = 0;
  private taken = 0;
  private followed = false;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly coreGeometry = new THREE.IcosahedronGeometry(CORE_RADIUS, 1);
  private readonly ringGeometry = new THREE.TorusGeometry(BASE_RADIUS, 60, 10, 72);
  private readonly materials: THREE.Material[] = [];

  /** The bases are laid out from the arena's freshly generated field and its seed, so every browser builds the same. */
  constructor(field: AsteroidField, seed: number) {
    const r = new Randomizer(seed * 11 + 5);
    const angle = r.range(0, Math.PI * 2);
    const axis = new THREE.Vector3();
    // the line through the center turns until both ends keep clear of rock and of a massive body
    for (let attempt = 0; attempt < 24; attempt++) {
      const turn = angle + attempt * 0.4;
      axis.set(Math.cos(turn), r.range(-0.2, 0.2), Math.sin(turn)).normalize().multiplyScalar(BASE_DISTANCE);
      if (![1, -1].some((side) => blocked(field, tow.copy(axis).multiplyScalar(side)))) break;
    }
    TEAM_TINTS.forEach((tint, team) => {
      const base = axis.clone().multiplyScalar(team === 0 ? 1 : -1);
      this.bases.push(base);
      this.cores.push({ carrier: null, home: true, position: base.clone(), velocity: new THREE.Vector3(), droppedAt: 0 });
      const color = new THREE.Color(tint);
      const glow = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), toneMapped: false });
      const faint = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.9), transparent: true, opacity: 0.55, toneMapped: false });
      this.materials.push(glow, faint);
      // the ring faces the center, so a carrier flying home flies through it
      const ring = new THREE.Mesh(this.ringGeometry, faint);
      ring.position.copy(base);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), base.clone().normalize());
      const core = new THREE.Mesh(this.coreGeometry, glow);
      core.position.copy(base);
      this.meshes.push(core);
      this.root.add(ring, core);
    });
  }

  /** The side of a ship, or -1 before the lead has given it one. */
  teamOf(id: string): number {
    return this.teams.get(id) ?? -1;
  }

  /** The side whose core a ship has in tow, or -1. */
  carrying(id: string): number {
    return this.cores.findIndex((core) => core.carrier === id);
  }

  /** The leader in captures, or -1 while they are level. */
  get leading(): number {
    return this.captures[0] === this.captures[1] ? -1 : this.captures[0] > this.captures[1] ? 0 : 1;
  }

  /** A side has captured enough to win at once. */
  get won(): boolean {
    return this.captures.some((count) => count >= CAPTURES_TO_WIN);
  }

  /**
   * The lead browser's rules, once a frame, over every ship of the round (watchers and drones
   * left out): sides for newcomers, cores lost by dead carriers, taken, sent home, captured.
   */
  lead(ships: readonly Flier[], now: number) {
    this.assign(ships);
    const byId = new Map(ships.map((ship) => [ship.id, ship]));
    this.cores.forEach((core, team) => {
      if (core.carrier) {
        const carrier = byId.get(core.carrier);
        // a carrier that died, left, or changed sides drops the core where it was
        if (!carrier?.alive || this.teamOf(carrier.id) === team) {
          if (carrier) core.velocity.copy(carrier.flight.velocity).multiplyScalar(DROP_DRIFT);
          this.event('drop', core.carrier, team);
          core.carrier = null;
          core.droppedAt = now;
        }
      }
      if (!core.home && !core.carrier && (now - core.droppedAt > ADRIFT_SECONDS || core.position.length() > ARENA_LIMIT)) {
        this.goHome(team);
        this.event('return', null, team);
      }
    });
    for (const ship of ships) {
      const side = this.teamOf(ship.id);
      if (!ship.alive || side < 0) continue;
      this.cores.forEach((core, team) => {
        if (core.carrier || ship.flight.position.distanceTo(core.position) > ship.radius + GRAB_REACH) return;
        if (team === side) {
          if (core.home) return;
          this.goHome(team);
          this.event('return', ship.id, team);
        } else if (this.carrying(ship.id) < 0) {
          core.carrier = ship.id;
          core.home = false;
          this.event('grab', ship.id, team);
        }
      });
      const theirs = 1 - side;
      if (this.cores[theirs].carrier === ship.id && this.cores[side].home && ship.flight.position.distanceTo(this.bases[side]) < BASE_RADIUS) {
        this.captures[side]++;
        this.goHome(theirs);
        this.event('capture', ship.id, theirs);
      }
    }
  }

  /** The lead's state, for the other browsers. */
  toState(): FlagsState {
    const sides: string[][] = [[], []];
    for (const [id, team] of this.teams) sides[team].push(id);
    return {
      t: sides,
      c: [...this.captures],
      f: this.cores.map((core) => (core.carrier ? core.carrier : core.home ? null : [...core.position.toArray().map(Math.round), ...core.velocity.toArray().map(Math.round)])),
      e: this.events.map((e) => [e.seq, EVENT_KINDS.indexOf(e.kind), e.ship, e.team]),
    };
  }

  /** Takes the lead browser's state; events not heard of yet are kept for the game (see takeEvents). */
  follow(state: FlagsState, now: number) {
    this.teams.clear();
    state.t.forEach((ids, team) => ids.forEach((id) => this.teams.set(id, team)));
    this.captures[0] = state.c[0];
    this.captures[1] = state.c[1];
    state.f.forEach((wire, team) => {
      const core = this.cores[team];
      if (wire === null) this.goHome(team);
      else if (typeof wire === 'string') {
        core.carrier = wire;
        core.home = false;
      } else {
        if (core.home || core.carrier) core.droppedAt = now;
        core.carrier = null;
        core.home = false;
        core.position.fromArray(wire);
        core.velocity.fromArray(wire, 3);
      }
    });
    for (const [seq, kind, ship, team] of state.e) {
      if (seq <= this.seq) continue;
      this.seq = seq;
      this.remember({ seq, kind: EVENT_KINDS[kind], ship, team });
    }
    // a browser that just came hears what happens from now on, not what happened before it
    if (!this.followed) this.taken = this.seq;
    this.followed = true;
  }

  /** The events since the game last asked, oldest first. */
  takeEvents(): FlagEvent[] {
    const fresh = this.events.filter((e) => e.seq > this.taken);
    this.taken = this.seq;
    return fresh;
  }

  /** The cores where they are this frame: home, in tow behind their carrier, or drifting. */
  update(dt: number, ships: readonly Flier[], now: number) {
    this.cores.forEach((core, team) => {
      const carrier = core.carrier ? ships.find((ship) => ship.id === core.carrier) : null;
      if (carrier) {
        // in tow behind the carrier, against its flight
        const speed = carrier.flight.velocity.length();
        tow.copy(carrier.flight.velocity).multiplyScalar(speed > 1 ? -1 / speed : 0);
        core.position.copy(carrier.flight.position).addScaledVector(tow, carrier.radius * 1.8);
      } else if (!core.home) core.position.addScaledVector(core.velocity, dt);
      const mesh = this.meshes[team];
      mesh.position.copy(core.position);
      mesh.rotation.set(now * 0.7, now * 1.1, 0);
    });
  }

  dispose() {
    this.coreGeometry.dispose();
    this.ringGeometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  /** Sides for ships that have none, Hosts spread over both first; bots even out the numbers. */
  private assign(ships: readonly Flier[]) {
    const present = new Set(ships.map((ship) => ship.id));
    for (const id of [...this.teams.keys()]) if (!present.has(id)) this.teams.delete(id);
    for (const ship of ships) {
      if (this.teams.has(ship.id)) continue;
      const [all, hosts] = [this.count(ships, null), this.count(ships, 'host')];
      // a Host joins the side with fewer Hosts, a bot the smaller side; a tie goes to Orange
      const pick = ship.kind === 'host' && hosts[0] !== hosts[1] ? (hosts[0] < hosts[1] ? 0 : 1) : all[1] < all[0] ? 1 : 0;
      this.teams.set(ship.id, pick);
    }
    // a side two ships short gets a bot from the other one (never one with a core in tow)
    const all = this.count(ships, null);
    if (Math.abs(all[0] - all[1]) < 2) return;
    const bigger = all[0] > all[1] ? 0 : 1;
    const bot = ships.find((ship) => ship.kind === 'bot' && this.teams.get(ship.id) === bigger && this.carrying(ship.id) < 0);
    if (bot) this.teams.set(bot.id, 1 - bigger);
  }

  /** Ships on each side, of a kind or all. */
  private count(ships: readonly Flier[], kind: Flier['kind']): number[] {
    const counts = [0, 0];
    for (const ship of ships) {
      const team = this.teams.get(ship.id);
      if (team !== undefined && (kind === null || ship.kind === kind)) counts[team]++;
    }
    return counts;
  }

  private goHome(team: number) {
    const core = this.cores[team];
    core.carrier = null;
    core.home = true;
    core.position.copy(this.bases[team]);
    core.velocity.set(0, 0, 0);
  }

  private event(kind: FlagEventKind, ship: string | null, team: number) {
    this.remember({ seq: ++this.seq, kind, ship, team });
  }

  private remember(event: FlagEvent) {
    this.events.push(event);
    if (this.events.length > EVENT_KEEP) this.events.shift();
  }
}

/** A base's place is in rock or in a massive body. */
function blocked(field: AsteroidField, point: THREE.Vector3) {
  return !!field.overlap(point, BASE_RADIUS * 2) || field.insideWell(point, BASE_RADIUS * 8);
}
