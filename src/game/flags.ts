import * as THREE from 'three';
import { Randomizer } from '../random';
import { FIELD_RADIUS, type AsteroidField } from '../world/asteroids';
import { ARENA_LIMIT } from '../world/arena';
import { GateKit } from '../world/gates';
import { CoreKit, GRIP, type CoreLook } from '../world/powercore';
import { touchRing } from '../world/gates';
import { bounceOff, bump } from '../ship/impact';
import { MASS, share, type Body } from '../world/bodies';
import { Cables, HOOK_RANGE, pullOn, type Mark } from './hook';
import { Cable } from './cable';
import { ringCrossing } from './race';
import { sponsorSigns } from './satire-ads';
import { msg } from '../i18n/i18n';
import { inGrip, WELL_CAUTION } from './alarms';

/**
 * Capture the Flag: two sides, Orange and Blue, each with a base on opposite sides of the
 * field and a sponsor core (the flag) at home in it. A ship takes the other side's core with
 * its hook: touching it, the hook on the hull grabs it; or the harpoon, fired at it, bites it
 * from afar (see claim). The core then hangs on the cable from the ship's stern (see tow), and
 * when the core itself passes through the ring of the carrier's base while the carrier's own
 * core is at home, it captures. A carrier that dies, or whose tow cable snaps on something solid
 * that came across it (rock, ice, junk, a hull), loses the core: it flies on from the
 * cable's end until someone takes it, its own side takes it (and it goes home), or
 * ADRIFT_SECONDS have passed. The first side with CAPTURES_TO_WIN captures wins at once;
 * otherwise the one with more when the time is up.
 *
 * The lead browser decides (see Flags.lead): who is on which side, who takes, returns and
 * captures a core, from where each core is on its own screen. Every other browser follows the
 * lead's state (see Flags.follow), which travels with the round clock, and hangs a core in tow
 * on its carrier's cable the same way.
 */
export const TEAM_NAMES = [msg('Orange'), msg('Blue')] as const;
/** The sides' colors in the HUD: the tournament's orange, and the blue of information made readable. */
export const TEAM_TINTS = ['#ff9d00', '#4d91ff'] as const;
export const CAPTURES_TO_WIN = 3;
/** The bases lie this far from the field's center (units, 1.8 km), opposite each other. */
const BASE_DISTANCE = FIELD_RADIUS * 0.8;
/** A base's ring (units, 80 m radius, smaller than a race gate's 120 m): a core in tow that passes through its opening captures. It keeps twice that clear of rock. */
export const BASE_RADIUS = 1600;
/** A ship whose hull comes this close to a core (units, 40 m) grabs it with its hook: takes it, or sends its own home. */
export const GRAB_REACH = 800;
/** A harpoon that bit a core counts when the core is within the hook's reach of the ship, and this much more for the lag between browsers (units, 500 m). */
const CLAIM_SLACK = 10000;
/** A core adrift goes home by itself after this long (s), or at once beyond the arena's edge. */
export const ADRIFT_SECONDS = 30;
/**
 * A core let go flies on with the velocity its cable's end had, and its own station-keeping
 * thrusters (a core of the Games is meant to be found) brake it to rest at CORE_BRAKE
 * (units/s², 2 g): a core dropped at 220 m/s comes to rest after about 11 s and 1.2 km.
 */
export const CORE_BRAKE = 392;
/** Points for taking the other side's core, for sending the own one home, and for a capture. */
export const GRAB_POINTS = 100;
export const RETURN_POINTS = 150;
export const CAPTURE_POINTS = 1000;
/**
 * A core in tow is a trailer on a rope: a body of a quarter of a ship's mass (see MASS in
 * world/bodies) with its own momentum, on a cable made fast at the carrier's stern (TOW_STERN
 * ship radii behind its center), TOW_CABLE ship radii long (about 75 m: beyond the chase
 * camera, which hangs 2.6 radii behind the ship). The cable is the hook's (see pullOn in
 * game/hook): it only pulls, never pushes. Slack, the core flies on by itself; taut, it jerks:
 * the speed apart is taken from both by their masses (the core takes four fifths, the ship
 * one fifth), so towing costs a fifth of the ship's acceleration and every jerk is felt as a
 * tug. In a turn it swings out and whips
 * around; when the ship brakes hard it overtakes on its momentum and bumps into the hull (and
 * bounces off it, by the same shares) or comes taut ahead. A core bitten from afar comes in on
 * the harpoon's cable, reeled in by the hook's winch to TOW_CABLE, which then holds that length.
 * This is where the rules have it: it captures, collides with rock and the bases' rings, and is
 * let go there with its velocity. It is shown at its size in tow, larger adrift and at home
 * (CORE_SCALE), where it is a mark to fly for.
 */
