import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS, arenaByKey, arenaOfRound } from './arenas';

describe('the arena of a tournament round', () => {
  it('is the same on every browser for the same room and round', () => {
    for (let round = 0; round < 20; round++) expect(arenaOfRound('kesslers-revenge-k7m2pq', round)).toBe(arenaOfRound('kesslers-revenge-k7m2pq', round));
  });

  it('walks through all seven before any comes again', () => {
    const seen = new Set(Array.from({ length: ARENAS.length }, (_, round) => arenaOfRound('a-room-abcdef', round).id));
    expect(seen.size).toBe(ARENAS.length);
    expect(arenaOfRound('a-room-abcdef', ARENAS.length)).toBe(arenaOfRound('a-room-abcdef', 0));
  });

  it('differs in order from room to room', () => {
    const order = (room: string) => Array.from({ length: ARENAS.length }, (_, round) => arenaOfRound(room, round).id).join();
    expect(order('first-room-aaaaaa')).not.toBe(order('second-room-bbbbbb'));
  });

  it('is found by its layout key, as a snapshot names it', () => {
    for (const arena of ARENAS) expect(arenaByKey(arena.layout.key)).toBe(arena);
  });
});

describe('the derelict', () => {
  it('tilts the spar across its stern as the stern hull is tilted: level across, its up the hull\'s', () => {
    const pieces = arenaByKey('derelict')!.layout.placements!;
    // the spars (type 4): the bow's and the stern's, at the stern section's middle
    const [bowSpar, sternSpar] = pieces.filter((piece) => piece.type === 4);
    const sternHull = pieces.find((piece) => piece.type === 0 && piece.position.equals(sternSpar.position))!;
    const along = (piece: (typeof pieces)[number], x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(piece.orientation);
    // both spars lie across the ship, level
    for (const spar of [bowSpar, sternSpar]) {
      expect(Math.abs(along(spar, 1, 0, 0).z)).toBeCloseTo(1);
      expect(along(spar, 1, 0, 0).y).toBeCloseTo(0);
    }
    expect(along(sternSpar, 0, 1, 0).distanceTo(along(sternHull, 0, 1, 0))).toBeCloseTo(0);
  });
});
