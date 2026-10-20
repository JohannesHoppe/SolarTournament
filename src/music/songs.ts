import { textSeed } from '../random';
import { NOW_PLAYING_DE, NOW_PLAYING_EN, PHRASES_DE, PHRASES_EN, STATION_DE, STATION_EN, TITLE_FIRST, TITLE_FIRST_DE, TITLE_SECOND, TITLE_SECOND_DE, type Language } from './lines';

/**
 * The generative techno of Radio 2584. Every tournament round gets a track of its own, and
 * the track's title is its seed: the same title always grows the same track. Everything
 * here is a pure function of title, bar and step: every decision is an integer hash of those
 * numbers, there is no random stream with state. So every client plays exactly the same
 * notes, and a client can jump to any point of a track.
 *
 * A track is a flavor (sound and tempo), a strategy (how the track develops), a handful of
 * surprises, and the voice of the regime. The rules follow techno production practice; see
 * "Radio 2584" in the README.
 */

/**
 * - hard: rolling bass under a heavy rumble, peak-time hard techno.
 * - industrial: bit-crushed, metallic percussion, cowbells and claves.
 * - acid: a squelching 303 line carries the track.
 * - ebm: electronic body music, a sequenced 16th bass and a backbeat.
 * - french: a chord loop that a filter opens and closes, phaser and pump.
 * - motorik: Kraftwerk's machine pop, electro beat, octave bass, pling arpeggios, German voice.
 * - schranz, rave: rare guests, loop-driven and tom-heavy or with stabs and a hoover.
 */
export type Flavor = 'hard' | 'industrial' | 'acid' | 'ebm' | 'french' | 'motorik' | 'schranz' | 'rave';

/**
 * How a track develops:
 * - classic: grooves and peaks, kick-less breakdowns, re-entries.
 * - relentless: no breakdown at all; layers drop out for a bar or two at irregular moments (Jeff Mills).
 * - hypnotic: one long accumulation, one parameter slowly turning (Acid Tracks, Steve Reich).
 * - movements: the first half belongs to the lead, the second to the bass; the lead never returns.
 * - switcher: the felt tempo changes, half-time and broken-kick sections between the straight ones.
 * - fakeDrop: a drop that withholds the low end, a gap, and then the real one.
 * - polymeter: percussion and acid loops of odd lengths drift against the bar and snap back in the finale.
 */
export type Strategy = 'classic' | 'relentless' | 'hypnotic' | 'movements' | 'switcher' | 'fakeDrop' | 'polymeter';
const STRATEGIES: Strategy[] = ['classic', 'relentless', 'hypnotic', 'movements', 'switcher', 'fakeDrop', 'polymeter'];

/** Tracks for tournament rounds run the full arc; the menu idles in a groove. */
export type Energy = 'lounge' | 'round';

export type SectionKind = 'intro' | 'groove' | 'peak' | 'break' | 'strip' | 'gap' | 'finale' | 'outro';
export type Groove = 'four' | 'half' | 'broken' | 'electro';
export type BassStyle = 'rolling' | 'offbeat' | 'ebm' | 'moroder';
export type LeadVoice = 'stab' | 'bell' | 'hoover' | 'arp';

export interface Section {
  kind: SectionKind;
  start: number;
  bars: number;
  /** Energy at the start and at the end of the section, 0..1. */
  from: number;
  to: number;
  groove: Groove;
  /** Kick and rumble high-passed, no bass: a drop that is not one yet. */
  fake?: boolean;
  /** Loops of odd lengths. */
  poly?: boolean;
  /** Second movement: the lead is gone, the bass takes over. */
  second?: boolean;
  /** The only layers that may play. */
  only?: Layer[];
}

export type Layer = 'kick' | 'rumble' | 'bass' | 'hat' | 'openHat' | 'ride' | 'clap' | 'perc' | 'metal' | 'acid' | 'lead' | 'chords';

export type FillType = 'kickEdit' | 'hatRoll' | 'clapBurst' | 'tomRun' | 'vacuum' | 'kickRoll' | 'stutter' | 'tapeStop' | 'rugPull';

export interface Fill {
  type: FillType;
  /** First step of the bar the fill takes over. */
  from: number;
  variant: number;
}

/** A surprise that spans one or more bars. */
export type SurpriseType = 'filterDip' | 'delayThrow' | 'siren' | 'bomb' | 'bitDrop' | 'keyLift';

export interface Surprise {
  type: SurpriseType;
  bar: number;
  bars: number;
}

export interface VoiceLine {
  bar: number;
  language: Language;
  text: string;
  /** chop: one word per eighth, like a vocoder hook; speech: sentence after sentence. */
  style: 'chop' | 'speech';
}

export interface BarInfo {
  bar: number;
  section: Section;
  inSection: number;
  energy: number;
  layers: Record<Layer, boolean>;
  fill: Fill | null;
  /** Master filter, 0 (dark) to 1 (open). */
  brightness: number;
  /** Distortion on kick, bass and stabs, 0..1. */
  drive: number;
  /** A noise riser starts at this bar and lasts this many bars. */
  riserBars: number;
  /** The first beat crashes in: a section starts after a breakdown. */
  impact: boolean;
  bassStyle: BassStyle;
  /** Semitones the tonal parts are lifted (a key lift late in the track). */
  transpose: number;
  /** A surprise that starts in this bar. */
  surprise: Surprise | null;
  /** The regime speaks, starting at the first beat of this bar. */
  voice: VoiceLine | null;
  /** Position of the french chord filter in its 8-bar cycle, 0..1. */
  sweep: number;
}

/**
 * The kick of a track, its own in every track: how far and how fast the pitch falls, how long
 * it rings, how it is distorted, and the rumble under it.
 */
export interface KickDesign {
  /** Pitch at the hit and after the first stage, as multiples of the fundamental. */
  start: number;
  middle: number;
  /** Duration of the two stages of the pitch drop (s). */
  snap: number;
  fall: number;
  /** Length of the body as a share of a beat. */
  length: number;
  /** gabber: tanh then atan, hard: clipped flat, soft: warm tanh, fold: folded back, metallic. */
  shape: 'gabber' | 'hard' | 'soft' | 'fold';
  /** Level of the noise click, 0..1. */
  click: number;
  /** Lowpass after the distortion (Hz): dark and round or bright and cutting. */
  tone: number;
  /** Rumble: its upper limit (Hz), level, and how long it takes to swell back (share of a beat). */
  rumbleCut: number;
  rumbleLevel: number;
  swell: number;
}

export interface Hit {
  note: number;
  velocity: number;
  /** Length in sixteenth steps. */
  length: number;
  accent: boolean;
  slide: boolean;
}

