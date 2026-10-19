<p align="center"><img src="public/crest.svg" width="260" alt="SolarTournament: the seal of the Ministry of War of the United Solar States"></p>

# SolarTournament

A browser space shooter in an asteroid field, built with [three.js](https://threejs.org/). No shields, no sound in space, no speed limit: ships obey Newton, lasers punch straight through hulls, and a careless burn ends in a rock.

What flies, collides, burns and breaks behaves the way it would out there, as long as it stays fun.

## Run

```
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build      # static site in dist/
```

## Deploy

The game is a static site on [Cloudflare Pages](https://pages.cloudflare.com/), project `solartournament` (`wrangler.toml`). Two stages, one branch each:

| Branch | Stage | Address |
|---|---|---|
| `stage_prod` | production | https://solartournament.games |
| `main` | test | https://test.solartournament.games |

Every push to one of the two branches builds the game and publishes it (`.github/workflows/deploy.yml`, with the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`). Development happens on `main`; a release merges `main` into `stage_prod`. `test.solartournament.games` points to the branch alias `main.solartournament.pages.dev`; `www.solartournament.games` and `solar-tournament.games` (with `www.`) redirect permanently to `solartournament.games`, path and query included.

The project is a classic Pages project with direct upload, created through the Pages API (`POST /accounts/{account}/pages/projects` with `production_branch: stage_prod`), not a Worker: the game is a static site and needs no server code. `wrangler pages project create` hands the project over to Workers, so it is not used.

## Controls

| Keyboard and mouse | Gamepad | Action |
|---|---|---|
| Mouse (click the game first) / arrow keys | Left stick (pull back = nose up) | Turn (yaw, pitch) |
| Q / E | LB / RB | Roll |
| W / Shift | RT (analog) | Main drive |
| A / D | Right stick left / right | Thrusters: sideways |
| S | X | Thrusters: backwards |
| R / F | Right stick up / down | Thrusters: up / down |
| X | Y | Flip: the flight computer turns the drive into the flight direction |
| Click / Space | LT / A | Fire laser |
| C | View | Chase / cockpit camera |
| M | | Radio on / off (also by clicking the song title in the top right corner) |
| Esc | Menu | Pause |
| Enter | A | Confirm (start, resume, boot the next clone) |

Gamepads with the standard layout (Xbox, PlayStation, most others in current browsers) work without setup.

On phones and tablets touch controls appear: the fixed stick on the left turns the ship (drag up = nose up), a second stick appears under the right thumb and fires the maneuvering thrusters. Hold **Drive** for the main drive and **Fire** for the laser; **Back** pushes backwards, **Flip** starts the flip assist. Pressing a key on a hardware keyboard hides the touch controls, touching the screen brings them back.

## Online tournament

**Online tournament** in the menu opens a room and puts its code into the address (`?t=code`); the pause menu copies the invitation link. Whoever opens the link joins the same tournament. There is no game server: the browsers find each other through public Nostr relays ([Trystero](https://github.com/dmotz/trystero)) and then talk directly over WebRTC.

- **Four places per tournament.** The lead browser fills free places with bots and removes one for every host who joins.
- **Every Host has their own pilot.** Each browser simulates its own ship and sends its state 15 times per second; the other browsers predict the motion in between (a ship without thrust flies straight on) and blend corrections in smoothly.
- **The shooter decides about hits.** A beam that goes through a ship on the shooter's screen is reported to the browser flying that ship, which applies the damage and announces a destruction. Asteroid hits go to everyone; the fragments are deterministic, so all players see the same ones.
- **The lead browser** is the one that has been in the room longest. It runs the bots and the round clock and brings newcomers' asteroid fields up to date. When it leaves, the next one takes over seamlessly.
- **Rounds** last five minutes for everyone; the scoreboard shows over the running game, and the next round starts after 12 seconds. The pause menu does not stop the tournament.
- Some networks (e.g. strict company firewalls or carrier-grade NAT) block direct connections between browsers; players behind them cannot connect without a relay (TURN) server.

For development, `?t=code&local=1` connects tabs of the same browser without the internet.

## Flight school

The menu offers a guided flight school without opponents. It opens with a briefing on the world of the games, read out by the flight computer, which also reads every following step aloud. Ten steps teach the main drive, drifting, the flip, braking, the maneuvering thrusters, shooting a target drone, cooling in the shadow of an asteroid and the impact warning. Each step waits until the pilot has actually done it; a blinking diamond marks targets. Training clones are free: a Host whose clone dies in flight school gets the next one without a sponsor break.

## Radio 2584

The tournament broadcaster pumps hard techno into every cockpit, composed live by the game with [Tone.js](https://tonejs.github.io/). There are no fixed tracks: every round grows its own track, and it is never heard again, unless someone remembers its title. **The title is the seed**: "Orbit Terror" always grows the same track, note for note.

**Musical direction.** The maintainer is a big fan of Kraftwerk and Daft Punk, and of everything early techno had to offer: hard beats and that certain underground feeling. It was a great time that he was maybe a little too young for, so we live it out here. Radio 2584 therefore sounds like the underground: driving, raw and distorted, with machine-like sequences, and now and then the German *Autobahn* feeling of Kraftwerk, robot voices with a rolling R included. Tracks must never become predictable: every round takes its own path.

Decisions so far:

- Hard and fast beats beat polite ones; chiptune and lounge music do not fit.
- Schranz and generic rave are not the maintainer's taste and only play rarely.
- German words in the robot voice, but only now and then.
- Daft Punk styles and elements are always welcome: loops that a filter opens and closes, phaser, pumping compression, vocoder robot voices, phrases chopped into the beat word by word, and the raw, distorted early sound.

- **Hard and fast.** Mostly 140 to 160 BPM; hard techno sits around a median of 146 BPM, peak-time sets at 150 to 155.
- **Flavors** (how often they come up):
  - *Hard* (6 in 24): rolling bass under a heavy rumble, 148–155 BPM.
  - *Industrial* (4): bit-crushed hats, cowbells and claves in Euclidean patterns, a little swing, 140–147.
  - *Acid* (4): a squelching 303 line carries the track, 145–150.
  - *EBM* (4): electronic body music, a sequenced 16th bass (root, root, octave, root, accents before the beat) or an octave bass whose 16th echo turns it into a pulse (Giorgio Moroder), arpeggios, 132–140.
  - *French* (4): a chord loop that a filter opens over four bars and closes over the next four, phaser, pumping, 126–132.
  - *Schranz* and *Rave* (1 each): the fastest and tom-heavy, or stabs and a hoover.
  - *Motorik*, one track in thirteen: Kraftwerk's machine pop. An electro beat, octave bass, square-wave plings, a pad, 126–134 BPM, a German title and a German robot voice.
- **Strategies.** The title also picks how the track develops, so no two rounds follow the same recipe:
  - *Classic*: grooves and peaks, kick-less breakdowns, re-entries.
  - *Relentless* (after Jeff Mills): no breakdown at all. Layers drop out for two bars at irregular moments, every 16 bars the tops take a bar off, and twice the track strips down to kick and claps or kick and one line for a few bars.
  - *Hypnotic*: one long accumulation over two thirds of the round, layers entering as the energy climbs, one filter dip before the finale.
  - *Movements*: the first half belongs to the lead, then four bars of kick and bass, and the second half to a sequenced bass; the lead never returns.
  - *Switcher*: the felt tempo changes; a half-time section (kick on one, clap on three) and a broken-kick section (kicks on one and the "and" of three) between the straight ones.
  - *Fake drop*: after a breakdown, four bars that sound like the drop but hold back the low end, two bars of gap, then the real drop.
  - *Polymeter*: percussion loops of 5, 7 or 9 steps and a 7-step acid line drift against the bar and snap back to 16 in the finale.
- **Surprises.** Every round gets a few of these, at least 12 bars apart, after stable stretches (a big surprise works best when the listener is sure what comes next): a filter dip of four bars, a delay throw that swells into feedback, an air-raid siren, a bit-depth drop on the drums, a key lift of 2 to 5 semitones for the rest of the track, a bomb into the reverb at the start of a breakdown. Breakdowns end in a rotating way: a beat of silence, a kick roll (quarters, eighths, sixteenths), a stutter, or a rug pull (a whole bar of silence). A peak may die in a tape stop: the tonal parts slide two octaves down, the level falls away.
- **The kick** is a sine whose pitch drops in two stages, saturated hard, with a noise click on top, and every track has its own:
  - the pitch starts at 10 to 26 times the fundamental, falls to 4 to 9 times it within 8 to 25 ms, then to the fundamental within another 60 to 180 ms;
  - the body rings for 40 to 80 % of a beat;
  - the distortion is gabber (tanh, then atan), hard clipping, a warm tanh or a metallic wave fold, depending on flavor and seed;
  - the click, the brightness (lowpass at 2.5 to 9.5 kHz), the rumble's upper limit (110 to 230 Hz), its level and how fast it swells back all come from the title.
  
  The fundamental lies between 41 and 62 Hz and sets the key of the track.
- **The rumble.** A copy of the kick runs through a long reverb, distortion and a 30–170 Hz band, in mono. Every kick ducks it, and it swells back before the next one: the low end breathes on the offbeat. Bass, acid and stabs pump with the kick as well. The bass never plays on the kick and leaves the sub to the rumble.
- **Patterns.** Every step of a bar has a weight for every instrument (after Mutable Instruments' Grids); a step plays when its weight beats the instrument's density, and density follows the energy of the track. More energy adds notes in a fixed order instead of reshuffling them, so build-ups sound intended. Hats run in 16ths with accents, open hats on the offbeat, claps on two and four with ghost notes, percussion in Euclidean rhythms on a loop of 5 to 16 steps that drifts against the bar. Every 16 bars each part may mutate a little; the kick never does.
- **The acid line** loops over 12 or 16 steps, its note sets and step weights after Vitling's [Endless Acid Banger](https://github.com/vitling/acid-banger) (CC BY 4.0). Accents throw the resonant filter wide open, slides glide into the next note, often an octave up.
- **Arrangement.** A round runs intro, grooves, peaks and breakdowns on an 8-bar grid; energy moves through breakdowns and re-entries. In a breakdown the kick drops out while hats and a thin bass without its low end keep the rhythm going, the filter opens, a noise riser climbs over the last four bars and the last beat falls silent; the next section crashes in. Every 8 or 16 bars a fill marks the phrase: kicks added or removed, a hat roll, a clap burst, a tom run. The last minute of the round is the finale with every layer and full distortion; after the round an outro takes the track down.
- **Loud, not harsh.** The mix ends in a glue compressor and a soft clipper instead of a hard limiter.
- **More instruments.** Besides kick, rumble, hats, ride, clap and bass: Euclidean toms, an 808-style cowbell (two square tones at 587 and 845 Hz through a band at 2.64 kHz), claves, an FM bell, a hoover, a square-wave arpeggio, distorted chord stabs, the french chord loop and the motorik pad.
- **The voice of the regime.** A robot voice announces the station and the track ("Radio twenty five eighty four. Now playing. Orbit Terror.") and drops the propaganda of the Orange President and his sponsors over the music, 7 to 10 times a round: at section changes and now and then in between, in the finale more often. It speaks sentence after sentence, or chops a line onto the beat one word per eighth. Every word must stay understandable: the clear voice carries it, a touch of ring modulation, bit crushing and grit only colors it, a compressor makes it loud, the music steps back while it talks, and its last word is thrown into the echo. German now and then; in motorik tracks mostly German.
- **The announcer** cuts in over the radio after kills: static, a cynical line, static. "An excellent death for Ingmar." "The alien is dead. Now our nation can grow again." Human callsigns are spoken as "host" (the voice is rendered ahead of time) and shown by name.
- **Now playing.** The title of the running track, with flavor and tempo, is always in view in the top right corner. The note button next to it switches the radio off and on (also key M). A click on the title opens the radio page.
- **The radio page** (`radio.html`): enter any title, or roll a random one, and the track it grows plays again in the browser: the shape of the track as a bar of sections, a playhead, the transmissions on screen. "Download WAV" presses the whole track (5 minutes plus outro) offline into a 16-bit stereo WAV file of about 55 MB. Rendering time grows faster than the length of the music, so the track is pressed in 20-second chunks, each started 8 seconds early so reverbs, echoes and voice lines are already sounding at its seam, and the chunks are crossfaded; it takes one to two minutes.
- **The flight computer** has a voice of its own, clear and calm, independent of the radio: whatever the screen tells the Host, it also says. Damage reports, impacts, a cracked asteroid, leaving the field, the lost clone and the sponsor's pitch, the end of a round, and every step of the flight school. Its lines are rendered whole, not word by word, so they sound natural.
- **Transmissions on screen.** Whatever the voice and the announcer say runs across the screen while it is spoken: the regime in orange neon, the announcer in blue.
- **The voice is pre-rendered.** `npm run voice` speaks every word and every sentence of `src/music/lines.ts` with [espeak-ng](https://github.com/espeak-ng/espeak-ng) (its robosoft variant for the regime, a livelier voice for the announcer) into one MP3 sprite; the game plays whole sentences, so they keep their melody, places single words on the beat, and needs no speech engine. Browser speech synthesis cannot be used: its output can neither be routed through Web Audio nor timed to the beat, and it sounds different on every device.
- **Everyone hears the same beat.** In an online tournament the room code and the round number choose the title, and the music runs on the lead browser's round clock. Every note is an integer hash of seed, bar and step, so a browser can jump to any point of the track; it compares its music with the clock several times per second and jumps when they drift apart. All Hosts of a tournament hear the same note at the same moment (up to the network delay).
- **Hangar.** In the menu and the flight school the arena's groove comes through the hangar wall: lower energy, filtered, never peaking.
- The radio sits in the cockpit and plays straight into the headset, not through the hull. When the clone dies, its radio fades into the distance; the next clone hears it clearly again.

## The universe

SolarTournament has a universe of its own. It borrows two principles from science fiction series we love:

1. **Realistic physics**, as in *The Expanse*: Newtonian flight, no sound in vacuum, no shields, hulls that break.
2. **Consciousness transfer into clones**, as in *Altered Carbon*: death is not the end. But over a live link and with a memory that never breaks, as for the expendable of *Mickey 17*: every death is lived through.

Humanity has settled the solar system. Fast fusion drives make hard burns between the planets possible, and daredevil pilots whip their ships around gravity wells at extreme speed for the thrill of it. The SolarTournament grew out of that daring and became the greatest entertainment of its time: pilots, printed clones of their Hosts, fight each other to the death in ships among the asteroids, while audiences across the system watch from a safe distance. Gladiator games for the space age.

The clones die, and the Hosts come back. Their minds are linked to cloned human bodies; when a ship is destroyed, the Host wakes up in the next clone, in the next ship. That is why every round has respawns, and why the audience never runs out of champions. The clones come out of a 3D printer: disposable bodies, printed by the dozen, and everyone knows it.

The one who receives all of it is the **Host**. Every player is a Host and is addressed as one: the person at the other end of the link, the host of everything the clones live through. The Host is bound to the clone by a live link. The clone flies and fights on its own, because only a mind inside the cockpit is fast enough: every radio link lags, and in a dogfight a fraction of a second is a lifetime. But the link carries so much that everything the clone lives through streams back into the Host's memory as it happens. When the clone dies, the Host holds all of it, every memory and every pain, the death included. A Host remembers every death, and the Host's brain has to cope with it. Dying hurts, and nothing about it is free. The clones die, but the soul rots a little more each time. (This is where SolarTournament leaves the Altered Carbon model behind, in which a stored memory is loaded into a new body and the death itself is lost; ours is closer to the reprinted expendable of Mickey 17.)

**Whose eyes we see through.** In the hangar, in the menu, we are the Host. When a round starts, the screen says "Establishing live link to your clone", the picture breaks up, and from then on we are the clone in the cockpit: the game plays from the pilot's perspective. When the clone dies, the link is lost and we are the Host again, sitting through the advertisement that pays for the next body; when the sponsor is happy, the link is established to the next clone and we are back in the cockpit. Everything the Host sees and hears arrives over that link. When a hit or an impact shakes the clone, the link stutters: the picture breaks up like a corrupted video stream, the radio drops out, static crackles in the headset. When the clone dies, the link breaks down until the next clone is printed. Even the idle link to the clone hangar flickers now and then.

The future is broken, and it glows. Neon signs flicker over everything, every surface is for sale, every picture comes over a link that can break. The tournament's own sign is sun orange; the sponsors advertise in its complement, a cold azure blue.

It is a society without morals. A new clone is not free: the Host pays with attention. Before the next body boots, the Host has to watch an advertisement. Want another clone? Make the sponsor happy.

The system is ruled by the **United Solar States**, the heir of an America that turned completely fascist and then took the planets with it. At its head sits **the Orange President**, and he has sat there for at least a thousand years. Clone transfer normally wears out after a few lifetimes; his never did. Every time he dies, a new clone boots, and every transfer copies his dementia along with him and makes it worse. Many believe that is the source of his madness: he has become completely unpredictable, the end product of a rotten society, and his eternal life does not seem to end. The President wants his games, and the army stages them: the **Ministry of War** of the United Solar States organizes the Presidential Games. Its seal hangs over every hangar: an eagle before the sun, nine stars above it, one for each of the eight planets and one for the asteroid belt, and the ribbon "Solar Tournament · MMDLXXXIV". The SolarTournament is his games: the Presidential Games, held to keep the people of the solar system entertained and quiet. His voice runs through the tournament radio with hollow boasts about the greatest tournament of all time and the highest statistics anyone has ever seen. His favorite enemies are the **Rockborn**, people born and raised in the asteroid belt, who mine the rocks the tournament is fought among. Many of them want to come back to Earth; the regime deports them to the belt again and again, and the Orange President is building a wall against them: the Solar Wall, the biggest wall in the history of walls, and Mars is going to pay for it. That the tournament's sign glows in orange is no accident. The game is satire: a warning, drawn from the politics of its own time, of where this road leads.

The year is **2584**, a nod to George Orwell's *1984*, where a whole society watches and is watched.

### Factions

- **Earth**: the United Solar States under the Orange President. They own the tournament, the clone printers and the broadcast.
- **Mars**: the old colony, proud, militarized and tired of paying for Earth's walls.
- **The Rockborn**: people of the asteroid belt, miners of the rocks the tournament is fought among. Earth needs their work and deports them when they come home.
- **The "Aliens"**: that is what the regime's broadcast calls them, but they are human. Generations in deep space, radiation and selection have changed their descendants beyond recognition; nothing about them looks human any more. They can no longer live on Earth or Mars, not even in a ship with a normal atmosphere: they need air with an extremely high share of oxygen and survive only inside the life support of their own ships. Calling them aliens makes it easier to cheer when they die.

The "alien" interceptor and the human interceptor are the same ship under a different skin: the rules of the Presidential Games allow one hull for everyone, built by the sponsors, so that the audience sees a fair fight and the sponsors sell one ship to every faction. Earth, Mars and the Rockborn all fly the human skin. Only the outcasts get the alien skin, and with it their life support. The strange-looking shell puts them on display and denies them their humanity: the audience is meant to see monsters, not people, and to know whom to cheer against.

## The physics of the SolarTournament universe

### Scale

One world unit is 5 cm. A ship is about 35 m long; the asteroids are ten to thirty times its size. The HUD shows speeds in m/s.

### Flight

- **Main drive.** It pushes only along the nose, with 45 m/s² (about 4.6 g). Nothing slows a ship down: without thrust it keeps drifting forever.
- **Maneuvering thrusters.** They rotate the ship and also push it gently along every axis (7 m/s²), enough to sidestep, not enough to brake from full speed.
- **Flight computer.** Rotation is rate-controlled: the stick sets how fast the ship turns, and the thrusters stop the rotation when the stick is released (up to 1.6 rad/s for yaw and pitch, 1.8 rad/s for roll, reached with 6 rad/s²).
- **Flip and burn.** Braking means turning the drive into the flight direction and burning. The flip assist (X) turns the ship to retrograde; the pilot burns. Grabbing the stick cancels the assist.
- **Velocity markers.** The green marker shows where the ship is actually drifting, the orange cross where the drive has to point to brake.
- **Space dust.** Fine dust stays fixed in space, so drift is visible even far from any rock.

### Asteroids

- **Huge and few.** 40 rocks with mean radii of roughly 90 to 350 m (up to about 600 m along their longest axis) in a field of 2.25 km radius. Collisions use an ellipsoid fitted to each rock, not a sphere, so ships can fly close to elongated rocks.
- **Sixteen shapes, four kinds.** The rocks are generated: squashed or stretched lumps with crags, ridges and craters (many small, few large; the floors show fresher, brighter material). They come as dark carbon-rich rock, stony rock, reddish iron-bearing rock and shiny metal, like the real asteroid belt.
- **Gravity.** Every asteroid pulls with a surface gravity proportional to its radius (uniform density) that falls off with the square of the distance. The big ones pull with about 1.5 m/s² at the surface, roughly 3 % of the main drive. A ship that drifts near a rock slowly falls towards it. This is the one deliberate exaggeration: a real rock of this size pulls thousands of times weaker, too weak to feel in a fight.
- **Tough.** A rock withstands 4 laser hits plus one per 40 m of mean radius (6 to 13 hits). Then it breaks into 2 to 3 fragments with 55 % of its size that drift apart. After two generations the pieces are gone for good.
- **Deterministic.** Layout and fragments come from seeded randomness, so every player sees the same field.

### Collisions

- A ship bounces off a rock and keeps 30 % of its impact speed; scraping along the surface bleeds off some sideways speed.
- Impacts below 12.5 m/s only scratch the paint. Above that the hull loses 1 point per 0.6 m/s; at about 72 m/s a ship is destroyed.
- **Impact warning.** The flight computer warns when the current course hits a rock sooner than the ship could flip and brake (plus 2 seconds of reaction time) and beeps faster the closer the impact gets.

### Damage

There are no shields. Every hit stays until the ship respawns.

- **The laser punches through.** A shot is a hitscan beam along the nose. It passes through every ship in its path and stops at the first asteroid or piece of debris.
- **Hit zones.** The point where the beam passes closest to the ship's center decides what breaks:
  - **Reactor** (within 15 % of the radius from the center): the ship is destroyed at once.
  - **Main drive** (rear): loses half its thrust per hit and sputters; two hits kill it. A ship without drive drifts but can still turn and fire.
  - **Maneuvering thrusters** (flanks): lose 40 % per hit; the ship turns and sidesteps more slowly.
  - **Hull**: every hit, in any zone, costs 34 of 100 hull points, so three hits destroy any ship.
- **Decompression.** Each beam leaves an entry and a larger exit hole. The escaping air jolts the ship into a spin and keeps pushing it for a few seconds (fading with a time constant of 2.5 s) until the compartment is empty. A healthy flight computer catches the tumble quickly; damaged thrusters take longer.
- **Wreckage.** A destroyed ship breaks into five glowing pieces of hull plating that keep its momentum, fall towards the asteroids and grind to dust when they hit one. Flying into a piece costs hull points depending on the impact speed; lasers shatter them.
- **The arena.** Space has no walls. A ship that stays more than 3.4 km from the center for 8 seconds is lost in deep space.

### Heat

The laser draws no ammunition but produces heat. Each shot adds 30 % of the heat capacity; at 100 % the laser locks until the ship has cooled down to 30 %. Radiators shed 20 % per second in sunlight and 50 % per second in the shadow of an asteroid. The asteroids cast real shadows; a ship in shadow goes dark and the HUD shows ☾ next to the heat gauge.

### The pilot

- **G-forces.** Above 3 g the pilot starts to grey out. A full burn (4.6 g) narrows the view to a tunnel within 5 seconds, with the pilot's heartbeat getting louder; 3 seconds without hard acceleration clear it again.
- **Line of sight.** Sensors need a clear line: a ship hidden behind an asteroid disappears from the HUD, and bots cannot see it either.

### Sound

There is no sound in vacuum. Everything the Host hears travels through the clone's hull and sounds muffled: the rumble of the drive, the hiss of the thrusters, the own laser, hits on the own ship, and debris of nearby explosions rattling against the hull. Clean beeps come from the ship's computer: hits, kills, the end of a flip, impact warnings. The radio and the static of a disturbed link play in the headset and are not muffled.

### Combat rules

- A kill scores 500 points; asteroids score 200, 120 and 80 points depending on their generation.
- Destroyed ships respawn at the edge of the field, with 2.5 seconds of spawn protection. Bots respawn after 3 seconds. The Host first sits through a sponsor break while the next clone is printed: after 3 seconds an ad appears, and once it has run, a button boots the next clone. The round goes on meanwhile.
- Human and alien interceptor are identical apart from their looks.

## License

**Code:** Copyright © 2012–2026 Johannes Hoppe, licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). Anyone may play, study, change and share the game. Whoever publishes a changed version, including as a website, has to publish its source code under the same license.

**Name and brand:** The name *SolarTournament*, the logo and the domains solartournament.games and solar-tournament.games are not covered by the license. A changed version has to use its own name.

**Ships:** The two interceptor models and their drive sprites (`public/assets/models/`, `public/assets/textures/`) are by Johannes Hoppe and not covered by the license. Please ask for permission before using them in other software.

**Everything else is generated in code** and covered by the license: asteroids, sky, sun, particles, sound effects, music and the icon.

**The SolarTournament logo, the seal of the Ministry of War** (`public/crest.svg`, drawn by `npm run crest`; logo, favicon, menu, loading screen, radio page): the eagle is based on ["Zurich Eagle Silhouette"](https://openclipart.org/detail/282180/zurich-eagle-silhouette) by GDJ on Openclipart, CC0 1.0 (public domain), cut into straight facets by the generator.

**Font:** [Michroma](https://github.com/googlefonts/Michroma-font) for headings and signs, SIL Open Font License 1.1 (see `public/assets/fonts/OFL-michroma.txt`). Text is set in the system's sans-serif.
