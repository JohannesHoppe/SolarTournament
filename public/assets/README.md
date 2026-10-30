# public/assets

The few files the game loads that are not generated in code. Asteroids, the Milky Way, particles, sound effects and music are all generated in code; only these come from files.

- [`models/`](models/): Johannes' own interceptor models (not licensed).
- [`textures/`](textures/): their drive flames.
- [`fonts/`](fonts/): Michroma, the display font (OFL).
- [`sounds/`](sounds/): the crowd's roar, a CC0 recording.
- [`planets/`](planets/): the maps of Saturn (and its ring) and of the gas giant (Jupiter), from Solar System Scope (CC BY 4.0) and NASA (JPL Image Use Policy).
- [`sky/`](sky/): the stars of the real sky of the arenas in the solar system, packed by `npm run sky` from the Yale Bright Star Catalogue (as NASA's HEASARC distributes it, a U.S. government work); the Milky Way is generated in code.
- `voice/`: the rendered voices, made by `npm run voice` at build time and never committed (see `tools/voice/`).
