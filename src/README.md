# src

The game itself: everything the browser runs. Vite serves it in development (`npm run dev`) and bundles it into `dist/` (`npm run build`). The pages in the repository's root (`index.html`, `radio.html`, the legal pages) load it.

The code is grouped by area, each folder with a README of its own:

| Folder | What it holds |
|---|---|
| [`game/`](game/) | The round: its flow, the modes, scoring, weapons and items, the flight school, Nicole's coaching |
| [`world/`](world/) | The arena: space, the asteroid field and everything that collides in it |
| [`ship/`](ship/) | The ships, how they fly and crash, and the bots that fly them |
| [`view/`](view/) | What the screen shows on top of the 3D scene: HUD, radar, effects, kill cam |
| [`input/`](input/) | Keyboard, mouse, gamepad and touch, merged into one set of controls |
| [`sound/`](sound/) | What the pilot hears besides the radio, and Nicole's voice |
| [`music/`](music/) | Radio 2584: the generated techno and everything the voices say |
| [`net/`](net/) | The online tournament: peer-to-peer messages, the lead browser, cheat checks |
| [`i18n/`](i18n/) | The four languages and their catalogs |
| [`test/`](test/) | Helpers shared by the unit tests |

The files at this level:

- `main.ts`: starts the game page (WebGL check, assets, the `Game`), and the benchmark or the frame meter when the address asks for them.
- `bench.ts`: the benchmark (`?bench`, `?bench=<seconds>`): plays a fixed scene and measures what each feature, each rung of the quality ladder, each arena and each mode costs per frame, with a table on screen, in the console and as JSON; the frame meter (`?fps`) with the frame rate and the rung the governor is on. See the README's section "Performance".
- `radio-page.ts`: starts the radio page (tune in a title, play it, download it as WAV).
- `assets.ts`: loads the ship models and drive sprites, collects what is generated in code.
- `random.ts`: the seeded random generator every browser shares, so all see the same world.
- `storage.ts`: the browser's localStorage, safe where it is unavailable.
- `devlog.ts`: the development log, a ring buffer of the round's deaths, ship contacts, shoves and bot decisions, read in the console as `game.log`; only in development, null and free in production.
- `style.css`: the styles of all pages.

Unit tests sit next to the code they test (`*.test.ts`) and run with `npm test`.
