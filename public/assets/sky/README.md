# public/assets/sky

The stars of the real sky of the arenas in the solar system (see `src/world/starmap.ts`, loaded by `src/assets.ts`), packed by `tools/sky/stars.ts` (`npm run sky`) from the Yale Bright Star Catalogue. The Milky Way behind them is generated in code (`src/world/milkyway.ts`), as are the stars fainter than the catalogue's limit; nothing of either lies here.

| File | What it is |
|---|---|
| `stars.bin` | The catalogue's 9,096 stars, the brightest first, 8 bytes each (see `src/world/starfile.ts`): right ascension and declination in the celestial frame (ICRF/J2000 equatorial; uint16 each), color (3 bytes, linear, the brightest channel 255), and brightness (a byte on a logarithmic scale). 73 KB. |

## Source and license

The Yale Bright Star Catalogue, 5th revised edition (preliminary version): D. Hoffleit and W. H. Warren Jr., "The Bright Star Catalogue, 5th Revised Ed. (Preliminary Version)", Astronomical Data Center, NSSDC/ADC, 1991 (catalogue V/50). Used as NASA's High Energy Astrophysics Science Archive Research Center (HEASARC) distributes it, as its table BSC5P ([description](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html)):

- `heasarc_bsc5p.tdat.gz` from https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz (913,895 bytes, SHA-256 `122628cde2d8bedf7e16ddf5f888167ac58c04b5592d6155408ce297f3073931`, fetched 2026-10-30; the tool fetches it into npm's cache and uses it only with this hash). Its header says `table_security = public`.

License: NASA's open data portal lists this very dataset, ["Bright Star Catalog"](https://data.nasa.gov/dataset/bright-star-catalog) ("The BSC5P database table contains data derived from the Bright Star Catalog, 5th Edition, preliminary", publisher "High Energy Astrophysics Science Archive Research Center", identifier `ivo://nasa.heasarc/bsc5p`), with `accessLevel` "public" and `license` "https://www.usa.gov/government-works": a work of the U.S. government, which U.S. copyright law does not protect (17 U.S.C. § 105), free to use, commercially too, without asking. As USAGov's page on government works says, government materials are never used so as to imply an agency's endorsement: the game's use implies none by NASA. Credit: Hoffleit and Warren (1991), Yale University Observatory and NASA's Astronomical Data Center; distributed by NASA's HEASARC.

## Changes

- Of each star only its place (J2000), its visual magnitude and its color index B−V are kept (for the 310 stars without B−V, the middle of its spectral class's main sequence); the 14 entries that are no stars (novae, clusters, galaxies kept for their numbers) are left out.
- The magnitude becomes the brightness the game draws: 1 at the sixth magnitude, about 1.7 times as bright for each magnitude brighter (`magnitudeFlux`).
- The color index becomes the color of a black body as hot as Ballesteros's formula (2012) says, seen through the CIE 1931 color matching functions in sRGB, a quarter paler (`starColor`).
