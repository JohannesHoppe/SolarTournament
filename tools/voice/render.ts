/**
 * Renders the voices into MP3 sprites plus manifests; no speech engine ships with the game.
 * The radio sprite holds the radio's voices from espeak-ng (WebAssembly build, GPL-3.0): every
 * word and every sentence of the regime's lines in src/music/lines.ts, in English and German,
 * because the game speaks sentences whole and places single words on the beat. Each language of
 * the game (see src/i18n) has a sprite of its own with the announcer (espeak-ng in that language)
 * and the flight computer: Nicole, Kokoro (neural, Apache-2.0), a natural voice. Kokoro speaks
 * English by itself; for the other languages espeak-ng spells the line in the phonemes of its
 * language and Nicole speaks them, with her accent. The game loads the radio sprite and the
 * sprite of the Host's language.
 *
 * The sprites are not kept in the repository: `npm run build` and `npm run dev` render them into
 * public/assets/voice/ (ffmpeg comes with the ffmpeg-static package), and only when the lines,
 * their translations, this tool or the speech engines have changed since the last time.
 * Sprites and Kokoro model are kept in a build cache (see cacheRoot), so a fresh checkout copies
 * sprites rendered before instead of rendering them.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { allLines, clipKey, phraseKey, phrases, words, type Language } from '../../src/music/lines.ts';
import { DE } from '../../src/i18n/de.ts';
import { ES } from '../../src/i18n/es.ts';
import { FR } from '../../src/i18n/fr.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'public/assets/voice');
const SAMPLE_RATE = 22050;
/** Renders the build cache keeps, the newest first. */
const CACHED_RENDERS = 3;
/** Silence between two words in a sprite, so decoder padding never cuts into a word (s). */
const GAP = 0.25;
/** The sprites: the radio's, and one for each language of the game. */
const SPRITES = ['radio', 'en', 'de', 'es', 'fr'] as const;
type Locale = Exclude<(typeof SPRITES)[number], 'radio'>;
/** Each language's translations of the lines (English is the source). */
const CATALOGS: Record<Exclude<Locale, 'en'>, Readonly<Record<string, string>>> = { de: DE, es: ES, fr: FR };
type Espeak = { voice: string; rate: number; pitch: number; range: number };
/** The regime speaks as a slow robot (espeak's robosoft variant, a narrow pitch range). */
const REGIME: Record<'en' | 'de', Espeak> = {
  en: { voice: 'en-us+robosoft', rate: 140, pitch: 32, range: 15 },
  de: { voice: 'de+robosoft', rate: 135, pitch: 30, range: 15 },
};
/** The announcer talks fast and lively, in every language with the same voice variant. */
const ANNOUNCER = { rate: 170, pitch: 45, range: 60 };
const ANNOUNCER_LANGUAGE: Record<Locale, string> = { en: 'en-us', de: 'de', es: 'es', fr: 'fr' };
/**
 * The flight computer: Kokoro's breathy, intimate Nicole, a little faster than she talks by
 * herself. The model is pinned to one revision, so the same inputs always render the same voice.
 */
