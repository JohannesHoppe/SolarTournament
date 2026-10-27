import * as THREE from 'three';
import type { AsteroidField, FieldState } from '../world/asteroids';
import { ownerOf, TOURNAMENT_SIZE, type Session, type RoundState, type Vec } from './session';
import type { Ship, ShipState } from '../ship/ship';
import type { WreckState } from '../world/wrecks';
import { unpackItems, type ItemKind, type ProbeState } from '../game/items';
import { Accusations, AIM_SLACK, beamShare, Evidence, ORIGIN_SLACK, Plausibility, plausibleBlast, hookShare, SenderClock, Standings, Strikes, type Cheat, type Margins } from './plausible';
import { devlog, type SuspicionEvent } from '../devlog';
import { HOOK_RANGE } from '../game/hook';
import type { Homing, Torpedo } from '../game/torpedoes';

/** What the online layer needs from the game. */
export interface OnlineGame {
  /** The game's time, on which the ships' motion is predicted (the checks run on real time, see wall). */
  readonly time: number;
  readonly field: AsteroidField;
  /** All ships, local and remote. */
  allShips(): Ship[];
  /** Ships this browser simulates: the own ship and the own bots. */
  ownedShips(): Ship[];
  addRemoteShip(state: ShipState, owner: string): Ship;
  removeShip(ship: Ship): void;
  /** Runs `count` own bots; the first adopt the `heirs`, bots another peer ran, with everything they had. */
  setBotCount(count: number, heirs?: readonly Ship[]): void;
  /** This browser started over in the tournament: the next round clock and field come from the lead browser. */
  rejoin(): void;
  showBeam(shooter: Ship, from: THREE.Vector3, to: THREE.Vector3): void;
  /** A beam from another peer hit a ship this browser simulates. */
  applyLaserHit(target: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null): void;
  /** Another peer reports a destroyed ship; `deaths` counts this death; position and velocity are where it broke up; `nova` when the killer's nova core did it. */
  remoteDestroyed(victim: Ship, killer: Ship | null, deaths: number, position: THREE.Vector3 | null, velocity: THREE.Vector3 | null, nova: boolean): void;
  /** Another peer hit an asteroid at a field time, in an online round. */
  remoteRock(id: string, at: number, round: number): void;
  /** Where a rock of the running round is and how far it reaches: one in the field, or one this browser broke a moment ago; null for none. */
  rockAt(id: string): { position: THREE.Vector3; radius: number } | null;
  /** Where a part of the President's battleship is, while it is in the arena. */
  fleetZoneAt(zone: number): THREE.Vector3 | null;
  /** Another peer shot or rammed a piece of wreckage. */
  remoteWreck(id: string): void;
  /** A ship of another peer hit a part of the President's battleship in a round, this many times (a torpedo counts several). */
  remoteFleetHit(zone: number, round: number, shooter: Ship, count: number): void;
  /** A part of the President's battleship as a torpedo homes on it, by its id. */
  beacon(id: string): Homing | null;
  /** The pieces of wreckage in flight, for a browser that joins. */
  wreckSnapshot(): WreckState[];
  /** Takes the pieces of wreckage in flight from the lead browser. */
  restoreWrecks(wrecks: WreckState[]): void;
  /** The probes taken this round, for a browser that joins. */
  probesTaken(): string[];
  /** The probes in flight, for a browser that joins. */
  probeSnapshot(): ProbeState[];
  /** Takes the probes taken this round from the lead browser: they do not show up here. */
  restoreProbes(taken: string[], probes: ProbeState[]): void;
  /** Takes the lead browser's field, in the arena it names. */
  restoreField(field: FieldState): void;
  /** Another browser's ship launched a torpedo. */
  remoteTorpedo(id: string, shooter: Ship, target: Homing | null, position: THREE.Vector3, velocity: THREE.Vector3): void;
  /** A torpedo went off or was shot down on another browser. */
  remoteTorpedoGone(id: string, position: THREE.Vector3): void;
  /** Another browser's torpedo hit a ship this browser runs. */
  applyTorpedoHit(target: Ship, shooter: Ship | null): void;
  /** A torpedo in flight or gone a moment ago (see Torpedoes.recent). */
  recentTorpedo(id: string): Torpedo | null;
  /**
   * A ship of another browser took a probe, in the third of a race its browser names: what it
   * held, null when this browser did not have the probe, undefined for an id no probe could have.
   */
  remoteProbe(id: string, ship: Ship | null, bucket: number): ItemKind | null | undefined;
  /** Whether a ship is close enough to a probe to take it, as this browser sees them (true for a probe it does not have). */
  probeWithin(id: string, ship: Ship): boolean;
  /** A ship of another browser set off its nova core: this browser's ships near it are gone. */
  novaBlast(holder: Ship, position: THREE.Vector3): void;
  /** A ship of another browser hooked a rock (by id, a point in its frame) or a ship, with this much cable out. */
  remoteHook(owner: Ship, rock: string | null, local: THREE.Vector3 | null, target: Ship | null, length: number): void;
  /** A ship of another browser says its harpoon bit the core of side `team` (Capture the Flag). */
  remoteCoreHook(owner: Ship, team: number): void;
  /** A ship of another browser took a torpedo on its hook (by id, with this much cable out): that browser decides where it goes off from now on. */
  remoteTorpedoHook(owner: Ship, id: string, length: number): void;
  /** A ship of another browser took a sponsor probe on its hook (by id, with this much cable out): it is reeled in to that ship, pulled here from its states. */
  remoteProbeHook(owner: Ship, id: string, length: number): void;
  /** Where a probe is now, as this browser has it; null for one it does not have. */
  probeAt(id: string): THREE.Vector3 | null;
  /** A ship of another browser let go of its hook. */
  remoteUnhook(owner: Ship): void;
  /** Several browsers found a Host cheating. */
  announceCheater(name: string): void;
  /** Number of the running online round. */
  readonly roundId: number;
  /** Seconds since the running round started (0 while it is not known), and on the race clock (since BURN!). */
  roundSeconds(): number;
  raceSeconds(): number;
  /** The lead browser's round clock and field time. */
  syncRound(round: RoundState): void;
  leadRound(): RoundState;
  /**
   * All places are taken by Hosts who were here first: the own clone watches instead of flying
   * (true), or a place has come free and it flies (false).
   */
  spectate(watching: boolean): void;
}

