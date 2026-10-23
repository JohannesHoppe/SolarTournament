/**
 * Nicole, the flight computer's voice: what she is made of, shared by the voice tool
 * (render.ts) and the tools that clone her into the other languages (clone/). See README.md
 * in this folder for the whole pipeline.
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

/** Where the cloned lines are kept: assets of one release of the public repository, never in its history. */
export const RELEASE = { repo: 'JohannesHoppe/SolarTournament', tag: 'voice-nicole' } as const;
export const releaseUrl = (file: string) => `https://github.com/${RELEASE.repo}/releases/download/${RELEASE.tag}/${file}`;

/** A line's name in the store of cloned lines: its language, its text and the settings it was cloned with. */
export function cloneKey(locale: Cloned, text: string): string {
  return createHash('sha256').update(JSON.stringify([CLONE, locale, text])).digest('hex').slice(0, 16);
}

/** Nicole's lines in a language, each once, as the game says them. */
export function nicoleLines(locale: Cloned): string[] {
  return [...new Set(allLines('sys').map((line) => CATALOGS[locale][line] ?? line))];
}
