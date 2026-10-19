import * as THREE from 'three';
import type { AsteroidField } from '../world/asteroids';
import type { Session, RoundState, Vec } from './session';
import type { Ship, ShipState } from '../ship/ship';

/** Players per tournament; the host fills free places with bots. */
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
  /** Another peer reports a destroyed ship. */
  remoteDestroyed(victim: Ship, killer: Ship | null): void;
  /** Another peer hit an asteroid. */
  remoteRock(id: string): void;
  /** The host's round clock. */
  syncRound(round: RoundState): void;
  hostRound(): RoundState;
}

const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();

/** Connects the game to a tournament session: who owns which ship, and what goes over the wire. */
export class Online {
  private wasHost: boolean | null = null;

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
      if (ship && ship.owner === null) game.applyLaserHit(ship, origin.fromArray(o), direction.fromArray(d), this.find(shooter));
    };
    session.onDestroyed = (victim, killer) => {
      const ship = this.find(victim);
      if (ship && ship.owner !== null) game.remoteDestroyed(ship, killer ? this.find(killer) : null);
    };
    session.onRock = (id) => game.remoteRock(id);
    session.onSync = (asteroids) => game.field.restore(asteroids);
    session.onPeerJoin = (peer) => {
      // the host brings the newcomer's asteroid field up to date
      if (session.isHost && !session.justJoined) session.sendSync(peer, game.field.snapshot());
      this.balanceBots();
    };
    session.onPeerLeave = (peer) => {
      for (const ship of game.allShips()) if (ship.owner === peer) game.removeShip(ship);
      this.balanceBots();
    };
  }

  get selfId() {
    return this.session.selfId;
  }

  get isHost() {
    return this.session.isHost;
  }

  get pilots() {
    return 1 + this.session.peers.length;
  }

  /** Sends the own ships; the host adds the round clock. Rebalances bots when the host changes. */
  update(now: number) {
    const host = this.isHost && !this.session.settling;
    if (this.wasHost !== host) {
      this.wasHost = host;
      this.balanceBots();
    }
    const states = this.game.ownedShips().map((ship) => ship.toState(now));
    this.session.sendStates(now, states, host ? this.game.hostRound() : null);
  }

  sendFire(shooter: Ship, a: THREE.Vector3, b: THREE.Vector3) {
    this.session.sendFire(shooter.id, round(a), round(b));
  }

  /** Tells the owner of a remote ship that a beam went through it. */
  sendHit(target: Ship, o: THREE.Vector3, d: THREE.Vector3, shooter: Ship) {
    if (target.owner) this.session.sendHit(target.owner, target.id, round(o), d.toArray().map((x) => +x.toFixed(5)), shooter.id);
  }

  sendDestroyed(victim: Ship, killer: Ship | null) {
    this.session.sendDestroyed(victim.id, killer?.id ?? null);
  }

  sendRock(id: string) {
    this.session.sendRock(id);
  }

  leave() {
    this.session.leave();
  }

  /** The host fills the tournament up with bots; everyone else runs none. */
  private balanceBots() {
    const host = this.isHost && !this.session.settling;
    this.game.setBotCount(host ? Math.max(0, TOURNAMENT_SIZE - this.pilots) : 0);
  }

  private receiveStates(states: ShipState[], round: RoundState | null, peer: string) {
    const now = this.game.time;
    const seen = new Set<string>();
    for (const state of states) {
      seen.add(state.id);
      const ship = this.find(state.id) ?? this.game.addRemoteShip(state, peer);
      if (ship.owner === peer) ship.applyState(state, now);
    }
    // bots the peer no longer runs (e.g. it stopped hosting)
    for (const ship of this.game.allShips()) if (ship.owner === peer && !seen.has(ship.id)) this.game.removeShip(ship);
    if (round && peer === this.session.hostId) this.game.syncRound(round);
  }

  private find(id: string): Ship | null {
    return this.game.allShips().find((ship) => ship.id === id) ?? null;
  }
}

const round = (v: THREE.Vector3): Vec => v.toArray().map(Math.round);
