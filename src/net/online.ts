import * as THREE from 'three';
import type { AsteroidField, FieldState } from '../world/asteroids';
import { ownerOf, TOURNAMENT_SIZE, type Session, type RoundState, type Vec } from './session';
import type { Ship, ShipState } from '../ship/ship';
import type { WreckState } from '../world/wrecks';
import { unpackItems, type ItemKind, type ProbeState } from '../game/items';
import { Accusations, AIM_SLACK, Evidence, Plausibility, plausibleBeam, plausibleBlast, type Cheat } from './plausible';
import { HOOK_RANGE } from '../game/hook';
import type { Homing, Torpedo } from '../game/torpedoes';

/** What the online layer needs from the game. */
export interface OnlineGame {
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
  /** The other browsers named this one a cheater and cast it out: it leaves the tournament. */
  castOut(): void;
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
  /** A ship of another browser let go of its hook. */
  remoteUnhook(owner: Ship): void;
  /** Several browsers found a Host cheating. */
  announceCheater(name: string): void;
  /** Number of the running online round. */
  readonly roundId: number;
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
  /** Peers this browser has reported, once each. */
  private readonly reported = new Set<string>();
  /** When each ship of another browser last set off a nova core, as this browser took it. */
  private readonly novas = new Map<string, number>();
  /** The round the checks were last reset for. */
  private checkedRound = Number.NaN;

