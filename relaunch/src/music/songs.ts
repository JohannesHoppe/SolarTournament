/**
 * The generative hard techno of Radio 2584. Every tournament round gets a track of its own,
 * grown from a seed and never heard again. Everything here is a pure function of seed, bar
 * and step: every decision is an integer hash of those numbers, there is no random stream
 * with state. So every client that knows the seed and the song time plays exactly the same
 * notes, and a client can jump to any point of a track.
 *
 * The rules follow hard techno production practice (see "Radio 2584" in the README):
 * 145–160 BPM, a distorted kick with a rumble that swells between the kicks, bass never on
 * the kick, 16th hats with accents, offbeat open hats, energy that moves through breakdowns
 * and re-entries, and a change in every 8-bar phrase.
 */

/**
 * - hard: rolling bass under a heavy rumble, peak-time hard techno.
 * - industrial: bit-crushed, metallic percussion, darker and a little slower.
 * - acid: a squelching 303 line carries the track.
 * - schranz: fastest, loop-driven, tom-heavy percussion.
 * - rave: distorted chord stabs and a hoover lead, early-2000s rave.
 */
export type Flavor = 'hard' | 'industrial' | 'acid' | 'schranz' | 'rave';
export const FLAVORS: Flavor[] = ['hard', 'industrial', 'acid', 'schranz', 'rave'];

/** Tournament rounds run the full arc; the menu and the flight school idle in a groove. */
export type Energy = 'lounge' | 'round';

export type SectionKind = 'intro' | 'groove' | 'peak' | 'break' | 'finale' | 'outro';

export interface Section {
  kind: SectionKind;
  start: number;
  bars: number;
  /** Energy at the start and at the end of the section, 0..1. */
  from: number;
  to: number;
}

export type Layer = 'kick' | 'rumble' | 'bass' | 'hat' | 'openHat' | 'ride' | 'clap' | 'perc' | 'acid' | 'stab' | 'lead';

export type FillType = 'kickEdit' | 'hatRoll' | 'clapBurst' | 'tomRun' | 'vacuum';

export interface Fill {
  type: FillType;
  /** First step of the bar the fill takes over. */
  from: number;
  variant: number;
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
  seed: number;
  flavor: Flavor;
  energy: Energy;
  title: string;
  bpm: number;
  /** Delay of every second sixteenth, as a share of a sixteenth. */
  swing: number;
  /** MIDI note of the kick's fundamental; the whole track is in this key. */
  root: number;
  acidSet: number[];
  acidLength: number;
  stabShape: number[];
  stabMoves: number[];
  /** Polymetric percussion: k hits spread over a loop of n sixteenths. */
  perc: { k: number; n: number };
  /** Rolling bass (three 16ths between the kicks) or a single offbeat bass. */
  rolling: boolean;
  form: Section[];
  /** Bars of the lounge cycle; rounds play their form once. */
  cycle: number;
  /** Two-bar hoover motif: scale steps, lengths in sixteenths. */
  lead: { step: number; degree: number; length: number }[];
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

/** A seed from a text, e.g. a tournament room code. */
export function textSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 2147483000) + 1;
}

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
  Stab,
  Fill,
  Note,
  Velocity,
  Lead,
}

const INSTRUMENT: Record<Layer, number> = { kick: 1, rumble: 2, bass: 3, hat: 4, openHat: 5, ride: 6, clap: 7, perc: 8, acid: 9, stab: 10, lead: 11 };

// ---- genes: what a seed decides once ------------------------------------------------------