const COMPUTER_VOICE = { model: 'onnx-community/Kokoro-82M-v1.0-ONNX', revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231', voice: 'af_nicole', speed: 1.3 } as const;
/** Every package whose version changes what the sprites sound like: the speech engines, Kokoro's phonemizer and runtime, the encoder. */
const ENGINES = ['kokoro-js', 'phonemizer', '@huggingface/transformers', 'onnxruntime-node', '@echogarden/espeak-ng-emscripten', 'ffmpeg-static'];

interface Worker {
  set_voice(voice: string): void;
  set_rate(rate: number): void;
  set_pitch(pitch: number): void;
  set_range(range: number): void;
  synthesize(text: string, callback: (samples: Int16Array | null) => void): void;
  synthesize_ipa(text: string): { ipa: string } | string;
}

/** The manifest of a sprite. */
const manifest = (sprite: string) => join(out, `voice-${sprite}.json`);
const files = SPRITES.flatMap((sprite) => [`voice-${sprite}.mp3`, `voice-${sprite}.json`]);

// the sprites are rendered again only when what they are made of has changed: the lines and
// their translations, this tool (with the model revision) and the engines' versions; a fresh
// checkout without cached sprites (see cacheRoot) renders them
const packageVersion = (name: string) => (JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')) as { version: string }).version;
const hash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).update(ENGINES.map(packageVersion).join());
hash.update(readFileSync(join(root, 'src/music/lines.ts')));
// of the catalogs only what is spoken: a text of the screen never renders the voice again
for (const locale of ['de', 'es', 'fr'] as const) for (const line of [...allLines('mod'), ...allLines('sys')]) hash.update(`${line}\u0000${CATALOGS[locale][line] ?? ''}\u0000`);
const inputs = hash.digest('hex').slice(0, 12);
const upToDate = SPRITES.every((sprite) => existsSync(manifest(sprite)) && (JSON.parse(readFileSync(manifest(sprite), 'utf8')) as { inputs?: string }).inputs === inputs);
if (upToDate) {
  console.log('Voice sprites up to date');
  process.exit(0);
}

// A cache that outlives a checkout: the sprites of these inputs and the Kokoro model. It sits in
// npm's cache directory (as npm run reports it, ~/.npm by default) because Cloudflare Pages
// keeps that one between builds (and lets no other directory be kept); npm ignores the folder.
// VOICE_CACHE moves it elsewhere. The cache is a help, never a need: where it cannot be
// written, the voices are rendered all the same.
const cacheRoot = process.env.VOICE_CACHE ?? join(process.env.npm_config_cache ?? join(homedir(), '.npm'), '_solartournament');
const tryCache = (action: () => void) => {
  try {
    action();
  } catch (error) {
    console.warn('Voice build cache not written:', (error as Error).message);
  }
};
const cached = join(cacheRoot, 'voice', inputs);
if (files.every((file) => existsSync(join(cached, file)))) {
  mkdirSync(out, { recursive: true });
  for (const file of files) cpSync(join(cached, file), join(out, file));
  console.log('Voice sprites from the build cache');
  process.exit(0);
}

const espeakPath = join(root, 'node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js');
const { default: init } = (await import(pathToFileURL(espeakPath).href)) as { default: () => Promise<{ eSpeakNGWorker: new () => Worker }> };
const module = await init();

/** A fresh worker per clip: espeak keeps state between calls, this keeps every clip reproducible. */
function espeak(settings: Espeak): Worker {
  const worker = new module.eSpeakNGWorker();
  worker.set_voice(settings.voice);
  worker.set_rate(settings.rate);
  worker.set_pitch(settings.pitch);
  worker.set_range(settings.range);
  return worker;
}

/** The clips of one sprite, one after the other with a gap between them. */
class Sprite {
  private readonly chunks: Int16Array[] = [];
  readonly clips: Record<string, [number, number]> = {};
  private position = 0;
  private readonly gap = new Int16Array(Math.round(GAP * SAMPLE_RATE));

  add(key: string, pcm: Int16Array) {
    this.clips[key] = [this.position / SAMPLE_RATE, pcm.length / SAMPLE_RATE];
    this.chunks.push(pcm, this.gap);
    this.position += pcm.length + this.gap.length;
  }

  /** Every word of the lines on its own, to place on the beat, and every sentence whole, with its melody; spoken by espeak. */
  speak(language: Language, lines: readonly string[], settings: Espeak) {
    const texts: [key: string, text: string][] = lines.flatMap((line) => [
      ...words(line.replaceAll('{name}', '')).map(({ word }): [string, string] => [word, word]),
      ...phrases(line).filter((piece) => piece !== '{name}').map((piece): [string, string] => [phraseKey(piece), piece]),
    ]);
    for (const [key, text] of texts) {
      if (this.clips[clipKey(language, key)]) continue;
      const parts: Int16Array[] = [];
      espeak(settings).synthesize(text, (samples) => {
        if (samples?.length) parts.push(Int16Array.from(samples));
      });
      this.add(clipKey(language, key), trim(concat(parts)));
    }
  }

  /** Encodes the sprite as MP3 and writes it with its manifest. */
  write(name: string) {
    const pcm = concat(this.chunks);
    // ffmpeg from the ffmpeg-static package, so no machine needs one installed
    const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string;
    const file = join(out, `voice-${name}.mp3`);
    const encoded = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0', '-b:a', '24k', file], { input: Buffer.from(pcm.buffer) });
    if (encoded.status !== 0) throw new Error('ffmpeg failed: ' + encoded.stderr);
    // the sprite's fingerprint: the game loads the MP3 under it, so a cached older sprite can
    // never meet a newer manifest
    const version = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 12);
    writeFileSync(manifest(name), JSON.stringify({ sampleRate: SAMPLE_RATE, version, inputs, clips: this.clips }, null, 1) + '\n');
    console.log(`${name}: ${Object.keys(this.clips).length} clips, ${(pcm.length / SAMPLE_RATE).toFixed(1)} s`);
  }
}

mkdirSync(out, { recursive: true });
// the regime's voice on the radio, in its own two languages whatever the Host speaks
const radio = new Sprite();
for (const language of ['en', 'de'] as const) radio.speak(language, allLines(language), REGIME[language]);
radio.write('radio');

