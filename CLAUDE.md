# SolarTournament – developer introduction

SolarTournament is a space shooter in the browser: three.js, TypeScript, Vite, hosted as a static site. Short rounds (5 minutes), ships fight each other in an asteroid field. Multiplayer runs peer-to-peer without a game server.

The original from 2012 (CopperLicht, Node.js, Socket.IO) lives on the branch `old-main-2013` (and its farewell page on `old-gh-pages-2013`). It only serves as a source of assets and ideas and is never changed.

**Language:** everything in this repository is English: code, comments, docs, commit messages. Johannes and Claude talk German with each other; that does not change the language of the repo.

## Guideline: a universe of its own

SolarTournament has a universe of its own. We take inspiration from popular series, but only adopt two game principles:

- **A: Realistic physics as in The Expanse.** Reason: it simply was an awesome series. Whatever flies, collides, burns and breaks behaves the way it would out there, as long as it is fun: Newtonian flight, no sound in vacuum, no shields, lasers punch through. Where we deliberately deviate for the fun of it (e.g. the exaggerated gravity of the asteroids), the README says so explicitly.
- **B: Consciousness transfer into clones as in Altered Carbon, with one deliberate deviation.** Clones, printed by 3D printers, fly the ships; when a clone dies, the next one takes over. That explains the respawn. Mind the perspective in every text: the clone in the cockpit is the **pilot** (it flies, fights, feels the g-forces and dies); the one at the other end of the link who receives all of it, pays for the next clone and remembers every death is the **Host**. The player is addressed as the Host, never as "player". In the docs, "host" means only that: the announcer of Radio 2584 is the announcer, and the browser running an online round is the lead browser. Unlike Altered Carbon, where a stored memory is loaded into a new body (two bodies, two memories; the death itself is not remembered unless it is uploaded), the player, called the **Host**, is bound to the clones by a **live link**. The clone acts on its own, because radio links lag and only a mind in the cockpit reacts fast enough; but the link's bandwidth streams everything the clone lives through back into the Host's memory as it happens. When the clone dies, the Host holds all its memories and pain, the death included, and has to cope with it. The memory persists from clone to clone, dying hurts, and the soul rots a little more each time. This follows the reprinted expendable of the film Mickey 17.

On top of that, a look:

- **C: Neon and glitch, inspired by cyberpunk.** The future is screwed, and this is what it looks like: neon lettering, flickering tubes, sponsors everywhere, a picture that breaks up with every hit. Stylistic elements of well-known cyberpunk games may resonate, but without overdoing it; we have a style of our own, slightly retro (80s, old-school techno). Neon is a must.

We do not adopt names, terms or characters from the series and games; we fill the world with our own ideas.

### Music

Radio 2584 follows the maintainer's taste, written down in the README section "Radio 2584" ("Musical direction"): early techno, Kraftwerk, Daft Punk, hard beats, underground feeling, now and then German words with a rolling R. New musical decisions go there.

### Colors

Sun orange `#ff9d00` (hue 37°) for everything you press and everything that hits; its complement azure blue (217°) for information: `#0062ff` exactly as neon glow, `#4d91ff` lightened as readable text. Neon is a tinted white tube with layered `text-shadow`s in shades of the color (`--neon-orange`, `--neon-blue` in `style.css`); flickering respects `prefers-reduced-motion`. Use neon deliberately: the "Tournament" of the logo, plate headings, the sponsor sign, the radio title.

## Mandatory: every game principle is documented

Everything we come up with for the game must be documented, so that we can understand the SolarTournament universe thoroughly later: physics, damage model, rules, points, story, world.

- **README.md** explains the universe and the game physics for players and developers, with the actual numbers.
- Every change to a game rule or constant updates the README in the same commit. README and code must never drift apart.
- New story elements (time, world, characters, background) go into the README section "The universe".
- Constants in the code carry a comment with unit and reasoning.

## Units

