import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { defaultRelayUrls } from 'trystero';
import relayList from './src/net/relays.json' with { type: 'json' };

/** Sends visitors of the Cloudflare Pages addresses of production and test (the test stage's branch, and main, which Cloudflare built earlier and still serves) on to our own domains, keeping path and room code. */
const HOME_SCRIPT =
  "{ const home = { 'solartournament.pages.dev': 'solartournament.games', 'stage-test.solartournament.pages.dev': 'test.solartournament.games', 'main.solartournament.pages.dev': 'test.solartournament.games' }[location.hostname]; if (home) location.replace('https://' + home + location.pathname + location.search + location.hash); }";
const HOME_REDIRECT = `<script>${HOME_SCRIPT}</script>`;

/**
 * What the pages may load and run, sent by Cloudflare Pages with every page (dist/_headers,
 * written by the build): scripts and styles of the site itself (the one inline script by its
 * hash, and blob: for the audio worklets Tone.js writes for the radio), connections to the site and to the Nostr relays of the online tournament (by name: the
 * checked list in src/net/relays.json and Trystero's built-in list, its fallback; WebRTC itself,
 * STUN and TURN are not subject to it), no frames around the game. It keeps what the privacy
 * policy promises (nothing from third-party servers) even if a bug slipped someone else's
 * script into a page.
 */
const RELAY_SOURCES = [...new Set([...relayList.relays, ...defaultRelayUrls])].join(' ');
const SECURITY_HEADERS = [
  `Content-Security-Policy: default-src 'self'; script-src 'self' blob: 'sha256-${createHash('sha256').update(HOME_SCRIPT).digest('base64')}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${RELAY_SOURCES} data: blob:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`,
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
];
/** Cloudflare Pages takes no line of `_headers` longer than this (characters, with the indent). */
const HEADER_LINE_LIMIT = 2000;

/** The dev server and the browser tests run on this port (DEV_PORT moves both, so a second checkout can test beside the first). */
const DEV_PORT = Number(process.env.DEV_PORT ?? 5173);

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
    const lines = SECURITY_HEADERS.map((header) => `  ${header}`);
    const tooLong = lines.find((line) => line.length > HEADER_LINE_LIMIT);
    if (tooLong) throw new Error(`_headers: a line of ${tooLong.length} characters, Cloudflare Pages takes ${HEADER_LINE_LIMIT} at most: ${tooLong.slice(0, 60)}…`);
    writeFileSync(join(dist, '_headers'), `/*\n${lines.map((line) => `${line}\n`).join('')}`);
  },
};

export default defineConfig({
  base: './',
  // the browser tests expect the dev server on its port: taken, it stops rather than moving on
  // to another port where the tests would meet some other checkout's server
  // the worktrees of parallel work live inside this checkout (.claude/worktrees): their edits must
  // not reload this checkout's pages, which would cut a browser test or a balance run short
  // (the checkout's own .claude/ only, so a dev server started inside a worktree still watches its files)
  server: { host: '127.0.0.1', port: DEV_PORT, strictPort: true, watch: { ignored: [join(resolve(import.meta.dirname), '.claude', '**')] } },
  plugins: [pageShell],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(['index', 'radio', 'handbook', 'impressum', 'datenschutz'].map((page) => [page, resolve(import.meta.dirname, `${page}.html`)])),
    },
  },
});
