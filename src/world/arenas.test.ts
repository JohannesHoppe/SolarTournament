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