export interface Song {
  title: string;
  seed: number;
  language: Language;
  flavor: Flavor;
  strategy: Strategy;
  energy: Energy;
  bpm: number;
  /** Delay of every second sixteenth, as a share of a sixteenth. */
  swing: number;
  /** MIDI note of the kick's fundamental; the whole track is in this key. */
  root: number;
  acidSet: number[];
  acidLength: number;
  stabShape: number[];
  /** Root movement per two bars for sequenced basses, arpeggios and chords (semitones). */
  progression: number[];
  /** Polymetric percussion: k hits spread over a loop of n sixteenths. */
  perc: { k: number; n: number };
  /** Cowbell and clave: Euclidean pattern over 16 steps. */
  metal: { k: number; rotation: number };
  bassStyle: BassStyle;
  lead: LeadVoice;
  kick: KickDesign;
  form: Section[];
  /** Bars of the lounge cycle; rounds play their form once. */
  cycle: number;
  /** Two-bar lead motif: scale steps, lengths in sixteenths. */
  motif: { step: number; degree: number; length: number }[];
  surprises: Surprise[];
  voice: VoiceLine[];
  cache: Map<number, BarInfo>;
}

export const STEPS_PER_BAR = 16;
const PHRASE = 8;

// ---- stateless hashing --------------------------------------------------------------------

/** SquirrelNoise5 (Squirrel Eiserloh): a noise function, the n-th value is as cheap as the next. */
function squirrel(x: number, seed: number): number {
  let m = Math.imul(x | 0, 0xd2a80a3f);
  m = (m + seed) | 0;
  m ^= m >>> 9;
  m = (m + 0xa884f197) | 0;
  m ^= m >>> 11;
  m = Math.imul(m, 0x6c736f4b);
  m ^= m >>> 13;
  m = (m + 0xb79f3abb) | 0;
  m ^= m >>> 15;
  m = Math.imul(m, 0x1b56c4f5);
  m ^= m >>> 17;
  return m >>> 0;
}

/** Hash of a seed and any integer keys. */
export function hash(seed: number, ...keys: number[]): number {
  let h = seed >>> 0;
  for (const k of keys) h = squirrel(k, h);
  return h;
}

/** Value in [0, 1) from a hash; exact in every browser (a division by a power of two). */
const unit = (seed: number, ...keys: number[]) => hash(seed, ...keys) / 4294967296;
const choose = <T>(list: readonly T[], seed: number, ...keys: number[]): T => list[hash(seed, ...keys) % list.length];

export { textSeed };

/** Length of a tournament round (s); a round's track is grown for it, in the game, on the radio page and in its WAV file alike. */
export const ROUND_SECONDS = 5 * 60;

/** Mixes two integers into a seed. */
export function mixSeed(a: number, b: number): number {
  return (hash(a, b) % 2147483000) + 1;
}

/** Independent hash channels, so decisions about different things never correlate. */
const enum Ch {
  Genes = 1,
  Importance,
  Mutation,
  Acid,
  Fill,
  Note,
  Velocity,
  Lead,
  Title,
  Mute,
  Surprise,
  Voice,
}

const INSTRUMENT: Record<Layer, number> = { kick: 1, rumble: 2, bass: 3, hat: 4, openHat: 5, ride: 6, clap: 7, perc: 8, metal: 9, acid: 10, lead: 11, chords: 12 };

// ---- titles: the seed you can read --------------------------------------------------------

/** How often each flavor comes up (relative weights). */
const FLAVOR_WEIGHTS: [Flavor, number][] = [['hard', 4], ['industrial', 4], ['acid', 4], ['ebm', 5], ['french', 5], ['schranz', 1], ['rave', 1]];
/** One track in thirteen is a German motorik track. */
const MOTORIK_CHANCE = 1 / 13;

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The title of a track, picked by any seed (e.g. room code and round number). */
export function titleFor(seed: number): string {
  if (unit(seed, Ch.Title, 0) < MOTORIK_CHANCE) {
    return `${capitalize(choose(TITLE_FIRST_DE, seed, Ch.Title, 1))} ${capitalize(choose(TITLE_SECOND_DE, seed, Ch.Title, 2))}`;
  }
  return `${capitalize(choose(TITLE_FIRST, seed, Ch.Title, 1))} ${capitalize(choose(TITLE_SECOND, seed, Ch.Title, 2))}`;
}

/** German titles are made of German words only; the word lists share no word. */
function isGerman(title: string): boolean {
  const [first, second] = title.toLowerCase().split(' ');
  return TITLE_FIRST_DE.includes(first) && TITLE_SECOND_DE.includes(second);
}

// ---- genes: what a title decides once -----------------------------------------------------

const FLAVOR_SETTINGS: Record<Flavor, { bpm: [number, number]; swing: [number, number]; bass: BassStyle[]; lead: LeadVoice[]; groove: Groove }> = {
  hard: { bpm: [140, 148], swing: [0, 0.06], bass: ['offbeat', 'offbeat', 'rolling'], lead: ['stab', 'hoover', 'bell'], groove: 'four' },
  industrial: { bpm: [134, 141], swing: [0.04, 0.12], bass: ['offbeat', 'rolling', 'ebm'], lead: ['stab', 'bell'], groove: 'four' },
  acid: { bpm: [138, 144], swing: [0, 0.08], bass: ['offbeat', 'offbeat', 'rolling'], lead: ['stab', 'bell'], groove: 'four' },
  ebm: { bpm: [132, 140], swing: [0, 0.03], bass: ['ebm', 'ebm', 'moroder'], lead: ['arp', 'stab', 'hoover'], groove: 'four' },
  french: { bpm: [126, 132], swing: [0.04, 0.1], bass: ['offbeat', 'moroder'], lead: ['bell', 'arp'], groove: 'four' },
  motorik: { bpm: [126, 134], swing: [0, 0.02], bass: ['moroder', 'ebm'], lead: ['arp', 'arp', 'bell'], groove: 'electro' },
  schranz: { bpm: [148, 152], swing: [0, 0.04], bass: ['rolling', 'offbeat'], lead: ['stab'], groove: 'four' },
  rave: { bpm: [142, 148], swing: [0, 0.04], bass: ['offbeat', 'rolling'], lead: ['hoover', 'stab'], groove: 'four' },
};

/**
 * Semitone sets for the acid line, heavy on root and octave. Duplicates weigh a note.
 * After the note sets of Vitling's "Endless Acid Banger" (CC BY 4.0).
 */
