/**
 * Prepares a clone run (see ../README.md): writes into a work folder the lines every speaker
 * (Nicole and the campaign's people, see SPEAKERS) says in each cloned language, under their keys
 * and with the settings to clone them with (lines.json), how much each language's job has to do
 * (todo.json), and, unless they are there already, the English references the speakers are
 * cloned from (Kokoro on the pinned revision). A speaker without a voice print in the work folder
 * gets one from the German job; the other languages leave that speaker for the next run, so
 * every language speaks with the same print. It refuses a Python lock (requirements.txt) that
 * names another Chatterbox or soundfile than nicole.ts.
 *
 * usage: node tools/voice/clone/prepare.ts <work folder>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECK, CLONE, CLONED, cloneKey, COMPUTER_VOICE, condsName, referenceName, SPEAKER_NAMES, SPEAKERS, speakerLines, storeName } from '../nicole.ts';

const work = process.argv[2];
if (!work) throw new Error('usage: prepare.ts <work folder>');
mkdirSync(work, { recursive: true });

const speakers = Object.fromEntries(
  SPEAKER_NAMES.map((speaker) => [
    speaker,
    {
      conds: condsName(speaker),
      reference: referenceName(speaker),
      locales: Object.fromEntries(CLONED.map((locale) => [locale, { store: storeName(speaker, locale), lines: speakerLines(speaker, locale).map((text) => ({ key: cloneKey(locale, text, speaker), text })) }])),
    },
  ]),
);
writeFileSync(join(work, 'lines.json'), JSON.stringify({ clone: CLONE, check: CHECK, speakers }, null, 1) + '\n');
// what clone.py runs on is locked in requirements.txt beside this file: it has to be the
// Chatterbox and the soundfile that nicole.ts names (see ../README.md, "The Python lock")
const lock = readFileSync(new URL('requirements.txt', import.meta.url), 'utf8');
const commit = /@([0-9a-f]{40})$/.exec(CLONE.code)?.[1];
if (!commit || !lock.includes(`/chatterbox/archive/${commit}.tar.gz`)) throw new Error('requirements.txt locks another Chatterbox than CLONE.code: lock again');
if (!new RegExp(`^soundfile==${CHECK.soundfile.replaceAll('.', '\\.')} `, 'm').test(lock)) throw new Error('requirements.txt locks another soundfile than CHECK.soundfile: lock again');
// what each language's job has to do: the lines the stores in the work folder (if downloaded)
// still lack, of the speakers it may clone, and the voice prints the German job makes
const todo = Object.fromEntries(
  CLONED.map((locale) => {
    let due = 0;
    for (const speaker of SPEAKER_NAMES) {
      const voiced = existsSync(join(work, condsName(speaker)));
      if (!voiced && locale !== 'de') continue;
      if (!voiced) due++;
      const index = join(work, `${storeName(speaker, locale)}.json`);
      const stored = existsSync(index) ? (JSON.parse(readFileSync(index, 'utf8')) as { clips: Record<string, unknown> }).clips : {};
      const lines = speakers[speaker].locales[locale].lines;
      const missing = lines.filter((line) => !(line.key in stored)).length;
      console.log(`${speaker} ${locale}: ${lines.length} lines, ${missing} to clone${voiced ? '' : ', and the voice print'}`);
      due += missing;
    }
    return [locale, due];
  }),
);
writeFileSync(join(work, 'todo.json'), JSON.stringify(todo) + '\n');

// the English references of the speakers that have no voice print yet
const wanted = SPEAKER_NAMES.filter((speaker) => !existsSync(join(work, condsName(speaker))) && !existsSync(join(work, referenceName(speaker))));
if (wanted.length) {
  const { env } = await import('@huggingface/transformers');
  env.remotePathTemplate = `{model}/resolve/${COMPUTER_VOICE.revision}/`;
  const { KokoroTTS } = await import('kokoro-js');
  const kokoro = await KokoroTTS.from_pretrained(COMPUTER_VOICE.model, { dtype: 'fp32', device: 'cpu' });
  for (const speaker of wanted) {
    const { voice, reference } = SPEAKERS[speaker];
    const audio = await kokoro.generate(reference.text, { voice: voice as never, speed: reference.speed });
    audio.save(join(work, referenceName(speaker)));
    console.log(`reference of ${speaker}: ${(audio.audio.length / audio.sampling_rate).toFixed(1)} s`);
  }
}
