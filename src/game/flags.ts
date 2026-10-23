import * as THREE from 'three';
import { Randomizer } from '../random';
import { FIELD_RADIUS, type AsteroidField } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { GateKit } from '../world/gates';
import { CoreKit, GRIP, type CoreLook } from '../world/powercore';
import { Cables } from './hook';
import { sponsorSigns } from './satire-ads';
import { msg } from '../i18n/i18n';

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
export const TEAM_NAMES = [msg('Orange'), msg('Blue')] as const;
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
/**
 * How a core is shown (look only; the rules know only where it is, see update). In tow it
 * hangs on a cable from the carrier's stern, TOW_CABLE ship radii long (about 75 m): beyond the
 * chase camera, which hangs 2.6 radii behind the ship, so a ship flying ahead never has it in
 * view. It trails against the flight and sags TOW_SAG of the cable below the ship, under the
 * camera's line of sight, swinging after the ship's turns at TOW_SWING (1/s). It is shown at
 * its size in tow, larger adrift and at home (CORE_SCALE), where it is a mark to fly for.
 */
const TOW_CABLE = 4.5;
const TOW_SAG = 0.35;
const TOW_SWING = 2.5;
const CORE_SCALE = { tow: 1, adrift: 1.4, home: 2 } as const;
/** A core let go glides from its cable to where the rules have it, if that is closer than this (units, 200 m); otherwise it is there at once. */
const GLIDE_REACH = 4000;
/**
 * A core in tow that hides the ship the camera follows, or the line from it to its crosshair, fades to its
 * outline at CORE_FADE (1/s), and back the same way once it is clear; only a core within
 * FADE_NEAR of the camera (units, 300 m) is that big on screen. The crosshair's line is checked
 * as far as AIM_REACH (units, 2 km); a core keeps FADE_MARGIN clear of it (in halves of the
 * screen's height).
 */
const CORE_FADE = 8;
const FADE_NEAR = 6000;
const AIM_REACH = 40000;
const FADE_MARGIN = 0.1;
/** How far a core reaches from its center, for its size on screen (units at its tow size, 8.5 m). */
const CORE_REACH = 170;
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
  readonly flight: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3; readonly orientation: THREE.Quaternion };
}

const tow = new THREE.Vector3();
const stern = new THREE.Vector3();
const hang = new THREE.Vector3();
const down = new THREE.Vector3();
const cableAxis = new THREE.Vector3();
const grip = new THREE.Vector3();
const spin = new THREE.Quaternion();
const onScreen = new THREE.Vector3();
const shipOnScreen = new THREE.Vector3();
const aimOnScreen = new THREE.Vector3();
const ahead = new THREE.Vector3();
const offset = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** The counts of the sides (see Flags.count), kept: the lead's rules run every frame. */
const allSides = [0, 0];
const hostSides = [0, 0];

