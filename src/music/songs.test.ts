import { describe, expect, it } from 'vitest';
import { createSong, FLAVOR_WEIGHTS, GLITCH_BARS, GLITCH_MAX, glitchSteps, ROUND_SECONDS, SCALES, stepEvents, STEPS_PER_BAR, titleFor } from './songs';
import { STATION_DE, STATION_EN } from './lines';

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

  it('keeps every tonal part on the scale of the track: natural minor, in drive also phrygian', () => {
    for (const title of ['Orbit Terror', 'Golden Damage', titleFor(7), titleFor(99), titleFor(5), titleFor(11)]) {
      for (const flavor of [undefined, 'drive' as const]) {
        const song = createSong(title, 'round', ROUND_SECONDS, flavor);
        expect(song.flavor === 'drive' ? [SCALES.aeolian, SCALES.phrygian] : [SCALES.aeolian]).toContain(song.scale);
        for (let step = 0; step < 200 * STEPS_PER_BAR; step += 3) {
          const events = stepEvents(song, step);
          // a key lift late in the track moves the key; the scale stays
          const root = song.root + events.info.transpose;
          for (const hit of [events.bass, events.sub, events.acid, events.lead]) if (hit) expect(song.scale).toContain((((hit.note - root) % 12) + 12) % 12);
        }
      }
    }
  });

  it('plays drive most of all, and French second: the hard flavors are guests', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 2000; seed++) {
      const flavor = createSong(titleFor(seed), 'round', ROUND_SECONDS).flavor;
      counts.set(flavor, (counts.get(flavor) ?? 0) + 1);
    }
    const share = (flavor: string) => (counts.get(flavor) ?? 0) / 2000;
    expect(share('drive')).toBeGreaterThan(0.33);
    expect(share('drive') + share('french')).toBeGreaterThan(0.5);
    for (const [flavor] of FLAVOR_WEIGHTS) if (flavor !== 'drive') expect(share(flavor)).toBeLessThan(share('drive'));
  });

  it('grows drive by its timbre: a pedal bass from the first bar, its lower wave later, a gentle pump and little drive', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const song = createSong(titleFor(seed), 'round', ROUND_SECONDS, 'drive');
      expect(song.strategy).toBe('timbre');
      expect(song.bpm).toBeGreaterThanOrEqual(116);
      expect(song.bpm).toBeLessThanOrEqual(124);
      expect(song.pump).toBeGreaterThan(0.8);
      // the loop: the root on about half the sixteenths or more, up to four held notes of a second voice off the beat
      const played = song.pedal.filter((s) => s !== null);
      const roots = played.filter((s) => !s.melody && s.degree % 12 === 0).length;
      const melody = song.pedal.map((s, i) => (s?.melody ? i : -1)).filter((i) => i >= 0);
      expect(roots / 32).toBeGreaterThanOrEqual(0.45);
      expect(melody.length).toBeGreaterThanOrEqual(1);
      expect(melody.length).toBeLessThanOrEqual(4);
      for (const i of melody) expect([1, 3]).toContain(i % 4);
      let sub = -1;
      for (let bar = 0; bar < 140; bar++) {
        const events = stepEvents(song, bar * STEPS_PER_BAR + 1);
        // the bass alone in the first bars, no rumble ever, never more than a little drive
        if (bar < 8) expect(events.kick).toBe(0);
        expect(events.info.layers.rumble).toBe(false);
        expect(events.info.drive).toBeLessThanOrEqual(0.45);
        if (sub < 0 && events.info.layers.sub) sub = bar;
      }
      expect(sub).toBeGreaterThan(16);
    }
  });

  it('ends drive as the hits of the eighties did: a tom roll into a finale lifted in key with the hook on top, a cadence, one hit, silence', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const song = createSong(titleFor(seed), 'round', ROUND_SECONDS, 'drive');
      const finale = song.form.find((s) => s.kind === 'finale')!;
      const outro = song.form.find((s) => s.kind === 'outro')!;
      const bar = (b: number) => Array.from({ length: STEPS_PER_BAR }, (_, s) => stepEvents(song, b * STEPS_PER_BAR + s));
      // toms rolling down in the last half bar before the finale, a crash on its first beat
      const before = bar(finale.start - 1);
      expect(before.slice(8).every((e) => e.perc !== null)).toBe(true);
      expect(bar(finale.start)[0].info.impact).toBe(true);
      // the finale lifted by a semitone or two, the hook playing on top
      expect([1, 2]).toContain(song.lift);
      expect(bar(finale.start)[0].info.transpose).toBe(song.lift);
      const hook = Array.from({ length: 4 }, (_, i) => bar(finale.start + i)).flat().filter((e) => e.lead?.melody);
      expect(hook.length).toBeGreaterThan(0);
      // the cadence on the fifth and the fourth, then one hit on the root with a crash, then nothing
      const fifth = bar(outro.start).find((e) => e.bass && !e.bass.melody)!.bass!;
      expect((((fifth.note - song.root - song.lift) % 12) + 12) % 12).toBe(7);
      const hit = bar(outro.start + 2);
      expect(hit[0].kick).toBe(1);
      expect(hit[0].info.impact).toBe(true);
      expect(hit[0].bass!.length).toBe(16);
      expect(hit.slice(1).every((e) => !e.kick && !e.bass && !e.clap && !e.hat)).toBe(true);
      expect(bar(outro.start + 3).every((e) => !e.kick && !e.bass && !e.clap && !e.hat && !e.lead)).toBe(true);
    }
  });

  it('picks titles from any seed, the same every time', () => {
    expect(titleFor(12345)).toBe(titleFor(12345));
    expect(titleFor(1)).not.toBe('');
  });

  it('calls the station once a round as a stammered jingle past the middle, and the hangar never', () => {
    let stammered = 0;
    for (let seed = 0; seed < 300; seed++) {
      const song = createSong(titleFor(seed), 'round', ROUND_SECONDS);
      const jingles = song.voice.filter((line) => line.text === STATION_EN || line.text === STATION_DE);
      // the station's name opens the title line in the intro; the jingle calls it alone
      expect(jingles.length).toBeLessThanOrEqual(1);
      for (const jingle of jingles) {
        expect(jingle.style).toBe('stammer');
        expect(jingle.bar).toBeGreaterThanOrEqual(song.form[song.form.length - 1].start / 2);
      }
      stammered += song.voice.filter((line) => line.style === 'stammer').length;
    }
    expect(stammered).toBeGreaterThan(300);
    expect(createSong('Orbit Terror', 'lounge', ROUND_SECONDS).voice.every((line) => line.style === 'speech')).toBe(true);
  });

  it('breaks the link into noise in a glitch, never in drive, the bursts the same from the same title', () => {
    let glitches = 0;
    for (let seed = 0; seed < 300; seed++) {
      const song = createSong(titleFor(seed), 'round', ROUND_SECONDS);
      const glitch = song.surprises.filter((s) => s.type === 'glitch');
      if (song.flavor === 'drive') expect(glitch).toEqual([]);
      glitches += glitch.length;
      for (const s of glitch) {
        expect(s.bars).toBe(GLITCH_BARS);
        const steps = glitchSteps(song, s.bar);
        expect(steps).toEqual(glitchSteps(createSong(titleFor(seed), 'round', ROUND_SECONDS), s.bar));
        expect(steps.every((i) => i >= 0 && i <= GLITCH_MAX)).toBe(true);
      }
    }
    expect(glitches).toBeGreaterThan(50);
  });
});
