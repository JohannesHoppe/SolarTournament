import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FROM_CODE, FROM_README, HANDBOOK_NUMBERS } from './numbers';
import { placeholders, sources } from '../../tools/i18n/sources';

const root = fileURLToPath(new URL('../..', import.meta.url));
const readme = readFileSync(`${root}README.md`, 'utf8');
/** The handbook's texts, as the catalogs translate them. */
const texts = [...sources(root)].filter(([, where]) => where.includes('handbook.html')).map(([text]) => text);
/** How the README writes a small count in words. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

describe("the Pilot's Handbook", () => {
  it('is translated through the catalogs', () => {
    // the i18n test checks every one of them in every language
    expect(texts.length).toBeGreaterThan(100);
  });

  it('says what the README says, for every number the code does not hand it', () => {
    const missing = Object.entries(FROM_README)
      .filter(([, { value, readme: phrase }]) => ![String(value), WORDS[value]].some((written) => written && readme.includes(phrase.replace('#', written))))
      .map(([name, { value, readme: phrase }]) => `${name}: "${phrase.replace('#', String(value))}"`);
    expect(missing).toEqual([]);
  });

  it('takes its numbers from the game', () => {
    for (const [name, value] of Object.entries(FROM_CODE)) expect(Number.isFinite(value) && value > 0, name).toBe(true);
    expect(FROM_CODE.limit).toBe(250);
    expect(FROM_CODE.turn).toBe(585);
  });

  it('writes every number as a placeholder, and has one for each', () => {
    const used = new Set(texts.flatMap(placeholders));
    expect([...used].filter((name) => !(name in HANDBOOK_NUMBERS))).toEqual([]);
    expect(Object.keys(HANDBOOK_NUMBERS).filter((name) => !used.has(name))).toEqual([]);
    // a digit outside a placeholder would be a number nobody keeps in step with the game
    const written = texts.filter((text) => /\d/.test(text.replace(/\{\w+\}/g, '').replace(/<[^>]*>/g, '')));
    expect(written).toEqual([]);
  });
});