/** The ship of an id among the round's ships (a handful), or undefined. */
function byId(ships: readonly Flier[], id: string): Flier | undefined {
  for (const ship of ships) if (ship.id === id) return ship;
  return undefined;
}

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
  /** Each core's look, where it is shown (see TOW_CABLE), its tow cable while in tow, and how far it has faded (see view). */
  private readonly looks: CoreLook[] = [];
  private readonly shown: THREE.Vector3[] = [];
  private readonly towLines: (THREE.Line | null)[] = [null, null];
  private readonly faded = [1, 1];
  private readonly coreKit = new CoreKit();
  private readonly cables = new Cables();
  /** A base's ring is a race's coil (see GateKit), its windings in its side's color. */
  private readonly kit = new GateKit(BASE_RADIUS);

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
    // each side's core carries the sign of the sponsor in its color
    const sponsors = sponsorSigns();
    TEAM_TINTS.forEach((tint, team) => {
      const base = axis.clone().multiplyScalar(team === 0 ? 1 : -1);
      this.bases.push(base);
      this.cores.push({ carrier: null, home: true, position: base.clone(), velocity: new THREE.Vector3(), droppedAt: 0 });
      // the ring faces the center, so a carrier flying home flies through it
      const ring = this.kit.build(base, base.clone().normalize(), this.kit.coilMaterial(tint, 2));
      const look = this.coreKit.build(tint, (sponsors.find((sponsor) => sponsor.color === tint) ?? sponsors[team]).brand);
      look.root.position.copy(base);
      this.looks.push(look);
      this.shown.push(base.clone());
      this.root.add(ring.root, look.root);
    });
    this.root.add(this.cables.group);
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
    this.cores.forEach((core, team) => {
      if (core.carrier) {
        const carrier = byId(ships, core.carrier);
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

  /** The events since the game last asked, oldest first (the same list each time, filled anew: the game asks every frame). */
  takeEvents(): readonly FlagEvent[] {
    const fresh = this.fresh;
    fresh.length = 0;
    for (const event of this.events) if (event.seq > this.taken) fresh.push(event);
    this.taken = this.seq;
    return fresh;
  }

  private readonly fresh: FlagEvent[] = [];

  /**
   * The cores where they are this frame: home, in tow behind their carrier, or drifting; and
   * where they are shown (see TOW_CABLE): a core in tow on its cable, one that was let go
   * easing over to where the rules have it.
   */
  update(dt: number, ships: readonly Flier[], now: number) {
    this.cores.forEach((core, team) => {
      const carrier = core.carrier ? byId(ships, core.carrier) : null;
      if (carrier) {
        // in tow behind the carrier, against its flight
        const speed = carrier.flight.velocity.length();
        tow.copy(carrier.flight.velocity).multiplyScalar(speed > 1 ? -1 / speed : 0);
        core.position.copy(carrier.flight.position).addScaledVector(tow, carrier.radius * 1.8);
      } else if (!core.home) core.position.addScaledVector(core.velocity, dt);
      this.show(team, carrier ?? null, dt, now);
    });
    this.kit.blink(now);
  }

  /** Where a core is shown and how it hangs: on its carrier's cable, adrift, or at home. */
  private show(team: number, carrier: Flier | null, dt: number, now: number) {
    const core = this.cores[team];
    const root = this.looks[team].root;
    const shown = this.shown[team];
    const scale = carrier ? CORE_SCALE.tow : core.home ? CORE_SCALE.home : CORE_SCALE.adrift;
    root.scale.setScalar(root.scale.x + (scale - root.scale.x) * (1 - Math.exp(-3 * dt)));
    let line = this.towLines[team];
    if (!carrier) {
      if (line) this.cables.give(line);
      this.towLines[team] = null;
      // a core let go glides to where the rules have it; one sent home is there at once
      if (core.home || shown.distanceTo(core.position) > GLIDE_REACH) shown.copy(core.position);
      else shown.lerp(core.position, 1 - Math.exp(-4 * dt));
      root.position.copy(shown);
      root.rotation.set(core.home ? 0.35 : now * 0.35, now * (core.home ? 0.4 : 0.55), core.home ? 0.2 : 0);
      return;
    }
    // the cable's end at the stern; the core trails against the flight (the stern's way when
    // the ship hardly moves) and sags below the ship, swinging after its turns
    const flight = carrier.flight;
    const length = carrier.radius * TOW_CABLE;
    stern.set(0, 0, carrier.radius * 0.8).applyQuaternion(flight.orientation).add(flight.position);
    const speed = flight.velocity.length();
    if (speed > 20) tow.copy(flight.velocity).divideScalar(-speed);
    else tow.set(0, 0, 1).applyQuaternion(flight.orientation);
    tow.addScaledVector(down.set(0, -1, 0).applyQuaternion(flight.orientation), TOW_SAG).setLength(length);
    hang.subVectors(shown, stern);
    // a core just taken comes in from where it was, but never farther than the cable
    if (!line) {
      line = this.towLines[team] = this.cables.take();
      if (hang.length() > length) hang.setLength(length);
    }
    hang.lerp(tow, 1 - Math.exp(-TOW_SWING * dt)).clampLength(0, length);
    shown.addVectors(stern, hang);
    root.position.copy(shown);
    // its cage towards the stern, turning slowly about its axis
    cableAxis.copy(hang).negate().normalize();
    root.quaternion.setFromUnitVectors(UP, cableAxis).multiply(spin.setFromAxisAngle(UP, now * 0.4));
    Cables.draw(line, stern, grip.copy(shown).addScaledVector(cableAxis, GRIP * root.scale.x));
  }

  /**
   * The cores as the camera sees them (after it moved this frame): a core in tow between the
   * camera and the ship it follows, or the line from that ship to its crosshair, fades to its
   * outline; in the cockpit, the core that ship tows is not seen at all, nor its cable. A core
   * at home or adrift is a mark to fly for and stays whole.
   */
  view(camera: THREE.PerspectiveCamera, subject: Flier, cockpit: boolean, dt: number) {
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.getWorldDirection(ahead);
    toScreen(shipOnScreen.copy(subject.flight.position), camera, ahead);
    toScreen(aimOnScreen.set(0, 0, -AIM_REACH).applyQuaternion(subject.flight.orientation).add(subject.flight.position), camera, ahead);
    this.cores.forEach((core, team) => {
      const look = this.looks[team];
      const towed = core.carrier === subject.id;
      look.root.visible = !(cockpit && towed);
      const line = this.towLines[team];
      if (line) line.visible = look.root.visible;
      const shown = this.shown[team];
      const depth = onScreen.subVectors(shown, camera.position).dot(ahead);
      let clear = true;
      if (core.carrier && depth > 0 && depth < FADE_NEAR) {
        // its size on screen, and how close it comes to the ship and to the crosshair's line
        const size = (CORE_REACH * look.root.scale.x) / depth / halfHeight;
        const ship = subject.alive ? (subject.radius / Math.max(1, shipOnScreen.z)) / halfHeight : 0;
        toScreen(onScreen.copy(shown), camera, ahead);
        clear = toSegment(onScreen, shipOnScreen, subject.alive ? aimOnScreen : shipOnScreen, camera.aspect) > size + Math.max(ship, FADE_MARGIN);
      }
      const faded = this.faded[team] + ((clear ? 1 : 0) - this.faded[team]) * (1 - Math.exp(-CORE_FADE * dt));
      this.faded[team] = faded;
      look.fade(faded > 0.99 ? 1 : faded < 0.01 ? 0 : faded);
    });
  }

  dispose() {
    this.coreKit.dispose();
    this.kit.dispose();
    this.cables.dispose();
  }

  /** Sides for ships that have none, Hosts spread over both first; bots even out the numbers. */
  private assign(ships: readonly Flier[]) {
    // a Map may lose entries while it is walked
    for (const id of this.teams.keys()) if (!byId(ships, id)) this.teams.delete(id);
    for (const ship of ships) {
      if (this.teams.has(ship.id)) continue;
      const all = this.count(ships, null, allSides);
      const hosts = this.count(ships, 'host', hostSides);
      // a Host joins the side with fewer Hosts, a bot the smaller side; a tie goes to Orange
      const pick = ship.kind === 'host' && hosts[0] !== hosts[1] ? (hosts[0] < hosts[1] ? 0 : 1) : all[1] < all[0] ? 1 : 0;
      this.teams.set(ship.id, pick);
    }
    // a side two ships short gets a bot from the other one (never one with a core in tow)
    const all = this.count(ships, null, allSides);
    if (Math.abs(all[0] - all[1]) < 2) return;
    const bigger = all[0] > all[1] ? 0 : 1;
    const bot = ships.find((ship) => ship.kind === 'bot' && this.teams.get(ship.id) === bigger && this.carrying(ship.id) < 0);
    if (bot) this.teams.set(bot.id, 1 - bigger);
  }

  /** Ships on each side, of a kind or all, counted into `counts`. */
  private count(ships: readonly Flier[], kind: Flier['kind'], counts: number[]): number[] {
    counts[0] = counts[1] = 0;
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

/** A point on screen: x and y as the camera projects it (-1..1), z its depth along the camera's view `ahead` (units). */
function toScreen(point: THREE.Vector3, camera: THREE.Camera, ahead: THREE.Vector3): THREE.Vector3 {
  const depth = offset.subVectors(point, camera.position).dot(ahead);
  point.project(camera).z = depth;
  return point;
}

/** How far a point on screen lies from the stretch between two others, in shares of the screen's height. */
function toSegment(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, aspect: number): number {
  const dx = (to.x - from.x) * aspect;
  const dy = to.y - from.y;
  const px = (point.x - from.x) * aspect;
  const py = point.y - from.y;
  const span = dx * dx + dy * dy;
  const along = span > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / span)) : 0;
  return Math.hypot(px - along * dx, py - along * dy);
}

/** A base's place is in rock or in a massive body. */
function blocked(field: AsteroidField, point: THREE.Vector3) {
  return !!field.overlap(point, BASE_RADIUS * 2) || field.insideWell(point, BASE_RADIUS * 8);
}
