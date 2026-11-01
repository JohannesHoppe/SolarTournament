import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexingRules, LANGUAGES, LEGAL_PAGE, localizePage, type Page, pageFile, PAGES, pageUrl, sitemap } from '../tools/seo/pages';
import { HANDBOOK_NUMBERS } from './handbook/numbers';
import { CATALOGS, writtenNumbers } from './i18n/i18n';
import { ARENAS } from './world/arenas';

const root = resolve(import.meta.dirname, '..');
const source = (page: string) => readFileSync(resolve(root, `${page}.html`), 'utf8');
const translator = (language: (typeof LANGUAGES)[number]) => (text: string) => (language === 'en' ? text : (CATALOGS[language][text] ?? text));
const written = (page: Page, language: (typeof LANGUAGES)[number]) =>
  localizePage(source(page), page, language, translator(language), page === 'handbook' ? writtenNumbers(HANDBOOK_NUMBERS, language) : {});

describe('the addresses', () => {
  it('stay in the root, where the pages\' relative paths hold, and never meet', () => {
    const files = PAGES.flatMap((page) => LANGUAGES.map((language) => pageFile(page, language)));
    expect(new Set(files).size).toBe(files.length);
    expect(files.every((file) => !file.includes('/'))).toBe(true);
    expect(pageUrl('index', 'en')).toBe('https://solartournament.games/');
    expect(pageUrl('handbook', 'de')).toBe('https://solartournament.games/handbook-de');
  });

  it('are all in the sitemap, the legal pages not', () => {
    const map = sitemap();
    for (const page of PAGES) for (const language of LANGUAGES) expect(map).toContain(`<loc>${pageUrl(page, language)}</loc>`);
    expect(map).not.toMatch(/impressum|datenschutz/);
  });
});

describe.each(PAGES)('the page %s', (page) => {
  it.each(LANGUAGES)('in %s names itself and every sibling', (language) => {
    const html = written(page, language);
    expect(html).toContain(`<html lang="${language}"`);
    expect(html.includes('data-locale=')).toBe(language !== 'en');
    expect(html).toContain(`<link rel="canonical" href="${pageUrl(page, language)}">`);
    for (const sibling of LANGUAGES) expect(html).toContain(`hreflang="${sibling}" href="${pageUrl(page, sibling)}"`);
    expect(html).toContain(`hreflang="x-default" href="${pageUrl(page, 'en')}"`);
    expect(html).toContain(`<meta property="og:url" content="${pageUrl(page, language)}">`);
  });

  it.each(LANGUAGES)('in %s has its title and description in that language, short enough to show', (language) => {
    const html = written(page, language);
    const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)![1];
    const description = /<meta name="description" content="([^"]*)"/.exec(html)![1];
    expect(title).toContain(page === 'index' ? 'SolarTournament' : ' · SolarTournament');
    expect(title.length).toBeLessThanOrEqual(80);
    expect(description.length).toBeGreaterThan(70);
    expect(description.length).toBeLessThanOrEqual(190);
    expect(html).toContain(`<meta property="og:title" content="${title}">`);
    expect(html).toContain(`<meta property="og:description" content="${description}">`);
    if (language !== 'en') {
      expect(title).not.toBe(/<title[^>]*>([^<]*)<\/title>/.exec(source(page))![1]);
      expect(description).not.toBe(/<meta name="description" content="([^"]*)"/.exec(source(page))![1]);
    }
  });

  it.each(LANGUAGES)('in %s points its links at its own language and final addresses', (language) => {
    const html = written(page, language);
    expect(html).not.toMatch(/\shref="(about|handbook|radio|impressum|datenschutz)\.html/);
    if (language === 'en' || page === 'radio' || page === 'handbook') return;
    expect(html).toContain(`href="handbook-${language}`);
  });
});

describe('the texts in place', () => {
  it('keep their English key for the page\'s own script', () => {
    const html = written('about', 'de');
    expect(html).toContain('data-i18n="Play now">Jetzt spielen<');
    expect(html).toMatch(/alt="Ein Schiff im Orbit[^"]*" data-i18n-alt="A ship in orbit/);
    expect(html).toContain('data-i18n-attr="alt"');
    expect(html).toContain('data-i18n="Realistic physics, &lt;span class=&quot;neon&quot;&gt;awesome dogfights&lt;/span&gt;"');
    expect(html).toContain('>Realistische Physik, <span class="neon">geile Dogfights</span></h1>');
  });

  it('leave no English behind in another language, and the handbook no placeholder', () => {
    for (const language of LANGUAGES) {
      const body = written('handbook', language).split('<body')[1];
      expect(body.replace(/data-i18n[\w-]*="[^"]*"/g, '')).not.toMatch(/\{\w+\}/);
      if (language !== 'en') expect(body.replace(/data-i18n[\w-]*="[^"]*"/g, '')).not.toContain('Dirty tricks');
    }
    expect(written('handbook', 'de').replace(/data-i18n[\w-]*="[^"]*"/g, '')).toContain('Pilotenhandbuch');
  });
});

describe('the home page\'s structured data', () => {
  const data = (language: (typeof LANGUAGES)[number]) => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(written('index', language))![1]);

  it('names the site at the root only, and the game in every language', () => {
    expect(data('en').map((entry: { '@type': unknown }) => entry['@type'])).toEqual(['WebSite', ['VideoGame', 'WebApplication']]);
    expect(data('en')[0].url).toBe('https://solartournament.games/');
    expect(data('de')).toHaveLength(1);
    expect(data('de')[0].inLanguage).toBe('de');
    expect(data('de')[0].description).toContain('Sieben Arenen');
    expect(data('en')[1].description).toContain("Saturn's rings");
  });

  it('claims no rating the game has not got', () => {
    expect(written('index', 'en')).not.toMatch(/aggregateRating|ratingValue/);
  });

  it('is on no other page', () => {
    for (const page of ['about', 'handbook', 'radio'] as const) expect(written(page, 'en')).not.toContain('application/ld+json');
  });
});

describe('what the pages say of the game holds', () => {
  it('counts the arenas right', () => {
    expect(ARENAS).toHaveLength(7);
    for (const page of ['index', 'about']) expect(source(page)).toMatch(/[Ss]even arenas/);
    expect((source('about').match(/<li data-i18n><strong>/g) ?? []).length).toBe(7 + 5);
  });
});

describe('the search engines are kept out', () => {
  it('of the raw Pages addresses on every stage', () => {
    for (const branch of ['stage_prod', 'stage_test', undefined]) {
      expect(indexingRules(branch)).toContain('https://:project.pages.dev/*\n  X-Robots-Tag: noindex');
      expect(indexingRules(branch)).toContain('https://:version.:project.pages.dev/*\n  X-Robots-Tag: noindex');
    }
  });

  it('of every page of the test stage, of none of production, and of none where the branch is unknown', () => {
    expect(indexingRules('stage_test')).toContain('/*\n  X-Robots-Tag: noindex');
    expect(indexingRules('stage_test').split('\n')).toContain('/*');
    expect(indexingRules('stage_prod').split('\n')).not.toContain('/*');
    expect(indexingRules(undefined).split('\n')).not.toContain('/*');
  });

  it('of the legal pages', () => {
    // the page shell marks each page with this in its source
    for (const page of ['impressum', 'datenschutz']) expect(source(page)).toContain(LEGAL_PAGE);
  });
});