/**
 * A report of a hit counts with a beam that ended, or a torpedo that went off, within this much
 * of what it hit (units, 1 km): rocks turn and drift, the battleship moves, messages lag.
 */
const EVIDENCE_REACH = AIM_SLACK;
/** A kill counts without a beam or torpedo of the killer when it was this close to its victim (units, 1.5 km): a drive plume burns at 150 m, a nova core reaches 800 m. */
const KILL_NEAR = 30000;
/** A nova core set off is evidence for its kills this long (s): the victims' browsers tell of them a moment later. */
const NOVA_EVIDENCE = 5;
/** A ship this browser runs may be hooked this far beyond the hook's reach (units, 500 m), for lag. */
const HOOK_LAG = 10000;
/** Failed checks kept in Online.suspicions. */
const SUSPICIONS_KEPT = 200;

/**
 * The clock of every check and every piece of evidence (s): real time, as the others' messages
 * arrive in it. The game's time runs slower on a device below 20 frames a second, and windows
 * measured in it (a respawn's delay, a beam's age) would come out wrong there.
 */
const wall = () => performance.now() / 1000;
/** A ship's start over clears what the checks know of its clone at most once in this long (s); the field goes to it every time. */
const REPRINT_GAP = 10;

const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();

/** Connects the game to a tournament session: who owns which ship, and what goes over the wire. */
export class Online {
  private wasLead: boolean | null = null;
  /** The number of pilots the bots were last balanced for. */
  private balancedFor = -1;
  /** A newcomer arrived: the next states carry everything (see Ship.toState). */
  private sendFull = false;
  /** The own Host only watches: the tournament was full when it came. */
  private watching = false;
  /** Peers whose clone flies (their states carry a Host's ship); watchers do not take a place. */
  private readonly flying = new Set<string>();
  /** What other browsers report is checked for the impossible; a peer several browsers catch is named. */
  private readonly plausible = new Plausibility();
  /** What the other browsers' ships did, as everyone sees it: what a report of theirs needs to count. */
  private readonly evidence = new Evidence();
  private readonly accusations = new Accusations();
  /** What each ship of another browser did that no ship can; a peer is reported only for a ship that does it again and again. */
  private readonly strikes = new Strikes();
  /** When the other browsers sent their states, on their own clocks. */
  private readonly clock = new SenderClock();
  /** How far the other browsers' ships stand in the round, as fast as a ship gets there. */
  private readonly standings = new Standings();
  /** Peers this browser has reported this round, once each. */
  readonly reported = new Set<string>();
  /** Every check a ship of another browser failed, whether it led to a report or not (the latest SUSPICIONS_KEPT), for the browser tests and the console. */
  readonly suspicions: SuspicionEvent[] = [];
  /** When each ship of another browser last set off a nova core, as this browser took it. */
  private readonly novas = new Map<string, number>();
  /** The round the checks were last reset for. */
  private checkedRound = Number.NaN;
  /** When the checks last took up each peer's start over (see REPRINT_GAP). */
  private readonly reprintedAt = new Map<string, number>();

