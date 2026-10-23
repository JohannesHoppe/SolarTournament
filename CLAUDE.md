# SolarTournament – developer introduction

SolarTournament is a space shooter in the browser: three.js, TypeScript, Vite, hosted as a static site. Short rounds (5 minutes), ships fight each other in an asteroid field. Multiplayer runs peer-to-peer without a game server.

The original from 2012 (CopperLicht, Node.js, Socket.IO) lives on the branch `old-main-2013` (and its farewell page on `old-gh-pages-2013`). It only serves as a source of assets and ideas and is never changed.

**Language:** everything in this repository is English: code, comments, docs, commit messages. Johannes and Claude talk German with each other; that does not change the language of the repo.

**The game in four languages:** English, German, Spanish, French (see `src/i18n/i18n.ts`). Every text the player sees is written in English where it is used and wrapped in `t('…')` (placeholders in braces, `t('Gate {n} of {total}', { n, total })`; whole phrases, never fragments put together); a text kept in a table and shown elsewhere is marked with `msg('…')` and shown through `t(value)`; a fixed text of a page carries `data-i18n` (attributes `data-i18n-attr`). The flight computer's and the announcer's lines in `src/music/lines.ts` are translated where they are spoken. Each new or changed text gets its translation in `src/i18n/de.ts`, `es.ts` and `fr.ts` in the same commit (keyed by the exact English text; `npm run i18n -- de` lists what is missing); the unit tests fail on a missing, stale or broken entry. Translations follow the catalogs' glossaries and voices (the Host addressed as du/tú/tu; the President's bombast, the announcer's cynicism, Nicole's flirt); larger batches go to translators briefed on the universe.

