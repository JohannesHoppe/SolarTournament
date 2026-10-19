# SolarTournament – developer introduction

SolarTournament is a space shooter in the browser: three.js, TypeScript, Vite, hosted as a static site. Short rounds (5 minutes), ships fight each other in an asteroid field. Multiplayer runs peer-to-peer without a game server.

The code in the parent directory (`../`) is the original from 2012 (CopperLicht, Node.js, Socket.IO). It only serves as a source of assets and ideas and is never changed.

**Language:** everything in this repository is English: code, comments, docs, commit messages. Johannes and Claude talk German with each other; that does not change the language of the repo.

## Guideline: a universe of its own

SolarTournament has a universe of its own. We take inspiration from popular series, but only adopt two game principles:

- **A: Realistic physics as in The Expanse.** Reason: it simply was an awesome series. Whatever flies, collides, burns and breaks behaves the way it would out there, as long as it is fun: Newtonian flight, no sound in vacuum, no shields, lasers punch through. Where we deliberately deviate for the fun of it (e.g. the exaggerated gravity of the asteroids), the README says so explicitly.
- **B: Consciousness transfer into clones as in Altered Carbon, with one deliberate deviation.** The pilots have transferred their consciousness into cloned human bodies, printed by 3D printers. When a clone dies, the pilot wakes up in the next one. That explains the respawn. Unlike Altered Carbon, where a stored memory is loaded into a new body (two bodies, two memories; the death itself is not remembered unless it is uploaded), our pilots live over a **live link**: there is only ever one consciousness, the memory persists from clone to clone, and the pilot experiences every death. Dying hurts. This follows the reprinted expendable of the film Mickey 17.

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
npm run deploy      # builds and publishes to Cloudflare Pages (project "solartournament")
```

Hosting is Cloudflare Pages (`wrangler.toml`). Only publish when Johannes asks for it.

Never use `npx`, always the scripts from `package.json`.

## Structure (`src/`)

| File | Content |
|---|---|
| `main.ts` | Startup: WebGL check, load assets, create `Game` |
| `radio-page.ts` | The radio page (`radio.html`, a second Vite entry): tune in a title, play it, download it as WAV |
| `assets.ts` | Loads the ship models and drive sprites, collects the assets generated in code |
| `rocks.ts` | Generates the 16 asteroid shapes: noise, craters, four kinds of rock; integer hashing and polynomials only, so every browser builds identical shapes |
| `textures.ts` | Canvas textures: glows, sparks, smoke |
| `sounds.ts` | Synthesized sound effects: laser, explosion |
| `glitch.ts` | Disturbed link to the clone: a shader imitating a corrupted JPEG stream (the look of the REVEALED inscriptions), plus the glitch of the DOM HUD |
| `music/songs.ts` | Radio 2584: hard techno tracks from a seed (flavor, form, energy curve, Grids-style patterns, fills); every decision is an integer hash of seed, bar and step |
| `music/band.ts` | The Tone.js instruments (kick with rumble, hats, clap, perc, bass, acid, stabs, hoover, riser) and how one sixteenth is played |
| `music/radio.ts` | Plays the song on the cue's clock (tournament: the host's round clock), jumps when it drifts |
| `music/preview.ts` | Renders a track (or a stretch) offline as WAV: downloads on the radio page, previews in development |
| `music/lines.ts` | Everything the voices say: title words, the regime's propaganda (EN/DE), the radio host's lines |
| `music/voice.ts` | Loads the pre-rendered voice sprite (once, shared) |
| `speaker.ts` | The flight computer's voice: reads out what the screen shows, whole lines from the sprite |

`tools/voice/render.ts` (`npm run voice`, needs ffmpeg) renders every word of `music/lines.ts` with espeak-ng into `public/assets/voice/`. Run it after changing any line; the radio skips words that are not rendered.
| `game.ts` | Game states, round flow, lasers, collisions, arena, camera, pilot (g-forces, warnings) |
| `flight.ts` | Newtonian flight model with flight computer (rate control, `steer()`) |
| `ship.ts` | Ship: hull, hit zones, holes with decompression, laser heat, drive animation |
| `asteroids.ts` | Asteroid field: ellipsoid collision, raycast, line of sight, gravity, fragments |
| `wrecks.ts` | Wreckage of destroyed ships |
| `bots.ts` | Bot AI: desired velocity, turn and burn, aiming with spread |
| `effects.ts` | Particles (one draw call per texture), laser beams |
| `space.ts` | Stars, nebula, sun with shadows, space dust |
| `hud.ts` | DOM HUD: gauges, markers, warnings, tunnel vision |
| `audio.ts` | Sound through the hull (low-pass), flight computer beeps, drive noise, link static |
| `online.ts` | Online tournament: ship ownership, what goes over the network, the host's bots |
| `net/session.ts` | Tournament protocol: message types, host election (longest in the room), room codes |
| `net/transport.ts` | Transport: Trystero (WebRTC over Nostr relays) and BroadcastChannel for local tests (`?local=1`) |
| `school.ts` | Flight school: steps with instruction, success condition and waypoint |
| `sponsors.ts` | Sponsor break before the respawn: `AdProvider` interface, placeholder ad |
| `input.ts` | Keyboard, mouse (pointer lock as virtual stick) and gamepad, merges all input into `Controls` |
| `touch.ts` | Touch controls with nipplejs: fixed stick left, dynamic stick right, hold buttons |
| `random.ts` | Deterministic random generator |

`tools/extract-ccb/` loads the old CopperCube scene with the original engine and writes the two ships as glTF models to `public/assets/models/`. Usage: `npm run dev`, then open `http://127.0.0.1:5173/tools/extract-ccb/`. It only runs when opened by hand.

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