const ACID_SETS = [
  [0, 0, 12, 24, 27],
  [0, 0, 0, 12, 10, 19, 26, 27],
  [0, 1, 7, 10, 12, 13],
  [0, 0, 0, 12],
  [0, 0, 12, 14, 15, 19],
  [0, 0, 0, 7, 12, 15, 17, 20, 24],
];
const STAB_SHAPES = [[0, 3, 7], [0, 7, 10], [0, 3, 10, 14], [0, 5, 7]];
const PROGRESSIONS = [[0, 0, 3, 5], [0, -2, 0, 3], [0, 5, 3, -2], [0, 0, 7, 5], [0, 3, -2, 0], [0, 0, 0, -2]];
/** Lead motif degrees in semitones; minor, with the flat second for menace. */
const LEAD_NOTES = [0, 0, 3, 7, 10, 12, 1, -2];

/** A track from its title. The title decides everything; online, titleFor picks the title. */
export function createSong(title: string, energy: Energy, roundLength: number, flavor?: Flavor): Song {
  const seed = textSeed(title.toLowerCase());
  const german = isGerman(title);
  const chosen = flavor ?? (german ? 'motorik' : weighted(seed));
  const settings = FLAVOR_SETTINGS[chosen];
  const lounge = energy === 'lounge';
  const bpm = settings.bpm[0] + (hash(seed, Ch.Genes, 2) % (settings.bpm[1] - settings.bpm[0] + 1)) - (lounge ? 6 : 0);
  const strategy: Strategy = lounge ? 'hypnotic' : chosen === 'motorik' ? choose(['relentless', 'hypnotic', 'movements'], seed, Ch.Genes, 3) : choose(STRATEGIES, seed, Ch.Genes, 3);
  const song: Song = {
    title,
    seed,
    language: german ? 'de' : 'en',
    flavor: chosen,
    strategy,
    energy,
    bpm,
    swing: settings.swing[0] + unit(seed, Ch.Genes, 5) * (settings.swing[1] - settings.swing[0]),
    // kick fundamental between E1 (41 Hz) and B1 (62 Hz)
    root: 28 + (hash(seed, Ch.Genes, 6) % 8),
    acidSet: choose(ACID_SETS, seed, Ch.Genes, 7),
    // a 12-step acid loop over the 16-step bar is a classic acid techno trick
    acidLength: unit(seed, Ch.Genes, 8) < 0.4 ? 12 : 16,
    stabShape: choose(STAB_SHAPES, seed, Ch.Genes, 9),
    progression: choose(PROGRESSIONS, seed, Ch.Genes, 10),
    perc: { k: choose([2, 3, 3], seed, Ch.Genes, 11), n: choose([7, 9, 12, 16], seed, Ch.Genes, 12) },
    metal: { k: choose([3, 5, 7], seed, Ch.Genes, 13), rotation: hash(seed, Ch.Genes, 14) % 16 },
    bassStyle: choose(settings.bass, seed, Ch.Genes, 15),
    lead: choose(settings.lead, seed, Ch.Genes, 16),
    kick: kickDesign(seed, chosen),
    form: [],
    cycle: 0,
    motif: leadMotif(seed),
    surprises: [],
    voice: [],
    cache: new Map(),
  };
  if (song.perc.k >= song.perc.n) song.perc.k = song.perc.n - 2;
  song.form = lounge ? loungeForm(settings.groove) : roundForm(song, roundLength, settings.groove);
  song.cycle = lounge ? song.form.reduce((sum, s) => sum + s.bars, 0) : 0;
  song.surprises = lounge ? [] : planSurprises(song);
  song.voice = planVoice(song);
  return song;
}

/** Each flavor leans towards its own distortion; the rest of the kick is the track's own. */
const KICK_SHAPES: Record<Flavor, KickDesign['shape'][]> = {
  hard: ['hard', 'soft', 'gabber', 'fold'],
  industrial: ['fold', 'hard', 'gabber'],
  acid: ['soft', 'gabber', 'hard'],
  ebm: ['hard', 'soft'],
  french: ['soft', 'soft', 'hard'],
  motorik: ['soft', 'hard'],
  schranz: ['gabber', 'hard'],
  rave: ['hard', 'fold'],
};

function kickDesign(seed: number, flavor: Flavor): KickDesign {
  const r = (key: number, min: number, max: number) => min + unit(seed, Ch.Genes, 40 + key) * (max - min);
  const soft = flavor === 'french' || flavor === 'motorik';
  return {
    start: r(1, 10, 26),
    middle: r(2, 4, 9),
    snap: r(3, 0.008, 0.025),
    fall: r(4, 0.06, 0.18),
    length: soft ? r(5, 0.4, 0.6) : r(5, 0.45, 0.8),
    shape: choose(KICK_SHAPES[flavor], seed, Ch.Genes, 46),
    click: r(7, 0.2, 1),
    tone: r(8, 2500, 9500),
    rumbleCut: r(9, 110, 230),
    rumbleLevel: soft ? r(10, 0.2, 0.5) : r(10, 0.5, 1),
    swell: r(11, 0.4, 0.85),
  };
}

function weighted(seed: number): Flavor {
  const total = FLAVOR_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let pick = hash(seed, Ch.Genes, 1) % total;
  for (const [flavor, weight] of FLAVOR_WEIGHTS) {
    if (pick < weight) return flavor;
    pick -= weight;
  }
  return 'hard';
}

export function barSeconds(song: Song): number {
  return (60 / song.bpm) * 4;
}

function leadMotif(seed: number) {
  const notes: { step: number; degree: number; length: number }[] = [];
  let step = 0;
  for (let i = 0; step < 32; i++) {
    const length = choose([4, 4, 6, 8, 2, 2], seed, Ch.Lead, i, 1);
    if (unit(seed, Ch.Lead, i, 2) < 0.75) notes.push({ step, degree: choose(LEAD_NOTES, seed, Ch.Lead, i, 3), length: Math.min(length, 32 - step) });
    step += length;
  }
  return notes;
}

// ---- form: the strategies -----------------------------------------------------------------

type Block = Omit<Section, 'start' | 'groove'> & { groove?: Groove };
const block = (kind: SectionKind, bars: number, from: number, to: number, extra: Partial<Section> = {}): Block => ({ kind, bars, from, to, ...extra });

