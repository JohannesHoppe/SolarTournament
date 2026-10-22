/**
 * Lists every English text of the game that is translated (see sources.ts), each with where it
 * is used and, for a language given as argument (de, es or fr), whether its catalog has it:
 * `npm run i18n -- de` prints the texts still missing in German as JSON, `npm run i18n` all.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources } from './sources.ts';
import { DE } from '../../src/i18n/de.ts';
import { ES } from '../../src/i18n/es.ts';
import { FR } from '../../src/i18n/fr.ts';

const catalogs: Record<string, Readonly<Record<string, string>>> = { de: DE, es: ES, fr: FR };
const locale = process.argv[2];
const catalog = locale ? catalogs[locale] : undefined;
if (locale && !catalog) throw new Error(`No catalog for "${locale}": de, es or fr`);
const texts = sources(join(dirname(fileURLToPath(import.meta.url)), '../..'));
const list = [...texts].filter(([text]) => !catalog || !catalog[text]).map(([text, where]) => ({ text, where: [...new Set(where)] }));
console.log(JSON.stringify(list, null, 1));
