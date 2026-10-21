import { describe, expect, it } from 'vitest';
import { newRoom, roomFragment, roomFromFragment } from './room';
import { ROUND_MODES } from '../game/race';

describe('a tournament room in its link', () => {
  it('comes back from its fragment with name, rules and mode', () => {
    for (const mode of [...ROUND_MODES, 'mixed'] as const) {
      const room = newRoom("Kessler's Revenge", true, false, mode);
      expect(roomFromFragment(roomFragment(room))).toEqual(room);
    }
  });

  it('is a deathmatch with bots when the link says nothing else', () => {
    const room = roomFromFragment('#t=some-room-abcdef');
    expect(room?.mode).toBe('deathmatch');
    expect(room?.bots).toBe(true);
    expect(room?.public).toBe(false);
  });

  it('gets a long random code when private, a short one when public', () => {
    const random = (code: string) => code.split('-').pop()!.length;
    expect(random(newRoom('Room', false, true, 'deathmatch').code)).toBe(20);
    expect(random(newRoom('Room', true, true, 'deathmatch').code)).toBe(6);
  });
});
