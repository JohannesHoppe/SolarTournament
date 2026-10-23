# tools/crest

Draws the seal of the Ministry of War, the game's emblem, into `public/crest.svg`: run `npm run crest` after a change here and commit the new SVG.

- `render.ts`: computes the rings, the stars and the sun, sets the Michroma lettering as paths (with opentype.js), and cuts the eagle into angular facets.
- `eagle.svg`: the eagle it starts from (CC0).
- `opentype.d.ts`: the types of opentype.js that `render.ts` uses.

The seal is also the favicon, the title screen's pad and the glow behind the station pages.
