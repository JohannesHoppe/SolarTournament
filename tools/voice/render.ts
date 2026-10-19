/**
 * Renders the voices into one MP3 sprite plus a manifest; no speech engine ships with the
 * game. The radio voices come from espeak-ng (WebAssembly build, GPL-3.0): every word and
 * every sentence of every line in src/music/lines.ts, once per language, because the game
 * speaks sentences whole and places single words on the beat. The flight computer speaks
 * whole lines with Kokoro (neural, Apache-2.0), a natural voice. Run with `npm run voice`
 * after changing lines.ts; needs ffmpeg on the PATH, and downloads the Kokoro model once.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { allLines, clipKey, phraseKey, phrases, words, type Language } from '../../src/music/lines.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'public/assets/voice');
const SAMPLE_RATE = 22050;
/** Silence between two words in the sprite, so decoder padding never cuts into a word (s). */
const GAP = 0.25;
/** The regime speaks as a slow robot (espeak's robosoft variant, a narrow pitch range); the announcer talks fast and lively. */
const VOICES: Record<Exclude<Language, 'sys'>, { voice: string; rate: number; pitch: number; range: number }> = {
  en: { voice: 'en-us+robosoft', rate: 140, pitch: 32, range: 15 },
  de: { voice: 'de+robosoft', rate: 135, pitch: 30, range: 15 },
  mod: { voice: 'en-us+m3', rate: 170, pitch: 45, range: 60 },
};
/** The flight computer: Kokoro's breathy, intimate Nicole, a little faster than she talks by herself. */
const COMPUTER_VOICE = { model: 'onnx-community/Kokoro-82M-v1.0-ONNX', voice: 'af_nicole', speed: 1.3 } as const;

interface Worker {
  set_voice(voice: string): void;
  set_rate(rate: number): void;
  set_pitch(pitch: number): void;
  set_range(range: number): void;
  synthesize(text: string, callback: (samples: Int16Array | null) => void): void;
}

const espeakPath = join(root, 'node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js');
const { default: init } = (await import(pathToFileURL(espeakPath).href)) as { default: () => Promise<{ eSpeakNGWorker: new () => Worker }> };
const module = await init();

const chunks: Int16Array[] = [];
const clips: Record<string, [number, number]> = {};
let position = 0;
const gap = new Int16Array(Math.round(GAP * SAMPLE_RATE));

for (const language of ['en', 'de', 'mod'] as const) {
  const settings = VOICES[language];
  // single words to place on the beat, whole sentences to speak them with their melody
  const texts: [key: string, text: string][] = allLines(language).flatMap((line) => [
    ...words(line).map(({ word }): [string, string] => [word, word]),
    ...phrases(line).filter((piece) => piece !== '{name}').map((piece): [string, string] => [phraseKey(piece), piece]),
  ]);
  const rendered = new Set<string>();
  for (const [key, text] of texts) {
    if (rendered.has(key)) continue;
    rendered.add(key);
    // a fresh worker per clip: espeak keeps state between calls, this keeps every clip reproducible
    const worker = new module.eSpeakNGWorker();
    worker.set_voice(settings.voice);
    worker.set_rate(settings.rate);
    worker.set_pitch(settings.pitch);
    worker.set_range(settings.range);
    const parts: Int16Array[] = [];
    worker.synthesize(text, (samples) => {
      if (samples?.length) parts.push(Int16Array.from(samples));
    });
    add(clipKey(language, key), trim(concat(parts)));
  }
}

const { KokoroTTS } = await import('kokoro-js');
const kokoro = await KokoroTTS.from_pretrained(COMPUTER_VOICE.model, { dtype: 'fp32', device: 'cpu' });
for (const line of new Set(allLines('sys'))) {
  const audio = await kokoro.generate(line, { voice: COMPUTER_VOICE.voice, speed: COMPUTER_VOICE.speed });
  add(clipKey('sys', line), trim(toPcm(resample(audio.audio, audio.sampling_rate, SAMPLE_RATE))));
}

function add(key: string, pcm: Int16Array) {
  clips[key] = [position / SAMPLE_RATE, pcm.length / SAMPLE_RATE];
  chunks.push(pcm, gap);
  position += pcm.length + gap.length;
}

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

mkdirSync(out, { recursive: true });
const pcm = concat(chunks);
const encoded = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0', '-b:a', '24k', join(out, 'voice.mp3')], {
  input: Buffer.from(pcm.buffer),
});
if (encoded.status !== 0) throw new Error('ffmpeg failed: ' + encoded.stderr);
writeFileSync(join(out, 'voice.json'), JSON.stringify({ sampleRate: SAMPLE_RATE, clips }, null, 1) + '\n');
console.log(`${Object.keys(clips).length} clips, ${(pcm.length / SAMPLE_RATE).toFixed(1)} s`);

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
