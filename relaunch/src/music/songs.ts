import { Randomizer } from '../random';

/**
 * The generative songs of Radio 2584. A song is a set of one-bar patterns, a chord
 * progression and an arrangement, all derived from a seed. Everything here is a pure
 * function of seed, bar and step: every client that knows the seed and the song time
 * plays exactly the same notes, and a client can jump to any point of a song.
 */

/**
 * - robotik: the electro of the late 1970s/early 1980s; clean drum machine, octave basses, pling arpeggios.
 * - acid: squelching, resonant 303 basslines over four-on-the-floor.
 * - chip: fast square-wave arpeggios and noise drums, like a home computer's sound chip.
 * - detroit: deep, syncopated bass with dub chord stabs and echoes.
 * - rave: hard, distorted offbeat bass, screaming leads, 2000s club techno.
 */
export type Style = 'robotik' | 'acid' | 'chip' | 'detroit' | 'rave';
export const STYLES: Style[] = ['robotik', 'acid', 'chip', 'detroit', 'rave'];

/** Calm songs for the menu and the flight school, driving songs for tournament rounds. */
export type Energy = 'lounge' | 'round';

export interface BassStep {
  /** Scale steps above the current chord root. */
  degree: number;
  octave: number;
  accent: boolean;
  /** Glides from the previous note without a new attack. */
  slide: boolean;
}

export interface LeadStep {
  degree: number;
  octave: number;
  /** Length in sixteenth steps. */
  length: number;
  velocity: number;
}

export interface Song {
  seed: number;
  style: Style;
  energy: Energy;
  title: string;
  bpm: number;
  /** Delay of every second sixteenth, as a share of a sixteenth. */
  swing: number;
  /** MIDI note of the key's root in the bass register. */
  root: number;
  scale: number[];
  /** Scale degree of each chord. */
  progression: number[];
  chordBars: number;
  /** Velocity per sixteenth of one bar, 0 = silent. */
  kick: number[];
  clap: number[];
  hat: number[];
  openHat: number[];
  stab: number[];
  /** Two variations of the bassline; sections switch between them. */
  bass: (BassStep | null)[][];
  /** Index into the chord tones over two octaves, per sixteenth. */
  arp: (number | null)[];
  /** A two-bar motif that follows the chords. */
  lead: (LeadStep | null)[];
  /** Song time in seconds where the finale and the outro begin (Infinity: never). */
  finaleAt: number;
  outroAt: number;
}

export type SectionKind = 'intro' | 'groove' | 'build' | 'drop' | 'main' | 'breakdown' | 'finale' | 'outro';

export interface Section {
  kind: SectionKind;
  /** Bar within the section and share of the section that has passed. */
  bar: number;
  progress: number;
  kick: boolean;
  clap: boolean;
  hat: boolean;
  openHat: boolean;
  bass: boolean;
  bassVariation: number;
  arp: boolean;
  lead: boolean;
  pad: boolean;
  stab: boolean;
  /** Brightness of the master filter, 0 (dark) to 1 (open). */
  brightness: number;
  /** Extra drive on bass and lead, 0..1. */
  dirt: number;
}

export const SECTION_BARS = 8;
export const STEPS_PER_BAR = 16;

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

const PROGRESSIONS = [
  [0, 5, 2, 6],
  [0, 3, 6, 2],
  [0, 0, 5, 6],
  [0, 4, 5, 3],
  [0, 6, 5, 6],
  [0, 2, 3, 4],
  [0, 5, 3, 4],
];

const STYLE_SETTINGS: Record<Style, { bpm: [number, number]; scales: number[][]; swing: number; chordBars: number }> = {
  robotik: { bpm: [112, 122], scales: [MINOR, DORIAN], swing: 0, chordBars: 2 },
  acid: { bpm: [128, 134], scales: [MINOR, PHRYGIAN], swing: 0.08, chordBars: 2 },
  chip: { bpm: [138, 150], scales: [MINOR, HARMONIC_MINOR], swing: 0, chordBars: 1 },
  detroit: { bpm: [122, 128], scales: [DORIAN, MINOR], swing: 0.12, chordBars: 2 },
  rave: { bpm: [136, 142], scales: [PHRYGIAN, MINOR], swing: 0, chordBars: 2 },
};