1 world unit = 5 cm. A ship is about 35 m long. Speeds in code in units/s, in the HUD in m/s (factor 0.05). 1 g = 196.2 units/s².

## Commands

```
npm install
npm run dev         # dev server on http://127.0.0.1:5173/
npm run typecheck
npm run build       # static site in dist/
```

Hosting is a classic Cloudflare Pages project (`wrangler.toml`), never Workers, built by Cloudflare from every push (Git integration): `main` is the test stage (https://test.solartournament.games), `stage_prod` is production (https://solartournament.games). Work happens on `main`. Only merge into `stage_prod` when Johannes asks for it.

Never use `npx`, always the scripts from `package.json`.

## Structure

The repository root is the Vite project: `index.html` (the game) and `radio.html` (Radio 2584) are its two pages, `public/` holds the static files, `tools/` the generators that write into `public/`.

`src/` is grouped by area:

| File | Content |
|---|---|
| `main.ts` | Startup of the game: WebGL check, load assets, create `Game` |
| `radio-page.ts` | Startup of the radio page: tune in a title, play it, download it as WAV |
| `style.css` | Styles of both pages |
| `assets.ts` | Loads the ship models and drive sprites, collects the assets generated in code |
| `random.ts` | Deterministic random generator |
| **`game/`** | **The round** |
| `game/game.ts` | Game states, round flow, lasers, collisions, arena, camera, the clone's body (g-forces, warnings) |
| `game/school.ts` | Flight school: steps with instruction, success condition and waypoint |
| `game/sponsors.ts` | Sponsor break before the respawn: `AdProvider` interface, placeholder ad |
| **`world/`** | **The arena** |
| `world/space.ts` | Stars, nebula, sun with shadows, space dust |
| `world/asteroids.ts` | Asteroid field: ellipsoid collision, raycast, line of sight, gravity, fragments |
| `world/rocks.ts` | Generates the 16 asteroid shapes: noise, craters, four kinds of rock; integer hashing and polynomials only, so every browser builds identical shapes |
| `world/wrecks.ts` | Wreckage of destroyed ships |
| **`ship/`** | **Ships and who flies them** |
| `ship/ship.ts` | Ship: hull, hit zones, holes with decompression, laser heat, drive animation |
| `ship/flight.ts` | Newtonian flight model with flight computer (rate control, `steer()`) |
| `ship/bots.ts` | Bot AI: desired velocity, turn and burn, aiming with spread |
| **`view/`** | **What the screen shows** |
| `view/hud.ts` | DOM HUD: gauges, markers, warnings, tunnel vision |
| `view/effects.ts` | Particles (one draw call per texture), laser beams |
| `view/glitch.ts` | Disturbed link to the clone: a shader imitating a corrupted JPEG stream (the look of the REVEALED inscriptions), plus the glitch of the DOM HUD |
| `view/textures.ts` | Canvas textures: glows, sparks, smoke |
| **`input/`** | **Controls** |
| `input/input.ts` | Keyboard, mouse flight (the ship turns towards the visible pointer, its offset from the center is the stick) and gamepad, merges all input into `Controls` |
| `input/touch.ts` | Touch controls with nipplejs: fixed stick left, dynamic stick right, hold buttons |
| **`sound/`** | **What the pilot hears besides the radio** |
| `sound/audio.ts` | Sound through the hull (low-pass), flight computer beeps, drive noise, link static |
| `sound/sounds.ts` | Synthesized sound effects: laser, explosion |
| `sound/speaker.ts` | The flight computer's voice: reads out what the screen shows, whole lines from the sprite |
| **`music/`** | **Radio 2584** |
| `music/songs.ts` | Hard techno tracks from a seed (flavor, form, energy curve, Grids-style patterns, fills); every decision is an integer hash of seed, bar and step |
| `music/band.ts` | The Tone.js instruments (kick with rumble, hats, clap, perc, bass, acid, stabs, hoover, riser), the voices, and how one sixteenth is played |
| `music/radio.ts` | Plays the song on the cue's clock (tournament: the lead browser's round clock), jumps when it drifts |
| `music/preview.ts` | Renders a track (or a stretch) offline as WAV: downloads on the radio page, previews in development |
| `music/lines.ts` | Everything the voices say: title words, the regime's propaganda (EN/DE), the announcer's lines, the flight computer's lines |
| `music/voice.ts` | Loads the pre-rendered voice sprite (once, shared) |
| **`net/`** | **Online tournament** |
| `net/online.ts` | Ship ownership, what goes over the network, the lead browser's bots |
| `net/session.ts` | Tournament protocol: message types, election of the lead browser (longest in the room), room codes |
| `net/transport.ts` | Transport: Trystero (WebRTC over Nostr relays) and BroadcastChannel for local tests (`?local=1`) |