  constructor(
    readonly session: Session,
    private readonly game: OnlineGame,
    /** The room's rule: bots fill the places no Host takes. */
    private readonly bots: boolean,
  ) {
    session.onStates = (states, round, peer, sent) => this.receiveStates(states, round, peer, sent);
    session.onFire = (shooter, a, b) => {
      from.fromArray(a);
      to.fromArray(b);
      const ship = this.find(shooter);
      // only a ship that is here fires (what a made-up id did is not kept)
      if (!ship) return;
      // a living ship's beam leaves from near where it flies here, or it is no beam of its; the
      // next state of the ship judges whether it left along a nose the ship could have had
      if (ship.alive && ship.owner !== null) {
        if (this.caught(ship, this.plausible.measure('aim', from.distanceTo(ship.flight.position) / ORIGIN_SLACK) ? 'aim' : null)) return;
        this.plausible.beam(shooter, from, to);
      }
      this.evidence.beam(shooter, from, to, wall());
      game.showBeam(ship, from, to);
    };
    session.onHit = (target, o, d, shooter) => {
      const ship = this.find(target);
      const gun = this.find(shooter);
      // only a living shooter hits, with a beam from near it past the ship, and only ships this
      // browser runs take damage here
      if (!ship || ship.owner !== null || !gun?.alive) return;
      origin.fromArray(o);
      direction.fromArray(d).normalize();
      if (this.caught(gun, this.plausible.measure('hit', beamShare(origin, direction, gun.flight.position, ship.flight.position)) ? 'hit' : null)) return;
      // a rock between the muzzle and the ship, as this browser sees them, takes the beam: lag may
      // let one slip in, so a blocked beam is only lost, not a cheat
      if (game.field.lineOfSight(origin, ship.flight.position)) game.applyLaserHit(ship, origin, direction, gun);
    };
    session.onDestroyed = (victim, killer, deaths, p, u, nova) => {
      const ship = this.find(victim);
      // a ship dies once per clone: only a ship that is here and alive, its count of deaths going
      // up; any other report changes nothing, and credits no killer either
      if (!ship || ship.owner === null || !ship.alive || deaths <= ship.deaths) return;
      const gun = killer === null ? null : this.find(killer);
      const where = p ? from.fromArray(p) : ship.flight.position;
      // the kill counts for the killer, a ship that is here, only with evidence that it could have made it
      const credited = killer !== null && gun !== null && this.witnessed(killer, victim, where, nova) ? killer : null;
      // the kills its states may show: every death another browser than the killer's names it
      // for counts (that browser saw it die by it); one of its own browser's ships only with
      // that evidence (a lead browser's Host or bot killing one of its bots)
      const counted = killer !== null && gun !== null && (credited !== null || ownerOf(killer) !== ownerOf(victim)) ? killer : null;
      this.credit(victim, counted, nova && counted !== null);
      this.plausible.died(victim, wall());
      game.remoteDestroyed(ship, credited ? gun : null, deaths, p && from.fromArray(p), u && to.fromArray(u), nova && credited !== null);
    };
    session.onRock = (id, at, round, shooter) => {
      // a rock of the running round breaks only for a beam of the shooter that ended on it (a
      // browser that has only just come, without the beams before, takes it on trust)
      const rock = round === game.roundId ? game.rockAt(id) : null;
      if (rock && !this.session.justJoined && !this.evidence.beamEnded(shooter, rock.position, rock.radius + EVIDENCE_REACH, wall())) return;
      game.remoteRock(id, at, round);
    };
    session.onWreck = (id) => game.remoteWreck(id);
    session.onFleetHit = (zone, round, shooter, count) => {
      // a living shooter's beam that ended on the part, or a torpedo that went off there (also
      // one whose shooter died while it flew)
      const ship = this.find(shooter);
      if (!ship) return;
      const part = round === game.roundId ? game.fleetZoneAt(zone) : null;
      if (!this.evidence.fleetHit(shooter, ship.alive, part, count, EVIDENCE_REACH, this.session.justJoined, wall())) return;
      game.remoteFleetHit(zone, round, ship, count);
    };
    session.onTorpedo = (id, shooter, target, p, v) => {
      const ship = this.find(shooter);
      // launched from near where the ship flies here, and no more than its clone carries
      from.fromArray(p);
      if (!ship?.alive || this.caught(ship, this.plausible.measure('aim', from.distanceTo(ship.flight.position) / ORIGIN_SLACK) ? 'aim' : null)) return;
      if (this.caught(ship, this.plausible.torpedo(ship.id, wall()))) return;
      this.evidence.launch(shooter, wall());
      game.remoteTorpedo(id, ship, target ? (this.find(target) ?? game.beacon(target)) : null, from.fromArray(p), to.fromArray(v));
    };
    session.onTorpedoGone = (id, p, shooter, holder) => {
      from.fromArray(p);
      // the browser that launched it says where it went off, or the one whose ship took it on
      // its hook (as this browser heard); another one only shot it down with a beam that ended there
      if (holder !== null) {
        const torpedo = game.recentTorpedo(id);
        if (!torpedo || (torpedo.holder?.id !== holder && torpedo.flinger?.id !== holder)) return;
        this.evidence.blast(holder, from, wall());
      } else if (shooter === null) {
        const launcher = id.slice(0, id.lastIndexOf('.'));
        if (this.find(launcher)) this.evidence.blast(launcher, from, wall());
      } else if (!this.evidence.beamEnded(shooter, from, EVIDENCE_REACH, wall())) return;
      game.remoteTorpedoGone(id, from);
    };
    session.onProbe = (id, ship, bucket) => {
      const taker = this.find(ship);
      // taken only by a ship near the probe, as this browser sees them; one refused here (lag may
      // have put the taker too far) may still have held a nova core it sets off later. The checks
      // count each probe once (see Plausibility.probe), and only for a ship that is here
      if (taker && !game.probeWithin(id, taker)) {
        this.plausible.probe(ship, id, null, wall());
        return;
      }
      const kind = game.remoteProbe(id, taker, bucket);
      if (kind !== undefined && taker) this.plausible.probe(ship, id, kind, wall());
    };
    session.onHook = (ship, hold) => {
      const owner = this.find(ship);
      if (!owner) return;
      if (!hold) {
        game.remoteUnhook(owner);
        return;
      }
      // a core: the lead's rules decide whether it is taken (from where they see ship and core)
      if (hold.core !== null) {
        game.remoteCoreHook(owner, hold.core);
        return;
      }
      // a torpedo: only one within the hook's reach of the ship, as this browser sees them
      if (hold.torpedo !== null) {
        const torpedo = game.recentTorpedo(hold.torpedo);
        if (!torpedo || this.caught(owner, this.plausible.measure('hook', hookShare(owner.flight.position, torpedo.position)) ? 'hook' : null)) return;
        game.remoteTorpedoHook(owner, hold.torpedo, hold.length);
        return;
      }
      // a probe: only a living ship's, one within the hook's reach as this browser sees them,
      // and on a cable at least as long as the way between them (a cable said to be short would
      // yank it aboard at once); a probe this browser no longer has was taken already
      if (hold.probe !== null) {
        const probe = game.probeAt(hold.probe);
        if (!probe || !owner.alive || this.caught(owner, this.plausible.measure('hook', hookShare(owner.flight.position, probe)) ? 'hook' : null)) return;
        game.remoteProbeHook(owner, hold.probe, Math.max(hold.length, owner.flight.position.distanceTo(probe)));
        return;
      }
      const target = hold.target ? this.find(hold.target) : null;
      let length = hold.length;
      if (target?.owner === null) {
        // a ship this browser runs is hooked only within the hook's reach, and the cable is at
        // least as long as the way between them: a cable said to be short would yank it across
        const distance = owner.flight.position.distanceTo(target.flight.position);
        if (distance > HOOK_RANGE + HOOK_LAG) return;
        length = Math.max(length, distance);
      }
      game.remoteHook(owner, hold.rock, hold.local ? from.fromArray(hold.local) : null, target, length);
    };
    // a nova only from a living ship that holds a core, where it is; anything else never goes off
    session.onNova = (ship, p) => {
      const holder = this.find(ship);
      if (!holder?.alive || this.caught(holder, this.plausible.nova(holder.id, p, wall(), this.clock.now(holder.owner ?? '', wall())))) return;
      this.novas.set(ship, wall());
      game.novaBlast(holder, from.fromArray(p));
    };
    session.onCheat = (ship, accuser) => {
      // only a browser in the room (or this one) can be accused: made-up peers are not kept
      const accused = ownerOf(ship);
      if (accused && (accused === this.selfId || this.session.peers.includes(accused))) this.accuse(accused, accuser);
    };
    session.onTorpedoHit = (target, shooter, id) => {
      const ship = this.find(target);
      // only ships this browser runs take damage here, and only from a torpedo of that shooter
      // (or of the ship that held it on its hook, see FLING_CREDIT) that flew here too and went
      // off near the ship
      if (!ship || ship.owner !== null) return;
      const gun = this.find(shooter);
      const torpedo = game.recentTorpedo(id);
      if (!gun || this.caught(gun, torpedo && [torpedo.shooter, torpedo.holder, torpedo.flinger].includes(gun) && plausibleBlast(torpedo.position, ship.flight.position) ? null : 'hit')) return;
      game.applyTorpedoHit(ship, gun);
    };
    session.onSync = (field, wrecks, probesTaken, probes) => {
      game.restoreField(field);
      game.restoreWrecks(wrecks);
      game.restoreProbes(probesTaken, probes);
    };
    session.onPeerJoin = (peer) => {
      // the lead browser brings the newcomer's asteroid field and wreckage up to date;
      // everyone tells it the names and scores of their ships with the next states
      this.sync(peer);
      this.sendFull = true;
      this.balanceBots();
    };
    session.onPeerRestart = (peer) => {
      // a browser that started over takes the field again, like a newcomer, and may print its
      // clone again (the checks take that up at most once in REPRINT_GAP); what its ships did
      // before still counts
      this.sync(peer);
      this.sendFull = true;
      const now = wall();
      if (now - (this.reprintedAt.get(peer) ?? -Infinity) < REPRINT_GAP) return;
      this.reprintedAt.set(peer, now);
      for (const ship of game.allShips()) if (ownerOf(ship.id) === peer) this.plausible.reprint(ship.id, now);
    };
    session.onRestart = () => {
      game.rejoin();
      // this browser heard nothing for a while: every ship may be anywhere now, what they hold stands
      this.plausible.lostSight(wall());
    };
    session.onPeerLeave = (peer) => {
      this.flying.delete(peer);
      this.forgetShipsOf(peer);
      this.accusations.forget(peer);
      // a lead browser that leaves hands its bots to the next one before its ships go
      this.followLead();
      for (const ship of [...game.allShips()]) if (ship.owner === peer) game.removeShip(ship);
      this.balanceBots();
    };
  }

