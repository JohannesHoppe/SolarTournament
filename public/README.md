# public

Static files, copied as they are into the built site (the build leaves the folders' READMEs behind).

- `404.html`: the page for an address that does not exist; the build adds the redirect to our own domains.
- `crest.svg`: the seal of the Ministry of War, drawn by `tools/crest/` (`npm run crest`); icon, title pad, glow.
- `icon-180.png`, `icon-512.png`, `manifest.webmanifest`: the icons and the web app manifest, so a phone can start the game from its home screen without the browser's bars.
- [`assets/`](assets/): ship models, drive sprites, the font, the planets' maps, and the rendered voice.