const FLAVOR_SETTINGS: Record<Flavor, { bpm: [number, number]; swing: [number, number]; rolling: number }> = {
  hard: { bpm: [148, 155], swing: [0, 0.06], rolling: 0.8 },
  industrial: { bpm: [140, 147], swing: [0.04, 0.12], rolling: 0.3 },
  acid: { bpm: [145, 150], swing: [0, 0.08], rolling: 0.4 },
  schranz: { bpm: [155, 160], swing: [0, 0.04], rolling: 0.6 },
  rave: { bpm: [148, 154], swing: [0, 0.04], rolling: 0.5 },
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
/** Parallel moves of the stab chord, one per two bars (same shape, shifted). */
const STAB_MOVES = [[0, 0, -2, 0], [0, 1, 0, -2], [0, 5, 0, 3], [0, 0, 0, 1]];
/** Hoover motif degrees in semitones; minor, with the flat second for menace. */
const LEAD_NOTES = [0, 0, 3, 7, 10, 12, 1, -2];

const TITLE_FIRST = ['Reactor', 'Kessler', 'Delta-V', 'Clone', 'Hull', 'Plasma', 'Vacuum', 'Burn', 'Sponsor', 'Orbit', 'Ion', 'Tungsten', 'Flip', 'Slingshot', 'Perihelion', 'Neon'];
const TITLE_SECOND = ['Pressure', 'Overdrive', 'Breach', 'Protocol', 'Ritual', 'Machine', 'Mantra', 'Static', 'Riot', 'Pulse', 'Damage', 'Collapse', 'Engine', 'Terror', 'Number Nine', 'Massacre'];

/** A track from a seed. The flavor follows from the seed unless one is given. */
export function createSong(seed: number, energy: Energy, roundLength: number, flavor?: Flavor): Song {
  const chosen = flavor ?? choose(FLAVORS, seed, Ch.Genes, 1);
  const settings = FLAVOR_SETTINGS[chosen];
  const bpm = settings.bpm[0] + (hash(seed, Ch.Genes, 2) % (settings.bpm[1] - settings.bpm[0] + 1)) - (energy === 'lounge' ? 8 : 0);
  const song: Song = {
    seed,
    flavor: chosen,
    energy,
    title: `${choose(TITLE_FIRST, seed, Ch.Genes, 3)} ${choose(TITLE_SECOND, seed, Ch.Genes, 4)}`,
    bpm,
    swing: settings.swing[0] + unit(seed, Ch.Genes, 5) * (settings.swing[1] - settings.swing[0]),
    // kick fundamental between F#1 (46 Hz) and A#1 (58 Hz)
    root: 30 + (hash(seed, Ch.Genes, 6) % 5),
    acidSet: choose(ACID_SETS, seed, Ch.Genes, 7),
    // a 12-step acid loop over the 16-step bar is a classic acid techno trick
    acidLength: unit(seed, Ch.Genes, 8) < 0.4 ? 12 : 16,
    stabShape: choose(STAB_SHAPES, seed, Ch.Genes, 9),
    stabMoves: choose(STAB_MOVES, seed, Ch.Genes, 10),
    perc: { k: choose([3, 5, 7], seed, Ch.Genes, 11), n: choose([5, 6, 7, 12, 16], seed, Ch.Genes, 12) },
    rolling: unit(seed, Ch.Genes, 13) < settings.rolling,
    form: [],
    cycle: 0,
    lead: [],
    cache: new Map(),
  };
  if (song.perc.k >= song.perc.n) song.perc.k = song.perc.n - 2;
  song.lead = leadMotif(seed);
  song.form = energy === 'lounge' ? loungeForm() : roundForm(seed, bpm, roundLength);
  song.cycle = energy === 'lounge' ? song.form.reduce((sum, s) => sum + s.bars, 0) : 0;
  return song;
}

export function barSeconds(song: Song): number {
  return (60 / song.bpm) * 4;
}

function leadMotif(seed: number) {
  const notes: { step: number; degree: number; length: number }[] = [];
  let step = 0;
  for (let i = 0; step < 32; i++) {
    const length = choose([4, 4, 6, 8, 2], seed, Ch.Lead, i, 1);
    if (unit(seed, Ch.Lead, i, 2) < 0.75) notes.push({ step, degree: choose(LEAD_NOTES, seed, Ch.Lead, i, 3), length: Math.min(length, 32 - step) });
    step += length;
  }
  return notes;
}

// ---- form and energy ----------------------------------------------------------------------

type Block = [SectionKind, number, number, number];

/**
 * Seeded section sequences between intro and finale. Energy moves through breakdowns and
 * re-entries, every boundary falls on the 8-bar grid.
 */
const MIDDLES: Block[][] = [
  [['groove', 32, 0.5, 0.7], ['break', 16, 0.3, 0.55], ['peak', 32, 0.8, 0.9], ['groove', 16, 0.6, 0.7], ['break', 8, 0.35, 0.6], ['peak', 32, 0.85, 0.95]],
  [['groove', 24, 0.55, 0.7], ['peak', 24, 0.75, 0.85], ['break', 16, 0.3, 0.6], ['peak', 40, 0.85, 0.95], ['groove', 16, 0.65, 0.75]],
  [['groove', 16, 0.5, 0.65], ['peak', 32, 0.75, 0.9], ['break', 16, 0.3, 0.6], ['groove', 16, 0.6, 0.7], ['peak', 32, 0.85, 0.95]],
];

function roundForm(seed: number, bpm: number, roundLength: number): Section[] {
  const bar = (60 / bpm) * 4;
  const endBar = Math.round(roundLength / bar);
  // the finale is the last minute of the round, starting on the phrase grid
  const finaleBar = Math.max(32, Math.floor((roundLength - 60) / bar / PHRASE) * PHRASE);
  const breakBar = finaleBar - PHRASE;
  const form: Section[] = [{ kind: 'intro', start: 0, bars: 16, from: 0.3, to: 0.5 }];
  const middle = choose(MIDDLES, seed, Ch.Genes, 20);
  let start = 16;
  for (let i = 0; start < breakBar; i++) {
    const [kind, bars, from, to] = middle[i % middle.length];
    const length = Math.min(bars, breakBar - start);
    form.push({ kind, start, bars: length, from, to });
    start += length;
  }
  form.push({ kind: 'break', start: breakBar, bars: PHRASE, from: 0.4, to: 0.65 });
  form.push({ kind: 'finale', start: finaleBar, bars: Math.max(PHRASE, endBar - finaleBar), from: 1, to: 1 });
  form.push({ kind: 'outro', start: Math.max(endBar, finaleBar + PHRASE), bars: 16, from: 0.6, to: 0.25 });
  return form;
}

/** The menu and the flight school: the arena's groove heard from the hangar, never peaking. */
function loungeForm(): Section[] {
  return [
    { kind: 'groove', start: 0, bars: 32, from: 0.4, to: 0.55 },
    { kind: 'break', start: 32, bars: 8, from: 0.3, to: 0.45 },
    { kind: 'groove', start: 40, bars: 24, from: 0.5, to: 0.6 },
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

/** Energy a layer needs to play, per flavor; checked at the start of every 8-bar phrase. */
const GATES: Record<Flavor, Record<Layer, number>> = {
  hard: { kick: 0, rumble: 0.3, hat: 0.2, openHat: 0.3, bass: 0.4, clap: 0.5, ride: 0.7, perc: 0.6, acid: 0.85, stab: 0.75, lead: 0.95 },
  industrial: { kick: 0, rumble: 0.3, hat: 0.2, openHat: 0.35, bass: 0.45, clap: 0.45, ride: 0.75, perc: 0.3, acid: 0.9, stab: 2, lead: 0.98 },
  acid: { kick: 0, rumble: 0.35, hat: 0.2, openHat: 0.3, bass: 0.7, clap: 0.5, ride: 0.75, perc: 0.65, acid: 0.3, stab: 2, lead: 0.98 },
  schranz: { kick: 0, rumble: 0.3, hat: 0.15, openHat: 0.25, bass: 0.45, clap: 0.4, ride: 0.5, perc: 0.35, acid: 0.9, stab: 0.85, lead: 0.98 },
  rave: { kick: 0, rumble: 0.3, hat: 0.2, openHat: 0.3, bass: 0.45, clap: 0.5, ride: 0.7, perc: 0.7, acid: 0.8, stab: 0.55, lead: 0.85 },
};

/** Everything about a bar that does not depend on the step. Memoized per song. */
export function barInfo(song: Song, absoluteBar: number): BarInfo {
  const cached = song.cache.get(absoluteBar);
  if (cached) return cached;
  // the lounge cycles; a round past its outro stays in the outro
  const bar = song.cycle ? absoluteBar % song.cycle : absoluteBar;
  const section = sectionAt(song, bar);
  const inSection = bar - section.start;
  const energy = section.kind === 'outro' && inSection >= section.bars ? section.to : energyAt(section, bar);
  const phraseStart = bar - (inSection % PHRASE);
  const phraseEnergy = energyAt(section, phraseStart);
  const gates = GATES[song.flavor];
  const layers = {} as Record<Layer, boolean>;
  for (const layer of Object.keys(gates) as Layer[]) layers[layer] = phraseEnergy >= gates[layer];
  layers.lead = layers.lead && song.energy === 'round';

  switch (section.kind) {
    case 'intro':
      layers.rumble = inSection >= 8;
      layers.bass = layers.clap = layers.acid = layers.stab = layers.ride = false;
      break;
    case 'break':
      // the kick drops out but the rhythm goes on: hats and a thin bass (its low end cut) carry the tension
      layers.kick = layers.rumble = layers.clap = layers.ride = layers.stab = layers.lead = layers.openHat = false;
      layers.hat = layers.bass = true;
      break;
    case 'finale':
      for (const layer of Object.keys(layers) as Layer[]) layers[layer] = gates[layer] <= 1;
      layers.lead = song.energy === 'round';
      break;
    case 'outro':
      layers.bass = layers.acid = layers.stab = layers.lead = layers.ride = layers.perc = false;
      layers.clap = inSection < 8;
      break;
  }

  const progress = Math.min(1, inSection / section.bars);
  let brightness = 1;
  if (section.kind === 'break') brightness = 0.35 + 0.65 * progress;
  else if (section.kind === 'intro') brightness = 0.5 + 0.5 * progress;
  else if (section.kind === 'outro') brightness = Math.max(0.3, 1 - 0.7 * progress);
  if (song.energy === 'lounge') brightness = Math.min(brightness, 0.55);

  const previous = section.start > 0 ? sectionAt(song, section.start - 1) : null;
  const info: BarInfo = {
    bar,
    section,
    inSection,
    energy,
    layers,
    fill: fillAt(song, section, inSection),
    brightness,
    drive: section.kind === 'finale' ? 1 : 0.3 + 0.7 * energy,
    riserBars: section.kind === 'break' && inSection === section.bars - Math.min(4, section.bars) ? Math.min(4, section.bars) : 0,
    impact: inSection === 0 && (previous?.kind === 'break' || section.kind === 'finale'),
  };
  song.cache.set(absoluteBar, info);
  return info;
}

/** Fills mark phrase ends: every 8 or 16 bars, and always at the end of a section. */
function fillAt(song: Song, section: Section, inSection: number): Fill | null {
  const seed = song.seed;
  const key = section.start + inSection;
  const lastOfSection = inSection === section.bars - 1;
  if (lastOfSection && section.kind === 'break') return { type: 'vacuum', from: 12, variant: 0 };
  const variant = hash(seed, Ch.Fill, key, 2) % 4;
  if (lastOfSection) return { type: choose<FillType>(['kickEdit', 'hatRoll', 'clapBurst', 'tomRun'], seed, Ch.Fill, key, 1), from: 12, variant };
  if (inSection % 16 === 15 && unit(seed, Ch.Fill, key) < 0.7) return { type: choose<FillType>(['hatRoll', 'tomRun', 'kickEdit'], seed, Ch.Fill, key, 1), from: 12, variant };
  if (inSection % 8 === 7 && unit(seed, Ch.Fill, key) < 0.5) return { type: 'kickEdit', from: 12, variant };
  return null;
}

// ---- patterns: importance and density (after Mutable Instruments Grids) --------------------

/** How often a part mutates at the start of a 16-bar epoch. The kick never does. */
const MUTATION: Record<Layer, number> = { kick: 0, rumble: 0, bass: 0.3, hat: 0.4, openHat: 0.15, ride: 0.2, clap: 0.2, perc: 0.3, acid: 0.5, stab: 0.35, lead: 0 };

/** The last 16-bar epoch in which a part mutated: patterns change in steps, a few hits at a time. */
function version(song: Song, layer: Layer, bar: number): number {
  let v = 0;
  for (let epoch = 1; epoch <= bar >> 4; epoch++) if (unit(song.seed, Ch.Mutation, INSTRUMENT[layer], epoch) < MUTATION[layer]) v = epoch;
  return v;
}

/** Structural weight of a step for a part; a step plays when it outweighs 1 - density. */
function base(song: Song, layer: Layer, step: number): number {
  const beat = step % 4;
  switch (layer) {
    case 'hat':
      return beat === 2 ? 0.95 : beat === 0 ? 0.75 : 0.5;
    case 'openHat':
      return beat === 2 ? 1 : 0.05;
    case 'ride':
      return step % 2 === 0 ? 0.8 : 0.2;
    case 'clap':
      return step === 4 || step === 12 ? 1 : 0.2;
    case 'bass':
      // never on the kick: the kick owns the first 16th of every beat
      if (beat === 0) return 0;
      return song.rolling ? (beat === 2 ? 0.95 : 0.75) : beat === 2 ? 1 : 0.25;
    case 'stab':
      return beat === 0 ? 0.1 : beat === 3 ? 0.65 : 0.55;
    default:
      return 0;
  }
}

const JITTER: Partial<Record<Layer, number>> = { hat: 0.3, openHat: 0.2, ride: 0.3, clap: 0.35, bass: 0.35, stab: 0.6 };

function density(layer: Layer, energy: number): number {
  switch (layer) {
    case 'hat': return 0.35 + 0.65 * energy;
    case 'openHat': return 0.4 + 0.5 * energy;
    case 'ride': return 0.5 + 0.4 * energy;
    case 'clap': return 0.25 + 0.5 * energy;
    case 'bass': return 0.45 + 0.5 * energy;
    case 'stab': return 0.2 + 0.4 * energy;
    default: return 1;
  }
}

/** Velocity of a part on a step, 0 when it rests. Structural steps are accented. */
function level(song: Song, layer: Layer, bar: number, step: number, energy: number): number {
  const v = version(song, layer, bar);
  const jitter = (unit(song.seed, Ch.Importance, INSTRUMENT[layer], v, step) - 0.5) * (JITTER[layer] ?? 0);
  const importance = Math.max(0, Math.min(1, base(song, layer, step) + jitter));
  if (importance <= 1 - density(layer, energy)) return 0;
  return importance > 0.75 ? 1 : 0.45 + 0.4 * importance;
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
  bass: Hit | null;
  acid: Hit | null;
  stab: { notes: number[]; velocity: number } | null;
  lead: Hit | null;
}

const NONE = (info: BarInfo): StepEvents => ({ info, kick: 0, clap: 0, hat: 0, openHat: 0, ride: 0, perc: null, bass: null, acid: null, stab: null, lead: null });

/** Everything that sounds on sixteenth number `absoluteStep` of the song. */
export function stepEvents(song: Song, absoluteStep: number): StepEvents {
  const absoluteBar = Math.floor(absoluteStep / STEPS_PER_BAR);
  const step = absoluteStep % STEPS_PER_BAR;
  const info = barInfo(song, absoluteBar);
  const bar = info.bar;
  const { layers, energy, fill } = info;
  const events = NONE(info);
  const inFill = fill !== null && step >= fill.from;
  if (inFill && fill.type === 'vacuum') return events;

  if (layers.kick && step % 4 === 0) events.kick = step === 0 ? 1 : 0.92;
  if (layers.clap) events.clap = level(song, 'clap', bar, step, energy);
  if (layers.hat) events.hat = level(song, 'hat', bar, step, energy) * 0.8;
  if (layers.openHat) events.openHat = level(song, 'openHat', bar, step, energy) * 0.7;
  // the ride plays eighths only
  if (layers.ride && step % 2 === 0) events.ride = level(song, 'ride', bar, step, energy) * 0.6;

  if (layers.perc) {
    // Euclidean hits on a loop that drifts against the bar (polymeter)
    const { k, n } = song.perc;
    const i = absoluteStep % n;
    if ((i * k) % n < k) {
      const degree = choose([0, 0, 7, 12, 3, 10], song.seed, Ch.Note, INSTRUMENT.perc, version(song, 'perc', bar), i);
      events.perc = { note: song.root + 24 + degree, velocity: 0.5 + 0.4 * unit(song.seed, Ch.Velocity, absoluteStep), length: 1, accent: false, slide: false };
    }
  }

  if (layers.bass) {
    const velocity = level(song, 'bass', bar, step, energy);
    if (velocity > 0) {
      const offset = choose([0, 0, 0, 0, 0, 12, 7, -2], song.seed, Ch.Note, INSTRUMENT.bass, version(song, 'bass', bar), step);
      events.bass = { note: song.root + 12 + offset, velocity, length: 1, accent: velocity === 1, slide: false };
    }
  }

  if (layers.acid) events.acid = acidAt(song, bar, absoluteStep);

  if (layers.stab) {
    const velocity = level(song, 'stab', bar, step, energy);
    if (velocity > 0) {
      const shift = song.stabMoves[(bar >> 1) % song.stabMoves.length];
      events.stab = { notes: song.stabShape.map((n) => song.root + 36 + shift + n), velocity };
    }
  }

  if (layers.lead) {
    const position = (bar % 2) * STEPS_PER_BAR + step;
    const note = song.lead.find((n) => n.step === position);
    if (note) events.lead = { note: song.root + 36 + note.degree, velocity: 0.9, length: note.length, accent: false, slide: true };
  }

  if (inFill) applyFill(song, events, fill, step);
  return events;
}

/**
 * The acid line: a 12- or 16-step loop that runs against the bar. Strong steps play more
 * often (the weights of "Endless Acid Banger"), accents and slides stay rare, slides
 * often jump an octave.
 */
function acidAt(song: Song, bar: number, absoluteStep: number): Hit | null {
  const v = version(song, 'acid', bar);
  const i = absoluteStep % song.acidLength;
  const weight = i % 4 === 0 ? 0.6 : i % 3 === 0 ? 0.5 : i % 2 === 0 ? 0.3 : 0.1;
  if (unit(song.seed, Ch.Acid, v, i, 0) >= weight * 1.4) return null;
  const previous = (i + song.acidLength - 1) % song.acidLength;
  const slide = unit(song.seed, Ch.Acid, v, i, 3) < 0.15 && unit(song.seed, Ch.Acid, v, previous, 0) < (previous % 4 === 0 ? 0.84 : 0.42);
  let note = song.root + 12 + choose(song.acidSet, song.seed, Ch.Acid, v, i, 1);
  if (slide && unit(song.seed, Ch.Acid, v, i, 2) < 0.6) note += 12;
  return { note, velocity: 1, length: 1, accent: unit(song.seed, Ch.Acid, v, i, 4) < 0.3, slide };
}

function applyFill(song: Song, events: StepEvents, fill: Fill, step: number) {
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
      events.perc = { note: song.root + 24 + degrees[step - 12], velocity: 0.7 + 0.1 * (step - 12), length: 1, accent: true, slide: false };
      break;
    }
  }
}
