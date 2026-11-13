import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENAS, arenaByKey, arenaOfRound, FIGHT_WORLDS, RACE_ARENAS, RACE_WORLDS, TOURNAMENT_ARENAS } from './arenas';

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
    for (const arena of TOURNAMENT_ARENAS) expect(arenaByKey(arena.layout.key)).toBe(arena);
  });

  it('of a race walks through the arenas of free space and the race worlds; every other mode stays in free space', () => {
    const races = new Set(Array.from({ length: RACE_ARENAS.length }, (_, round) => arenaOfRound('a-room-abcdef', round, 'race').id));
    expect(races.size).toBe(RACE_ARENAS.length);
    for (const world of RACE_WORLDS) expect(races.has(world.id)).toBe(true);
    for (let round = 0; round < 40; round++) expect(ARENAS).toContain(arenaOfRound('a-room-abcdef', round));
    // a room playing every mode in turn meets every race arena in its races, every fifth round
    const mixed = new Set(Array.from({ length: RACE_ARENAS.length }, (_, k) => arenaOfRound('a-room-abcdef', 1 + 5 * k, 'race').id));
    expect(mixed.size).toBe(RACE_ARENAS.length);
  });

  it('of a deathmatch is fought every other time over a world, walking through each kind in an order of its own', () => {
    const fights = Array.from({ length: 4 * FIGHT_WORLDS.length * ARENAS.length }, (_, round) => arenaOfRound('a-room-abcdef', round, 'deathmatch'));
    fights.forEach((arena, round) => expect(round % 2 ? FIGHT_WORLDS : ARENAS).toContain(arena));
    // every world and every arena of free space comes before any comes again
    expect(new Set(fights.filter((_, round) => round % 2).slice(0, FIGHT_WORLDS.length).map((arena) => arena.id)).size).toBe(FIGHT_WORLDS.length);
    expect(new Set(fights.filter((_, round) => round % 2 === 0).slice(0, ARENAS.length).map((arena) => arena.id)).size).toBe(ARENAS.length);
    // a mixed room counts its deathmatches (every fifth round): half of them over a world
    const mixed = Array.from({ length: 2 * ARENAS.length }, (_, k) => arenaOfRound('a-room-abcdef', 5 * k, 'deathmatch', k));
    expect(mixed.filter((arena) => FIGHT_WORLDS.includes(arena))).toHaveLength(ARENAS.length);
    // no other mode is played over a world fought over
    for (const mode of ['survival', 'flag', 'fleet']) for (let round = 0; round < 20; round++) expect(ARENAS).toContain(arenaOfRound('a-room-abcdef', round, mode));
  });

  it("of a world fought over stands on its place's ground, under its gravity, inside the arena's edge", () => {
    for (const world of FIGHT_WORLDS) {
      expect(world.open).toBeUndefined();
      expect(world.start).toBeUndefined();
      expect(world.layout.fall).toBeGreaterThan(0);
      expect(world.layout.placements!.some((piece) => piece.ground)).toBe(true);
    }
  });
});

describe('the derelict', () => {
  it('tilts the spar across its stern as the stern hull is tilted: level across, its up the hull\'s', () => {
    const pieces = arenaByKey('derelict')!.layout.placements!;
    // the spars (type 4): the bow's and the stern's, at the stern section's middle
    const [bowSpar, sternSpar] = pieces.filter((piece) => piece.type === 4);
    const sternHull = pieces.find((piece) => piece.type !== 4 && piece.position.equals(sternSpar.position))!;
    const along = (piece: (typeof pieces)[number], x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(piece.orientation);
    // both spars lie across the ship, level
    for (const spar of [bowSpar, sternSpar]) {
      expect(Math.abs(along(spar, 1, 0, 0).z)).toBeCloseTo(1);
      expect(along(spar, 1, 0, 0).y).toBeCloseTo(0);
    }
    expect(along(sternSpar, 0, 1, 0).distanceTo(along(sternHull, 0, 1, 0))).toBeCloseTo(0);
  });
});
