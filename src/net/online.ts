import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import { ownerOf, type Session, type RoundState, type Vec } from './session';
import type { Ship, ShipState } from '../ship/ship';

/** Places per tournament: Hosts and bots together; the lead browser fills free places with bots. */
export const TOURNAMENT_SIZE = 4;

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
  setBotCount(count: number): void;
  showBeam(shooter: Ship, from: THREE.Vector3, to: THREE.Vector3): void;
  /** A beam from another peer hit a ship this browser simulates. */
  applyLaserHit(target: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null): void;
  /** Another peer reports a destroyed ship; `deaths` counts this death. */
  remoteDestroyed(victim: Ship, killer: Ship | null, deaths: number): void;
  /** Another peer hit an asteroid at a field time. */
  remoteRock(id: string, at: number): void;
  /** The lead browser's round clock and field time. */
  syncRound(round: RoundState): void;
  leadRound(): RoundState;
  /** The tournament has all its places taken by Hosts who were here first. */
  tournamentFull(): void;
}

const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();

/** Connects the game to a tournament session: who owns which ship, and what goes over the wire. */
export class Online {
  private wasLead: boolean | null = null;

  constructor(
    readonly session: Session,
    private readonly game: OnlineGame,
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
    session.onDestroyed = (victim, killer, deaths) => {
      const ship = this.find(victim);
      if (ship && ship.owner !== null) game.remoteDestroyed(ship, killer ? this.find(killer) : null, deaths);
    };
    session.onRock = (id, at) => game.remoteRock(id, at);
    session.onSync = (field) => game.field.restore(field);
    session.onPeerJoin = (peer) => {
      // the lead browser brings the newcomer's asteroid field up to date
      if (session.isLead) session.sendSync(peer, game.field.snapshot());
      this.balanceBots();
    };
    session.onPeerLeave = (peer) => {
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

  get pilots() {
    return 1 + this.session.peers.length;
  }

  /** Sends the own ships; the lead browser adds the round clock. Rebalances bots when the lead changes. */
  update(now: number) {
    const lead = this.isLead;
    if (this.wasLead !== lead) {
      this.wasLead = lead;
      this.balanceBots();
    }
    // a Host beyond the places of the tournament leaves again, once it knows who was here first
    if (!this.session.justJoined && this.session.rank() >= TOURNAMENT_SIZE) {
      this.game.tournamentFull();
      return;
    }
    const states = this.game.ownedShips().map((ship) => ship.toState(now));
    this.session.sendStates(now, states, lead ? this.game.leadRound() : null);
  }

  sendFire(shooter: Ship, a: THREE.Vector3, b: THREE.Vector3) {
    this.session.sendFire(shooter.id, round(a), round(b));
  }

  /** Tells the owner of a remote ship that a beam went through it. */
  sendHit(target: Ship, o: THREE.Vector3, d: THREE.Vector3, shooter: Ship) {
    if (target.owner) this.session.sendHit(target.owner, target.id, round(o), d.toArray().map((x) => +x.toFixed(5)), shooter.id);
  }

  sendDestroyed(victim: Ship, killer: Ship | null) {
    this.session.sendDestroyed(victim.id, killer?.id ?? null, victim.deaths);
  }

  sendRock(id: string, at: number) {
    this.session.sendRock(id, at);
  }

  leave() {
    this.session.leave();
  }

  /** The lead browser fills the tournament up with bots; everyone else runs none. */
  private balanceBots() {
    this.game.setBotCount(this.isLead ? Math.max(0, TOURNAMENT_SIZE - this.pilots) : 0);
  }

  private receiveStates(states: ShipState[], round: RoundState | null, peer: string) {
    const now = this.game.time;
    const seen = new Set<string>();
    for (const state of states) {
      seen.add(state.id);
      // the session only passes on ships whose id names the sender as their owner
      const ship = this.find(state.id) ?? this.game.addRemoteShip(state, peer);
      if (ship.owner === peer && ownerOf(ship.id) === peer) ship.applyState(state, now);
    }
    // bots the peer no longer runs (e.g. it stopped leading)
    for (const ship of [...this.game.allShips()]) if (ship.owner === peer && !seen.has(ship.id)) this.game.removeShip(ship);
    if (round && peer === this.session.leadId) this.game.syncRound(round);
  }

  private find(id: string): Ship | null {
    return this.game.allShips().find((ship) => ship.id === id) ?? null;
  }
}

const round = (v: THREE.Vector3): Vec => v.toArray().map(Math.round);