  get selfId() {
    return this.session.selfId;
  }

  get isLead() {
    return this.session.isLead;
  }

  /** Hosts whose clones fly, the own one included unless it watches; a silent peer's clone does not count. */
  get pilots() {
    let pilots = this.watching ? 0 : 1;
    for (const peer of this.flying) if (!this.session.isSilent(peer)) pilots++;
    return Math.min(pilots, TOURNAMENT_SIZE);
  }

  /** Sends the own ships; the lead browser adds the round clock. Rebalances bots when the lead changes. */
  update(now: number) {
    this.session.tick();
    this.followRound();
    // a Host beyond the places of the tournament watches, and flies as soon as a place comes free
    const watching = this.session.rank() >= TOURNAMENT_SIZE;
    if (watching !== this.watching) {
      this.watching = watching;
      this.game.spectate(watching);
    }
    // the ships of a peer that went quiet (a hidden tab) leave every screen until it sends again
    for (const ship of this.game.allShips()) {
      if (ship.owner !== null && ship.alive && this.session.isSilent(ship.owner)) {
        ship.alive = false;
        ship.root.visible = false;
      }
    }
    this.followLead();
    // the bots of a browser that no longer leads are gone; the new lead has adopted them (while
    // this browser does not know the lead yet, the bots it sees stay)
    const lead = this.session.leadId;
    const known = lead !== this.selfId || this.isLead;
    for (const ship of this.game.allShips()) if (known && ship.owner !== null && ship.owner !== lead && ship.id.startsWith('b:')) this.game.removeShip(ship);
    // the lead browser keeps its round clock every frame; the states go out at their own rate
    const round = this.isLead ? this.game.leadRound() : null;
    if (!this.session.statesDue(now)) return;
    this.session.sendStates(
      now,
      this.game.ownedShips().map((ship) => ship.toState(now, this.sendFull)),
      round,
    );
    this.sendFull = false;
  }