`tools/crest/render.ts` (`npm run crest`) draws the seal of the Ministry of War into `public/crest.svg`: computed rings, stars and sun, Michroma lettering as paths, and the eagle of `tools/crest/eagle.svg` (CC0) cut into angular facets.

`tools/voice/render.ts` (`npm run voice`, needs ffmpeg) renders every word and every sentence of `src/music/lines.ts` with espeak-ng into `public/assets/voice/`. Run it after changing any line; the radio skips words that are not rendered.

## License

The code is licensed under AGPL-3.0-or-later (`LICENSE`), the repository is public. Name, logo and domains are not licensed. The only files in `public/assets/` are Johannes' own ship models with their drive sprites (not licensed), the font Michroma (OFL) and the rendered voice (`public/assets/voice/`, made by `npm run voice` with espeak-ng; the output of a GPL program is not covered by the GPL). Asteroids, sky, particles, sound effects and music are generated in code. New dependencies must be compatible with the AGPL. Third-party assets only enter the repo with a clarified license, named in the README; when in doubt, generate in code. Never commit keys, tokens or credentials. The menu links the source code, as the AGPL requires for a network game.

### Typography

Typography matters. Running text is always justified, never ragged, with hyphenation on (`hyphens: auto`, the pages declare `lang`). Centered blocks are justified too and only center their last line (`text-align-last: center`). Headings and signs in Michroma, text in the system sans-serif.

## Code rules

- **Determinism:** everything that concerns the shared world state (asteroid field, fragments, wreckage, the notes of Radio 2584) comes from seeded randomness (`Randomizer`), never from `Math.random()`. Otherwise peer-to-peer players see different worlds. `Math.random()` is only allowed for visuals (particles, flicker, glitches) and bot decisions.
- **Human and alien ship are identical**, only their looks differ (shared hit radius).
- **No sound from outside:** the player hears only what travels through the own hull, plus the flight computer's beeps, the radio and the link static in the headset.
- **Performance:** no objects created per frame in hot loops; reuse module-level scratch vectors.

## Testing in the browser

In dev mode the game hangs on the window as `window.game`. It lets you read and set state (Playwright, `browser_evaluate`):

- Start a round: `document.getElementById('start').click()`
- Simulate keys: `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`
- Freeze time for screenshots: `game.timeScale = 0`
- Disable bots: set the other ships to `alive = false` and `respawnAt = Infinity`
- Multiplayer: open two tabs with `?t=<code>&local=1` and click "Online tournament" in both (BroadcastChannel, no internet); without `local=1` the same test runs over Trystero and real Nostr relays
- Render music offline: `const { renderPreview } = await import('/src/music/preview.ts')`, then `renderPreview('Orbit Terror', 'round', undefined, fromSecond, seconds)` (the title is the seed; a flavor can be forced); returns a WAV file as base64 that can be saved and listened to
- Trigger a glitch: `game.glitch.trigger(1, 5)`; idle glitches in the menu make element screenshots fail, so stop them with `game.nextIdleGlitch = Infinity`

The test browser renders without a GPU; its frame rate says nothing about real hardware. Game feel and sound cannot be judged this way; Johannes tests those himself.
