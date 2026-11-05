/**
 * The voices made of Kokoro and cloned into the other languages: Nicole, the flight computer, and
 * the campaign's people (Rask, Pim, Hedda). What each is made of, shared by the voice tool
 * (render.ts) and the tools that clone them (clone/). See README.md in this folder for the whole
 * pipeline.
 */
import { createHash } from 'node:crypto';
import { allLines } from '../../src/music/lines.ts';
import { DE } from '../../src/i18n/de.ts';
import { ES } from '../../src/i18n/es.ts';
import { FR } from '../../src/i18n/fr.ts';

/**
 * Nicole in English: Kokoro's breathy, intimate af_nicole, a little faster than she talks by
 * herself. The model is pinned to one revision, so the same inputs always render the same voice.
 */
export const COMPUTER_VOICE = { model: 'onnx-community/Kokoro-82M-v1.0-ONNX', revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231', voice: 'af_nicole', speed: 1.3 } as const;

/** The languages Nicole is cloned into (English is Kokoro's own). */
export const CLONED = ['de', 'es', 'fr'] as const;
export type Cloned = (typeof CLONED)[number];

/** Each cloned language's translations of the lines. */
export const CATALOGS: Record<Cloned, Readonly<Record<string, string>>> = { de: DE, es: ES, fr: FR };

/**
 * How Nicole is cloned: Chatterbox Multilingual V3 (Resemble AI, MIT), its code and model pinned,
 * with the settings the maintainer chose by ear ("variant D": robotic, cool, with feeling).
 * `exaggeration` is how much emotion she puts in, `cfg` how closely she keeps to the text over
 * the reference's English accent, `temperature` how freely each line is sampled. Changing any
 * of these renders every line again (see cloneKey).
 */
export const CLONE = {
  code: 'git+https://github.com/resemble-ai/chatterbox@5de7a54aa4e5e2baadb0182dde554908b48b85c2',
  model: 'ResembleAI/chatterbox',
  revision: '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18',
  t3: 't3_mtl23ls_v3.safetensors',
  exaggeration: 0.8,
  cfg: 0.3,
  temperature: 0.8,
} as const;

/**
 * What checks the clone's work (see clone/clone.py): Whisper small (OpenAI, Apache-2.0) at a
 * pinned revision, and the Python package that reads and writes the store. They pick a take but
 * shape no voice, so they are not part of a line's key.
 */
export const CHECK = { whisper: 'openai/whisper-small', revision: '973afd24965f72e36ca33b3055d56a652f456b4d', soundfile: '0.14.0' } as const;

/** What the English Nicole says to give the clone her voice: about 18 seconds, Kokoro at her own pace. */
export const REFERENCE = {
  text: 'Beautiful flying. You are doing very well, darling. Feel that pull? Come back to the field, darling. Round over. You were wonderful. Your first kill. The President is proud of you.',
  speed: 1,
} as const;

/**
 * Who is cloned: each speaker's English voice in Kokoro (rendered at `speed`), what they say to
 * give the clone their voice (`reference`: about ten to twenty seconds of their own lines), and
 * the lines of theirs the game speaks (a Language of src/music/lines). Nicole is the flight
 * computer; the others are the campaign's people, played by the game at a pitch of their own
 * (see CAST_VOICES in src/sound/speaker.ts).
 */
export const SPEAKERS = {
  nicole: { voice: COMPUTER_VOICE.voice, speed: COMPUTER_VOICE.speed, reference: REFERENCE, language: 'sys' },
  rask: {
    voice: 'am_onyx',
    speed: 1.05,
    reference: { text: "Good morning, Host! Rise and shine! The printer's warm, and so's your debt. There you are, darling. Stay in the cockpit, we'll talk from here. Time is money, and yours is mine.", speed: 1 },
    language: 'rask',
  },
  pim: {
    voice: 'af_jessica',
    speed: 1.15,
    reference: { text: "Oi! Lot seven thousand whatever! That's my pad you're parked on. Wait. You're the one Rask sold the junk computer to? Mint. Hold still, I'm welding your thrusters.", speed: 1 },
    language: 'pim',
  },
  hedda: {
    voice: 'af_kore',
    speed: 0.95,
    reference: { text: "Patience here. Captain Kroll. You the nobody who cleared my lane? Right. I need a gunner who works for food and a bunk. Your gun's a joke. You'll do anyway.", speed: 1 },
    language: 'hedda',
  },
  saw: {
    voice: 'am_puck',
    speed: 1.1,
    reference: { text: "Oh look, brothers, a scrap heap with a gun! Hee hee! Keep sawing, it can't hurt us! Okay, okay! We're going! It was a lousy rig anyway!", speed: 1 },
    language: 'saw',
  },
} as const;
export type Speaker = keyof typeof SPEAKERS;
export const SPEAKER_NAMES = Object.keys(SPEAKERS) as Speaker[];

/** Where the cloned lines are kept: assets of one release of the public repository, never in its history. */
export const RELEASE = { repo: 'JohannesHoppe/SolarTournament', tag: 'voice-nicole' } as const;
export const releaseUrl = (file: string) => `https://github.com/${RELEASE.repo}/releases/download/${RELEASE.tag}/${file}`;

/** How often a download from a release is tried, and the wait before the first retry (ms, doubled for each after it). */
const RELEASE_TRIES = 4;
const RELEASE_WAIT = 2000;
/**
 * A file of a release, fetched with patience: GitHub's downloads now and then answer a while
 * with a server error (5xx) or not at all for a file that is there, so such an answer is tried
 * again a few times; any other answer (the file, a 404) is returned as it comes. `seconds` bounds
 * each try.
 */
export async function fetchRelease(url: string, seconds: number, get: typeof fetch = fetch): Promise<Response> {
  for (let attempt = 1, wait = RELEASE_WAIT; ; attempt++, wait *= 2) {
    try {
      const answer = await get(url, { signal: AbortSignal.timeout(seconds * 1000) });
      if (answer.status < 500 || attempt === RELEASE_TRIES) return answer;
    } catch (error) {
      if (attempt === RELEASE_TRIES) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
/** A speaker's store of a language in the release (its index `<name>.json`, see cloneAudioName): Nicole's `nicole-de`, Rask's `rask-de`, … */
export const storeName = (speaker: Speaker, locale: Cloned) => `${speaker}-${locale}`;
/** A speaker's voice print as Chatterbox holds it, and the English reference it was taken from (Nicole's under the names they had before the others were cloned). */
export const condsName = (speaker: Speaker) => `${speaker}-conds.pt`;
export const referenceName = (speaker: Speaker) => (speaker === 'nicole' ? 'reference.wav' : `reference-${speaker}.wav`);
/**
 * A speaker's cloned audio of a language in the release, named by its fingerprint (the start of
 * its sha256, which the index names): an index uploaded after its audio, or not at all, never
 * points at another audio, and builds of the older index keep finding theirs.
 */
export const cloneAudioName = (speaker: Speaker, locale: Cloned, sha256: string) => `${storeName(speaker, locale)}-${sha256.slice(0, 16)}.flac`;

/** A line's name in a store of cloned lines: its language, its text, the settings it was cloned with, and (but for Nicole, whose keys came first) its speaker. */
export function cloneKey(locale: Cloned, text: string, speaker: Speaker = 'nicole'): string {
  return createHash('sha256').update(JSON.stringify(speaker === 'nicole' ? [CLONE, locale, text] : [CLONE, locale, text, speaker])).digest('hex').slice(0, 16);
}

/** A speaker's lines in a language, each once, as the game says them. */
export function speakerLines(speaker: Speaker, locale: Cloned): string[] {
  return [...new Set(allLines(SPEAKERS[speaker].language).map((line) => CATALOGS[locale][line] ?? line))];
}