  sendFire(shooter: Ship, a: THREE.Vector3, b: THREE.Vector3) {
    this.session.sendFire(shooter.id, round(a), round(b));
  }

  /** Tells the owner of a remote ship that a beam went through it. */
  sendHit(target: Ship, o: THREE.Vector3, d: THREE.Vector3, shooter: Ship) {
    if (target.owner) this.session.sendHit(target.owner, target.id, round(o), d.toArray().map((x) => +x.toFixed(5)), shooter.id);
  }

  sendDestroyed(victim: Ship, killer: Ship | null, nova: boolean) {
    this.credit(victim.id, killer?.id ?? null, nova);
    this.session.sendDestroyed(victim.id, killer?.id ?? null, victim.deaths, round(victim.flight.position), round(victim.flight.velocity), nova);
  }

  sendRock(id: string, at: number, round: number, shooter: Ship) {
    this.session.sendRock(id, at, round, shooter.id);
  }

  sendWreck(id: string) {
    this.session.sendWreck(id);
  }

  sendFleetHit(zone: number, round: number, shooter: Ship, count: number) {
    this.session.sendFleetHit(zone, round, shooter.id, count);
  }

  sendTorpedo(id: string, shooter: Ship, target: Homing | null, position: THREE.Vector3, velocity: THREE.Vector3) {
    this.session.sendTorpedo(id, shooter.id, target?.id ?? null, round(position), round(velocity));
  }

