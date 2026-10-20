import { describe, expect, it } from 'vitest';
import { createSong, ROUND_SECONDS, stepEvents, STEPS_PER_BAR, titleFor } from './songs';

const notes = (title: string, from: number, steps: number) => {
  const song = createSong(title, 'round', ROUND_SECONDS);
  return Array.from({ length: steps }, (_, i) => JSON.stringify(stepEvents(song, from + i), (key, value) => (key === 'info' ? undefined : value)));
};

describe('Radio 2584', () => {
  it('grows the same track from the same title, note for note', () => {
    for (const title of ['Orbit Terror', 'Golden Damage', titleFor(42)]) expect(notes(title, 600, 64)).toEqual(notes(title, 600, 64));
  });

  it('can jump anywhere: a step sounds the same whatever was played before', () => {
    const song = createSong('Orbit Terror', 'round', ROUND_SECONDS);
    const late = JSON.stringify(stepEvents(song, 3000), (key, value) => (key === 'info' ? undefined : value));
    // the same step in a fresh song, after playing a different stretch first
    const other = createSong('Orbit Terror', 'round', ROUND_SECONDS);
    for (let i = 0; i < 200; i++) stepEvents(other, i);
    expect(JSON.stringify(stepEvents(other, 3000), (key, value) => (key === 'info' ? undefined : value))).toBe(late);
  });

  it('keeps every tonal part on the minor scale of the track', () => {
    const minor = [0, 2, 3, 5, 7, 8, 10];
    for (const title of ['Orbit Terror', 'Golden Damage', titleFor(7), titleFor(99)]) {
      const song = createSong(title, 'round', ROUND_SECONDS);
      for (let step = 0; step < 200 * STEPS_PER_BAR; step += 3) {
        const events = stepEvents(song, step);
        // a key lift late in the track moves the key; the scale stays
        const root = song.root + events.info.transpose;
        for (const hit of [events.bass, events.acid, events.lead]) if (hit) expect(minor).toContain((((hit.note - root) % 12) + 12) % 12);
      }
    }
  });

  it('picks titles from any seed, the same every time', () => {
    expect(titleFor(12345)).toBe(titleFor(12345));
    expect(titleFor(1)).not.toBe('');
  });
});