const TITLE_FIRST = ['Neon', 'Clone', 'Kessler', 'Orbit', 'Perihelion', 'Sponsor', 'Ion', 'Delta-V', 'Burn', 'Retro', 'Vacuum', 'Tungsten', 'Flip', 'Hull', 'Plasma', 'Reactor', 'Belt', 'Slingshot'];
const TITLE_SECOND = ['Protocol', 'Drift', 'Boogie', 'Express', 'Overdrive', 'Machine', 'Ritual', 'Funk', 'Breach', 'Theory', 'Pulse', 'Station', 'Run', 'Number Nine', 'Disco', 'Baby', 'Mantra', 'Static'];

/** Mixes two integers into a seed for the Randomizer (never 0). */
export function mixSeed(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f);
  h ^= h >>> 13;
  return ((h >>> 0) % 2147483000) + 1;
}

/** A seed from a text, e.g. a tournament room code. */
export function textSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 2147483000) + 1;
}

const pick = <T>(r: Randomizer, list: T[]): T => list[r.nextInt() % list.length];
const chance = (r: Randomizer, p: number) => r.nextFloat() < p;

function drums(r: Randomizer, style: Style) {
  const kick = new Array(STEPS_PER_BAR).fill(0);
  const clap = new Array(STEPS_PER_BAR).fill(0);
  const hat = new Array(STEPS_PER_BAR).fill(0);
  const openHat = new Array(STEPS_PER_BAR).fill(0);
  if (style === 'robotik') {
    // drum machine electro: kick on one and the "and" of three, snare on two and four
    kick[0] = 1;
    kick[8] = 0.9;
    if (chance(r, 0.6)) kick[10] = 0.7;
    if (chance(r, 0.4)) kick[6] = 0.6;
    clap[4] = clap[12] = 1;
    for (let i = 0; i < STEPS_PER_BAR; i += 2) hat[i] = i % 4 === 0 ? 0.8 : 0.5;
    if (chance(r, 0.5)) for (let i = 1; i < STEPS_PER_BAR; i += 4) hat[i] = 0.3;
  } else {
    for (let i = 0; i < STEPS_PER_BAR; i += 4) kick[i] = 1;
    if (style === 'rave' && chance(r, 0.5)) kick[14] = 0.6;
    clap[4] = clap[12] = 1;
    if (style === 'chip') clap[4] = 0;
    for (let i = 2; i < STEPS_PER_BAR; i += 4) openHat[i] = style === 'chip' ? 0 : 0.8;
    for (let i = 0; i < STEPS_PER_BAR; i++) {
      if (openHat[i]) continue;
      const density = style === 'chip' ? 0.9 : style === 'detroit' ? 0.75 : 0.55;
      if (chance(r, density)) hat[i] = i % 2 === 0 ? 0.6 : 0.35 + r.nextFloat() * 0.2;
    }
    if (style === 'detroit' && chance(r, 0.5)) clap[15] = 0.4;
  }
  return { kick, clap, hat, openHat };
}

function bassline(r: Randomizer, style: Style): (BassStep | null)[] {
  const steps: (BassStep | null)[] = new Array(STEPS_PER_BAR).fill(null);
  const note = (degree: number, octave = 0, accent = false, slide = false): BassStep => ({ degree, octave, accent, slide });
  switch (style) {
    case 'robotik':
      // octave jumps in eighths, the sound of the early sequencers
      for (let i = 0; i < STEPS_PER_BAR; i += 2) steps[i] = note(chance(r, 0.15) ? 4 : 0, (i / 2) % 2, i % 8 === 0);
      if (chance(r, 0.5)) steps[15] = note(0, 1);
      break;
    case 'acid':
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        if (!chance(r, i % 4 === 0 ? 0.9 : 0.65)) continue;
        const degree = pick(r, [0, 0, 0, 2, 4, 6, 7, -1]);
        steps[i] = note(degree, chance(r, 0.25) ? 1 : 0, chance(r, 0.3), i > 0 && chance(r, 0.2));
      }
      break;
    case 'chip':
      for (let i = 0; i < STEPS_PER_BAR; i += 2) steps[i] = note(pick(r, [0, 0, 4, 7]), i % 4 === 2 ? 1 : 0);
      break;
    case 'detroit': {
      const hits = [0, 3, 6, 10, 12, 14];
      for (const i of hits) if (i === 0 || chance(r, 0.7)) steps[i] = note(pick(r, [0, 0, 0, 6, 4]), 0, i === 0, false);
      break;
    }
    case 'rave':
      // rolling offbeat bass between the kicks
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        if (i % 4 === 0) continue;
        if (i % 4 === 2 || chance(r, 0.45)) steps[i] = note(chance(r, 0.15) ? pick(r, [1, 4, 6]) : 0, 0, i % 4 === 2);
      }
      break;
  }
  return steps;
}