/** A core is a lively thing: it keeps this share of its speed into a rock, a ring or a hull when it bounces off (a ship's hull keeps 0.3). */
const CORE_RESTITUTION = 0.6;
const TOW_STERN = 0.8;
const TOW_CABLE = 4.5;
/** Every browser swings a core in tow on its own rope; one that does not run the carrier takes the lead's core (see toState) when its own is farther off than this (units, 100 m). */
const TOW_CORRECTION = 2000;
const CORE_SCALE = { tow: 1, adrift: 1.4, home: 2 } as const;
/** A core adrift on another browser glides to where the lead has it, if that is closer than this (units, 200 m); otherwise it is there at once. */
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
/** How far a core reaches from its center (units at its tow size, 8.5 m): its size on screen, and the sphere it collides as. */
export const CORE_REACH = 170;
/** Recent events the lead keeps in its state, so a follower that missed a state still hears of them. */
const EVENT_KEEP = 6;

/**
 * What a side's core does: at home in its base, in tow behind a ship (on `cable` of cable,
 * 0 while it is not in tow), or adrift; where it is, where it was the frame before, and its
 * velocity (in tow, its cable end's).
 */
type Core = {
  carrier: string | null;
  home: boolean;
  readonly team: number;
  readonly mass: number;
  readonly position: THREE.Vector3;
  readonly previous: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  droppedAt: number;
  cable: number;
  /** Where the tow cable lies on the field's pieces, from the core to the stern (see game/cable). */
  readonly lies: Cable;
  /** Where the lead has it in tow, from its last state (see TOW_CORRECTION). */
  told: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 } | null;
};
export type FlagEventKind = 'grab' | 'return' | 'capture' | 'drop';
const EVENT_KINDS: readonly FlagEventKind[] = ['grab', 'return', 'capture', 'drop'];
/** Something happened to the core of side `team`; `ship` did it (none: a core adrift went home by itself). */
export type FlagEvent = { seq: number; kind: FlagEventKind; ship: string | null; team: number };

/** What the lead browser sends: the ship ids of each side, the captures, each core (null at home, a carrier's id, or position and velocity adrift), and the recent events. */
export type FlagsState = {
  t: string[][];
  c: number[];
  f: (string | number[] | null)[];
  /** Each core in tow: its position and velocity (null for one not in tow). */
  w: (number[] | null)[];
  e: [number, number, string | null, number][];
};

/** What a side needs to know of a ship. */
export interface Flier {
  readonly id: string;
  readonly alive: boolean;
  readonly radius: number;
  readonly kind: 'bot' | 'host' | null;
  /** The browser that runs it, null for this one. */
  readonly owner: string | null;
  readonly flight: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3; readonly orientation: THREE.Quaternion };
  /** Its flight as a body on a rope or in a bump (see world/bodies). */
  readonly body: Body;
  /** How far the last step set another browser's ship right as this browser predicts it (see Ship.corrected); none for a ship this browser runs. */
  readonly corrected?: number;
}

