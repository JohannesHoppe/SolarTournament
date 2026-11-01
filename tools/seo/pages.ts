/**
 * What search engines and link previews read, written by the build (`pageShell` in
 * vite.config.ts) into the built pages. Google asks for one address per language and its crawler
 * sends no language of its own, so each page the search finds is written out in every language
 * with its texts in place, its address and its links to its siblings. The addresses stay in the
 * site's root, where the pages' relative paths hold: `/` and `/handbook` in English, `/de` and
 * `/handbook-de` in German. Vite's dev server serves the English sources only.
 */

/** The site's address in production: the only one search engines are told about. */
export const SITE = 'https://solartournament.games';
/** Cloudflare's name of the branch production is built from. */
export const PRODUCTION_BRANCH = 'stage_prod';

/** The pages a search can land on, by the name of their source. */
export const PAGES = ['index', 'about', 'handbook', 'radio'] as const;
export type Page = (typeof PAGES)[number];

/** What marks a legal page in its source: German only, of no use to a search, and left out of it. */
export const LEGAL_PAGE = '<main class="station legal">';
export const NOT_FOR_SEARCH = '<meta name="robots" content="noindex, follow">';

export const LANGUAGES = ['en', 'de', 'es', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

const OG_LOCALE: Record<Language, string> = { en: 'en_US', de: 'de_DE', es: 'es_ES', fr: 'fr_FR' };
/** The link preview's picture, 1200 × 630, in public/. */
const PREVIEW = { path: '/preview.jpg', width: 1200, height: 630 };
const REPOSITORY = 'https://github.com/JohannesHoppe/SolarTournament';

/** An element whose text the page translates: its tag, its attributes, its text (the text's key once its white space is folded). */
export const I18N_TEXT = /<(\w+)\b([^>]*\sdata-i18n(?:="")?(?=[\s>])[^>]*)>([\s\S]*?)<\/\1>/g;
/** An element with attributes the page translates: what stands before and after the list of their names, and the list. */
export const I18N_ATTRIBUTES = /<\w+\b([^>]*)\sdata-i18n-attr="([^"]+)"([^>]*)>/g;

/** The name of a page's file without its extension, as Cloudflare Pages serves it. */
function stem(page: Page, language: Language) {
  if (language === 'en') return page === 'index' ? '' : page;
  return page === 'index' ? language : `${page}-${language}`;
}

/** The file a page is written to in a language. */
export const pageFile = (page: Page, language: Language) => `${stem(page, language) || 'index'}.html`;

/** The full address of a page in a language. */
export const pageUrl = (page: Page, language: Language) => `${SITE}/${stem(page, language)}`;

/** A text as the value of an attribute. */
const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** What an attribute's value says. */
const plain = (text: string) => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Puts a page's texts in place. Each element keeps its English text as its key, so the page's
 * own script finds the same translation whatever language the file was written in.
 */
function placeTexts(html: string, translate: (text: string) => string, numbers: Record<string, string>) {
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (all, name: string) => numbers[name] ?? all);
  return html
    .replace(I18N_ATTRIBUTES, (element, before: string, names: string, after: string) => {
      let attributes = before + after;
      for (const name of names.split(' ')) {
        attributes = attributes.replace(new RegExp(`\\s${name}="([^"]*)"`), (_, value: string) => ` ${name}="${attribute(translate(plain(value)))}" data-i18n-${name}="${value}"`);
      }
      return `${element.slice(0, element.indexOf(before))}${attributes} data-i18n-attr="${names}">`;
    })
    .replace(I18N_TEXT, (_, tag: string, attributes: string, text: string) => {
      const key = text.replace(/\s+/g, ' ').trim();
      const marked = attributes.replace(/\sdata-i18n(?:="")?(?=[\s>]|$)/, ` data-i18n="${attribute(key)}"`);
      return `<${tag}${marked}>${fill(translate(key))}</${tag}>`;
    });
}

