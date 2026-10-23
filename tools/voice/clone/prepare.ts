/**
 * Prepares a clone run (see ../README.md): writes into a work folder the lines Nicole says in
 * each cloned language, under their keys and with the settings to clone them with
 * (lines.json), how many of them each language's store in the folder still lacks (todo.json),
 * the Python packages clone.py needs (requirements.txt), and, unless it is there
 * already, the English reference she is cloned from (reference.wav, Kokoro's Nicole on the
 * pinned revision).
 *
 * usage: node tools/voice/clone/prepare.ts <work folder>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, CLONE, CLONED, cloneKey, COMPUTER_VOICE, nicoleLines, REFERENCE } from '../nicole.ts';

const work = process.argv[2];
if (!work) throw new Error('usage: prepare.ts <work folder>');
mkdirSync(work, { recursive: true });

const locales = Object.fromEntries(CLONED.map((locale) => [locale, nicoleLines(locale).map((text) => ({ key: cloneKey(locale, text), text }))]));
writeFileSync(join(work, 'lines.json'), JSON.stringify({ clone: CLONE, check: CHECK, locales }, null, 1) + '\n');
// what clone.py runs on (Python 3.11): Chatterbox at its pinned commit pins torch, transformers
// (Whisper's too) and the rest itself
writeFileSync(join(work, 'requirements.txt'), `chatterbox-tts @ ${CLONE.code}\nsoundfile==${CHECK.soundfile}\n`);
// how many lines of each language the store in the work folder (if downloaded) still lacks
const todo = Object.fromEntries(
  CLONED.map((locale) => {
    const index = join(work, `nicole-${locale}.json`);
    const stored = existsSync(index) ? (JSON.parse(readFileSync(index, 'utf8')) as { clips: Record<string, unknown> }).clips : {};
    const missing = locales[locale].filter((line) => !(line.key in stored)).length;
    console.log(`${locale}: ${locales[locale].length} lines, ${missing} to clone`);
    return [locale, missing];
  }),
);
writeFileSync(join(work, 'todo.json'), JSON.stringify(todo) + '\n');

const reference = join(work, 'reference.wav');
if (!existsSync(reference)) {
  const { env } = await import('@huggingface/transformers');
  env.remotePathTemplate = `{model}/resolve/${COMPUTER_VOICE.revision}/`;
  const { KokoroTTS } = await import('kokoro-js');
  const kokoro = await KokoroTTS.from_pretrained(COMPUTER_VOICE.model, { dtype: 'fp32', device: 'cpu' });
  const audio = await kokoro.generate(REFERENCE.text, { voice: COMPUTER_VOICE.voice, speed: REFERENCE.speed });
  audio.save(reference);
  console.log(`reference: ${(audio.audio.length / audio.sampling_rate).toFixed(1)} s`);
}