// The model lands in the build cache too, instead of being downloaded for every build, one
// folder per revision. transformers.js takes any file it finds there as complete, so a folder
// counts only once a load through it has finished (COMPLETE); one without the mark holds an
// interrupted download and starts over.
const { env } = await import('@huggingface/transformers');
env.remotePathTemplate = `{model}/resolve/${COMPUTER_VOICE.revision}/`;
const models = join(cacheRoot, 'models', COMPUTER_VOICE.revision);
const complete = join(models, 'COMPLETE');
let modelsCached = false;
tryCache(() => {
  if (!existsSync(complete)) rmSync(models, { recursive: true, force: true });
  mkdirSync(models, { recursive: true });
  // other revisions are of no use any more
  for (const entry of readdirSync(dirname(models))) if (entry !== COMPUTER_VOICE.revision) rmSync(join(dirname(models), entry), { recursive: true, force: true });
  modelsCached = true;
});
env.cacheDir = modelsCached ? models : join(root, 'node_modules', '.cache', 'solartournament-models');
const { KokoroTTS } = await import('kokoro-js');
const kokoro = await KokoroTTS.from_pretrained(COMPUTER_VOICE.model, { dtype: 'fp32', device: 'cpu' });
if (modelsCached) tryCache(() => writeFileSync(complete, COMPUTER_VOICE.revision + '\n'));
const tokenizer = (kokoro as unknown as { tokenizer: (text: string, options: object) => { input_ids: unknown } }).tokenizer;

/** Nicole says a line: English by herself, any other language in the phonemes espeak spells it in. */
async function nicole(locale: Locale, line: string): Promise<Int16Array> {
  let audio: { audio: Float32Array; sampling_rate: number };
  if (locale === 'en') audio = await kokoro.generate(line, { voice: COMPUTER_VOICE.voice, speed: COMPUTER_VOICE.speed });
  else {
    const spelled = new module.eSpeakNGWorker();
    spelled.set_voice(ANNOUNCER_LANGUAGE[locale]);
    const ipa = spelled.synthesize_ipa(line);
    // espeak joins a word's phonemes with "_" and marks unstressed words with "-"
    const phonemes = (typeof ipa === 'string' ? ipa : ipa.ipa).replace(/[_-]/g, '').replace(/\s+/g, ' ').trim();
    const { input_ids } = tokenizer(phonemes, { truncation: true });
    audio = await kokoro.generate_from_ids(input_ids as never, { voice: COMPUTER_VOICE.voice, speed: COMPUTER_VOICE.speed });
  }
  return trim(toPcm(resample(audio.audio, audio.sampling_rate, SAMPLE_RATE)));
}

for (const locale of ['en', 'de', 'es', 'fr'] as const) {
  const translate = (line: string) => (locale === 'en' ? line : (CATALOGS[locale][line] ?? line));
  const sprite = new Sprite();
  sprite.speak('mod', allLines('mod').map(translate), { voice: `${ANNOUNCER_LANGUAGE[locale]}+m3`, ...ANNOUNCER });
  for (const line of new Set(allLines('sys').map(translate))) sprite.add(clipKey('sys', line), await nicole(locale, line));
  sprite.write(locale);
}

// into the build cache, which keeps the newest few renders
tryCache(() => {
  mkdirSync(cached, { recursive: true });
  for (const file of files) cpSync(join(out, file), join(cached, file));
  const renders = join(cacheRoot, 'voice');
  const old = readdirSync(renders).sort((a, b) => statSync(join(renders, b)).mtimeMs - statSync(join(renders, a)).mtimeMs).slice(CACHED_RENDERS);
  for (const entry of old) rmSync(join(renders, entry), { recursive: true, force: true });
});

/** Linear resampling, good enough for speech that ends up as a 24 kbps MP3. */
function resample(samples: Float32Array, from: number, to: number): Float32Array {
  const result = new Float32Array(Math.floor((samples.length * to) / from));
  for (let i = 0; i < result.length; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const next = samples[Math.min(j + 1, samples.length - 1)];
    result[i] = samples[j] + (next - samples[j]) * (x - j);
  }
  return result;
}

/** Float samples to 16 bit, normalized to a peak of 90 %. */
function toPcm(samples: Float32Array): Int16Array {
  const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 1e-6);
  return Int16Array.from(samples, (s) => Math.round((s / peak) * 0.9 * 32767));
}

function concat(parts: Int16Array[]): Int16Array {
  const result = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** Cuts the silence before and after a word, so it starts exactly on its beat. */
function trim(samples: Int16Array): Int16Array {
  const threshold = 300;
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end--;
  return samples.slice(Math.max(0, start - 20), Math.min(samples.length, end + 200));
}
