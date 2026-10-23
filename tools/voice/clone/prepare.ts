/**
 * Prepares a clone run (see ../README.md): writes into a work folder the lines Nicole says in
 * each cloned language, under their keys and with the settings to clone them with
 * (lines.json), how many of them each language's store in the folder still lacks (todo.json),
 * and, unless it is there already, the English reference she is cloned from (reference.wav,
 * Kokoro's Nicole on the pinned revision). It refuses a Python lock (requirements.txt) that
 * names another Chatterbox or soundfile than nicole.ts.
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
// what clone.py runs on is locked in requirements.txt beside this file: it has to be the
// Chatterbox and the soundfile that nicole.ts names (see ../README.md, "The Python lock")
const lock = readFileSync(new URL('requirements.txt', import.meta.url), 'utf8');
const commit = /@([0-9a-f]{40})$/.exec(CLONE.code)?.[1];
if (!commit || !lock.includes(`/chatterbox/archive/${commit}.tar.gz`)) throw new Error('requirements.txt locks another Chatterbox than CLONE.code: lock again');
if (!new RegExp(`^soundfile==${CHECK.soundfile.replaceAll('.', '\\.')} `, 'm').test(lock)) throw new Error('requirements.txt locks another soundfile than CHECK.soundfile: lock again');
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