/** Middle sections between intro and the break before the finale, per strategy. */
function middleBlocks(song: Song): Block[] {
  const seed = song.seed;
  switch (song.strategy) {
    case 'classic':
      return choose([
        [block('groove', 32, 0.5, 0.7), block('break', 16, 0.3, 0.55), block('peak', 32, 0.8, 0.9), block('groove', 16, 0.6, 0.7), block('break', 8, 0.35, 0.6), block('peak', 32, 0.85, 0.95)],
        [block('groove', 24, 0.55, 0.7), block('peak', 24, 0.75, 0.85), block('break', 16, 0.3, 0.6), block('peak', 40, 0.85, 0.95), block('groove', 16, 0.65, 0.75)],
      ], seed, Ch.Genes, 20);
    case 'relentless':
      // no breakdown: energy only through layers that come and go (see mutes in barInfo)
      return [block('groove', 40, 0.55, 0.75), block('strip', 2, 0.6, 0.6, { only: ['kick', 'clap'] }), block('peak', 42, 0.75, 0.9), block('strip', 4, 0.6, 0.6, { only: ['kick', 'rumble', 'lead', 'acid'] }), block('peak', 48, 0.85, 0.95)];
    case 'hypnotic':
      // one long accumulation; the filter dips once before the finale
      return [block('groove', 120, 0.45, 0.92), block('strip', 4, 0.5, 0.5, { only: ['kick', 'rumble', 'hat'] })];
    case 'movements':
      return [block('groove', 64, 0.55, 0.85), block('strip', 4, 0.6, 0.6, { only: ['kick', 'bass'] }), block('peak', 52, 0.8, 0.95, { second: true })];
    case 'switcher':
      return [block('groove', 32, 0.55, 0.7), block('groove', 16, 0.6, 0.7, { groove: 'half' }), block('peak', 32, 0.8, 0.9), block('groove', 16, 0.65, 0.75, { groove: 'broken' }), block('peak', 24, 0.8, 0.9)];
    case 'fakeDrop':
      return [block('groove', 40, 0.5, 0.7), block('break', 16, 0.3, 0.6), block('peak', 4, 0.8, 0.8, { fake: true }), block('gap', 2, 0.4, 0.4, { only: ['lead', 'hat'] }), block('peak', 34, 0.85, 0.95), block('break', 8, 0.35, 0.6), block('groove', 16, 0.75, 0.85, { groove: 'broken' })];
    case 'polymeter':
      return [block('groove', 32, 0.5, 0.65), block('groove', 48, 0.6, 0.8, { poly: true }), block('strip', 8, 0.5, 0.5, { only: ['kick', 'rumble', 'perc'], poly: true }), block('peak', 40, 0.8, 0.95, { poly: true })];
  }
}

function roundForm(song: Song, roundLength: number, groove: Groove): Section[] {
  const bar = barSeconds(song);
  const endBar = Math.round(roundLength / bar);
  // the finale is the last minute of the round, starting on the phrase grid
  const finaleBar = Math.max(32, Math.floor((roundLength - 60) / bar / PHRASE) * PHRASE);
  const relentless = song.strategy === 'relentless' || song.strategy === 'hypnotic';
  const middleEnd = relentless ? finaleBar : finaleBar - PHRASE;
  const introBars = song.strategy === 'relentless' ? 8 : 16;
  const form: Section[] = [{ kind: 'intro', start: 0, bars: introBars, from: 0.3, to: 0.5, groove }];
  let start = introBars;
  const middle = middleBlocks(song);
  if (song.strategy === 'hypnotic') {
    // the accumulation fills the middle, and its strip lands right before the finale
    const [build, strip] = middle;
    form.push({ ...build, start, bars: middleEnd - strip.bars - start, groove: build.groove ?? groove });
    form.push({ ...strip, start: middleEnd - strip.bars, groove: strip.groove ?? groove });
    start = middleEnd;
  }
  for (let i = 0; start < middleEnd; i++) {
    const b = middle[i % middle.length];
    const bars = Math.min(b.bars, middleEnd - start);
    form.push({ ...b, start, bars, groove: b.groove ?? groove });
    start += bars;
  }
  if (!relentless) form.push({ kind: 'break', start: middleEnd, bars: PHRASE, from: 0.4, to: 0.65, groove });
  const second = song.strategy === 'movements';
  form.push({ kind: 'finale', start: finaleBar, bars: Math.max(PHRASE, endBar - finaleBar), from: 1, to: 1, groove, second });
  form.push({ kind: 'outro', start: Math.max(endBar, finaleBar + PHRASE), bars: 16, from: 0.6, to: 0.25, groove });
  return form;
}

/** The menu: the arena's groove heard through the hangar wall. */
function loungeForm(groove: Groove): Section[] {
  return [
    { kind: 'groove', start: 0, bars: 32, from: 0.4, to: 0.55, groove },
    { kind: 'break', start: 32, bars: 8, from: 0.3, to: 0.45, groove },
    { kind: 'groove', start: 40, bars: 24, from: 0.5, to: 0.6, groove },
  ];
}

function sectionAt(song: Song, bar: number): Section {
  const form = song.form;
  for (let i = form.length - 1; i >= 0; i--) if (bar >= form[i].start) return form[i];
  return form[0];
}

function energyAt(section: Section, bar: number): number {
  const progress = Math.min(1, (bar - section.start) / section.bars);
  return section.from + (section.to - section.from) * progress;
}

// ---- surprises and the voice: planned once per track --------------------------------------

const SURPRISES: SurpriseType[] = ['filterDip', 'delayThrow', 'siren', 'bitDrop', 'keyLift'];

/**
 * 3 to 5 surprises per round, 12 bars apart (8 where a track has no room for more), each type at most once. They land
 * after stable stretches: a big surprise works best when the listener is sure what comes
 * next. The bit drop belongs to industrial and EBM and to half of the other tracks; the key
 * lift only comes in the last stretch before the finale.
 */
function planSurprises(song: Song): Surprise[] {
  const seed = song.seed;
  const count = 3 + (hash(seed, Ch.Surprise, 0) % 3);
  const remaining = [...SURPRISES].sort((a, b) => hash(seed, Ch.Surprise, 1, SURPRISES.indexOf(a)) - hash(seed, Ch.Surprise, 1, SURPRISES.indexOf(b)));
  const bitDrop = song.flavor === 'industrial' || song.flavor === 'ebm' || unit(seed, Ch.Surprise, 3) >= 0.5;
  const result: Surprise[] = [];
  const finale = song.form.find((s) => s.kind === 'finale')!;
  const fits = (type: SurpriseType, bar: number) => (type !== 'keyLift' || bar >= finale.start - 48) && (type !== 'bitDrop' || bitDrop);
  // first at bars the seed picks, 12 bars apart; a track that got too few that way takes
  // them at any free groove or peak bar, closer together if it has to
  const place = (chance: number, spacing: number) => {
    for (let bar = 24; bar < finale.start && result.length < count; bar += 4) {
      const section = sectionAt(song, bar);
      if (section.kind !== 'groove' && section.kind !== 'peak') continue;
      if (result.some((s) => Math.abs(s.bar - bar) < spacing)) continue;
      if (unit(seed, Ch.Surprise, 2, bar) > chance) continue;
      // the next type in the round's order that fits here
      const type = remaining.find((t) => fits(t, bar));
      if (!type) continue;
      remaining.splice(remaining.indexOf(type), 1);
      result.push({ type, bar, bars: type === 'filterDip' ? 4 : type === 'siren' ? 2 : type === 'keyLift' ? finale.start + finale.bars + 16 - bar : 1 });
    }
  };
  place(0.3, 12);
  place(1, 12);
  place(1, 8);
  result.sort((a, b) => a.bar - b.bar);
  // half of the breakdowns open with a bomb: a deep hit into a long reverb
  for (const section of song.form) if (section.kind === 'break' && unit(seed, Ch.Surprise, 4, section.start) < 0.5) result.push({ type: 'bomb', bar: section.start, bars: 1 });
  return result;
}