  constructor(
    readonly session: Session,
    private readonly game: OnlineGame,
    /** The room's rule: bots fill the places no Host takes. */
    private readonly bots: boolean,
  ) {
    session.onStates = (states, round, peer) => this.receiveStates(states, round, peer);
    session.onFire = (shooter, a, b) => {
      from.fromArray(a);
      to.fromArray(b);
      this.evidence.beam(shooter, from, to, game.time);
      const ship = this.find(shooter);
      if (ship) game.showBeam(ship, from, to);
    };
    session.onHit = (target, o, d, shooter) => {
      const ship = this.find(target);
      const gun = this.find(shooter);
      // only a living shooter hits, with a beam from near it past the ship, and only ships this
      // browser runs take damage here
      if (!ship || ship.owner !== null || !gun?.alive) return;
      origin.fromArray(o);
      direction.fromArray(d).normalize();
      if (this.caught(gun, plausibleBeam(origin, direction, gun.flight.position, ship.flight.position) ? null : 'hit')) return;
      // a rock between the muzzle and the ship, as this browser sees them, takes the beam: lag may
      // let one slip in, so a blocked beam is only lost, not a cheat
      if (game.field.lineOfSight(origin, ship.flight.position)) game.applyLaserHit(ship, origin, direction, gun);
    };
    session.onDestroyed = (victim, killer, deaths, p, u, nova) => {
      const ship = this.find(victim);
      const where = p ? from.fromArray(p) : (ship?.flight.position ?? null);
      // the kill counts for the killer only with evidence that it could have made it
      const credited = killer !== null && where !== null && this.witnessed(killer, where, nova) ? killer : null;
      this.credit(victim, credited, nova && credited !== null);
      this.plausible.died(victim, game.time);
      // a ship dies once per clone: a dead one cannot die again, and the count only goes up
      if (ship && ship.owner !== null && ship.alive && deaths > ship.deaths) {
        game.remoteDestroyed(ship, credited ? this.find(credited) : null, deaths, p && from.fromArray(p), u && to.fromArray(u), nova && credited !== null);
      }
    };
    session.onRock = (id, at, round, shooter) => {
      // a rock of the running round breaks only for a beam of the shooter that ended on it (a
      // browser that has only just come, without the beams before, takes it on trust)
      const rock = round === game.roundId ? game.rockAt(id) : null;
      if (rock && !this.session.justJoined && !this.evidence.beamEnded(shooter, rock.position, rock.radius + EVIDENCE_REACH, game.time)) return;
      game.remoteRock(id, at, round);
    };
    session.onWreck = (id) => game.remoteWreck(id);
    session.onFleetHit = (zone, round, shooter, count) => {
      // only a living shooter hits, with a beam that ended on the part, or a torpedo that went off there
      const ship = this.find(shooter);
      if (!ship?.alive) return;
      const part = round === game.roundId ? game.fleetZoneAt(zone) : null;
      if (part && !this.session.justJoined) {
        const seen = count > 1 ? this.evidence.blasted(shooter, part, EVIDENCE_REACH, game.time) : this.evidence.beamEnded(shooter, part, EVIDENCE_REACH, game.time);
        if (!seen) return;
      }
      game.remoteFleetHit(zone, round, ship, count);
    };
    session.onTorpedo = (id, shooter, target, p, v) => {
      const ship = this.find(shooter);
      if (!ship?.alive || this.caught(ship, this.plausible.torpedo(ship.id, game.time))) return;
      this.evidence.launch(shooter, game.time);
      game.remoteTorpedo(id, ship, target ? (this.find(target) ?? game.beacon(target)) : null, from.fromArray(p), to.fromArray(v));
    };
    session.onTorpedoGone = (id, p, shooter) => {
      from.fromArray(p);
      // the browser that launched it says where it went off; another one only shot it down with
      // a beam that ended there
      if (shooter === null) this.evidence.blast(id.slice(0, id.lastIndexOf('.')), from, game.time);
      else if (!this.evidence.beamEnded(shooter, from, EVIDENCE_REACH, game.time)) return;
      game.remoteTorpedoGone(id, from);
    };
    session.onProbe = (id, ship, bucket) => {
      const taker = this.find(ship);
      // taken only by a ship near the probe, as this browser sees them
      if (taker && !game.probeWithin(id, taker)) return;
      const kind = game.remoteProbe(id, taker, bucket);
      if (kind !== undefined) this.plausible.probe(ship, kind, game.time);
    };
    session.onHook = (ship, hold) => {
      const owner = this.find(ship);
      if (!owner) return;
      if (!hold) {
        game.remoteUnhook(owner);
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
      if (!holder?.alive || this.caught(holder, this.plausible.nova(holder.id, p, game.time))) return;
      this.novas.set(ship, game.time);
      game.novaBlast(holder, from.fromArray(p));
    };
    session.onCheat = (ship, _cheat, accuser) => {
      const accused = ownerOf(ship);
      if (accused) this.accuse(accused, accuser);
    };
    session.onTorpedoHit = (target, shooter, id) => {
      const ship = this.find(target);
      // only ships this browser runs take damage here, and only from a torpedo of that shooter
      // that flew here too and went off near the ship
      if (!ship || ship.owner !== null) return;
      const gun = this.find(shooter);
      const torpedo = game.recentTorpedo(id);
      if (!gun || this.caught(gun, torpedo?.shooter === gun && plausibleBlast(torpedo.position, ship.flight.position) ? null : 'hit')) return;
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
      // a browser that started over takes the field again, like a newcomer, and prints its clone
      // again; what its ships did before still counts
      this.sync(peer);
      this.sendFull = true;
      for (const ship of game.allShips()) if (ownerOf(ship.id) === peer) this.plausible.reprint(ship.id, game.time);
    };
    session.onRestart = () => {
      game.rejoin();
      this.plausible.newRound(game.time);
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

  get spectating() {
    return this.watching;
  }

  /** Sends the own ships; the lead browser adds the round clock. Rebalances bots when the lead changes. */
  update(now: number) {
    this.session.tick();
    // a new round prints every ship again and starts the kills over
    if (this.game.roundId !== this.checkedRound) {
      this.checkedRound = this.game.roundId;
      this.plausible.newRound(this.game.time);
    }
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

  /** A ship of this browser hooked a rock (a point in its frame) or a ship, or let go (null). */
  sendHook(ship: Ship, hold: { rock: string; local: THREE.Vector3 } | { target: Ship } | null, length = 0) {
    if (!hold) this.session.sendHook(ship.id, null);
    else if ('rock' in hold) this.session.sendHook(ship.id, { rock: hold.rock, local: round(hold.local) }, Math.round(length));
    else this.session.sendHook(ship.id, { target: hold.target.id }, Math.round(length));
  }

  sendProbe(id: string, ship: Ship, bucket: number) {
    this.session.sendProbe(id, ship.id, bucket);
  }

  /** A torpedo of this browser went off (`shooter` null), or an own ship shot one down. */
  sendTorpedoGone(id: string, position: THREE.Vector3, shooter: Ship | null) {
    this.session.sendTorpedoGone(id, round(position), shooter?.id ?? null);
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

  private receiveStates(states: ShipState[], round: RoundState | null, peer: string) {
    const now = this.game.time;
    // a peer that started over hands its bots to the next lead before they are gone
    this.followLead();
    const lead = this.session.leadId;
    const seen = new Set<string>();
    for (const state of states) {
      // only the lead browser runs bots: those of a peer that just stopped leading are gone
      if (state.id.startsWith('b:') && peer !== lead) continue;
      seen.add(state.id);
      // the session only passes on ships whose id names the sender as their owner; a ship
      // first shows once a state brings its name and type
      const known = this.find(state.id);
      if (!known && state.n === undefined) continue;
      const ship = known ?? this.game.addRemoteShip(state, peer);
      if (ship.owner !== peer || ownerOf(ship.id) !== peer) continue;
      const report = { p: state.p, alive: state.a, kills: state.ki, nova: state.it === undefined ? undefined : unpackItems(state.it).nova };
      // a peer cast out by this very state is gone: nothing more of it is taken
      if (this.caught(ship, this.plausible.state(ship.id, report, now)) && this.session.isCastOut(peer)) return;
      ship.applyState(state, now);
    }
    const flies = states.some((state) => state.id.startsWith('p:'));
    if (flies !== this.flying.has(peer)) {
      if (flies) this.flying.add(peer);
      else this.flying.delete(peer);
      this.balanceBots();
    }
    // bots the peer no longer runs (e.g. it stopped leading)
    for (const ship of [...this.game.allShips()]) if (ship.owner === peer && !seen.has(ship.id)) this.game.removeShip(ship);
    if (round && peer === lead) this.game.syncRound(round);
  }

  /**
   * Whether a ship could have killed another that died at `where`: one this browser runs did it
   * here; another needs a beam of its that passed there, a torpedo of its in flight, its nova
   * core set off, or to have been close.
   */
  private witnessed(killer: string, where: THREE.Vector3, nova: boolean): boolean {
    const ship = this.find(killer);
    if (ship?.owner === null) return true;
    const now = this.game.time;
    const near = ship !== null && ship.flight.position.distanceTo(where) < KILL_NEAR;
    if (nova) return near || now - (this.novas.get(killer) ?? -Infinity) < NOVA_EVIDENCE;
    return near || this.evidence.beamPassed(killer, where, now) || this.evidence.launched(killer, now);
  }

  /** A death everyone saw: its killer's kills grow, by two for a nova, and a nova's victim loses one. */
  private credit(victim: string, killer: string | null, nova: boolean) {
    const now = this.game.time;
    if (killer) this.plausible.credit(killer, nova ? 2 : 1, now);
    if (nova) this.plausible.credit(victim, -1, now);
  }

  /** A ship of another browser did the impossible (or not, `cheat` null): this browser reports its peer, once. */
  private caught(ship: Ship, cheat: Cheat | null): boolean {
    if (!cheat) return false;
    const accused = ownerOf(ship.id);
    if (!accused || accused === this.selfId) return true;
    console.warn(`SolarTournament: ${ship.name} (${ship.id}) failed the ${cheat} check`);
    // a watching Host rejects what it can, but has no vote (see accuse)
    if (!this.reported.has(accused) && !this.watching) {
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
   * alone; a browser cast out itself is told so and leaves.
   */
  private accuse(accused: string, accuser: string) {
    if (!this.accusations.add(accused, accuser, this.session.seated(accuser), this.voters)) return;
    const ships = this.game.allShips().filter((ship) => ship.owner === accused || (accused === this.selfId && ship.owner === null));
    const host = ships.find((ship) => ship.id.startsWith('p:')) ?? ships[0];
    this.game.announceCheater(host?.name ?? accused);
    if (accused === this.selfId) this.game.castOut();
    else this.session.castOut(accused);
  }

  /** A peer left: what this browser knows of its ships goes with it. */
  private forgetShipsOf(peer: string) {
    for (const ship of this.game.allShips()) {
      if (ownerOf(ship.id) !== peer) continue;
      this.plausible.forget(ship.id);
      this.evidence.forget(ship.id);
      this.novas.delete(ship.id);
    }
  }

  private find(id: string): Ship | null {
    return this.game.allShips().find((ship) => ship.id === id) ?? null;
  }
}

const round = (v: THREE.Vector3): Vec => v.toArray().map(Math.round);