function arpeggio(r: Randomizer, style: Style): (number | null)[] {
  const shape = pick(r, ['up', 'down', 'updown', 'random']);
  const span = style === 'chip' ? 6 : 4;
  const rate = style === 'chip' ? 1 : pick(r, [1, 2]);
  const steps: (number | null)[] = [];
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    if (i % rate !== 0 || (style !== 'chip' && chance(r, 0.15))) {
      steps.push(null);
      continue;
    }
    const k = i / rate;
    let index: number;
    if (shape === 'up') index = k % span;
    else if (shape === 'down') index = span - 1 - (k % span);
    else if (shape === 'updown') index = span - 1 - Math.abs((k % (2 * span - 2)) - (span - 1));
    else index = r.nextInt() % span;
    steps.push(index);
  }
  return steps;
}

function leadMotif(r: Randomizer, style: Style): (LeadStep | null)[] {
  const steps: (LeadStep | null)[] = new Array(STEPS_PER_BAR * 2).fill(null);
  const density = style === 'chip' ? 0.5 : style === 'robotik' ? 0.35 : 0.25;
  let degree = pick(r, [0, 2, 4]);
  let i = 0;
  while (i < steps.length) {
    if (chance(r, density) || i === 0) {
      const length = pick(r, style === 'chip' ? [1, 1, 2, 2, 4] : [1, 2, 2, 3, 4, 6]);
      degree = Math.max(-2, Math.min(9, degree + pick(r, [-2, -1, -1, 0, 1, 1, 2, 3])));
      steps[i] = { degree, octave: 0, length, velocity: 0.7 + r.nextFloat() * 0.3 };
      i += length;
    } else {
      i++;
    }
  }
  return steps;
}

function chordStabs(r: Randomizer, style: Style): number[] {
  const stab = new Array(STEPS_PER_BAR).fill(0);
  const hits = style === 'detroit' ? [3, 6, 10, 14] : style === 'rave' ? [2, 6, 10, 14] : [0, 6, 12];
  for (const i of hits) if (chance(r, 0.65)) stab[i] = 0.6 + r.nextFloat() * 0.4;
  return stab;
}

/** A song from a seed. The style follows from the seed unless one is given. */
export function createSong(seed: number, energy: Energy, roundLength: number, style?: Style): Song {
  const r = new Randomizer(seed);
  const chosen = style ?? STYLES[r.nextInt() % STYLES.length];
  const settings = STYLE_SETTINGS[chosen];
  const lounge = energy === 'lounge';
  const bpm = Math.round(r.range(settings.bpm[0], settings.bpm[1]) * (lounge ? 0.85 : 1));
  const { kick, clap, hat, openHat } = drums(r, chosen);
  return {
    seed,
    style: chosen,
    energy,
    title: `${pick(r, TITLE_FIRST)} ${pick(r, TITLE_SECOND)}`,
    bpm,
    swing: settings.swing,
    root: 33 + (r.nextInt() % 8),
    scale: pick(r, settings.scales),
    progression: pick(r, PROGRESSIONS),
    chordBars: settings.chordBars,
    kick,
    clap,
    hat,
    openHat,
    stab: chordStabs(r, chosen),
    bass: [bassline(r, chosen), bassline(r, chosen)],
    arp: arpeggio(r, chosen),
    lead: leadMotif(r, chosen),
    finaleAt: lounge ? Infinity : roundLength - 60,
    outroAt: lounge ? Infinity : roundLength,
  };
}