**No foreign projects as references:** files and commit messages never name another project that served as a model or inspiration (for a license, a workflow, a pattern). Only what the repo actually uses is named: dependencies, assets and their licenses.

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
npm run dupes       # duplicated code (jscpd) and duplicated style rules (tools/dupes/css.ts)
npm test            # unit tests of the deterministic core (Vitest, in Node, under a second)
npm run e2e         # browser tests (Playwright: solo start, two tabs online); first once: npm run e2e:install
npm run balance     # balance runs (Playwright, about ten minutes): every mode played out by bots in time-lapse
npm run build       # static site in dist/ (renders the voice, checks types, duplicates and unit tests first)
```

**Tests.** The unit tests (`src/**/*.test.ts`, helpers in `src/test/`) cover what every browser must compute alike and what guards the game: songs (same title, same notes, a jump lands on the same step, every note on the scale), the arena of a round, the field (same layout, snapshot and restore, orbits, a rock colliding where it is seen, box and well collision), the race course and its gates, the modes of a room, the clones and the flare of Last Clone Standing, the sides, bases and cores of Capture the Flag, the President's battleship (its parts, phases, plume, the cover of its hull, torpedo hits and sinking), the lap timer and its ghost, the hook's cable, probes, wreckage, the checks of messages from other browsers, room links, Nicole's coaching (each tip only so often). **Plausibility:** what a Host is asked to fly, a bot of middling skill (0.5) must manage; `src/game/courses.test.ts` flies it with the game's flight model, gravity, coils and rock collisions (`src/test/pilot.ts`): a lap of every arena's race course along its ideal line without being lost, and the flight school's ring and coil drills from the arena's middle and from its edge, inside the arena (every coil through its core). A new course, drill or arena gets such a test. The modes get theirs in the balance runs (`e2e/balance.spec.ts`, `npm run balance`, not part of `npm run e2e`): every mode of a solo round, twice, played out by the default rivals in time-lapse with the Host's ship taken out; the middling bot (Kessler) scores at least the median (in a race, where every bot flies the line alike, it finishes) and dies at most about once a minute and a half, a deathmatch sees six kills, Capture the Flag a capture, and the bots sink the battleship. Run them after every change to bots, weapons, damage or a mode's rules. Every change to these rules adds or updates a test; `npm run build` fails on a red one. The browser tests (`e2e/`, against the dev server) start a solo round of every mode and each course of the flight school without errors, buy an upgrade in the hangar and keep it, and let two tabs of one tournament see the same arena, round, rocks and ships, a torpedo of one hit the other, agree on the sides and cores of Capture the Flag, and see one battleship and count the same hits on it, a laser's and a torpedo's. Run them before pushing changes to the network or the round flow. How the game feels and sounds is tested by playing.

Hosting is a classic Cloudflare Pages project (`wrangler.toml`), never Workers, built by Cloudflare from every push (Git integration). Its one piece of server code is a Pages Function of the same project, `functions/turn.ts` (`GET /turn`): it hands out short-lived TURN credentials and keeps the TURN key on the server; the key comes from the Pages project's environment variables `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` (secret), set by Johannes in the Cloudflare dashboard for production and preview. Cloudflare has no spending cap for TURN, so the function keeps its own monthly budget (`MONTHLY_BUDGET_GB`): it reads the month's relay traffic through the GraphQL analytics with `CLOUDFLARE_ACCOUNT_ID` (a plain variable in `wrangler.toml`: with that file, Pages takes plain variables only from it, secrets still from the dashboard) and `TURN_ANALYTICS_TOKEN` (secret, Account Analytics Read) and hands out nothing when the budget is spent or the traffic cannot be read. Branches: `main` is the test stage (https://test.solartournament.games), `stage_prod` is production (https://solartournament.games). Every page sends visitors of the raw Pages addresses (`solartournament.pages.dev`, `main.solartournament.pages.dev`) on to these domains with a small inline script, keeping path and room code; the plugin `pageShell` in `vite.config.ts` writes it into every page (also into the static `public/404.html` in `dist/`), together with what else the pages share (icon, stylesheet, the seal behind the station pages, the head of the legal pages). Work happens on `main`. As long as the game has no real players yet, every push goes to both branches at once (`git push origin main main:stage_prod`); once it has players, `stage_prod` only moves when Johannes asks for it.

Never use `npx`, always the scripts from `package.json`.

## Structure

The repository root is the Vite project: `index.html` (the game), `radio.html` (Radio 2584), `impressum.html` and `datenschutz.html` (German legal pages, linked from the menu and the radio page) are its pages, `public/` holds the static files, `tools/` the generators that write into `public/`.

**The privacy policy follows the code.** `datenschutz.html` lists every data flow of the game: Cloudflare hosting, the eleven localStorage entries, the online tournament and its lobby (WebRTC between players, public Nostr relays, Cloudflare's STUN server and TURN relay, public tournament names, the cheat reports between the browsers), the satire ads (no ad network), e-mail contact. Any change that adds a data flow (a new storage key, an external request, an ad network, analytics, another TURN or STUN server) updates the privacy policy in the same commit. Nothing is loaded from third-party servers at runtime.

`src/` is grouped by area:

| File | Content |
|---|---|
| `main.ts` | Startup of the game: WebGL check, load assets, create `Game` |
| `radio-page.ts` | Startup of the radio page: tune in a title, play it, jump in it, download it as WAV |
| `style.css` | Styles of both pages |
| `assets.ts` | Loads the ship models and drive sprites, collects the assets generated in code |
| `random.ts` | Deterministic random generator |
| `storage.ts` | The browser's localStorage, where it is available |
| `i18n/` | The languages: `i18n.ts` (t(), msg(), the language chosen, the page's fixed texts) and the catalogs `de.ts`, `es.ts`, `fr.ts`; `tools/i18n/` collects every text to translate |
| **`game/`** | **The round** |
| `game/game.ts` | Game states, round flow, lasers, collisions, arena, camera, the clone's body (g-forces, warnings) |
| `game/race.ts` | The race: modes of rounds and rooms, the course of gates (laid out from the arena's field), points for gates and places |
| `game/survival.ts` | Last Clone Standing: the clones of a round, the solar flare closing in on the field time |
| `game/flags.ts` | Capture the Flag: the two sides, their bases and sponsor cores; the lead browser's rules (sides, taking, sending home, capturing) and the state the others follow |
| `game/fleet.ts` | The President's Fleet: his battleship (hull, batteries, drives, reactor, built in code), its phases, how the lead browser flies it, its plume, its hull as cover, how it takes hits (lasers and torpedoes) and goes down, and the state the others follow |
| `game/hook.ts` | The hook: harpoon, cable and winch; what it bites, how the cable pulls and swings, its lines on screen |
| `game/racingline.ts` | The ideal line of a course: a smooth curve through the centers of the gates (or the flight school's rings), bowing around rock as it lies now; where a racer is on it and what it flies for |
| `game/hangar.ts` | The hangar: Solar Coins paid out for a round's points, the upgrades of both interceptors and their prices, what they do (online up to a cap), the Sovereign earned by both complete; what the browser keeps of it |
| `game/laps.ts` | The own laps in a race: lap clock, splits against the arena's best lap, the best lap and its ghost as the browser keeps them |
| `game/items.ts` | Items: sponsor probes that show up on the round clock (the same on every browser), what they carry and what each does in a few words, dropped again when a clone dies; the nova core goes off in `Game.novaBlast` |
| `game/torpedoes.ts` | Torpedoes: launch, homing, fuse, shot down by the laser; only the shooter's browser decides where one goes off |
| `game/school.ts` | Flight school: five courses played on their own (basic training, racer, gladiator, arsenal, tactician), 47 drills, one maneuver each, with spoken line, keys, markers in space (buoys, rings, debris), success and failure conditions, repetitions and praise |
| `game/coach.ts` | Nicole as a coach in real rounds: the briefing of a mode in a Host's first round of it, the tips of the fight the moment they matter, each only a few times; what the browser has heard |
| `game/sponsors.ts` | Sponsor break before the respawn: `AdProvider` interface, how the clone died, the round so far |
| `game/satire-ads.ts` | The invented sponsors of 2584 (Victory Cola, Space Burger, PrintMe Bodies, …): consumer satire in the ad slot until real sponsors take it |
| **`world/`** | **The arena** |
| `world/space.ts` | Stars, nebula, sun with shadows, space dust |
| `world/arena.ts` | The arena edge (`ARENA_LIMIT`, `ARENA_GRACE`) and its grid, also as the shell of a solar flare |
| `world/belt.ts` | The asteroid belt beyond the arena: instanced low-detail rocks as scenery |
| `world/arenas.ts` | The seven arenas (belt, rings, Kessler field, gas giant, corona, event horizon, derelict): field layout, well, sun, cooling, storms; which arena a tournament round is in |
| `world/asteroids.ts` | The field of an arena: rocks, ice, debris or hull from a layout, orbits, solid pieces, a massive body (well); collision with a rock's measured surface, a debris ellipsoid or a hull box, raycast, line of sight, gravity, fragments |
| `world/boxes.ts` | Boxes in their own frame: a sphere against a box, a ray into a box (the hull of a wreck, a battleship) |
| `world/surface.ts` | A rock's surface as its collisions see it: measured from its mesh, how far it reaches in every direction |
| `world/shapes.ts` | The field shapes besides rock: ice, station debris, the world ship's hull sections (with computed collider boxes) |
| `world/landmarks.ts` | The arenas' scenery: ringed planet, the world below the Kessler field, gas giant, the sun up close, black hole and its disk, the derelict's neon |
| `world/rocks.ts` | Generates the 16 asteroid shapes: noise, craters, four kinds of rock; integer hashing and polynomials only, so every browser builds identical shapes |
| `world/wrecks.ts` | Wreckage of destroyed ships |
| **`ship/`** | **Ships and who flies them** |
| `ship/models.ts` | The interceptors' hulls, low poly in code; collider, drive flame and glows come from the model files |
| `ship/ship.ts` | Ship: hull, hit zones, holes with decompression, laser heat, drive animation |
| `ship/flight.ts` | Newtonian flight model with flight computer (rate control, `steer()`) |
| `ship/impact.ts` | A ship striking a surface: how it bounces off and scrapes along, and what the impact costs its hull |
| `ship/bots.ts` | Bot AI: desired velocity, turn and burn, dogfights in arcs, aiming with spread, a hand that eases every command in; every bot's skills (aim, reflexes, daring) |
| **`view/`** | **What the screen shows** |
| `view/hud.ts` | DOM HUD: gauges, markers, warnings, tunnel vision |
| `view/effects.ts` | Particles (one draw call per texture), laser beams |
| `view/killcam.ts` | The kill cam: keeps the last seconds of every ship and beam, replays the kill of the own clone in slow motion from behind the shooter |
| `view/radar.ts` | The radar sphere: everything within 2.5 km around the own ship, ahead and behind, on a canvas |
| `view/lensing.ts` | The black hole's gravitational lens over the rendered picture |
| `view/glitch.ts` | Disturbed link to the clone: a shader imitating a corrupted JPEG stream (the look of the REVEALED inscriptions), plus the glitch of the DOM HUD |
| `view/guide.ts` | The racing line: dots on the ideal line every 20 m, fixed in space, joined from the own ship's flight, with pulses |
| `view/showcase.ts` | The title screen's pad: the seal as a coin seen from above at a slant, the chosen ship hovering and circling above it in its upgrades' looks, a ship not earned as a silhouette; a view of its own behind the plates |
| `view/ghost.ts` | The ghost of the own best lap: the own hull as a faint blue hologram |
| `view/datamosh.ts` | The clone's death: its last picture loses the key frames and rots with the camera's motion and the frames' changes (a pass with its own feedback buffers) |
| `view/textures.ts` | Canvas textures: glows, sparks, smoke |
| `view/marks.ts` | The marks before names: bot or Host, drawn as shapes, never as characters |
| **`input/`** | **Controls** |
| `input/input.ts` | Keyboard, mouse flight (the ship turns towards the visible pointer, its offset from the center is the stick) and gamepad, merges all input into `Controls` |
| `input/touch.ts` | Touch controls with nipplejs: fixed stick left, dynamic stick right, hold buttons |
| **`sound/`** | **What the pilot hears besides the radio** |
| `sound/audio.ts` | Sound through the hull (low-pass), flight computer beeps, drive noise, link static |
| `sound/sounds.ts` | Synthesized sound effects: laser, explosion |
| `sound/speaker.ts` | Nicole, the flight computer's voice: reads out what the screen shows, whole lines from the sprite |
| **`music/`** | **Radio 2584** |
| `music/songs.ts` | Hard techno tracks from a seed (flavor, form, energy curve, weighted step patterns, fills); every decision is an integer hash of seed, bar and step |
| `music/band.ts` | The Tone.js instruments (kick with rumble, hats, clap, perc, bass, acid, stabs, hoover, riser), the voices, and how one sixteenth is played |
| `music/radio.ts` | Plays the song on the cue's clock (tournament: the lead browser's round clock), jumps when it drifts |
| `music/preview.ts` | Renders a track (or a stretch) offline as WAV: downloads on the radio page, previews in development |
| `music/lines.ts` | Everything the voices say: title words, the regime's propaganda (EN/DE), the announcer's lines, the flight computer's lines |
| `music/transmission.ts` | The on-screen transmission: whatever the radio says, in neon, while it is spoken (game and radio page) |
| `music/voice.ts` | Loads the pre-rendered voices for the Host's language: the radio's sprite and the language's, joined (once, shared) |
| **`net/`** | **Online tournament** |
| `net/online.ts` | Ship ownership, what goes over the network, the lead browser's bots (a new lead adopts them) |
| `net/session.ts` | Tournament protocol: message types, sender checks and rate limits, election of the lead browser (longest in the room and still sending), starting over after a lost link |
| `net/room.ts` | A tournament room as its link describes it: code, name, public or private, bots or not, deathmatch, race or both |
| `net/lobby.ts` | The lobby: public tournaments announce themselves, the list of tournaments listens |
| `net/validate.ts` | Checks every message from other browsers before the game uses it |
| `net/plausible.ts` | Rough plausibility of what other browsers report (jumps, novas without a core, torpedoes, kills) and the accusations: a peer a majority of the other Hosts who fly (at least two; watching Hosts have no vote) catch is named a cheater and cast out |
| `net/transport.ts` | Transport: Trystero (WebRTC over Nostr relays, STUN and the TURN relay from `/turn`) and BroadcastChannel for local tests (`?local=1`) |

`tools/crest/render.ts` (`npm run crest`) draws the seal of the Ministry of War into `public/crest.svg`: computed rings, stars and sun, Michroma lettering as paths, and the eagle of `tools/crest/eagle.svg` (CC0) cut into angular facets.

`tools/voice/render.ts` (`npm run voice`) renders into `public/assets/voice/` a sprite for the radio (every word and every sentence of the regime's lines in `src/music/lines.ts` with espeak-ng, English and German) and one for each language of the game (the announcer with espeak-ng in that language, and the flight computer's lines, Nicole: English with Kokoro, the other languages as her clone), translated through the catalogs. **Nicole's clone** (the whole pipeline in `tools/voice/README.md`): Chatterbox Multilingual V3 clones her from an English reference, line by line, checked by Whisper; `tools/voice/nicole.ts` pins what she is made of (Kokoro voice, reference, Chatterbox commit, model revision and the settings chosen by ear), `tools/voice/clone/` holds the tools, and the workflow `.github/workflows/voice.yml` clones whatever lines are missing and keeps them as assets of the release `voice-nicole` (never in the history); the build downloads them, and a line not cloned yet falls back to Kokoro reading espeak-ng's phonemes. The sprites are generated, not versioned (`.gitignore`): `npm run build` and `npm run dev` make them first, and only render them when the spoken lines or their translations, Nicole's clones, the tool (with the pinned Kokoro revision) or the engines' versions (kokoro-js, phonemizer, transformers, onnxruntime, espeak-ng, ffmpeg-static) changed. ffmpeg comes from the ffmpeg-static package. Sprites (keyed by a hash of their inputs), the clones and Kokoro model (one folder per revision, used only once a download has completed) are kept in `_solartournament/` inside npm's cache directory (`~/.npm` by default): Cloudflare Pages keeps that directory between builds and no other, so a fresh checkout whose inputs did not change copies the sprite instead of rendering it (`VOICE_CACHE` moves the cache; where it cannot be written, the voice is rendered all the same). Never commit the sprite: generated binaries bloat the repository's history for good.

## License

The code is licensed under AGPL-3.0-or-later (`LICENSE`), the repository is public. Name, logo and domains are not licensed. Johannes keeps the right to relicense the code (commercially too): every other contributor signs the Contributor License Agreement in `CONTRIBUTING.md` with a file `contributors/<login>.txt`, and the workflow `.github/workflows/cla.yml` checks every pull request for it (labels `cla: missing` / `cla: signed`, one comment per change of state, a failing check while a signature is missing; it never runs the pull request's code). Merge a pull request only with `cla: signed`. Code from outside (a snippet, a file from another project) only enters under a license that allows relicensing, or not at all. The only files in `public/assets/` are Johannes' own ship models with their drive sprites (not licensed; the game takes their colliders, drive flames and glows, the hulls are built in code in `ship/models.ts`), the font Michroma (OFL) and, generated at build time and not versioned, the rendered voice (`public/assets/voice/`, made by `npm run voice` with espeak-ng, Kokoro and Nicole's clones from Chatterbox; the output of a GPL program is not covered by the GPL). Asteroids, sky, particles, sound effects and music are generated in code. New dependencies must be compatible with the AGPL. Third-party assets only enter the repo with a clarified license, named in the README; when in doubt, generate in code. Never commit keys, tokens or credentials. The menu links the source code, as the AGPL requires for a network game.

### Typography

Typography matters. Running text is always justified, never ragged, with hyphenation on (`hyphens: auto`, the pages declare `lang`). Centered blocks are justified too and only center their last line (`text-align-last: center`). Headings and signs in Michroma, text in the system sans-serif.

## Code rules

- **Determinism:** everything that concerns the shared world state (the arena of a round, its field, fragments, wreckage, the notes of Radio 2584) comes from seeded randomness (`Randomizer`), never from `Math.random()`. Otherwise peer-to-peer players see different worlds. `Math.random()` is only allowed for visuals (particles, flicker, glitches) and bot decisions.
- **Human and alien ship are identical**, only their looks differ (shared hit radius); so is the Sovereign. Upgrades bought in the hangar change a ship for its own Host only, both interceptors alike, and online only up to their cap (see `game/hangar.ts`).
- **No sound from outside:** the player hears only what travels through the own hull, plus the flight computer's beeps, the radio and the link static in the headset.
- **Performance:** no objects created per frame in hot loops; reuse module-level scratch vectors.
- **Write nothing twice.** Code, markup and styles exist once: a repeated stretch becomes a function, a constant, a selector list or part of the page shell (`vite.config.ts`). `npm run dupes` checks it: jscpd (`.jscpd.json`: `src`, `tools`, `e2e`, `functions`, the four pages, `public/404.html` and `vite.config.ts`, from 5 lines and 50 tokens, threshold 0, files of any length) and `tools/dupes/css.ts`, which finds style rules with the same set of at least three declarations under different selectors. Run it regularly and at the latest before every commit; `npm run build` fails on a duplicate, so Cloudflare does not deploy one. A repetition that is technically unavoidable is marked with `jscpd:ignore-start` / `jscpd:ignore-end` (in a style sheet the comment `css-dupes: <reason>` before the rule) and one sentence why.

## Testing in the browser

In dev mode the game hangs on the window as `window.game`. It lets you read and set state (Playwright, `browser_evaluate`):

- Start a solo round: `document.getElementById('start').click()` opens its choices, `document.getElementById('solo-launch').click()` launches it
- Start a course of the flight school: `document.getElementById('school-racer').click()` (also `school-basic`, `school-gladiator`, `school-arsenal`, `school-tactician`); to start one at a drill, set `localStorage['solartournament.school-step']` to `{"arsenal": 3}` (the course and the drill's index) before
- Simulate keys: `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`
- Freeze time for screenshots: `game.timeScale = 0`
- Disable bots: set the other ships to `alive = false` and `respawnAt = Infinity`
- Multiplayer: open two tabs with `?local=1#t=<code>` (at least six letters or digits) and click "Join tournament" in both (BroadcastChannel, no internet); without `local=1` the same test runs over Trystero and real Nostr relays. Several tabs render too slowly without a GPU (frame gaps make browsers start over, see `CUT_OFF_MS`): switch rendering off with `game.composer.render = () => {}`. Cut a tab's link with `const t = game.online.session.transport; t._post = t.post; t.post = () => {}; t._recv = t.channel.onmessage; t.channel.onmessage = null` (restore both to reconnect); freeze it with a busy loop of a few seconds
- Render music offline: `const { renderPreview } = await import('/src/music/preview.ts')`, then `renderPreview('Orbit Terror', 'round', undefined, fromSecond, seconds)` (the title is the seed; a flavor can be forced); returns a WAV file as base64 that can be saved and listened to
- Trigger a glitch: `game.glitch.trigger(1, 5)`; idle glitches in the menu make element screenshots fail, so stop them with `game.nextIdleGlitch = Infinity`

The test browser renders without a GPU; its frame rate says nothing about real hardware. Game feel and sound cannot be judged this way; Johannes tests those himself.
