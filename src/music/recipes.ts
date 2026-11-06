import { msg, t } from '../i18n/i18n';
import { createSong, FLAVOR_SETTINGS, FLAVOR_WEIGHTS, GATES, KICK_SHAPES, MOTORIK_CHANCE, PUMP, ROUND_SECONDS, SCALES, STRATEGIES, titleFor, TURNAROUND, type BassStyle, type Flavor, type KickDesign, type Layer, type LeadVoice, type Strategy } from './songs';

/**
 * The recipes of Radio 2584 as the radio page shows them (its footer's link, #recipes): for
 * every flavor, how often it plays, its tempo and swing, its bass and lead, its kick, how hard
 * the music pumps, its scale, how its tracks develop and from what energy each part plays, all
 * read from the generator's own tables (see songs.ts), so the page always says what the radio
 * does; and a sentence or two of how it sounds and why.
 */

/** Every flavor's sound and idea in a few sentences. */
export const FLAVOR_RECIPES: Record<Flavor, string> = {
  drive: msg('The station’s main sound: a warm night drive of the eighties. One analog bassline is the lead: two detuned saws galloping on the root, now and then an octave up, and a few held notes of a second voice an octave higher, off the beat. The track hardly changes its notes; it grows by the bass’s timbre: the filter opening, a lower wave an octave down, an effect (chorus, phaser or flanger), the resonance turned up for a short peak. A soft, short kick, claps on two and four, hats in eighths, no rumble, a gentle pump.'),
  french: msg('A chord loop through a phaser and a filter that opens over four bars and closes over the next four, with swing and a pump on every kick. Its bass bounces on the offbeat, pulses in octaves, or gallops like drive’s.'),
  ebm: msg('Electronic body music: a sequenced sixteenth bass (root, root, octave, root) under a hard backbeat, arpeggios or stabs on top.'),
  hard: msg('Peak-time hard techno: a rolling bass under a heavy rumble, a distorted kick, stabs or a hoover at the peaks.'),
  industrial: msg('Bit-crushed hats, metallic percussion, cowbells and claves, a swung, grinding groove.'),
  acid: msg('A squelching 303 line carries the track: a resonant filter opened by accents, slides that glide up an octave, a loop of twelve or sixteen steps against the bar.'),
  motorik: msg('Machine pop with German words: an electro beat, an octave bass, square plings in eighths and a slow pad under the machines. Every track with a German title.'),
  schranz: msg('A rare guest: fast, loop-driven, tom-heavy and crushed.'),
  rave: msg('A rare guest: stabs and a hoover gliding over a fast four to the floor.'),
};

/** How a track develops, as the listener reads it. */
export const STRATEGY_NAMES: Record<Strategy, string> = {
  classic: msg('classic'),
  relentless: msg('relentless'),
  hypnotic: msg('hypnotic'),
  movements: msg('in movements'),
  switcher: msg('switching'),
  fakeDrop: msg('fake drop'),
  polymeter: msg('polymeter'),
  timbre: msg('by its timbre'),
};

const LAYER_NAMES: Record<Layer, string> = {
  kick: msg('Kick'),
  rumble: msg('Rumble'),
  bass: msg('Bass'),
  sub: msg('Lower wave'),
  hat: msg('Hats'),
  openHat: msg('Open hat'),
  ride: msg('Ride'),
  clap: msg('Clap'),
  perc: msg('Toms'),
  metal: msg('Cowbell and clave'),
  acid: msg('Acid line'),
  lead: msg('Lead'),
  chords: msg('Chords'),
};

const BASS_NAMES: Record<BassStyle, string> = {
  rolling: msg('rolling'),
  offbeat: msg('offbeat'),
  ebm: msg('sequenced sixteenths'),
  moroder: msg('octave pulse'),
  pedal: msg('analog pedal with a second voice'),
};

const LEAD_NAMES: Record<LeadVoice, string> = {
  stab: msg('stabs'),
  bell: msg('FM bell'),
  hoover: msg('hoover'),
  arp: msg('square arpeggio'),
};

const KICK_NAMES: Record<KickDesign['shape'], string> = {
  gabber: msg('gabber'),
  hard: msg('hard'),
  soft: msg('soft'),
  fold: msg('folded'),
};

/** The flavors in the order the page shows them: the most played first, motorik by its German titles. */
const ORDER: Flavor[] = [...FLAVOR_WEIGHTS.map(([flavor]) => flavor), 'motorik'];

