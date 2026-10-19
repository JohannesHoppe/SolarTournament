/**
 * Renders the voice of Radio 2584 with espeak-ng (WebAssembly build, GPL-3.0) into one MP3
 * sprite plus a manifest: every word and every sentence of every line in src/music/lines.ts,
 * once per language. The game speaks sentences whole and places single words on the beat; no speech engine ships
 * with the game. Run with `npm run voice` after changing lines.ts; needs ffmpeg on the PATH.
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
const VOICES: Record<Language, { voice: string; rate: number; pitch: number; range: number }> = {
  en: { voice: 'en-us+robosoft', rate: 140, pitch: 32, range: 15 },
  de: { voice: 'de+robosoft', rate: 135, pitch: 30, range: 15 },
  mod: { voice: 'en-us+m3', rate: 170, pitch: 45, range: 60 },
  sys: { voice: 'en-us+f3', rate: 172, pitch: 55, range: 35 },
};

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

for (const language of ['en', 'de', 'mod', 'sys'] as Language[]) {
  const settings = VOICES[language];
  // the music voices need single words to place on the beat and whole sentences to speak them
  // with their melody; the flight computer speaks whole lines
  const texts: [key: string, text: string][] =
    language === 'sys'
      ? allLines(language).map((line) => [line, line])
      : allLines(language).flatMap((line) => [
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
    const pcm = trim(concat(parts));
    clips[clipKey(language, key)] = [position / SAMPLE_RATE, pcm.length / SAMPLE_RATE];
    chunks.push(pcm, gap);
    position += pcm.length + gap.length;
  }
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