  sendNova(ship: Ship, position: THREE.Vector3) {
    this.session.sendNova(ship.id, round(position));
  }

  /** A ship of this browser hooked a rock (a point in its frame), a ship, a core of Capture the Flag (its side, for the lead's rules) a torpedo (by id: this browser decides where it goes off from now on) or a sponsor probe (by id: every browser reels it in on that cable), or let go (null). */
  sendHook(ship: Ship, hold: { rock: string; local: THREE.Vector3 } | { target: Ship } | { core: number } | { torpedo: string } | { probe: string } | null, length = 0) {
    if (!hold) this.session.sendHook(ship.id, null);
    else if ('rock' in hold) this.session.sendHook(ship.id, { rock: hold.rock, local: round(hold.local) }, Math.round(length));
    else if ('core' in hold || 'torpedo' in hold || 'probe' in hold) this.session.sendHook(ship.id, hold, Math.round(length));
    else this.session.sendHook(ship.id, { target: hold.target.id }, Math.round(length));
  }

  sendProbe(id: string, ship: Ship, bucket: number) {
    this.session.sendProbe(id, ship.id, bucket);
  }

  /** A torpedo of this browser went off (`shooter` null; `holder` the own ship whose hook took it, if one did), or an own ship shot one down. */
  sendTorpedoGone(id: string, position: THREE.Vector3, shooter: Ship | null, holder: Ship | null = null) {
    this.session.sendTorpedoGone(id, round(position), shooter?.id ?? null, holder?.id ?? null);
  }

  /** Tells the browser that runs a remote ship that an own torpedo hit it. */
  sendTorpedoHit(target: Ship, shooter: Ship, torpedo: string) {
    if (target.owner) this.session.sendTorpedoHit(target.owner, target.id, shooter.id, torpedo);
  }

  /** The lead browser hands a newcomer, or a browser that started over, the field and the wreckage. */
  private sync(peer: string) {
    if (this.session.isLead) this.session.sendSync(peer, this.game.field.snapshot(), this.game.wreckSnapshot(), this.game.probesTaken(), this.game.probeSnapshot());
  }

  leave() {
    this.session.leave();
  }

  /** Rebalances the bots when the lead or the number of pilots changed. */
  private followLead() {
    const lead = this.isLead;
    const pilots = this.pilots;
    if (this.wasLead === lead && this.balancedFor === pilots) return;
    this.wasLead = lead;
    this.balancedFor = pilots;
    this.balanceBots();
  }

  /**
   * In a room with bots the lead browser fills the free places with them; a Host always takes
   * a bot's place. A browser that has just become the lead adopts the bots of the one before
   * it, so they fly on with their scores, damage and positions.
   */
  private balanceBots() {
    const lead = this.isLead;
    const heirs = lead ? this.game.allShips().filter((ship) => ship.owner !== null && ship.id.startsWith('b:')) : [];
    this.game.setBotCount(lead && this.bots ? Math.max(0, TOURNAMENT_SIZE - this.pilots) : 0, heirs);
  }