/** The share of tracks a flavor grows (0..1): German titles are motorik, the rest by the weights. */
export function flavorShare(flavor: Flavor): number {
  if (flavor === 'motorik') return MOTORIK_CHANCE;
  const total = FLAVOR_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  const weight = FLAVOR_WEIGHTS.find(([f]) => f === flavor)?.[1] ?? 0;
  return (1 - MOTORIK_CHANCE) * (weight / total);
}

/** How a flavor's tracks develop. */
const strategiesOf = (flavor: Flavor): Strategy[] => (flavor === 'drive' ? ['timbre'] : flavor === 'motorik' ? ['relentless', 'hypnotic', 'movements'] : STRATEGIES);

/** A title that grows a track of this flavor, for listening to it. */
export function titleOf(flavor: Flavor): string {
  for (let seed = 1; seed < 100000; seed++) {
    const title = titleFor(seed);
    if (createSong(title, 'round', ROUND_SECONDS).flavor === flavor) return title;
  }
  return titleFor(1);
}

const percent = (share: number) => Math.round(share * 100);
const list = (names: string[]) => [...new Set(names.map((name) => t(name)))].join(', ');

/** One flavor's card: its facts from the generator's tables, its sound in words, a button to listen to a track of it. */
function card(flavor: Flavor, listen: (flavor: Flavor) => void): HTMLElement {
  const settings = FLAVOR_SETTINGS[flavor];
  const gates = GATES[flavor];
  const parts = (Object.keys(gates) as Layer[])
    .filter((layer) => gates[layer] <= 1)
    .sort((a, b) => gates[a] - gates[b])
    .map((layer) => t('{part} from {energy}', { part: t(LAYER_NAMES[layer]), energy: gates[layer].toFixed(2) }));
  const facts: [string, string][] = [
    [msg('Share of tracks'), t('{percent} %', { percent: percent(flavorShare(flavor)) })],
    [msg('Tempo'), t('{min} to {max} BPM', { min: settings.bpm[0], max: settings.bpm[1] })],
    [msg('Swing'), t('{min} to {max} % of a sixteenth', { min: percent(settings.swing[0]), max: percent(settings.swing[1]) })],
    [msg('Bass'), list(settings.bass.map((style) => BASS_NAMES[style]))],
    [msg('Lead'), list(settings.lead.map((voice) => LEAD_NAMES[voice]))],
    [msg('Kick'), list(KICK_SHAPES[flavor].map((shape) => KICK_NAMES[shape]))],
    [msg('Pump'), t('ducks to {percent} % on every kick', { percent: percent(PUMP[flavor]) })],
    [msg('Scale'), flavor === 'drive' ? t('phrygian (two in three) or natural minor') : flavor === 'french' ? t('mixolydian (one in three) or natural minor') : t('natural minor')],
    [msg('Development'), list(strategiesOf(flavor).map((strategy) => STRATEGY_NAMES[strategy]))],
    [msg('Parts by energy'), parts.join(' · ')],
  ];
  const article = document.createElement('article');
  article.className = 'recipe';
  const title = document.createElement('h3');
  title.textContent = flavor;
  const about = document.createElement('p');
  about.textContent = t(FLAVOR_RECIPES[flavor]);
  const table = document.createElement('dl');
  for (const [term, value] of facts) {
    const dt = document.createElement('dt');
    dt.textContent = t(term);
    const dd = document.createElement('dd');
    dd.textContent = value;
    table.append(dt, dd);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('Listen to a {flavor} track', { flavor });
  button.addEventListener('click', () => listen(flavor));
  article.append(title, about, table, button);
  return article;
}

/** Every flavor's card, the most played first. */
export function recipeCards(listen: (flavor: Flavor) => void): HTMLElement[] {
  return ORDER.map((flavor) => card(flavor, listen));
}

/** The note under the cards: the scales in semitones over the root, and drive's harmony bar by bar. */
export const scaleNote = () =>
  t('Natural minor: {aeolian}. Phrygian: {phrygian}, the flat second over the root. Mixolydian: {mixolydian}, major with the flat seventh, French’s good mood. Drive’s harmony, bar by bar: {turnaround} semitones.', {
    aeolian: SCALES.aeolian.join(' '),
    phrygian: SCALES.phrygian.join(' '),
    mixolydian: SCALES.mixolydian.join(' '),
    turnaround: TURNAROUND.join(' '),
  });