# public

Static files, copied as they are into the built site (the build leaves the folders' READMEs behind).

- `404.html`: the page for an address that does not exist; the build adds the redirect to our own domains.
- `crest.svg`: the seal of the Ministry of War, drawn by `tools/crest/` (`npm run crest`); icon, title pad, glow.
- `icon-180.png`, `icon-512.png`, `manifest.webmanifest`: the icons and the web app manifest, so a phone can start the game from its home screen without the browser's bars.
- `push-sw.js`: the service worker of the notification when a public tournament opens (see `src/net/push.ts`): shows a push's text and opens the list of tournaments when it is tapped; no cache, no fetch.
- `robots.txt`: lets search engines in and names the sitemap the build writes (`sitemap.xml`, see `tools/seo/`).
- `preview.jpg`: the picture of a link preview, 1200 × 630: the Event Horizon as the game draws it (top quality tier, HUD hidden), the game's name and a line over it.
- `shots/`: pictures of the game for the page `about.html`, 1280 × 720, taken the same way from the arenas drawn entirely in code, so they owe no map's credit.
- [`assets/`](assets/): ship models, drive sprites, the font, the planets' maps, and the rendered voice.