  /**
   * A new round prints every ship again and starts the kills over; what was said of cheats in
   * the last round goes with it (see Accusations.newRound), and so do the strikes.
   */
  private followRound() {
    if (this.game.roundId === this.checkedRound) return;
    this.checkedRound = this.game.roundId;
    this.plausible.newRound(wall());
    this.standings.newRound();
    this.accusations.newRound();
    this.strikes.newRound();
    this.reported.clear();
  }

  private receiveStates(states: ShipState[], round: RoundState | null, peer: string, clock: number | null) {
    const now = wall();
    // when the peer sent them, on its own clock (a peer that names no time: when they came)
    const sent = clock === null ? now : this.clock.sent(peer, clock, now);
    // a peer that started over hands its bots to the next lead before they are gone
    this.followLead();
    const lead = this.session.leadId;
    // the lead's round first: the states of a new round's first moment, its ships printed
    // anew, are judged as the new round's, not against where the ships flew in the last
    if (round && peer === lead) {
      this.game.syncRound(round);
      this.followRound();
    }
    const seen = new Set<string>();
    for (const state of states) {
      // only the lead browser runs bots: those of a peer that just stopped leading are gone
      if (state.id.startsWith('b:') && peer !== lead) continue;
      seen.add(state.id);
      // the session only passes on ships whose id names the sender as their owner; a ship
      // first shows once a state brings its name and type
      const known = this.find(state.id);
      if (!known && state.n === undefined) continue;
      // score, gates and finish as fast as a ship makes them (see Standings), on the race clock
      // of when the state was sent
      if (state.n !== undefined) {
        const race = this.game.raceSeconds() - (clock === null ? 0 : this.clock.age(peer, sent, now));
        ({ s: state.s, g: state.g, fi: state.fi } = this.standings.take(state.id, { s: state.s!, g: state.g!, fi: state.fi! }, now, this.game.roundSeconds(), race));
      }
      const ship = known ?? this.game.addRemoteShip(state, peer);
      if (ship.owner !== peer || ownerOf(ship.id) !== peer) continue;
      const report = { p: state.p, alive: state.a, kills: state.ki, nova: state.it === undefined ? undefined : unpackItems(state.it).nova, q: state.q, w: state.w };
      for (const cheat of this.plausible.state(ship.id, report, now, sent)) this.caught(ship, cheat);
      // a peer cast out by this very state is gone: nothing more of it is taken
      if (this.session.isCastOut(peer)) return;
      ship.applyState(state, this.game.time);
    }
    const flies = states.some((state) => state.id.startsWith('p:'));
    if (flies !== this.flying.has(peer)) {
      if (flies) this.flying.add(peer);
      else this.flying.delete(peer);
      this.balanceBots();
    }
    // bots the peer no longer runs (e.g. it stopped leading)
    for (const ship of [...this.game.allShips()]) if (ship.owner === peer && !seen.has(ship.id)) this.game.removeShip(ship);
  }

  /**
   * Whether a ship could have killed another that died at `where`: one this browser runs did it
   * here; another needs a beam of its that passed there, a torpedo of its in flight, its nova
   * core set off, or to have been close, now or in the last seconds (a shove that sent the
   * victim into a rock).
   */
  private witnessed(killer: string, victim: string, where: THREE.Vector3, nova: boolean): boolean {
    const ship = this.find(killer);
    if (ship?.owner === null) return true;
    const now = wall();
    const near = (ship !== null && ship.flight.position.distanceTo(where) < KILL_NEAR) || this.plausible.met(killer, victim, KILL_NEAR);
    if (nova) return near || now - (this.novas.get(killer) ?? -Infinity) < NOVA_EVIDENCE;
    return near || this.evidence.beamPassed(killer, where, now) || this.evidence.launched(killer, now);
  }

  /** A death everyone saw: its killer's kills grow, by two for a nova, and a nova's victim loses one. */
  private credit(victim: string, killer: string | null, nova: boolean) {
    const now = wall();
    if (killer) this.plausible.credit(killer, nova ? 2 : 1, now);
    if (nova) this.plausible.credit(victim, -1, now);
  }