/**
 * The voice: the station and the title in the intro, then propaganda at section changes and
 * now and then in between, never closer than 12 bars. Motorik tracks speak German; the
 * others now and then.
 */
function planVoice(song: Song): VoiceLine[] {
  const seed = song.seed;
  const lines: VoiceLine[] = [];
  const german = song.language === 'de';
  const titleLine = `${german ? STATION_DE : STATION_EN}. ${german ? NOW_PLAYING_DE : NOW_PLAYING_EN}. ${song.title.toLowerCase()}`;
  lines.push({ bar: song.energy === 'lounge' ? 2 : 4, language: song.language, text: titleLine, style: 'speech' });
  // in the hangar the radio only names its track; the flight computer has the floor
  if (song.energy === 'lounge') return lines;

  const englishOrder = order(seed, PHRASES_EN.length, 1);
  const germanOrder = order(seed, PHRASES_DE.length, 2);
  let english = 0;
  let deutsch = 0;
  let last = 4;
  const end = song.form[song.form.length - 1].start;
  for (let bar = 12; bar < end; bar += 4) {
    const section = sectionAt(song, bar);
    const starts = bar === section.start;
    const chance = starts ? 0.7 : section.kind === 'finale' ? 0.35 : 0.12;
    if (bar - last < 12 || unit(seed, Ch.Voice, bar) >= chance) continue;
    const speakGerman = german ? unit(seed, Ch.Voice, bar, 1) < 0.7 : unit(seed, Ch.Voice, bar, 1) < 0.12;
    const text = speakGerman ? PHRASES_DE[germanOrder[deutsch++ % germanOrder.length]] : PHRASES_EN[englishOrder[english++ % englishOrder.length]];
    lines.push({ bar, language: speakGerman ? 'de' : 'en', text, style: unit(seed, Ch.Voice, bar, 2) < 0.45 ? 'chop' : 'speech' });
    last = bar;
  }
  return lines;
}

/** A seeded permutation of 0..n-1: every phrase once before any repeats. */
function order(seed: number, n: number, channel: number): number[] {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => hash(seed, Ch.Voice, 100 + channel, a) - hash(seed, Ch.Voice, 100 + channel, b));
}

// ---- bars ---------------------------------------------------------------------------------

/** Energy a layer needs to play, per flavor; checked at the start of every 8-bar phrase. */
const GATES: Record<Flavor, Record<Layer, number>> = {
  hard: { kick: 0, rumble: 0.3, hat: 0.2, openHat: 0.3, bass: 0.4, clap: 0.5, ride: 0.7, perc: 0.6, metal: 0.9, acid: 0.85, lead: 0.75, chords: 2 },
  industrial: { kick: 0, rumble: 0.3, hat: 0.2, openHat: 0.35, bass: 0.45, clap: 0.45, ride: 0.75, perc: 0.3, metal: 0.4, acid: 0.9, lead: 0.8, chords: 2 },
  acid: { kick: 0, rumble: 0.35, hat: 0.2, openHat: 0.3, bass: 0.7, clap: 0.5, ride: 0.75, perc: 0.65, metal: 0.9, acid: 0.3, lead: 0.9, chords: 2 },
  ebm: { kick: 0, rumble: 0.5, hat: 0.25, openHat: 0.5, bass: 0.25, clap: 0.4, ride: 0.8, perc: 0.7, metal: 0.55, acid: 2, lead: 0.6, chords: 2 },
  french: { kick: 0, rumble: 0.6, hat: 0.2, openHat: 0.3, bass: 0.4, clap: 0.45, ride: 0.7, perc: 0.8, metal: 0.9, acid: 2, lead: 0.85, chords: 0.3 },
  motorik: { kick: 0, rumble: 2, hat: 0.2, openHat: 2, bass: 0.3, clap: 0.35, ride: 2, perc: 0.7, metal: 0.5, acid: 2, lead: 0.45, chords: 0.8 },
  schranz: { kick: 0, rumble: 0.3, hat: 0.15, openHat: 0.25, bass: 0.45, clap: 0.4, ride: 0.5, perc: 0.35, metal: 0.6, acid: 0.9, lead: 0.85, chords: 2 },
  rave: { kick: 0, rumble: 0.3, hat: 0.2, openHat: 0.3, bass: 0.45, clap: 0.5, ride: 0.7, perc: 0.7, metal: 0.9, acid: 0.8, lead: 0.55, chords: 2 },
};

/** Bars of a song kept in its memo (see barInfo). */
const BAR_CACHE = 512;

/** Layers that crowd each other when all of them play: the melodic parts and the extra percussion (with a salt for each group). */
const CROWDS: [Layer[], number][] = [
  [['acid', 'lead', 'chords'], 2],
  [['ride', 'perc', 'metal'], 3],
];

/** Layers a relentless track mutes for two bars at a time. */
const MUTABLE: Layer[] = ['hat', 'clap', 'openHat', 'bass', 'perc', 'lead', 'acid', 'ride'];

