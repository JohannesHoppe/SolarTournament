import { describe, expect, it } from 'vitest';
import { createSong, mixSeed, ROUND_SECONDS, textSeed, titleFor } from './songs';
import { DJ_IDLE, DJ_TITLE_MAX, djFromWire, djNewRound, djSong, djStep, djTitle, djToWire, djTune, MAX_DJ_OFFSET, programmeTitle, tidyTitle } from './dj';
import { djWire } from '../net/validate';

const ROOM = textSeed('dj-room');

describe('the game master as DJ', () => {
  it('leaves a round on the programme\'s own song until it steps or tunes', () => {
    // online the room and round pick the song, alone the solo round's seed: as without a DJ
    expect(djSong(DJ_IDLE, ROOM, 4, true)).toBe(titleFor(mixSeed(ROOM, 4)));
    expect(djSong(DJ_IDLE, 12345, 0, false)).toBe(titleFor(12345));
  });

  it('steps forward through the programme and back again to a song it liked', () => {
    const next = djStep(DJ_IDLE, 1, 30);
    expect(next).toEqual({ offset: 1, title: null, from: 30 });
    expect(djSong(next, ROOM, 4, true)).toBe(programmeTitle(ROOM, 5, true));
    const back = djStep(djStep(next, -1, 60), -1, 90);
    expect(djSong(back, ROOM, 4, true)).toBe(programmeTitle(ROOM, 3, true));
    // the next round goes on with the step, from the round's start
    expect(djNewRound(back)).toEqual({ offset: -1, title: null, from: 0 });
    // the step stays within its bounds however often the DJ presses
    let far = DJ_IDLE;
    for (let i = 0; i < MAX_DJ_OFFSET + 5; i++) far = djStep(far, 1, 0);
    expect(far.offset).toBe(MAX_DJ_OFFSET);
  });

  it('tunes to the song its words make, and goes back to the programme\'s song it interrupted', () => {
    const tuned = djTune(djStep(DJ_IDLE, 1, 10), 'Orbit Terror', 20);
    expect(djSong(tuned, ROOM, 0, true)).toBe('Orbit Terror');
    expect(tuned.from).toBe(20);
    expect(djStep(tuned, -1, 40)).toEqual({ offset: 1, title: null, from: 40 });
    expect(djStep(tuned, 1, 40)).toEqual({ offset: 2, title: null, from: 40 });
    // a new round ends the typed song
    expect(djNewRound(tuned).title).toBeNull();
  });

  it('makes the same song from the same words as the radio page does', () => {
    for (const words of ['orbit terror', '  Golden   damage ', 'Hull Mantra', titleFor(7).toLowerCase(), 'straße der sterne']) {
      const title = djTitle(words)!;
      expect(title).toBe(tidyTitle(words));
      expect(createSong(title, 'round', ROUND_SECONDS).seed).toBe(createSong(tidyTitle(words), 'round', ROUND_SECONDS).seed);
      expect(createSong(title, 'round', ROUND_SECONDS).seed).toBe(createSong(words.trim().replace(/\s+/g, ' '), 'round', ROUND_SECONDS).seed);
    }
  });

  it('refuses words the radio does not take', () => {
    for (const bad of ['', '   ', 'x'.repeat(DJ_TITLE_MAX + 1), '<img src=x onerror=alert(1)>', 'Orbit; Terror', 'a b c d e f g', 42, null, { title: 'x' }]) expect(djTitle(bad)).toBeNull();
    expect(djTitle("Rock'n Roll-Station 9")).toBe("Rock'n Roll-Station 9");
  });

  it('puts every browser on the same song at the same beat: the lead\'s word read back is the same state', () => {
    for (const dj of [djStep(DJ_IDLE, 1, 12.5), djTune(DJ_IDLE, 'Orbit Terror', 99.25), djNewRound(djStep(DJ_IDLE, -1, 3))]) {
      const wire = djToWire(dj);
      const sent = JSON.parse(JSON.stringify({ d: wire })).d;
      expect(djFromWire(djWire(sent) ?? undefined)).toEqual(dj);
      expect(djSong(djFromWire(sent), ROOM, 7, true)).toBe(djSong(dj, ROOM, 7, true));
    }
    // a radio on the programme sends nothing, and nothing heard is the programme
    expect(djToWire(DJ_IDLE)).toBeUndefined();
    expect(djFromWire(undefined)).toEqual(DJ_IDLE);
  });

  it('takes a DJ\'s word only as the lead sends it', () => {
    expect(djWire({ o: 2, f: 30 })).toEqual({ o: 2, f: 30 });
    expect(djWire({ o: -1, t: 'Orbit Terror', f: 0 })).toEqual({ o: -1, t: 'Orbit Terror', f: 0 });
    for (const bad of [null, 'dj', { o: 1.5, f: 0 }, { o: MAX_DJ_OFFSET + 1, f: 0 }, { o: 0, f: -1 }, { o: 0, f: 1e9 }, { o: 0 }, { o: 0, f: 0, t: 'orbit terror' }, { o: 0, f: 0, t: '<b>x</b>' }, { o: 0, f: 0, t: 7 }]) expect(djWire(bad)).toBeNull();
  });
});
