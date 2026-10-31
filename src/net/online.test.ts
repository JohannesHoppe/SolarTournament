import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isLeadHost, Online, pingPeerOf, type OnlineGame } from './online';
import type { Session } from './session';
import type { Ship } from '../ship/ship';
import type { Torpedo } from '../game/torpedoes';

describe('the peer a ship\'s ping is measured to', () => {
  it('is null for a ship this very browser runs: its own clone, and its own bots while it leads', () => {
    expect(pingPeerOf('p:me', 'me')).toBeNull();
    expect(pingPeerOf('b:me:0', 'me')).toBeNull();
  });

  it('is the peer that runs a remote Host\'s ship', () => {
    expect(pingPeerOf('p:other', 'me')).toBe('other');
  });

  it('is the lead browser for a bot, since only the lead runs bots: a bot\'s id embeds its peer', () => {
    expect(pingPeerOf('b:lead:3', 'me')).toBe('lead');
    // this browser leads itself and sees another peer's bot: still that peer, not this one
    expect(pingPeerOf('b:other:0', 'me')).toBe('other');
  });
});

describe('the lead mark', () => {
  it('marks a Host\'s own ship when this browser leads', () => {
    expect(isLeadHost('p:lead', 'lead')).toBe(true);
  });

  it('never marks a Host that does not lead', () => {
    expect(isLeadHost('p:other', 'lead')).toBe(false);
  });

  it('never marks a bot, even the lead\'s own', () => {
    expect(isLeadHost('b:lead:0', 'lead')).toBe(false);
  });
});

/** A ship as the online layer reads it: id, owner and whether its clone lives, where it flies. */
function remoteShip(id: string, owner: string) {
  return { id, owner, alive: true, flight: { position: new THREE.Vector3() } } as unknown as Ship;
}

/** The online layer of a browser in round 1 with the ships given, the game's answers stubbed, and the messages of its peers to hand to it. */
function online(ships: Ship[], game: Partial<OnlineGame> = {}) {
  const session = { justJoined: false } as unknown as Session;
  const calls = { fleetHits: 0, rocks: 0 };
  const stub = {
    roundId: 1,
    allShips: () => ships,
    remoteFleetHit: () => calls.fleetHits++,
    remoteRock: () => calls.rocks++,
    fleetNovaHit: () => 0,
    rockAt: () => ({ position: new THREE.Vector3(0, 0, 50000), radius: 1000 }),
    recentTorpedo: () => null,
    remoteTorpedoGone: () => {},
    showBeam: () => {},
    ...game,
  } as unknown as OnlineGame;
  new Online(session, stub, true);
  return { session, calls };
}

describe('a hit on the battleship from another browser', () => {
  it('counts only while the battleship is in the arena here, and only on a part it has', () => {
    const shooter = remoteShip('p:other', 'other');
    // before it arrives (or once it went down) the game knows no part, nor a part beyond its nine
    const { session, calls } = online([shooter], { fleetZoneAt: () => null });
    session.onFire('p:other', [0, 0, 0], [0, 0, 80000]);
    session.onFleetHit(0, 1, 'p:other', 1, false);
    session.onFleetHit(3, 1, 'p:other', 188, true);
    session.onFleetHit(20, 1, 'p:other', 1, false);
    expect(calls.fleetHits).toBe(0);
    const there = online([shooter], { fleetZoneAt: (zone) => (zone < 9 ? new THREE.Vector3(0, 0, 80000) : null) });
    there.session.onFire('p:other', [0, 0, 0], [0, 0, 80000]);
    there.session.onFleetHit(0, 1, 'p:other', 1, false);
    there.session.onFleetHit(20, 1, 'p:other', 1, false);
    expect(there.calls.fleetHits).toBe(1);
  });

  it("counts a torpedo's blast only for a torpedo that flew here and went off near where it flies here, once", () => {
    const shooter = remoteShip('p:other', 'other');
    const part = new THREE.Vector3(0, 0, 80000);
    const torpedo = { id: 'p:other.1', shooter, position: part.clone(), holder: null, flinger: null } as unknown as Torpedo;
    const made = online([shooter], { fleetZoneAt: () => part, recentTorpedo: (id) => (id === torpedo.id ? torpedo : null) });
    // a torpedo never launched says it went off at the part: nothing
    made.session.onTorpedoGone('p:other.9', [0, 0, 80000], null, null);
    made.session.onFleetHit(0, 1, 'p:other', 10, false);
    expect(made.calls.fleetHits).toBe(0);
    // the real one, said far from where it flies here, then where it is: once on each part
    made.session.onTorpedoGone('p:other.1', [0, 0, -80000], null, null);
    made.session.onFleetHit(0, 1, 'p:other', 10, false);
    expect(made.calls.fleetHits).toBe(0);
    made.session.onTorpedoGone('p:other.1', [0, 0, 80000], null, null);
    made.session.onFleetHit(0, 1, 'p:other', 10, false);
    made.session.onFleetHit(1, 1, 'p:other', 10, false);
    expect(made.calls.fleetHits).toBe(2);
  });
});

describe('a rock broken on another browser', () => {
  it("breaks here for the beam of a bot whose first state has not come yet (a new lead's adopted bot)", () => {
    const { session, calls } = online([]);
    session.onFire('b:lead:0', [0, 0, 0], [0, 0, 50000]);
    session.onRock('r1', 10, 1, 'b:lead:0');
    session.onRock('r2', 10, 1, 'b:lead:1');
    expect(calls.rocks).toBe(1);
  });
});
