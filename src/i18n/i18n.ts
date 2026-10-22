import { DE } from './de';
import { ES } from './es';
import { FR } from './fr';
import { storageGet, storageSet } from '../storage';

/**
 * The languages of the game. English is the source: every text is written in English where it
 * is used, wrapped in t() (or, where it is kept in a table and shown elsewhere, marked with
 * msg()), and the English text is the key of its translation in each catalog (de.ts, es.ts,
 * fr.ts). A text without a translation shows in English; the unit tests make sure there is none.
 * Placeholders in braces ({name}, {n}) are filled in after the translation, so a translation
 * can put them where its language wants them.
 */
export type Locale = 'en' | 'de' | 'es' | 'fr';
export const LOCALES: readonly Locale[] = ['en', 'de', 'es', 'fr'];
/** What the language switcher calls each language, in itself. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français' };

export type Catalog = Readonly<Record<string, string>>;
export const CATALOGS: Record<Exclude<Locale, 'en'>, Catalog> = { de: DE, es: ES, fr: FR };

let locale: Locale = 'en';

/** The language a Host gets: the one it chose, else the first of its browser's languages the game speaks, else English. */
export function pickLocale(chosen: string | null, browser: readonly string[]): Locale {
  if (LOCALES.includes(chosen as Locale)) return chosen as Locale;
  for (const tag of browser) {
    const language = tag.slice(0, 2).toLowerCase();
    if (LOCALES.includes(language as Locale)) return language as Locale;
  }
  return 'en';
}

export const currentLocale = () => locale;

/** The language a Host chose in the menu (see chooseLocale). */
const LOCALE_KEY = 'solartournament.language';

/** Sets the language at startup: the one the Host chose, else its browser's (see pickLocale). */
export function initLocale() {
  setLocale(pickLocale(storageGet(LOCALE_KEY), typeof navigator === 'undefined' ? [] : navigator.languages));
}

/**
 * The Host chooses a language: it is kept, and the page starts anew in it. Texts are put in
 * place once (the page's, the marks on the radar, the voices), so a fresh start puts them all
 * in the new language at once.
 */
export function chooseLocale(next: Locale) {
  if (next === locale) return;
  storageSet(LOCALE_KEY, next);
  location.reload();
}

export function setLocale(next: Locale) {
  locale = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/** A text in the current language, its placeholders filled in. */
export function t(source: string, params?: Record<string, string | number>): string {
  return fill(locale === 'en' ? source : (CATALOGS[locale][source] ?? source), params);
}

/** Marks a text for translation where it is kept (a table, a constant) and shown elsewhere through t(): it returns the text as it is. */
export const msg = (source: string) => source;

/** Fills the {placeholders} of a text. */
export function fill(text: string, params?: Record<string, string | number>): string {
  return params ? text.replace(/\{(\w+)\}/g, (all, key: string) => (key in params ? String(params[key]) : all)) : text;
}

/**
 * Translates the page's fixed texts: every element with data-i18n (its English text is the
 * key, kept in the attribute the first time), and every attribute named in data-i18n-attr.
 */
export function translatePage(root: ParentNode = document) {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.dataset.i18n ||= element.innerHTML.trim();
    element.innerHTML = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const name of element.dataset.i18nAttr!.split(' ')) {
      const key = `i18n${name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`;
      element.dataset[key] ||= element.getAttribute(name) ?? '';
      element.setAttribute(name, t(element.dataset[key]!));
    }
  }
}