/** Everything about a bar that does not depend on the step. Memoized per song. */
export function barInfo(song: Song, absoluteBar: number): BarInfo {
  const cached = song.cache.get(absoluteBar);
  if (cached) return cached;
  // the lounge cycles; a round past its outro stays in the outro
  const bar = song.cycle ? absoluteBar % song.cycle : absoluteBar;
  const section = sectionAt(song, bar);
  const inSection = bar - section.start;
  const energy = section.kind === 'outro' && inSection >= section.bars ? section.to : energyAt(section, bar);
  const phraseEnergy = energyAt(section, bar - (inSection % PHRASE));
  const gates = GATES[song.flavor];
  const layers = {} as Record<Layer, boolean>;
  for (const layer of Object.keys(gates) as Layer[]) layers[layer] = phraseEnergy >= gates[layer];

  switch (section.kind) {
    case 'intro':
      layers.rumble = layers.rumble && inSection >= 8;
      layers.bass = layers.clap = layers.acid = layers.lead = layers.ride = layers.metal = false;
      layers.chords = layers.chords && song.flavor === 'french';
      break;
    case 'break':
      // the kick drops out but the rhythm goes on: hats and a thin bass (its low end cut) carry the tension
      layers.kick = layers.rumble = layers.clap = layers.ride = layers.lead = layers.openHat = false;
      layers.hat = layers.bass = true;
      break;
    case 'finale':
      for (const layer of Object.keys(layers) as Layer[]) layers[layer] = gates[layer] <= 1;
      break;
    case 'outro':
      layers.bass = layers.acid = layers.lead = layers.ride = layers.perc = layers.metal = layers.chords = false;
      layers.clap = inSection < 8;
      break;
  }
  if (section.only) for (const layer of Object.keys(layers) as Layer[]) layers[layer] = layers[layer] && section.only.includes(layer) || (section.only.includes(layer) && gates[layer] <= 1);
  if (section.fake) layers.bass = false;
  // movements: the second half belongs to the bass, the lead never returns
  if (section.second) {
    layers.lead = false;
    layers.bass = true;
  }
  // relentless: a layer drops out for two bars now and then, and every 16 bars the tops take one bar off
  if (song.strategy === 'relentless' && (section.kind === 'groove' || section.kind === 'peak')) {
    if (unit(song.seed, Ch.Mute, bar >> 1) < 0.35) layers[choose(MUTABLE, song.seed, Ch.Mute, bar >> 1, 1)] = false;
    if (inSection % 16 === 15) layers.hat = layers.ride = layers.clap = false;
  }
  // room to breathe: of the melodic parts and of the extra percussion, at most two play at
  // once; which one rests changes every eight bars
  for (const [group, salt] of CROWDS) {
    const playing = group.filter((layer) => layers[layer]);
    if (playing.length > 2) layers[choose(playing, song.seed, Ch.Mute, bar >> 3, salt)] = false;
  }

  const progress = Math.min(1, inSection / section.bars);
  let brightness = 1;
  if (section.kind === 'break') brightness = 0.35 + 0.65 * progress;
  else if (section.kind === 'intro') brightness = 0.5 + 0.5 * progress;
  else if (section.kind === 'outro') brightness = Math.max(0.3, 1 - 0.7 * progress);
  else if (section.kind === 'strip' && song.strategy === 'hypnotic') brightness = 0.3;

  const surprise = song.surprises.find((s) => s.bar === bar) ?? null;
  const dip = song.surprises.find((s) => s.type === 'filterDip' && bar >= s.bar && bar < s.bar + s.bars);
  if (dip) brightness = Math.min(brightness, 0.28);
  if (song.energy === 'lounge') brightness = Math.min(brightness, 0.55);
  const lift = song.surprises.find((s) => s.type === 'keyLift' && bar >= s.bar);

  const previous = section.start > 0 ? sectionAt(song, section.start - 1) : null;
  const info: BarInfo = {
    bar,
    section,
    inSection,
    energy,
    layers,
    fill: fillAt(song, section, inSection),
    brightness,
    // even the finale keeps some headroom: hours of full distortion wear the ears out
    drive: section.kind === 'finale' ? 0.85 : 0.25 + 0.6 * energy,
    riserBars: section.kind === 'break' && inSection === section.bars - Math.min(4, section.bars) ? Math.min(4, section.bars) : 0,
    impact: inSection === 0 && (previous?.kind === 'break' || previous?.kind === 'gap' || section.kind === 'finale'),
    bassStyle: section.second && song.bassStyle !== 'ebm' && song.bassStyle !== 'moroder' ? 'ebm' : song.bassStyle,
    transpose: lift ? choose([2, 3, 5], song.seed, Ch.Surprise, 9) : 0,
    surprise,
    voice: song.voice.find((v) => v.bar === bar) ?? null,
    sweep: (bar % 8) / 8,
  };
  // the hangar track cycles for hours: the memo holds the recent bars, not all of them
  if (song.cache.size >= BAR_CACHE) song.cache.clear();
  song.cache.set(absoluteBar, info);
  return info;
}

/** Ways to end a breakdown; a track rotates through them instead of always doing the same. */
const BREAK_ENDINGS: FillType[] = ['vacuum', 'kickRoll', 'stutter', 'rugPull', 'vacuum'];

/** Fills mark phrase ends: every 8 or 16 bars, and always at the end of a section. */
function fillAt(song: Song, section: Section, inSection: number): Fill | null {
  const seed = song.seed;
  const key = section.start + inSection;
  const lastOfSection = inSection === section.bars - 1;
  const variant = hash(seed, Ch.Fill, key, 2) % 4;
  const next = song.form[song.form.indexOf(section) + 1];
  if (lastOfSection && section.kind === 'break') {
    const index = song.form.filter((s) => s.kind === 'break' && s.start < section.start).length;
    const type = BREAK_ENDINGS[(hash(seed, Ch.Fill, 0) + index) % BREAK_ENDINGS.length];
    return { type, from: type === 'kickRoll' ? 0 : type === 'rugPull' ? 0 : 12, variant };
  }
  // a peak that runs into a breakdown may die with a tape stop
  if (lastOfSection && next?.kind === 'break' && unit(seed, Ch.Fill, key, 3) < 0.35) return { type: 'tapeStop', from: 8, variant };
  if (lastOfSection && section.kind !== 'outro') return { type: choose<FillType>(['kickEdit', 'hatRoll', 'clapBurst', 'tomRun', 'stutter'], seed, Ch.Fill, key, 1), from: 12, variant };
  if (inSection % 16 === 15 && unit(seed, Ch.Fill, key) < 0.4) return { type: choose<FillType>(['hatRoll', 'tomRun', 'kickEdit', 'stutter'], seed, Ch.Fill, key, 1), from: 12, variant };
  if (inSection % 8 === 7 && unit(seed, Ch.Fill, key) < 0.2) return { type: 'kickEdit', from: 12, variant };
  return null;
}

// ---- patterns: importance and density (after Mutable Instruments Grids) --------------------

/** How often a part mutates at the start of a 16-bar epoch. The kick never does. */
const MUTATION: Record<Layer, number> = { kick: 0, rumble: 0, bass: 0.3, hat: 0.4, openHat: 0.15, ride: 0.2, clap: 0.2, perc: 0.3, metal: 0.25, acid: 0.5, lead: 0.35, chords: 0.3 };

/** The last 16-bar epoch in which a part mutated: patterns change in steps, a few hits at a time. */
function version(song: Song, layer: Layer, bar: number): number {
  let v = 0;
  for (let epoch = 1; epoch <= bar >> 4; epoch++) if (unit(song.seed, Ch.Mutation, INSTRUMENT[layer], epoch) < MUTATION[layer]) v = epoch;
  return v;
}

