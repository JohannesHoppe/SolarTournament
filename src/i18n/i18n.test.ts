import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { CATALOGS, fill, pickLocale, setLocale, t } from './i18n';
import { placeholders, sources } from '../../tools/i18n/sources';

const root = fileURLToPath(new URL('../..', import.meta.url));
const texts = sources(root);

describe('the languages of the game', () => {
  it('picks the language a Host chose, else its browser’s, else English', () => {
    expect(pickLocale('fr', ['de-DE'])).toBe('fr');
    expect(pickLocale(null, ['it-IT', 'es-MX', 'de'])).toBe('es');
    expect(pickLocale('xx', ['ja'])).toBe('en');
  });

  it('fills placeholders after translating', () => {
    expect(fill('Hooked {name}', { name: 'Vega' })).toBe('Hooked Vega');
    setLocale('en');
    expect(t('Torpedo away · {name}', { name: 'Orion' })).toBe('Torpedo away · Orion');
  });

  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    it(`has every text in ${locale}, with the same placeholders, and nothing left over`, () => {
      const missing = [...texts.keys()].filter((text) => !catalog[text]);
      expect(missing, `${missing.length} untranslated`).toEqual([]);
      const broken = Object.entries(catalog).filter(([source, text]) => placeholders(source).join() !== placeholders(text).join());
      expect(broken).toEqual([]);
      const stale = Object.keys(catalog).filter((source) => !texts.has(source));
      expect(stale).toEqual([]);
    });
  }
});