const tow = new THREE.Vector3();
const normal = new THREE.Vector3();
const contact = new THREE.Vector3();
const surface = new THREE.Vector3();
const crossing = new THREE.Vector3();
const STILL = new THREE.Vector3();
const stern = new THREE.Vector3();
/** Both ends of a tow cable as they were before this frame's jerk (see Flags.tow), and the stern as a body the cable pulls. */
const sternAt = new THREE.Vector3();
const sternBody = { position: stern, velocity: new THREE.Vector3(), mass: MASS.ship };
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
  /** Each base's ring faces the field's center: the axis through its opening, pointing out. */
  readonly facings: THREE.Vector3[] = [];
  readonly cores: Core[] = [];
  /** Cores bitten by a harpoon, for the lead's rules (see claim). */
  private readonly claims: { ship: string; team: number }[] = [];
  /** Where the lead last had each core in tow (see Core.told), kept. */
  private readonly told: { readonly position: THREE.Vector3; readonly velocity: THREE.Vector3 }[] = [];
  /** The cores a ship's harpoon may bite (see hookable), kept: bots ask every frame. */
  private readonly marks: Mark[] = [];
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
  constructor(
    private readonly field: AsteroidField,
    seed: number,
  ) {
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
      this.facings.push(base.clone().normalize());
      this.cores.push({ carrier: null, home: true, team, mass: MASS.core, position: base.clone(), previous: base.clone(), velocity: new THREE.Vector3(), droppedAt: 0, cable: 0, lies: new Cable(), told: null });
      this.told.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3() });
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
   * left out): sides for newcomers, cores lost by dead carriers, taken (touched or bitten by a
   * harpoon), sent home, captured.
   */
  lead(ships: readonly Flier[], now: number) {
    this.assign(ships);
    for (let team = 0; team < this.cores.length; team++) {
      const core = this.cores[team];
      if (core.carrier) {
        const carrier = byId(ships, core.carrier);
        // a carrier that died, left, or changed sides lets the core go where it hangs, flying
        // on with its cable end's velocity; so does a tow cable that snaps where lying on what
        // came across it is no answer (see game/cable), never in the step it is laid out, nor
        // for the jump of another browser's carrier set right as this browser predicts it
        if (!carrier?.alive || this.teamOf(carrier.id) === team || !core.lies.follow(this.field, core.position, sternOf(carrier, stern), core.cable > 0, carrier.corrected ?? 0)) {
          this.event('drop', core.carrier, team);
          core.carrier = null;
          core.droppedAt = now;
        }
      }
      // a core that falls into the arena's massive body is lost, and its sponsor's spare waits at home
      if (!core.home && !core.carrier && (now - core.droppedAt > ADRIFT_SECONDS || core.position.length() > ARENA_LIMIT || this.field.insideWell(core.position, CORE_REACH))) {
        this.goHome(team);
        this.event('return', null, team);
      }
    }
    // a harpoon that bit a core takes it as a touch does, if the ship is still within the hook's reach
    for (const { ship: id, team } of this.claims) {
      const ship = byId(ships, id);
      const side = this.teamOf(id);
      if (ship?.alive && side >= 0 && ship.flight.position.distanceTo(this.cores[team].position) < HOOK_RANGE + CLAIM_SLACK) this.take(ship, side, team);
    }
    this.claims.length = 0;
    for (const ship of ships) {
      const side = this.teamOf(ship.id);
      if (!ship.alive || side < 0) continue;
      for (const core of this.cores) if (ship.flight.position.distanceTo(core.position) <= ship.radius + GRAB_REACH) this.take(ship, side, core.team);
      // the core itself through the ring, the own core at home
      const theirs = this.cores[1 - side];
      if (theirs.carrier === ship.id && this.cores[side].home && this.through(side, theirs)) {
        this.captures[side]++;
        this.goHome(theirs.team);
        this.event('capture', ship.id, theirs.team);
      }
    }
  }

  /**
   * A ship's hook has a core (touched or bitten): the other side's core it takes in tow, unless
   * it already tows one; its own side's core away from home it sends home. A core in tow stays
   * with its carrier.
   */
  private take(ship: Flier, side: number, team: number) {
    const core = this.cores[team];
    if (core.carrier) return;
    if (team === side) {
      if (core.home) return;
      this.goHome(team);
      this.event('return', ship.id, team);
    } else if (this.carrying(ship.id) < 0) {
      this.towBy(core, ship.id);
      this.event('grab', ship.id, team);
    }
  }

  /**
   * The ship `id` has the core in tow. A new carrier's cable is laid out afresh where the core
   * hangs (see tow): never on the length and wrap points of the one before, which may have lost
   * it in the same frame.
   */
  private towBy(core: Core, id: string) {
    if (core.carrier !== id) {
      core.cable = 0;
      core.lies.clear();
    }
    core.carrier = id;
    core.home = false;
  }

  /** A harpoon of `ship` bit the core of side `team`: the lead's rules take it next frame (see lead). */
  claim(ship: string, team: number) {
    this.claims.push({ ship, team });
  }

  /** The cores the harpoon of a ship may bite: the other side's core while it tows none, and its own core adrift; none in tow. */
  hookable(ship: Flier): readonly Mark[] {
    const marks = this.marks;
    marks.length = 0;
    const side = this.teamOf(ship.id);
    if (side < 0) return marks;
    for (const core of this.cores) {
      if (core.carrier) continue;
      if (core.team === side ? !core.home : this.carrying(ship.id) < 0) marks.push(core);
    }
    return marks;
  }

  /** The core passed through the opening of the ring of `side`'s base since the frame before (either way). */
  private through(side: number, core: Core): boolean {
    return ringCrossing(this.bases[side], this.facings[side], BASE_RADIUS, core.previous, core.position) !== null;
  }

  /**
   * Where a carrier of side `side` flies for to bring the core on its cable home: through the
   * middle of its base's ring and on, until the core has passed it too. From afar, or lined up
   * with the opening, straight through it to a point on the far side; beside the ring, first to
   * a point in front of it on the own side. Within that, it keeps flying the way it goes.
   */
  homeRun(side: number, ship: Flier, out: THREE.Vector3): THREE.Vector3 {
    const base = this.bases[side];
    const facing = this.facings[side];
    // past the ring by twice the cable, so the core on it is through too
    const beyond = ship.radius * (TOW_STERN + TOW_CABLE) * 2;
    const offset = crossing.subVectors(ship.flight.position, base);
    const along = offset.dot(facing);
    const beside = offset.addScaledVector(facing, -along).length();
    const near = along >= 0 ? 1 : -1;
    if (beside < BASE_RADIUS / 2 && Math.abs(along) < beyond) return out.copy(base).addScaledVector(facing, (ship.flight.velocity.dot(facing) >= 0 ? 1 : -1) * beyond);
    if (beside < BASE_RADIUS / 2 + Math.abs(along) * 0.2) return out.copy(base).addScaledVector(facing, -near * beyond);
    return out.copy(base).addScaledVector(facing, near * beyond);
  }

  /** The lead's state, for the other browsers. */
  toState(): FlagsState {
    const sides: string[][] = [[], []];
    for (const [id, team] of this.teams) sides[team].push(id);
    return {
      t: sides,
      c: [...this.captures],
      f: this.cores.map((core) => (core.carrier ? core.carrier : core.home ? null : motion(core))),
      w: this.cores.map((core) => (core.carrier ? motion(core) : null)),
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
        this.towBy(core, wire);
        const towed = state.w[team];
        if (towed) {
          const told = this.told[team];
          told.position.fromArray(towed);
          told.velocity.fromArray(towed, 3);
          core.told = told;
        }
      } else {
        if (core.home || core.carrier) core.droppedAt = now;
        core.carrier = null;
        core.home = false;
        core.position.fromArray(wire);
        core.previous.copy(core.position);
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
   * The cores where they are this frame: home, in tow on their carrier's cable (see tow), or
   * drifting (see drift); and where they are shown: where they are, a core adrift on another
   * browser easing over to where the lead has it.
   */
  update(dt: number, ships: readonly Flier[], now: number) {
    for (let team = 0; team < this.cores.length; team++) {
      const core = this.cores[team];
      core.previous.copy(core.position);
      const carrier = core.carrier ? (byId(ships, core.carrier) ?? null) : null;
      if (carrier) {
        // the lead's core, where this browser's own rope has drifted too far from it
        if (core.told && carrier.owner !== null && core.position.distanceTo(core.told.position) > TOW_CORRECTION) {
          core.position.copy(core.told.position);
          core.velocity.copy(core.told.velocity);
          core.previous.copy(core.position);
        }
        this.tow(core, carrier, ships, dt);
      } else {
        core.cable = 0;
        core.lies.clear();
        if (!core.home) this.drift(core, ships, dt);
      }
      core.told = null;
      this.show(team, carrier, dt, now);
    }
    this.kit.blink(now);
  }

  /**
   * A core in tow (see TOW_CABLE): it flies on its own momentum, bounces off rock, the bases'
   * rings and ships, and hangs on the hook's cable from the carrier's stern. A core just taken
   * is on a cable as long as the way to it (no longer than the hook reaches), which the winch
   * reels in to TOW_CABLE. Taut, the cable pulls both ends by their masses; the carrier only
   * on the browser that runs it (elsewhere the core alone follows the carrier as it is told).
   * It lies on the field's pieces as the hook's cable does (see game/cable).
   */
  private tow(core: Core, carrier: Flier, ships: readonly Flier[], dt: number) {
    const flight = carrier.flight;
    const length = carrier.radius * TOW_CABLE;
    const local = carrier.owner === null;
    const fresh = core.cable === 0;
    core.position.addScaledVector(core.velocity, dt);
    this.collide(core.position, core.velocity);
    this.bump(core, ships);
    // the rope between the core and the stern, which moves the ship with it; it lies on what
    // comes across it (see game/cable), every browser following it for itself; whether it
    // snaps, the lead's rules decide (see lead)
    sternOf(carrier, stern);
    core.lies.follow(this.field, core.position, stern, false);
    // a core just taken hangs on as much cable as the way to it, over what the cable already
    // lies on (a harpoon's bite from afar, with a rock come across meanwhile): the rope starts
    // slack, never with a jerk by the way round the rock
    if (fresh) {
      const straight = stern.distanceTo(core.position);
      core.cable = THREE.MathUtils.clamp(straight, length, HOOK_RANGE + CLAIM_SLACK) + core.lies.length(core.position, stern) - straight;
    }
    sternAt.copy(stern);
    sternBody.velocity = flight.velocity;
    // wrapped, the winch holds the cable as it is: reeling in over a rock would drag the
    // carrier back to it
    const path = core.lies.path(false);
    const cable = pullOn(core, sternBody, core.cable, core.cable > length && !path, length, Infinity, dt, local ? 'moved' : 'elsewhere', path, length);
    flight.position.add(stern.sub(sternAt));
    if (cable !== null) core.cable = cable;
  }

  /** A core adrift: it flies on, its thrusters braking it (see CORE_BRAKE), and bounces off rock, the bases' rings and ships. */
  private drift(core: Core, ships: readonly Flier[], dt: number) {
    const speed = core.velocity.length();
    if (speed > 0) core.velocity.multiplyScalar(Math.max(0, speed - CORE_BRAKE * dt) / speed);
    core.position.addScaledVector(core.velocity, dt);
    this.collide(core.position, core.velocity);
    this.bump(core, ships);
    this.meetCore(core);
  }

  /**
   * A core adrift touching the other core bounces off it, both taking their shares by their
   * masses (CORE_RESTITUTION); the other moves only while adrift too (one in tow or at home is
   * held by its own rules), else this one takes all of it.
   */
  private meetCore(core: Core) {
    const other = this.cores[1 - core.team];
    if (!other) return;
    const apart = normal.subVectors(core.position, other.position);
    const distance = apart.length();
    const reach = CORE_REACH * 2;
    if (distance >= reach || distance < 1e-6) return;
    apart.divideScalar(distance);
    const free = !other.home && !other.carrier;
    const toCore = free ? share(core.mass, other.mass) : 1;
    core.position.addScaledVector(apart, (reach - distance) * toCore);
    // a held core moves for nobody: this one bounces off it as off a wall moving with it
    if (free) {
      other.position.addScaledVector(apart, -(reach - distance) * (1 - toCore));
      bump(core, other, apart, CORE_RESTITUTION, true, true);
    } else bounceOff(core.velocity, other.velocity, apart, CORE_RESTITUTION);
  }

  /**
   * A core that touches a ship bounces off it (CORE_RESTITUTION), both taking their shares of
   * the bump by their masses (see world/bodies); the ship on the browser that runs it. A bump
   * only shoves: it harms neither the ship nor the core.
   */
  private bump(core: Core, ships: readonly Flier[]) {
    for (const ship of ships) {
      if (!ship.alive) continue;
      const apart = normal.subVectors(core.position, ship.flight.position);
      const distance = apart.length();
      const reach = ship.radius + CORE_REACH;
      if (distance >= reach || distance < 1e-6) continue;
      apart.divideScalar(distance);
      const local = ship.owner === null;
      const toCore = share(core.mass, ship.body.mass);
      core.position.addScaledVector(apart, (reach - distance) * toCore);
      if (local) ship.flight.position.addScaledVector(apart, -(reach - distance) * (1 - toCore));
      bump(core, ship.body, apart, CORE_RESTITUTION, true, local);
    }
  }

  /** A core touching rock or a base's ring is pushed out onto its surface, and its velocity bounces off it (CORE_RESTITUTION). */
  private collide(position: THREE.Vector3, velocity: THREE.Vector3) {
    const field = this.field;
    const rock = field.overlap(position, CORE_REACH);
    if (rock && field.resolve(rock, position, CORE_REACH, normal)) {
      bounceOff(velocity, field.surfaceVelocity(rock, contact.copy(position).addScaledVector(normal, -CORE_REACH), surface), normal, CORE_RESTITUTION);
      return;
    }
    for (let side = 0; side < this.bases.length; side++) {
      if (!touchRing(this.bases[side], this.facings[side], BASE_RADIUS, position, CORE_REACH, normal)) continue;
      bounceOff(velocity, STILL, normal, CORE_RESTITUTION);
      return;
    }
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
      // a core adrift glides to where the lead has it; one sent home is there at once
      if (core.home || shown.distanceTo(core.position) > GLIDE_REACH) shown.copy(core.position);
      else shown.lerp(core.position, 1 - Math.exp(-4 * dt));
      root.position.copy(shown);
      root.rotation.set(core.home ? 0.35 : now * 0.35, now * (core.home ? 0.4 : 0.55), core.home ? 0.2 : 0);
      return;
    }
    line ??= this.towLines[team] = this.cables.take();
    shown.copy(core.position);
    root.position.copy(shown);
    // its cage towards its cable (to the stern, or where the cable lies on a piece), turning
    // slowly about its axis
    sternOf(carrier, stern);
    cableAxis.subVectors(core.lies.count ? core.lies.at(0) : stern, shown).normalize();
    root.quaternion.setFromUnitVectors(UP, cableAxis).multiply(spin.setFromAxisAngle(UP, now * 0.4));
    Cables.draw(line, stern, grip.copy(shown).addScaledVector(cableAxis, GRIP * root.scale.x), core.lies);
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
    for (let team = 0; team < this.cores.length; team++) {
      const core = this.cores[team];
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
    }
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

  /** A comet's head ran down a core adrift (the lead browser decides): it is lost as in a well, and its sponsor's spare waits at home. */
  runDown(head: THREE.Vector3, radius: number) {
    for (const core of this.cores) {
      if (core.home || core.carrier || core.position.distanceTo(head) >= radius + CORE_REACH) continue;
      this.goHome(core.team);
      this.event('return', null, core.team);
    }
  }

  private goHome(team: number) {
    const core = this.cores[team];
    core.carrier = null;
    core.home = true;
    core.position.copy(this.bases[team]);
    core.previous.copy(core.position);
    core.velocity.set(0, 0, 0);
    core.cable = 0;
  }

  private event(kind: FlagEventKind, ship: string | null, team: number) {
    this.remember({ seq: ++this.seq, kind, ship, team });
  }

  private remember(event: FlagEvent) {
    this.events.push(event);
    if (this.events.length > EVENT_KEEP) this.events.shift();
  }
}

/** A core's position and velocity as the lead sends them (whole units). */
function motion(core: Core): number[] {
  return [...core.position.toArray().map(Math.round), ...core.velocity.toArray().map(Math.round)];
}

/** Where a ship's tow cable is made fast: at its stern (see TOW_STERN). */
function sternOf(ship: Flier, out: THREE.Vector3): THREE.Vector3 {
  return out.set(0, 0, ship.radius * TOW_STERN).applyQuaternion(ship.flight.orientation).add(ship.flight.position);
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

/** A base's place is in rock, in a massive body or in its grip (where its pull alone sounds the CAUTION of the escape gauge, see inGrip). */
function blocked(field: AsteroidField, point: THREE.Vector3) {
  return !!field.overlap(point, BASE_RADIUS * 2) || field.insideWell(point, BASE_RADIUS * 8) || inGrip(field.well, point, WELL_CAUTION);
}
