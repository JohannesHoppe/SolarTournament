import * as THREE from 'three';
import type { AsteroidField, FieldState } from '../world/asteroids';
import { ownerOf, TOURNAMENT_SIZE, type Session, type RoundState, type Vec } from './session';
import type { Ship, ShipState } from '../ship/ship';
import type { WreckState } from '../world/wrecks';

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
  /** Another peer reports a destroyed ship; `deaths` counts this death; position and velocity are where it broke up. */
  remoteDestroyed(victim: Ship, killer: Ship | null, deaths: number, position: THREE.Vector3 | null, velocity: THREE.Vector3 | null): void;
  /** Another peer hit an asteroid at a field time, in an online round. */
  remoteRock(id: string, at: number, round: number): void;
  /** Another peer shot or rammed a piece of wreckage. */
  remoteWreck(id: string): void;
  /** The pieces of wreckage in flight, for a browser that joins. */
  wreckSnapshot(): WreckState[];
  /** Takes the pieces of wreckage in flight from the lead browser. */
  restoreWrecks(wrecks: WreckState[]): void;
  /** Takes the lead browser's field, in the arena it names. */
  restoreField(field: FieldState): void;
  /** The lead browser's round clock and field time. */
  syncRound(round: RoundState): void;
  leadRound(): RoundState;
  /**
   * All places are taken by Hosts who were here first: the own clone watches instead of flying
   * (true), or a place has come free and it flies (false).
   */
  spectate(watching: boolean): void;
}

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

  constructor(
    readonly session: Session,
    private readonly game: OnlineGame,
    /** The room's rule: bots fill the places no Host takes. */
    private readonly bots: boolean,
  ) {
    session.onStates = (states, round, peer) => this.receiveStates(states, round, peer);
    session.onFire = (shooter, a, b) => {
      const ship = this.find(shooter);
      if (ship) game.showBeam(ship, from.fromArray(a), to.fromArray(b));
    };
    session.onHit = (target, o, d, shooter) => {
      const ship = this.find(target);
      const gun = this.find(shooter);
      // only a living shooter hits, and only ships this browser runs take damage here
      if (ship && ship.owner === null && gun?.alive) game.applyLaserHit(ship, origin.fromArray(o), direction.fromArray(d).normalize(), gun);
    };
    session.onDestroyed = (victim, killer, deaths, p, u) => {
      // a ship dies once per clone: a dead one cannot die again, and the count only goes up
      const ship = this.find(victim);
      if (ship && ship.owner !== null && ship.alive && deaths > ship.deaths) {
        game.remoteDestroyed(ship, killer ? this.find(killer) : null, deaths, p && from.fromArray(p), u && to.fromArray(u));
      }
    };
    session.onRock = (id, at, round) => game.remoteRock(id, at, round);
    session.onWreck = (id) => game.remoteWreck(id);
    session.onSync = (field, wrecks) => {
      game.restoreField(field);
      game.restoreWrecks(wrecks);
    };
    session.onPeerJoin = (peer) => {
      // the lead browser brings the newcomer's asteroid field and wreckage up to date;
      // everyone tells it the names and scores of their ships with the next states
      this.sync(peer);
      this.sendFull = true;
      this.balanceBots();
    };
    session.onPeerRestart = (peer) => {
      // a browser that started over takes the field again, like a newcomer
      this.sync(peer);
      this.sendFull = true;
    };
    session.onRestart = () => game.rejoin();
    session.onPeerLeave = (peer) => {
      this.flying.delete(peer);
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
    // the bots of a browser that no longer leads are gone; the new lead has adopted them
    const lead = this.session.leadId;
    for (const ship of this.game.allShips()) if (ship.owner !== null && ship.owner !== lead && ship.id.startsWith('b:')) this.game.removeShip(ship);
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

  sendDestroyed(victim: Ship, killer: Ship | null) {
    this.session.sendDestroyed(victim.id, killer?.id ?? null, victim.deaths, round(victim.flight.position), round(victim.flight.velocity));
  }

  sendRock(id: string, at: number, round: number) {
    this.session.sendRock(id, at, round);
  }

  sendWreck(id: string) {
    this.session.sendWreck(id);
  }

  /** The lead browser hands a newcomer, or a browser that started over, the field and the wreckage. */
  private sync(peer: string) {
    if (this.session.isLead) this.session.sendSync(peer, this.game.field.snapshot(), this.game.wreckSnapshot());
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
      if (ship.owner === peer && ownerOf(ship.id) === peer) ship.applyState(state, now);
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

  private find(id: string): Ship | null {
    return this.game.allShips().find((ship) => ship.id === id) ?? null;
  }
}

const round = (v: THREE.Vector3): Vec => v.toArray().map(Math.round);