/** A page's links to the site's pages, in its own language and at their final addresses. */
function pointLinks(html: string, language: Language) {
  return html
    .replace(/href="(about|handbook|radio)\.html/g, (_, page: Page) => `href="${stem(page, language)}`)
    .replace(/href="(impressum|datenschutz)\.html/g, 'href="$1')
    .replace(/href="\.\/"/g, `href="./${stem('index', language)}"`);
}

/** What the home page says of the game to a machine that reads it. */
function structuredData(language: Language, description: string) {
  const game = {
    '@context': 'https://schema.org',
    '@type': ['VideoGame', 'WebApplication'],
    name: 'SolarTournament',
    url: pageUrl('index', language),
    description,
    image: SITE + PREVIEW.path,
    genre: ['Space combat', 'Shooter', 'Racing'],
    gamePlatform: 'Web browser',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any (web browser)',
    playMode: ['SinglePlayer', 'MultiPlayer'],
    inLanguage: language,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    author: { '@type': 'Person', name: 'Johannes Hoppe' },
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    sameAs: REPOSITORY,
  };
  // Google reads a site's name only from the home page at the domain's root
  const site = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'SolarTournament', url: `${SITE}/` };
  const data = language === 'en' ? [site, game] : [game];
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/** The address, its siblings and the link preview, from the page's title and description. */
function headTags(html: string, page: Page, language: Language) {
  const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)?.[1];
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!title || !description) throw new Error(`${page}: a page a search can land on has a title and a description`);
  return [
    `<link rel="canonical" href="${pageUrl(page, language)}">`,
    ...LANGUAGES.map((sibling) => `<link rel="alternate" hreflang="${sibling}" href="${pageUrl(page, sibling)}">`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl(page, 'en')}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="SolarTournament">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${pageUrl(page, language)}">`,
    `<meta property="og:image" content="${SITE}${PREVIEW.path}">`,
    `<meta property="og:image:width" content="${PREVIEW.width}">`,
    `<meta property="og:image:height" content="${PREVIEW.height}">`,
    `<meta property="og:locale" content="${OG_LOCALE[language]}">`,
    ...LANGUAGES.filter((sibling) => sibling !== language).map((sibling) => `<meta property="og:locale:alternate" content="${OG_LOCALE[sibling]}">`),
    '<meta name="twitter:card" content="summary_large_image">',
    ...(page === 'index' ? [structuredData(language, plain(description))] : []),
  ]
    .map((tag) => `  ${tag}\n`)
    .join('');
}

/**
 * A built page in a language: its texts in place, its language named (`data-locale` makes the
 * page's script speak it whatever the browser's language, see i18n.ts; the English addresses go
 * without, so a browser in another language still reads them in its own), its links and its head.
 */
export function localizePage(html: string, page: Page, language: Language, translate: (text: string) => string, numbers: Record<string, string> = {}) {
  const marked = html.replace('<html lang="en"', language === 'en' ? '<html lang="en"' : `<html lang="${language}" data-locale="${language}"`);
  const placed = pointLinks(placeTexts(marked, translate, numbers), language);
  return placed.replace('</head>', `${headTags(placed, page, language)}</head>`);
}

/** Every address of the site worth finding. */
export function sitemap() {
  const urls = PAGES.flatMap((page) => LANGUAGES.map((language) => `  <url><loc>${pageUrl(page, language)}</loc></url>\n`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('')}</urlset>\n`;
}

/**
 * The rules of `_headers` that keep all but production out of the search results: the raw Pages
 * addresses always, and every page of a build from another branch, whose custom domain Cloudflare
 * leaves open. A build that does not know its branch stays open: a test stage found by a search
 * costs little, a production site hidden from it a lot.
 */
export function indexingRules(branch: string | undefined) {
  const hidden = ['https://:project.pages.dev/*', 'https://:version.:project.pages.dev/*', ...(branch && branch !== PRODUCTION_BRANCH ? ['/*'] : [])];
  return hidden.map((path) => `${path}\n  X-Robots-Tag: noindex\n`).join('');
}
