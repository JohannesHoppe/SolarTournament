import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { allLines } from '../../src/music/lines.ts';
import { I18N_ATTRIBUTES, I18N_TEXT } from '../seo/pages.ts';

/**
 * Every English text of the game that is translated (see src/i18n/i18n.ts), with where it is
 * used: the first argument of every t() and msg() in the code (a string without ${}), the
 * texts and attributes the pages mark with data-i18n and data-i18n-attr, and the lines the
 * flight computer and the announcer speak (their voices are rendered in every language).
 */
export function sources(root: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (text: string, where: string) => {
    const key = text.trim();
    if (key) found.set(key, [...(found.get(key) ?? []), where]);
  };
  for (const file of walk(join(root, 'src'))) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file.includes('/i18n/')) continue;
    const code = readFileSync(file, 'utf8');
    for (const match of code.matchAll(/\b(?:t|msg)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (match[1] === '`' && match[2].includes('${')) continue;
      add(unescape(match[2]), relative(root, file));
    }
  }
  for (const page of ['index.html', 'radio.html', 'handbook.html', 'about.html']) {
    const html = readFileSync(join(root, page), 'utf8');
    for (const match of html.matchAll(I18N_TEXT)) add(match[3].replace(/\s+/g, ' '), page);
    for (const match of html.matchAll(I18N_ATTRIBUTES)) {
      const attributes = match[1] + match[3];
      for (const name of match[2].split(' ')) {
        const value = attributes.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
        if (value) add(value, page);
      }
    }
  }
  for (const line of allLines('sys')) add(line, 'src/music/lines.ts (flight computer)');
  for (const line of allLines('mod')) add(line, 'src/music/lines.ts (announcer)');
  for (const line of allLines('rask')) add(line, 'src/music/lines.ts (yardmaster)');
  for (const line of allLines('pim')) add(line, 'src/music/lines.ts (welder)');
  for (const line of allLines('hedda')) add(line, 'src/music/lines.ts (captain)');
  for (const line of allLines('saw')) add(line, 'src/music/lines.ts (claim-jumpers)');
  return found;
}

function* walk(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** The text a string literal stands for. */
const unescape = (text: string) => text.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');

/** The placeholders of a text, sorted: a translation keeps the same. */
export const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
