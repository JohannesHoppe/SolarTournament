# tools/sky

`stars.ts` packs the stars of the real sky of the arenas in the solar system into `public/assets/sky/stars.bin` from the Yale Bright Star Catalogue, 5th revised edition, as NASA's HEASARC distributes it (source, license and what is kept: `public/assets/sky/README.md`). The Milky Way and the stars fainter than the catalogue are generated in code by the game itself (`src/world/milkyway.ts`); nothing here makes them.

Run it with `npm run sky`, once, when the way the stars are packed changes; `stars.bin` is committed (73 KB), so neither the build nor a developer needs it otherwise. It fetches the catalogue (0.9 MB, gzipped) from HEASARC's archive into `_solartournament/sky/` in npm's cache directory (`SKY_SOURCES` moves it) and uses it only if its SHA-256 is the one pinned in the tool; it takes a second.

The star file's layout, how a magnitude becomes a brightness and a color index a color are in `src/world/starfile.ts`, shared with the game, so the file is made with the very functions that read it back; `src/world/starmap.test.ts` checks the shipped file.