/** Structural weight of a step for a part; a step plays when it outweighs 1 - density. */
function base(layer: Layer, step: number, bassStyle: BassStyle, groove: Groove): number {
  const beat = step % 4;
  switch (layer) {
    case 'hat':
      return beat === 2 ? 0.95 : beat === 0 ? 0.75 : 0.5;
    case 'openHat':
      return beat === 2 ? 1 : 0.05;
    case 'ride':
      return step % 2 === 0 ? 0.8 : 0.2;
    case 'clap':
      if (groove === 'half') return step === 8 ? 1 : 0.15;
      return step === 4 || step === 12 ? 1 : 0.2;
    case 'bass':
      // never on the kick: the kick owns the first 16th of every beat
      if (beat === 0) return 0;
      return bassStyle === 'rolling' ? (beat === 2 ? 0.95 : 0.75) : beat === 2 ? 1 : 0.25;
    case 'lead':
      return beat === 0 ? 0.1 : beat === 3 ? 0.65 : 0.55;
    case 'chords':
      // the french loop: syncopated eighths
      return step % 2 === 1 ? 0.15 : beat === 0 ? 0.55 : 0.85;
    default:
      return 0;
  }
}

const JITTER: Partial<Record<Layer, number>> = { hat: 0.3, openHat: 0.2, ride: 0.3, clap: 0.15, bass: 0.3, lead: 0.6, chords: 0.4 };

/**
 * How much of a part's pattern plays (a step plays when its weight beats 1 - density). The
 * ranges are kept narrow on purpose: energy brings the strong steps in and adds a few weak
 * ones, but never fills every gap, so even the finale keeps its groove: claps on 2 and 4,
 * open hats on the offbeat, hats in eighths with a sixteenth here and there, the bass on
 * its steps. More energy comes from layers, filter and drive, not from more notes.
 */
function density(layer: Layer, energy: number): number {
  switch (layer) {
    case 'hat': return 0.3 + 0.15 * energy;
    case 'openHat': return 0.3 + 0.3 * energy;
    case 'ride': return 0.3 + 0.2 * energy;
    case 'clap': return 0.6 + 0.1 * energy;
    case 'bass': return 0.3 + 0.3 * energy;
    case 'lead': return 0.2 + 0.3 * energy;
    case 'chords': return 0.35 + 0.35 * energy;
    default: return 1;
  }
}

/** Velocity of a part on a step, 0 when it rests. Structural steps are accented. */
function level(song: Song, layer: Layer, info: BarInfo, step: number): number {
  const v = version(song, layer, info.bar);
  const jitter = (unit(song.seed, Ch.Importance, INSTRUMENT[layer], v, step) - 0.5) * (JITTER[layer] ?? 0);
  const importance = Math.max(0, Math.min(1, base(layer, step, info.bassStyle, info.section.groove) + jitter));
  if (importance <= 1 - density(layer, info.energy)) return 0;
  return importance > 0.75 ? 1 : 0.45 + 0.4 * importance;
}

/** Kicks per groove: four on the floor, half-time, broken (1 and the "and" of 3), electro. */
function kickAt(groove: Groove, step: number): number {
  switch (groove) {
    case 'four': return step % 4 === 0 ? (step === 0 ? 1 : 0.92) : 0;
    case 'half': return step === 0 ? 1 : 0;
    case 'broken': return step === 0 ? 1 : step === 10 ? 0.9 : 0;
    case 'electro': return step === 0 || step === 8 ? 1 : step === 10 ? 0.75 : 0;
  }
}

// ---- the notes of one step ---------------------------------------------------------------

export interface StepEvents {
  info: BarInfo;
  kick: number;
  clap: number;
  hat: number;
  openHat: number;
  ride: number;
  perc: Hit | null;
  metal: { kind: 'cowbell' | 'clave'; velocity: number } | null;
  bass: Hit | null;
  acid: Hit | null;
  lead: Hit | null;
  /** Chord notes for stabs, the french loop or a motorik pad. */
  chord: { notes: number[]; velocity: number; length: number } | null;
}

const NONE = (info: BarInfo): StepEvents => ({ info, kick: 0, clap: 0, hat: 0, openHat: 0, ride: 0, perc: null, metal: null, bass: null, acid: null, lead: null, chord: null });

/** Everything that sounds on sixteenth number `absoluteStep` of the song. */
export function stepEvents(song: Song, absoluteStep: number): StepEvents {
  const absoluteBar = Math.floor(absoluteStep / STEPS_PER_BAR);
  const step = absoluteStep % STEPS_PER_BAR;
  const info = barInfo(song, absoluteBar);
  const bar = info.bar;
  const { layers, fill } = info;
  const events = NONE(info);
  const inFill = fill !== null && step >= fill.from;
  if (inFill && (fill.type === 'vacuum' || fill.type === 'rugPull')) return events;
  const root = song.root + info.transpose;
  const move = song.progression[(bar >> 1) % song.progression.length];

  if (layers.kick) events.kick = kickAt(info.section.groove, step);
  if (layers.clap) events.clap = info.section.groove === 'electro' ? (step === 4 || step === 12 ? 1 : 0) : level(song, 'clap', info, step);
  if (layers.hat) events.hat = level(song, 'hat', info, step) * (info.section.groove === 'half' && step % 2 === 1 ? 0.5 : 0.8);
  if (layers.openHat) events.openHat = level(song, 'openHat', info, step) * 0.7;
  // the ride plays eighths only
  if (layers.ride && step % 2 === 0) events.ride = level(song, 'ride', info, step) * 0.6;

  if (layers.perc) {
    // Euclidean hits on a loop that drifts against the bar (polymeter); odd loops in poly sections
    const n = info.section.poly ? choose([5, 7, 9], song.seed, Ch.Genes, 30) : song.perc.n;
    // at most two hits in five steps: the toms color the groove, they do not fill it
    const k = Math.min(song.perc.k, Math.floor(n * 0.4));
    const i = absoluteStep % n;
    if ((i * k) % n < k) {
      const degree = choose([0, 0, 7, 12, 3, 10], song.seed, Ch.Note, INSTRUMENT.perc, version(song, 'perc', bar), i);
      events.perc = { note: root + 24 + degree, velocity: 0.5 + 0.4 * unit(song.seed, Ch.Velocity, absoluteStep), length: 1, accent: false, slide: false };
    }
  }

  if (layers.metal) {
    const i = (step + song.metal.rotation) % 16;
    if ((i * song.metal.k) % 16 < song.metal.k) events.metal = { kind: unit(song.seed, Ch.Note, INSTRUMENT.metal, i) < 0.5 ? 'cowbell' : 'clave', velocity: 0.6 + 0.3 * unit(song.seed, Ch.Velocity, absoluteStep, 1) };
  }

  if (layers.bass) events.bass = bassAt(song, info, step, root + move);
  if (layers.acid) events.acid = acidAt(song, info, absoluteStep, root);
  if (layers.lead) leadAt(song, info, step, root + move, events);

  if (layers.chords) {
    if (song.flavor === 'french') {
      const velocity = level(song, 'chords', info, step);
      if (velocity > 0) events.chord = { notes: song.stabShape.map((n) => root + 36 + move + n), velocity, length: 1.5 };
    } else if (step === 0 && bar % 2 === 0) {
      // motorik: a sustained pad under the machines
      events.chord = { notes: [0, 7, 12, 15].map((n) => root + 36 + move + n), velocity: 0.5, length: 31 };
    }
  }

  if (inFill) applyFill(song, events, fill, step, root);
  // one key for every instrument: whatever the chord shape, the motif or the acid line asks
  // for, the note lands on the track's minor scale, so the parts never rub against each other
  for (const hit of [events.perc, events.bass, events.acid, events.lead]) if (hit) hit.note = inKey(hit.note, root);
  if (events.chord) events.chord.notes = events.chord.notes.map((note) => inKey(note, root));
  return events;
}

