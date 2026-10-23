import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** Sends visitors of the Cloudflare Pages addresses of production and test on to our own domains, keeping path and room code. */
const HOME_REDIRECT =
  "<script>{ const home = { 'solartournament.pages.dev': 'solartournament.games', 'main.solartournament.pages.dev': 'test.solartournament.games' }[location.hostname]; if (home) location.replace('https://' + home + location.pathname + location.search + location.hash); }</script>";

/** Writes `added` into a page right after (or before) `marker`, which has to stand there exactly once. */
function insert(html: string, page: string, marker: string, added: string, before = false) {
  const parts = html.split(marker);
  if (parts.length !== 2) throw new Error(`${page}: expected "${marker}" once, found it ${parts.length - 1} times`);
  return parts[0] + (before ? added + marker : marker + added) + parts[1];
}

const redirect = (html: string, page: string) => insert(html, page, '<meta charset="utf-8">', `\n  ${HOME_REDIRECT}`);

/**
 * What the pages share, written once here and filled into each page before Vite processes it:
 * - first in the head, the redirect to our own domains (also into the static 404 page, which
 *   Vite only copies);
 * - at the end of the head, icon and stylesheet;
 * - on the pages of the station look (`<body class="page">`), the seal glowing behind the page;
 * - on the legal pages (`<main class="station legal">`), the seal leading home and the eyebrow.
 */
let building = false;
const pageShell: Plugin = {
  name: 'page-shell',
  configResolved(config) {
    building = config.command === 'build';
  },
  transformIndexHtml: {
    order: 'pre',
    handler(html, { filename }) {
      let page = redirect(html, filename);
      page = insert(page, filename, '</head>', '  <link rel="icon" href="crest.svg" type="image/svg+xml">\n  <link rel="stylesheet" href="/src/style.css">\n', true);
      if (page.includes('<body class="page">')) page = insert(page, filename, '<body class="page">', '\n  <div class="crest" aria-hidden="true"></div>');
      if (page.includes('<main class="station legal">')) {
        page = insert(
          page,
          filename,
          '<main class="station legal">',
          '\n    <a href="./" class="legal-home"><img class="logo" src="crest.svg" alt="SolarTournament" width="88" height="88"></a>\n    <p class="legal-eyebrow">Rechtliches</p>',
        );
      }
      return page;
    },
  },
  closeBundle() {
    if (!building) return;
    const notFound = resolve(import.meta.dirname, 'dist/404.html');
    writeFileSync(notFound, redirect(readFileSync(notFound, 'utf8'), '404.html'));
    // the folders' READMEs explain the repository, not the site: Vite copies public/ whole, they stay behind
    const dist = resolve(import.meta.dirname, 'dist');
    for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' })) if (basename(file) === 'README.md') rmSync(join(dist, file));
  },
};

export default defineConfig({
  base: './',
  // the browser tests expect the dev server on 5173: taken, it stops rather than moving on to
  // another port where the tests would meet some other checkout's server
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [pageShell],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(['index', 'radio', 'impressum', 'datenschutz'].map((page) => [page, resolve(import.meta.dirname, `${page}.html`)])),
    },
  },
});