export function barSeconds(song: Song): number {
  return (60 / song.bpm) * 4;
}

/** MIDI note of a scale degree (may be negative or beyond one octave) above the root. */
export function scaleNote(song: Song, degree: number): number {
  const length = song.scale.length;
  const octave = Math.floor(degree / length);
  return song.root + 12 * octave + song.scale[((degree % length) + length) % length];
}

/** Scale degree of the chord that sounds in a bar. */
export function chordAt(song: Song, bar: number): number {
  return song.progression[Math.floor(bar / song.chordBars) % song.progression.length];
}

/** The order of sections after intro and first groove; repeats with seeded variations. */
const CYCLE: SectionKind[] = ['build', 'drop', 'main', 'groove', 'breakdown', 'build', 'drop', 'main'];
const LOUNGE_CYCLE: SectionKind[] = ['breakdown', 'groove', 'groove', 'breakdown'];

function sectionKind(song: Song, index: number, startSeconds: number): SectionKind {
  if (startSeconds >= song.outroAt) return 'outro';
  if (startSeconds >= song.finaleAt) return 'finale';
  if (song.energy === 'lounge') return LOUNGE_CYCLE[index % LOUNGE_CYCLE.length];
  if (index === 0) return 'intro';
  if (index === 1) return 'groove';
  const r = new Randomizer(mixSeed(song.seed, index));
  const kind = CYCLE[(index - 2) % CYCLE.length];
  // a plain main section sometimes turns into a breakdown or carries the lead
  if (kind === 'main' && chance(r, 0.25)) return 'breakdown';
  return kind;
}

/** What plays in a bar of the song. */
export function sectionAt(song: Song, bar: number): Section {
  const index = Math.floor(bar / SECTION_BARS);
  const start = index * SECTION_BARS * barSeconds(song);
  const kind = sectionKind(song, index, start);
  const inSection = bar % SECTION_BARS;
  const progress = inSection / SECTION_BARS;
  const r = new Randomizer(mixSeed(song.seed ^ 0x5bd1e995, index));
  const variation = r.nextInt() % 2;
  const leadOn = chance(r, 0.6);
  const lounge = song.energy === 'lounge';
  const base: Section = {
    kind, bar: inSection, progress,
    kick: true, clap: true, hat: true, openHat: true, bass: true, bassVariation: variation,
    arp: false, lead: false, pad: false, stab: false, brightness: 1, dirt: 0,
  };
  switch (kind) {
    case 'intro':
      return { ...base, clap: false, openHat: inSection >= 4, bass: inSection >= 4, brightness: 0.3 + 0.6 * progress };
    case 'groove':
      return { ...base, arp: lounge, stab: !lounge && variation === 1, pad: lounge, kick: !lounge || inSection % 2 === 0, clap: !lounge, openHat: !lounge, brightness: lounge ? 0.55 : 0.85 };
    case 'build':
      return { ...base, kick: inSection < 6, openHat: false, arp: true, brightness: 0.35 + 0.65 * progress, dirt: 0.3 * progress };
    case 'drop':
      return { ...base, arp: true, lead: true, stab: true, dirt: 0.5 };
    case 'main':
      return { ...base, arp: true, lead: leadOn, stab: variation === 0, dirt: 0.3 };
    case 'breakdown':
      return { ...base, kick: false, clap: false, openHat: false, hat: !lounge || inSection >= 4, bass: lounge && inSection >= 4, arp: true, pad: true, lead: !lounge && leadOn, brightness: lounge ? 0.45 : 0.55 };
    case 'finale':
      return { ...base, arp: true, lead: true, stab: true, pad: inSection < 2, dirt: 0.8 };
    case 'outro':
      return { ...base, clap: false, openHat: false, bass: false, pad: true, arp: true, brightness: Math.max(0.2, 0.7 - progress), dirt: 0 };
  }
}