  /** What the checks measured closest to a cheat so far (see Plausibility.margins), for the browser tests and the console. */
  get margins(): Margins {
    return this.plausible.margins;
  }

  /**
   * A ship of another browser did the impossible (or not, `cheat` null): what it did is
   * rejected, and once it did it again and again (see Strikes) this browser reports its peer,
   * once a round. Every failed check is kept in `suspicions` and the development log.
   */
  private caught(ship: Ship, cheat: Cheat | null): boolean {
    if (!cheat) return false;
    const accused = ownerOf(ship.id);
    if (!accused || accused === this.selfId) return true;
    const now = wall();
    const enough = this.strikes.add(ship.id, cheat, now);
    // a watching Host rejects what it can, but has no vote (see accuse)
    const report = enough && !this.reported.has(accused) && !this.watching;
    const suspicion: SuspicionEvent = { kind: 'suspicion', t: this.game.time, ship: ship.name, cheat, strikes: this.strikes.count(ship.id, cheat), share: +(this.plausible.lastShares[cheat] ?? 0).toFixed(2), round: this.game.roundId, reported: report };
    this.suspicions.push(suspicion);
    if (this.suspicions.length > SUSPICIONS_KEPT) this.suspicions.shift();
    devlog?.add(suspicion);
    console.warn(`SolarTournament: ${ship.name} (${ship.id}) failed the ${cheat} check (${suspicion.strikes} of late)`);
    if (report) {
      this.reported.add(accused);
      this.session.sendCheat(ship.id, cheat);
      this.accuse(accused, this.selfId);
    }
    return true;
  }

  /**
   * The Hosts with a vote on cheaters: those that hold one of the tournament's places by the
   * time they came (see Session.seated) and still send. A browser's word that it flies buys no
   * vote: watching Hosts, however many tabs, have none.
   */
  private get voters() {
    let voters = this.session.seated(this.selfId) ? 1 : 0;
    for (const peer of this.session.peers) if (this.session.seated(peer) && !this.session.isSilent(peer)) voters++;
    return voters;
  }

  /**
   * One browser more says a peer cheats; once enough do, everyone here is told who, and the
   * peer is cast out: this browser sends it nothing more and takes nothing from it, its ships
   * leave this tournament as if it had gone. Only the Hosts who hold a place vote, and the
   * majority is counted among them: a cheater who comes in to watch, with as many tabs as it
   * likes, has no say. Every honest browser comes to the same vote, so the cheater is left
   * alone. Votes carry no evidence, so a browser never casts itself out on the others' word: it
   * sees its own callsign called and plays on with whoever still listens to it (a cheater's
   * browser would ignore the call all the same).
   */
  private accuse(accused: string, accuser: string) {
    if (!this.accusations.add(accused, accuser, this.session.seated(accuser), this.voters)) return;
    const ships = this.game.allShips().filter((ship) => ship.owner === accused || (accused === this.selfId && ship.owner === null));
    const host = ships.find((ship) => ship.id.startsWith('p:')) ?? ships[0];
    this.game.announceCheater(host?.name ?? accused);
    if (accused !== this.selfId) this.session.castOut(accused);
  }

  /** A peer left: what this browser knows of its ships goes with it, by their ids (whatever ids it named). */
  private forgetShipsOf(peer: string) {
    const gone = (id: string) => ownerOf(id) === peer;
    this.plausible.forget(gone);
    this.standings.forget(gone);
    this.evidence.forget(gone);
    this.strikes.forget(gone);
    for (const id of this.novas.keys()) if (gone(id)) this.novas.delete(id);
  }

  private find(id: string): Ship | null {
    return this.game.allShips().find((ship) => ship.id === id) ?? null;
  }
}

const round = (v: THREE.Vector3): Vec => v.toArray().map(Math.round);

/**
 * The peer a ship's ping is measured to, read from its id: a bot's id embeds the peer that runs
 * it, always the lead browser (only the lead runs bots), a Host's id its own peer. Null for a
 * ship this very browser runs, its own clone or, while it leads, its own bots: there is no link
 * to oneself.
 */
export function pingPeerOf(shipId: string, selfId: string): string | null {
  const peer = ownerOf(shipId);
  return peer === selfId ? null : peer;
}

/** Whether a Host's ship (never a bot) belongs to the browser that leads the tournament: it runs the round and the bots. */
export function isLeadHost(shipId: string, leadId: string): boolean {
  return shipId.startsWith('p:') && ownerOf(shipId) === leadId;
}