/** Steps of the natural minor scale (aeolian) above the root, in semitones. */
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** A note on the minor scale of `root`: a note outside it moves down a semitone onto the scale. */
function inKey(note: number, root: number): number {
  const degree = (((note - root) % 12) + 12) % 12;
  return MINOR_SCALE.includes(degree) ? note : note - 1;
}

function bassAt(song: Song, info: BarInfo, step: number, root: number): Hit | null {
  const v = version(song, 'bass', info.bar);
  switch (info.bassStyle) {
    case 'ebm': {
      // body music: every 16th, root root octave root, accents just before the beat
      const shape = [0, 0, 12, 0];
      const accent = step % 4 === 3;
      return { note: root + 12 + shape[step % 4], velocity: accent ? 1 : 0.7, length: 1, accent, slide: false };
    }
    case 'moroder': {
      // eighths in alternating octaves; a 16th echo in the band turns them into a pulse
      if (step % 2 === 1) return null;
      return { note: root + 12 + (step % 4 === 2 ? 12 : 0), velocity: 0.85, length: 1, accent: false, slide: false };
    }
    default: {
      const velocity = level(song, 'bass', info, step);
      if (velocity === 0) return null;
      const offset = choose([0, 0, 0, 0, 0, 12, 7, -2], song.seed, Ch.Note, INSTRUMENT.bass, v, step);
      return { note: root + 12 + offset, velocity, length: 1, accent: velocity === 1, slide: false };
    }
  }
}

function leadAt(song: Song, info: BarInfo, step: number, root: number, events: StepEvents) {
  switch (song.lead) {
    case 'stab': {
      const velocity = level(song, 'lead', info, step);
      if (velocity > 0) events.chord = { notes: song.stabShape.map((n) => root + 36 + n), velocity, length: 1.2 };
      return;
    }
    case 'arp': {
      // motorik plings: 16ths over the chord tones, up and down
      const tones = [0, 7, 12, 15, 19, 24];
      const shape = choose([[0, 1, 2, 3, 4, 5], [0, 2, 1, 3, 2, 4], [5, 4, 3, 2, 1, 0], [0, 3, 1, 4, 2, 5]], song.seed, Ch.Lead, 50, version(song, 'lead', info.bar));
      // eighths: sixteenth plings on top of a sixteenth bass and hats would rush the track
      if (step % 2 === 1) return;
      events.lead = { note: root + 36 + tones[shape[step % shape.length]], velocity: step % 4 === 0 ? 0.9 : 0.6, length: 1, accent: false, slide: false };
      return;
    }
    default: {
      // bell or hoover: the two-bar motif
      const position = (info.bar % 2) * STEPS_PER_BAR + step;
      const note = song.motif.find((n) => n.step === position);
      if (note) events.lead = { note: root + 36 + note.degree, velocity: 0.9, length: note.length, accent: false, slide: song.lead === 'hoover' };
    }
  }
}

/**
 * The acid line: a 12- or 16-step loop that runs against the bar (7 steps in polymeter
 * sections). Strong steps play more often (the weights of "Endless Acid Banger"), accents
 * and slides stay rare, slides often jump an octave.
 */
function acidAt(song: Song, info: BarInfo, absoluteStep: number, root: number): Hit | null {
  const v = version(song, 'acid', info.bar);
  const length = info.section.poly ? 7 : song.acidLength;
  const i = absoluteStep % length;
  const weight = i % 4 === 0 ? 0.6 : i % 3 === 0 ? 0.5 : i % 2 === 0 ? 0.3 : 0.1;
  if (unit(song.seed, Ch.Acid, v, i, 0) >= weight * 1.4) return null;
  const previous = (i + length - 1) % length;
  const slide = unit(song.seed, Ch.Acid, v, i, 3) < 0.15 && unit(song.seed, Ch.Acid, v, previous, 0) < (previous % 4 === 0 ? 0.84 : 0.42);
  let note = root + 12 + choose(song.acidSet, song.seed, Ch.Acid, v, i, 1);
  if (slide && unit(song.seed, Ch.Acid, v, i, 2) < 0.6) note += 12;
  return { note, velocity: 1, length: 1, accent: unit(song.seed, Ch.Acid, v, i, 4) < 0.3, slide };
}

function applyFill(song: Song, events: StepEvents, fill: Fill, step: number, root: number) {
  switch (fill.type) {
    case 'kickEdit':
      // add or remove kicks at the end of the phrase to mark the change
      if (fill.variant < 2) events.kick = step === 12 ? 0 : events.kick;
      else if (step === 14 || (fill.variant === 3 && step === 15)) events.kick = 0.7;
      break;
    case 'hatRoll':
      events.hat = 0.4 + 0.15 * (step - 12);
      events.openHat = step === 15 ? 0.8 : 0;
      break;
    case 'clapBurst':
      events.clap = 0.45 + 0.18 * (step - 12);
      break;
    case 'tomRun': {
      const degrees = [12, 10, 7, 3];
      events.perc = { note: root + 24 + degrees[step - 12], velocity: 0.7 + 0.1 * (step - 12), length: 1, accent: true, slide: false };
      break;
    }
    case 'kickRoll':
      // quarters, then eighths, then sixteenths into the drop
      events.kick = step < 8 ? (step % 4 === 0 ? 0.7 : 0) : step < 12 ? (step % 2 === 0 ? 0.8 : 0) : 0.9;
      events.clap = step >= 12 ? 0.5 : 0;
      break;
    case 'stutter':
      // the beat repeats itself: kick and clap on every 16th, getting quieter (the band pitches them down)
      events.kick = 0.9 - 0.12 * (step - 12);
      events.clap = 0.5;
      events.hat = 0;
      break;
    case 'tapeStop':
      // the band slows the tonal parts down; the drums stop
      events.kick = events.clap = events.hat = events.openHat = events.ride = 0;
      events.perc = events.metal = null;
      break;
  }
  void song;
}
