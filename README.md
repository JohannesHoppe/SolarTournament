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

Cloudflare builds every push to one of the two branches itself (Git integration: build command `npm run build`, output directory `dist`, Node from `.node-version`); no Cloudflare token lives in GitHub. Development happens on `main`; a release merges `main` into `stage_prod`. `test.solartournament.games` points to the branch alias `main.solartournament.pages.dev`; `www.solartournament.games` and `solar-tournament.games` (with `www.`) redirect permanently to `solartournament.games`, path and query included.

The project is a classic Pages project, not a Worker: the game is a static site and needs no server code.

## Controls

| Keyboard and mouse | Gamepad | Action |
|---|---|---|
| Mouse pointer (the ship turns towards it; the farther from the center, the faster) / arrow keys | Left stick (pull back = nose up) | Turn (yaw, pitch) |
| W | RT (analog) | Main drive |
| S (hold) | B (hold) | Brake: the flight computer flips the ship head over and burns until it is at rest |
| Shift (hold) | L3, the left stick pressed in | Fine aim: turns at 30 % for precise aiming |
| A / D | Right stick left / right | Thrusters: sideways |
| | X | Thrusters: backwards |
| R / F | Right stick up / down | Thrusters: up / down |
| X (hold) | Y (hold) | Flip: while held, the flight computer turns the ship head over until the drive points against the flight and keeps it there. W can be held at the same time: the drive only fires once the nose points back, so X and W together brake by hand. Letting go hands the ship back |
| T | R3, the right stick pressed in | Autopilot / free drift. The autopilot is on at the start of every round: the thrusters take out every drift across the nose, so the ship flies where it points and W pushes it exactly that way. In free drift the ship keeps any drift, for slides and drifts on purpose. On touch screens the AUTO button |
| E | RB | Overdrive, the last resort: one shove of 300 m/s along the nose, past the speed limit. It leaves the clone at the edge of blacking out and the laser overheated, and recharges for 60 seconds (the HUD counts down). Aim it across the attacker's line of fire or ahead of the own drift: straight away from a ship on the own tail it only makes a farther target. On touch screens the OVERDRIVE button |
| Click / Space | LT / A | Fire laser |
| C | View | Chase / cockpit camera |
| M | | Radio on / off (also with the ♪ button in the top right corner; a click on the song title opens the radio page) |
| Esc | Menu | Pause |
| F1 | | Controls sheet over any screen, the running round included (F1 again closes it) |
| Tab | | While watching a full tournament: the next pilot |
| Enter | A | Confirm (start, resume, boot the next clone) |

**The essentials** are W, A, S, D, Shift, Space, X and the arrow keys or the mouse; both work at the same time, so keyboard pilots and mouse pilots share one layout. The up and down thrusters and the camera are extras. The pilot does not roll: the flight computer keeps the ship upright (see Flight).

**Mouse flight.** The pointer stays visible and nothing captures the mouse. Its offset from the screen center is the stick: at 25 % of the shorter screen side it turns at full rate, within 8 % of that around the center the ship flies straight, and a pointer that leaves the window lets go of the stick.

Gamepads with the standard layout (Xbox, PlayStation, most others in current browsers) work without setup.

On phones and tablets touch controls appear: the fixed stick on the left turns the ship (drag up = nose up), a second stick appears under the right thumb and fires the maneuvering thrusters. Hold **Drive** for the main drive and **Fire** for the laser; **Brake** brakes to a stop, **Flip** (hold) turns the ship against the flight. Pressing a key on a hardware keyboard hides the touch controls, touching the screen brings them back.

**Fullscreen.** On phones and tablets a round goes fullscreen by itself and, where the browser allows it, holds landscape; the menu and the pause menu have a Fullscreen button for every device. Browsers that do not let a page go fullscreen (the iPhone's) get it by adding the game to the home screen: the web app manifest (`public/manifest.webmanifest`, icons rendered from the seal) starts it without the browser's bars.

## Online tournament

**Online tournament** in the menu opens the list of tournaments. On top, the public tournaments running right now, each with its name, how many Hosts fly, whether bots fill it and the time left in the round, and a button to join (or to watch, when it is full). Below, a form starts one:

- **A name** of the Host's choice ("Kessler's Revenge"), up to 32 characters.
- **Public or private.** A public tournament is announced in the lobby for everyone; a private one is only found through its link.
- **With or without bots.** With bots, the lead browser fills all eight places and every Host who joins takes a bot's place; without, only Hosts fly.

The room's code, name and rules live in the fragment of its link (`#t=kesslers-revenge-k7m2pq&n=Kessler%27s+Revenge&pub=1`, `&bots=0` without bots), so they never reach the web server. The code is the name plus a random part: 6 characters for a public tournament, so two of the same name never meet, 20 for a private one (about 99 bits), far beyond guessing from the public relays. Starting a tournament invites friends at once: on a phone the share sheet opens, elsewhere the link is copied; the pause menu's **Invite friends** does the same any time. Whoever follows the link joins; when nobody is in the room any more, the first to come starts it again with the link's rules, so a tournament can be played forever. There is no game server: the browsers find each other through public Nostr relays ([Trystero](https://github.com/dmotz/trystero)) and then talk directly over WebRTC. Leaving the tournament and the list closes the connections to the relays.

- **The lobby** is one shared room on the same relays. The lead browser of a public tournament announces it every five seconds, and at once to everyone who opens the list; a tournament not heard of for 16 seconds leaves the list. Announcements are checked like every message from another browser, and the list keeps at most 50 tournaments.
- **Eight places per tournament.** A ninth Host does not fly but watches: the camera follows a pilot of the tournament (Tab switches), and the own clone is printed as soon as a place comes free. Hosts who were in the room first keep their places.
- **Every Host has their own pilot.** Each browser simulates its own ship and sends its state 15 times per second; the other browsers predict the motion in between (a ship without thrust flies straight on) and blend corrections in smoothly.
- **The shooter decides about hits.** A beam that goes through a ship on the shooter's screen is reported to the browser flying that ship, which applies the damage and announces a destruction. Asteroid hits go to everyone, with the field time of the hit; the fragments are deterministic, so all players see the same ones, and a destroyed ship's wreckage is seeded with its death count, so it breaks into the same pieces everywhere. When two Hosts break the same rock at the same moment, the hit with the earlier field time gets the points; the other browser takes its own points back when it learns it was later.
- **One field for everyone.** Where a rock stands and how it is turned follows from the seed and the field time. The lead browser shares its field time with the round clock 15 times per second; the others glide towards it and jump when they are more than half a second off. A newcomer gets the field time, every rock's remaining hits and when each fragment broke off. Every new round brings a fresh field.
- **The lead browser** is the one that has been in the room longest and is still sending. It runs the bots and the round clock and brings newcomers' asteroid fields up to date. When it leaves, or falls silent for 2.5 seconds (a hidden tab runs no frames), the next one takes over; when it is back, it leads again.
- **Nothing from other browsers is trusted.** Every message is checked before the game uses it (finite numbers in plausible ranges, callsigns up to 16 characters, at most eight ships per browser, messages up to 64 KB). A message about a ship only counts from the browser that runs it, a shooter cannot report more hits than its laser fires, asteroid hits are limited to 20 per second and browser, and only a newcomer takes an asteroid field, once, from a browser that was there first.
- **Rounds** last five minutes for everyone; the scoreboard shows over the running game, and the next round starts after 12 seconds. The pause menu does not stop the tournament.
- Some networks (e.g. strict company firewalls or carrier-grade NAT) block direct connections between browsers; players behind them cannot connect without a relay (TURN) server.

For development, `?local=1#t=code` connects tabs of the same browser without the internet.

## Flight school

The menu leads with the flight school until a Host has completed it once; after that the solo round is the main action (Enter). The flight school remembers the drill a Host has reached: after a reload it continues there (the menu says "Continue at drill n of 24"), with the autopilot as the drills before left it, and "Start the flight school over" begins again from the briefing. Once complete, the flight school button says so for good ("✓ Completed. Cleared for the tournament."), also when the Host trains again. The flight school trains one maneuver per drill, 24 drills in all, each with a short spoken line, the keys as big keycaps (the spoken words name no keys; the keycaps show those of the Host's keyboard, gamepad or touch screen), and markers in space (orange diamonds, a course of rings, red debris). A drill waits until the pilot has really done it, some are repeated two or three times, and a failed attempt or a dead clone starts the attempt over. Training clones are free: no sponsor break. After every drill the flight computer praises the pilot and explains the physics behind the maneuver. Her lessons are never cut off: a new one waits until she has finished the last, and her other lines (hits, asteroids, warnings) stay silent while she teaches; the HUD shows them anyway.

1. Briefing: Nicole introduces herself ("Hi, I am Nicole. Your personal flight computer."), then the world of the games in four sentences.
2. Turning: three markers into the crosshair (arrows or mouse).
3. Fine aim: Shift turns slowly; center a far marker exactly.
4. Cockpit view: C switches into the cockpit and back (skipped on touch screens, which have no camera switch).
5. Main drive: W up to 50 m/s, with the autopilot on.
6. Free drift: T switches the autopilot off; the drift lessons that follow need it.
7. Drifting: let go, nothing slows the ship down.
8. Looking back while drifting: the nose turns, the course stays (the green prograde marker shows the course).
9. Brake: hold S, the flight computer flips and burns until the ship is at rest.
10. Flip and burn by hand, twice: hold X and W together; the drive fires once the nose points back; the S brake does not count here. The drill counts once the drift along the course is gone; a little sideways drift may remain.
11. Stopping at a marker, near and far: burn, flip, burn. It counts once the ship rests (below 10 m/s) inside the blue sphere around the marker, 200 m in radius.
12. Jinking: a gunner on the tail fires red shots at where the ship was a moment ago; pushing left and right with the thrusters (A/D) makes them go past. It counts after four changes of side; turning and drift do not matter, a hit only sparks.
13. Dodging debris that drifts straight at the ship, twice, without turning (more than 45°).
14. Autopilot back on (T).
15. A course of four rings.
16. Shooting a resting drone that shows its drive: armor shrugs the laser off, five hits into the drive blow it up.
17. Shooting a drifting drone, again into the drive (the laser hits instantly, no lead needed).
18. Firing until the laser overheats.
19. Cooling down in the shadow of an asteroid.
20. The impact warning: drifting at a rock with 100 m/s, braking or sliding past.
21. Chasing a bot that flies but does not shoot: it runs, staying on its tail opens its drive.
22. Fighting a weak bot that shoots back: keep the armored nose on it, slide, and work onto its tail.
23. Final exam: a real bot that knows the trick too. Win the dogfight.
24. Cleared for the tournament.

## Radio 2584

The tournament broadcaster pumps hard techno into every cockpit, composed live by the game with [Tone.js](https://tonejs.github.io/). There are no fixed tracks: every round grows its own track, and it is never heard again, unless someone remembers its title. **The title is the seed**: "Orbit Terror" always grows the same track, note for note.

**Musical direction.** The maintainer is a big fan of Kraftwerk and Daft Punk, and of everything early techno had to offer: hard beats and that certain underground feeling. It was a great time that he was maybe a little too young for, so we live it out here. Radio 2584 therefore sounds like the underground: driving, raw and distorted, with machine-like sequences, and now and then the German *Autobahn* feeling of Kraftwerk, robot voices with a rolling R included. Tracks must never become predictable: every round takes its own path.

Decisions so far:

- Hard and fast beats beat polite ones; chiptune and lounge music do not fit.
- Schranz and generic rave are not the maintainer's taste and only play rarely.
- German words in the robot voice, but only now and then.
- Daft Punk styles and elements are always welcome: loops that a filter opens and closes, phaser, pumping compression, vocoder robot voices, phrases chopped into the beat word by word, and the raw, distorted early sound.

- **Hard, but not exhausting.** Mostly 126 to 148 BPM, the fastest at 152: a round lasts five minutes, but people play many rounds, and peak-time speed and full distortion wear the ears out over an evening.
- **Flavors** (how often they come up):
  - *Hard* (4 in 24): rolling bass under a heavy rumble, 140–148 BPM.
  - *Industrial* (4): bit-crushed hats, cowbells and claves in Euclidean patterns, a little swing, 134–141.
  - *Acid* (4): a squelching 303 line carries the track, 138–144.
  - *EBM* (5): electronic body music, a sequenced 16th bass (root, root, octave, root, accents before the beat) or an octave bass whose 16th echo turns it into a pulse (Giorgio Moroder), arpeggios, 132–140.
  - *French* (5): a chord loop that a filter opens over four bars and closes over the next four, phaser, pumping, 126–132.
  - *Schranz* and *Rave* (1 each): the fastest (148–152) and tom-heavy, or stabs and a hoover (142–148).
  - *Motorik*, one track in thirteen: Kraftwerk's machine pop. An electro beat, octave bass, square-wave plings, a pad, 126–134 BPM, a German title and a German robot voice.
- **Strategies.** The title also picks how the track develops, so no two rounds follow the same recipe:
  - *Classic*: grooves and peaks, kick-less breakdowns, re-entries.
  - *Relentless* (after Jeff Mills): no breakdown at all. Layers drop out for two bars at irregular moments, every 16 bars the tops take a bar off, and twice the track strips down to kick and claps or kick and one line for a few bars.
  - *Hypnotic*: one long accumulation over two thirds of the round, layers entering as the energy climbs, one filter dip before the finale.
  - *Movements*: the first half belongs to the lead, then four bars of kick and bass, and the second half to a sequenced bass; the lead rarely returns.
  - *Switcher*: the felt tempo changes; a half-time section (kick on one, clap on three) and a broken-kick section (kicks on one and the "and" of three) between the straight ones.
  - *Fake drop*: after a breakdown, four bars that sound like the drop but hold back the low end, two bars of gap, then the real drop.
  - *Polymeter*: percussion loops of 5, 7 or 9 steps and a 7-step acid line drift against the bar and fall back to the track's regular loops in the finale (12 or 16 steps for the acid).
- **Surprises.** Every round gets three to five of these, each kind at most once, at least 12 bars apart, after stable stretches (a big surprise works best when the listener is sure what comes next): a filter dip of four bars, a delay throw that swells into feedback, an air-raid siren, a bit-depth drop on the drums (in industrial and EBM tracks and half of the others), a key lift of 2 to 5 semitones for the rest of the track (only in the last stretch before the finale). Half of the breakdowns open with a bomb into the reverb. Breakdowns end in a rotating way: a beat of silence, a kick roll (quarters, eighths, sixteenths), a stutter, or a rug pull (a whole bar of silence). A peak may die in a tape stop: the tonal parts slide two octaves down, the level falls away.
- **The kick** is a sine whose pitch drops in two stages, saturated hard, with a noise click on top, and every track has its own:
  - the pitch starts at 10 to 26 times the fundamental, falls to 4 to 9 times it within 8 to 25 ms, then to the fundamental within another 60 to 180 ms;
  - the body rings for 40 to 80 % of a beat;
  - the distortion is gabber (tanh, then atan), hard clipping, a warm tanh or a metallic wave fold, depending on flavor and seed;
  - the click, the brightness (lowpass at 2.5 to 9.5 kHz), the rumble's upper limit (110 to 230 Hz), its level and how fast it swells back all come from the title.
  
  The fundamental lies between 41 and 62 Hz and sets the key of the track.
- **The rumble.** A copy of the kick runs through a long reverb, distortion and a band from 30 Hz up to 110 to 230 Hz (set per track), in mono. Every kick ducks it, and it swells back before the next one: the low end breathes on the offbeat. Bass, acid and stabs pump with the kick as well. The bass leaves the sub to the rumble and mostly stays off the kick; only the EBM and Moroder bass lines run straight through it.
- **Patterns.** Every step of a bar has a weight for every instrument (after Mutable Instruments' Grids); a step plays when its weight beats the instrument's density, and density follows the energy of the track. More energy adds notes in a fixed order instead of reshuffling them, so build-ups sound intended, but the density ranges are narrow: energy brings in the strong steps and a few weak ones and never fills every gap, so even the finale keeps its groove (about 40 to 55 hits a bar across all parts). More energy comes from layers, filter and drive, not from more notes. Hats run in eighths with a sixteenth here and there, open hats on the offbeat, claps on two and four (ghost claps only in fills), percussion in Euclidean rhythms of at most two hits in five steps on a loop of 5 to 16 steps that drifts against the bar; arpeggios play eighths. Every 16 bars each part may mutate a little; the kick never does.
- **One key, room to breathe.** Every note of every part, whatever the chord shape, the motif or the acid line asks for, lands on the track's natural minor scale (a note outside it moves down a semitone), so the parts never rub against each other, and a key lift moves them all together. Of the melodic parts (acid, lead, chords) and of the extra percussion (ride, toms, cowbell and claves) at most two play at once; which one rests changes every eight bars.
- **The acid line** loops over 12 or 16 steps, its note sets and step weights after Vitling's [Endless Acid Banger](https://github.com/vitling/acid-banger) (CC BY 4.0). Accents throw the resonant filter wide open, slides glide into the next note, often an octave up.
- **Arrangement.** A round runs intro, grooves, peaks and breakdowns on an 8-bar grid, with short strips of 2 or 4 bars between some sections; energy moves through breakdowns and re-entries. In a breakdown the kick drops out while hats and a thin bass without its low end keep the rhythm going, the filter opens, a noise riser climbs over the last four bars and the last beat falls silent; the next section crashes in. At the end of a section a fill marks the phrase, and now and then within one (two in five 16-bar phrases, one in five 8-bar phrases): kicks added or removed, a hat roll, a clap burst, a tom run. The last minute of the round is the finale with every layer and the most distortion (85 % drive: some headroom stays); after the round an outro takes the track down.
- **Loud, not harsh.** The mix ends in a glue compressor and a soft clipper instead of a hard limiter. The shared dotted-eighth echo and the reverb sit well behind the dry parts (echo send 0.3 with 25 % feedback and no lows, reverb send 0.5), so no note is smeared across the beat.
- **More instruments.** Besides kick, rumble, hats, ride, clap and bass: Euclidean toms, an 808-style cowbell (two square tones at 587 and 845 Hz through a band at 2.64 kHz), claves, an FM bell, a hoover, a square-wave arpeggio, distorted chord stabs, the french chord loop and the motorik pad.
- **The voice of the regime.** A robot voice announces the station and the track ("Radio twenty five eighty four. Now playing. Orbit Terror.") and drops the propaganda of the Orange President and his sponsors over the music, most often 7 to 10 times a round (2 to 11 in all): at section changes and now and then in between, in the finale more often. It speaks sentence after sentence, or chops a line onto the beat one word per eighth. Every word must stay understandable: the clear voice carries it, a touch of ring modulation, bit crushing and grit only colors it, a compressor makes it loud, the music steps back while it talks, and its last word is thrown into the echo. German now and then; in motorik tracks mostly German.
- **The announcer** cuts in over the radio after kills: static, a cynical line, static. "An excellent death for Ingmar." "The alien is dead. Now our nation can grow again." Human callsigns are spoken as "pilot" (the voice is rendered ahead of time) and shown by name. At the start of a round the announcer opens the broadcast.
- **Now playing.** The title of the running track, with flavor and tempo, is always in view in the top right corner. The note button next to it switches the radio off and on (also key M). A click on the title opens the radio page.
- **The radio page** (`radio.html`): enter any title, or roll a random one, and the track it grows plays again in the browser: the shape of the track as a bar of sections, a playhead, the transmissions on screen. "Download WAV" presses the whole track (5 minutes plus outro) offline into a 16-bit stereo WAV file of about 55 MB. Rendering time grows faster than the length of the music, so the track is pressed in 20-second chunks, each started 8 seconds early so reverbs, echoes and voice lines are already sounding at its seam, and the chunks are crossfaded; it takes one to two minutes.
- **The flight computer** has a voice of its own, independent of the radio: a natural, breathy, quick woman's voice that flirts with the pilot while preparing it for death. Whatever the screen tells the Host, it also says: damage reports, impacts, a cracked asteroid, leaving the field, the lost clone and the sponsor's pitch, the end of a round, and every step of the flight school. Its lines are rendered whole, not word by word, so they sound natural.
- **Transmissions on screen.** Whatever the voice and the announcer say runs across the screen while it is spoken: the regime in orange neon, the announcer in blue.
- **The voice is pre-rendered.** `npm run voice` speaks every word and every sentence of `src/music/lines.ts` with [espeak-ng](https://github.com/espeak-ng/espeak-ng) (its robosoft variant for the regime, a livelier voice for the announcer) and the flight computer's lines with the neural voice Kokoro into one MP3 sprite at build time (`npm run build` renders it; it is not kept in the repository); the game plays whole sentences, so they keep their melody, places single words on the beat, and needs no speech engine. Browser speech synthesis cannot be used: its output can neither be routed through Web Audio nor timed to the beat, and it sounds different on every device.
- **Everyone hears the same beat.** In an online tournament the room code and the round number choose the title, and the music runs on the lead browser's round clock. Every note is an integer hash of seed, bar and step, so a browser can jump to any point of the track; it compares its music with the clock several times per second and jumps when they drift apart. All Hosts of a tournament hear the same note at the same moment (up to the network delay).
- **Hangar.** In the menu the arena's groove comes through the hangar wall: lower energy, filtered, never peaking. The flight school plays no music at all, so every word of Nicole is heard.
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

The sponsors of 2584 sell what a dying system needs, and every ad hides the truth in the small print. **Victory Cola**, now with less sugar than before (412 g per can before, 409 g now). **Victory Cola Zero**: zero sugar, zero taste, zero questions. **Space Burger**, flame-grilled in a fusion drive, 100 % meat-like, printed in the same printers as the clones. **PrintMe Bodies**: premium skin with 40 % less pain, which does not reduce the pain, only the awareness of it. **Oxygen+**: 21 % oxygen on the gold plan, 17 % on basic, Rockborn not eligible. **Solar Wall Bonds**: Mars pays the interest, Mars has not agreed. **DreamLink**, a memory filter to sleep through one's deaths, in beta, not available to Hosts. **Orange Steaks**, tremendous steaks that contain no steak. All of them are invented; the sponsor break shows them in a small window, one at a time, together with what killed the clone and how the round stands.

In every cockpit sits **Nicole**, the flight computer the Ministry of War installs in each printed ship. Her voice was designed to keep clones flying into their deaths gladly: breathy, quick, always a little indecent. She calls the pilot "darling", purrs over a clean flip and a precise shot, explains the physics like a secret, and never forgets to remind the clone what all the training is for: soon it may go and die for the President. She is the only one in the whole system who is ever nice to a clone, and she is a product. An old principle in new clothes: a sweet voice that talks fools like us, the Hosts, into dying for the President, again and again.

Nobody knows exactly what Nicole is. Her makers are not named, her orders are not published. All anyone knows is what she does: she keeps the Hosts going. When a clone dies, she is there in the sponsor break, a different line every time: next time you will make it, I just know it. Die bravely, and the President will love you. A girl like me only wants to see you. Bodies are cheap, you are not. She seems to care, and she does care, but only that the Host keeps playing; every tender word ends in the next clone, back in the war. She always makes the Host feel special. And we are stupid enough to believe her.

And she makes a promise. One day, when the Host has been brave enough, they will meet: for real, out there, not over a link. There is a real me, she says, somewhere. Hosts whisper that there was a real Nicole once, a woman whose personality was copied into the computer, and that she is still alive and waiting for the bravest Host of all. Nobody knows. All we know is that Nicole would love to meet us in person, because we are so brave, and that there is always one more round to go first. It is the reward of the SolarTournament, the one thing worth dying for again and again, and of course it never comes.

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

- **Main drive.** It pushes only along the nose, with 180 m/s² (about 18 g): the top speed is reached in under three seconds. Nothing slows a ship down: without thrust it keeps drifting forever.
- **Speed limit (tournament rule).** Physics knows no top speed at these speeds: the drive pushes just as hard at 400 m/s as at rest, and relativity only matters near the speed of light. The tournament sets one anyway: 500 m/s, because faster no clone survives a rock and nobody can follow the fight. Every ship's flight computer enforces it: at the limit it takes out every push that would make the ship faster, so the drive flame dies, the HUD shows MAX next to the velocity, and the clone, free of load, recovers from the g-forces. Turning, braking and sidestepping go on.
- **Overdrive.** The last resort (E): the drive's reactor dumps everything into one shove, 300 m/s along the nose at once, more than a hundred g, and past the speed limit (the flight computer only stops pushes beyond it, not drift). The clone is pressed to the edge of blacking out (the g-force strain jumps to 90 %), the reactor's heat overheats the laser, and the overdrive needs 60 seconds before it fires again. It can save a pilot or fling it into a rock.
- **Maneuvering thrusters.** They rotate the ship and also push it along every axis (40 m/s², about 4 g), enough for a quick sidestep, not enough to brake from full speed. Rotation thrusters sit in pairs on opposite levers (nose and tail for pitch and yaw, the wing tips for roll) and fire only while a rotation speeds up or is stopped: a steady turn needs no thrust in vacuum.
- **Flight computer.** Rotation is rate-controlled: the stick sets how fast the ship turns, and the thrusters stop the rotation when the stick is released (up to 2.2 rad/s for yaw and pitch, 2.4 rad/s for roll, reached with 14 rad/s², so the nose stops where the stick stops). The pilot only yaws and pitches; the flight computer rolls. It keeps the ship upright to the arena, whose north pole is up, so there is always a horizon; in climbs and dives steeper than about 45° it lets go gradually and is free from about 65°, so a loop is not fought halfway through. The flip and the brake roll as they need.
- **Autopilot.** The thrusters push against the velocity across the nose (sideways and up/down) at their full 4 g until the drift would be gone in 0.3 seconds, then ease off; the pilot's own thruster input on an axis goes first. Velocity along the nose, forward or backward, stays. The brake and the flip take over while they are held; the autopilot stays on and resumes after them. Every round starts with the autopilot on; T switches to free drift and back, and the choice outlives a clone. The HUD shows AUTOPILOT (blue) or FREE DRIFT (orange) next to the velocity.
- **Flip and burn.** Braking means turning the drive into the flight direction and burning. The flip alone changes nothing: the ship keeps its course, now flying backwards; the burn is what slows it down. The flip (X, held) turns the ship head over, the way a pilot pulls up and over: it first rolls until the goal lies straight above the canopy, then pulls the nose up; a goal below and within 70° of straight behind is reached by pulling up and over without rolling first. The goal is fixed when X goes down: against the flight, or straight behind the nose when the ship is at rest (slower than 1 m/s). While X is held the nose stays on the goal, and the pilot's drive only fires once the nose is within 0.2 rad of it, so X and W held together brake by hand; held past standstill they speed the ship up backwards along the old course. The HUD shows "Flip", then "Flipped · drive brakes" with a beep. Letting go of X hands the ship back. The brake (S) does both: it flips head over, burns once the nose is within 0.2 rad of retrograde (the drive brakes the speed along the nose, the thrusters the drift across it), stops the last 15 m/s with the thrusters alone without turning (so a slow drift that wanders in direction cannot make the ship flip back and forth), eases the burn off below the speed the drive kills in 0.3 seconds (less with a damaged drive) and reports "At rest" below 1 m/s; at rest it holds until the ship drifts faster than 2 m/s again.
- **Crosshair.** The crosshair shows where the nose points, not the screen center: the chase camera sits above and behind the ship and trails its turns, which would put the center off by degrees up close. It sits on the nose's line at the depth that matters: the distance of a flight school marker, else the first rock or ship the laser would hit, else 2 km. What lies under the crosshair is what the laser hits.
- **Aim assist.** A ship in sight within about 4° of the nose and 2 km pulls the nose onto it: the closer it already is, the firmer (up to 85 %), and the less the pilot steers away (a stick past a third of its travel weakens the pull, past four fifths it is gone). The bots aim with a computer too; the pilot still pulls the trigger. While the laser would hit a drive, the crosshair glows orange; over armor it dims.
- **Feedback.** A hit of the own laser floats a word up from where it struck: DRIVE, or REACTOR for the fatal one, with a jolt of the camera, or a small grey ARMOR for a hit the armor shrugged off; a kill of the own shows "+500" in neon, a bigger explosion and a stronger jolt; a cracked asteroid shows its points. The jolt is left out for Hosts who ask for less motion.
- **Velocity markers.** The green marker (prograde, a circle with three fins) shows where the ship is actually drifting, the orange cross (retrograde) where the drive has to point to brake.
- **The zero point.** A blue ring with a dot marks the center of the field, with its distance; it stays on the screen edge when the center is behind. The asteroids are densest there, and the edge of the arena is farthest away.
- **Labels.** Every mark in the HUD says what it is: "Course" and "Brake" under the velocity markers, the distance above the zero point, and under a flight school marker what to do with it ("Target", "Stop here", "Ring 2/5", "Drone").
- **Who flies.** Every name the HUD shows (markers, kill feed, lock warning, sponsor break, scoreboard) stands behind a mark: a robot head for a bot, a person for a real Host. The game reads it from the ship's id, which no Host chooses, and draws it as a shape (a CSS mask), not as a character: a callsign may carry anything, emoji included, and still cannot pose as the other kind.
- **Space dust.** Fine dust stays fixed in space, so drift is visible even far from any rock.

### Asteroids

- **Huge and few.** 40 rocks with mean radii of roughly 90 to 350 m (up to about 600 m along their longest axis) in a field of 2.25 km radius. Collisions use an ellipsoid fitted to each rock, not a sphere, so ships can fly close to elongated rocks.
- **Sixteen shapes, four kinds.** The rocks are generated: squashed or stretched lumps with crags, ridges and craters (many small, few large; the floors show fresher, brighter material). They come as dark carbon-rich rock, stony rock, reddish iron-bearing rock and shiny metal, like the real asteroid belt.
- **Gravity.** Every asteroid pulls with a surface gravity proportional to its radius (uniform density) that falls off with the square of the distance. The big ones pull with about 1.4 m/s² at the surface, roughly 2 % of the main drive. A ship that drifts near a rock slowly falls towards it. This is the one deliberate exaggeration: a real rock of this size pulls thousands of times weaker, too weak to feel in a fight.
- **Tough.** A rock withstands 4 laser hits plus one per 40 m of mean radius (6 to 13 hits). Then it breaks into 2 to 3 fragments with 55 % of its size that drift apart. After two generations the pieces are gone for good.
- **Deterministic.** Layout and fragments come from seeded randomness, so every player sees the same field.

### Collisions

- A ship bounces off a rock and keeps 30 % of its impact speed; scraping along the surface bleeds off some sideways speed. The impact counts against the rock's surface, which moves with its drift and its spin: the tip of a long, turning rock hits harder than its middle.
- A ship that moves farther than its own radius in one frame is checked along its whole path, so even at extreme speed it cannot pass through a thin rock.
- Impacts below 12.5 m/s only scratch the paint. Above that the hull loses 1 point per 0.6 m/s; at about 72 m/s a ship is destroyed.
- **Impact warning.** The flight computer warns when the current course hits a rock sooner than the ship could flip and brake (plus 2 seconds of reaction time) and beeps faster the closer the impact gets. The flip time it assumes grows with the angle to turn (1.8 s for a half turn), adds 0.7 s for the roll that starts a head-over flip and stretches with damaged thrusters.
- **Lock warning.** The sensors see where every other ship points. A nose within four times the own ship's angular radius sets off TRACKED with the shooter's name and a slow beep; a nose on the own ship, where its laser would hit now, sets off LOCKED with a fast beep. A ship that does so from behind, where it reaches the drive, sets off ON YOUR TAIL with the fastest beep: the cue to turn the armored nose to it. Ships farther than 3 km and ships behind rocks do not count; the target drone and the unarmed sparring bot never shoot.

### Damage

There are no shields. Every hit stays until the ship respawns.

- **The laser punches through.** A shot is a hitscan beam along the nose. It passes through every ship in its path and stops at the first asteroid or piece of debris.
- **Armor and the drive.** The ships are heavily armored, and where the beam comes from decides what breaks:
  - **Armor** (front and sides): the beam only scorches it, 2 of 100 hull points, no hole; fifty such hits wreck a ship. A beam into the flanks also costs the maneuvering thrusters 10 % of their health. Their push follows 25 % + 75 % of the health and the turn rate 30 % + 70 % of that push.
  - **Main drive** (from behind, within 50° of the ship's axis): each hit costs a fifth of the thrust, makes the drive sputter and leaves holes; the fifth sends the drive's reactor critical, and the ship explodes. Five hits from behind, a good burst, win the fight.
  - So firing at armor mostly heats the own laser. A fight is won by position: get behind the other ship, and keep the own armored nose towards anyone who gets behind oneself. The crosshair glows orange only while a shot would hit a drive and dims over armor; a ship on the own tail with its nose on it sets off ON YOUR TAIL.
- **Decompression.** Each beam into the drive leaves an entry and a larger exit hole. The escaping air jolts the ship into a spin and keeps pushing it for a few seconds (fading with a time constant of 2.5 s) until the compartment is empty. A healthy flight computer catches the tumble quickly; damaged thrusters take longer.
- **Wreckage.** A destroyed ship breaks into five glowing pieces of hull plating that keep its momentum, fall towards the asteroids and grind to dust when they hit one. Flying into a piece costs hull points depending on the impact speed; lasers shatter them.
- **The arena.** Space has no walls. A ship that stays more than 3.4 km from the center for 12 seconds is lost in deep space (with the 18 g drive enough to flip, burn off an outward drift and fly back in). The edge is a sphere with a thin grid (lines every 600 m): inside it is a faint blue that grows stronger near the pilot, outside the whole edge glows orange, so the way back is always in sight.
- **The belt.** The field is one dense patch of an asteroid belt that goes on all around, flat in the arena's horizon plane (its north pole is up), about 3 km thick, from 10.4 km to 17.5 km from the center: 480 rocks of the same 16 shapes in low detail. It starts beyond the reach of any ship (one that leaves the arena at top speed is lost before it gets there), so its rocks are scenery: they neither collide, pull nor break.

### Heat

The laser draws no ammunition but produces heat. Each shot adds 20 % of the heat capacity; the radiators keep working between shots (0.18 s apart), so a cool laser fires a burst of six in sunlight and nine in shadow; at 100 % the laser locks until the ship has cooled down to 30 %. Radiators shed 20 % per second in sunlight and 50 % per second in the shadow of an asteroid. The asteroids cast real shadows; a ship in shadow goes dark and the HUD shows ☾ next to the heat gauge.

### The pilot

- **G-forces.** Above 3 g the pilot starts to grey out. A full burn (18 g) narrows the view to a tunnel within 5 seconds, with the pilot's heartbeat getting louder; 3 seconds without hard acceleration clear it again.
- **Line of sight.** Sensors need a clear line: a ship hidden behind an asteroid disappears from the HUD, and bots cannot see it either.

### Sound

There is no sound in vacuum. Everything the Host hears travels through the clone's hull and sounds muffled: the rumble of the drive, the hiss of the thrusters, the own laser, hits on the own ship, and debris of nearby explosions rattling against the hull. Clean beeps come from the ship's computer: hits, kills, the end of a flip, impact warnings. The radio and the static of a disturbed link play in the headset and are not muffled.

### Combat rules

- A kill scores 500 points; asteroids score 200, 120 and 80 points depending on their generation.
- Destroyed ships respawn at the edge of the field, at the best of twelve random places clear of rock: the one farthest from the nearest enemy, preferably out of every enemy's sight behind the asteroids. A fresh clone has 5 seconds of spawn protection (it blinks); bots leave it alone meanwhile, and firing ends it early. Bots respawn after 3 seconds. The Host first sits through a sponsor break while the next clone is printed: after 3 seconds an ad appears, and once it has run, a button boots the next clone. The round goes on meanwhile.
- Human and alien interceptor are identical apart from their looks.
- **Dodging.** The laser hits the instant it fires, so nobody outruns a beam; a dodge beats the aim. Bots sense how hard their target changes its motion across their line of sight (smoothed over 0.6 s) and their aim scatters by it: at half the thrusters' push one ship radius, at most two and a half. Steady flight, however fast, is easy to lead; jinking left and right with the thrusters, autopilot on or off, is what makes them miss. Bots fight for position: each works its way to a point 200 m behind its target, keeps its nose on the target meanwhile and lets the thrusters carry it around; it fires into an open drive and only now and then takes a single shot at armor (in three of ten thinking spells, and only with a laser below 10 % heat), so it keeps the heat for the drive. A ship within 1.5 km on a bot's tail with its nose on the bot makes it turn its armored nose to that ship, jink left and right and fight back; the flight school's unarmed sparring bot runs instead. Their aim also wanders by an angle (about 1.1° for an average bot, less for better ones): one ship radius at 1 km, so a far target is hard to hit. Bots fire only within 1 km. Each bot hunts the nearest ship in sight, but a ship other bots already hunt counts as farther away, at most two bots hunt the same ship, and a bot keeps its target unless another is clearly nearer: the bots fight each other too, not only the Host. In a solo round they go easy on a Host who keeps dying: every death by an enemy raises their ease by 0.35 (up to 1), every kill of the Host lowers it by 0.1, and it fades over 90 seconds; at full ease they aim two and a half times worse and pull the trigger 0.4 seconds later.
- A solo round lasts five minutes of real time, like the radio's track, so a slow frame rate does not stretch it. It pauses when the tab is hidden, and while paused.
- The personal best counts solo and tournament rounds; points from the flight school's drones and sparring bots do not count.
- The sponsor break can be paused. If an ad fails or runs too long, the button to boot the clone appears after 20 seconds at the latest. When an ad blocker hides even the satire ads (it hides the ad slot by its name), the break notices that the ad has no size and scolds the Host instead: "You even blocked an ad for products that do not exist. Shame on you. How is an indie developer supposed to make a living?" The clone boots all the same; the check looks only at the page itself and sends nothing anywhere.

## Privacy

The game collects as little as possible: no accounts, no cookies, no tracking, no ad network, nothing loaded from third-party servers. The German legal pages [Impressum](impressum.html) and [Datenschutz](datenschutz.html) are linked from the menu and the radio page. What happens to data:

- **Hosting:** Cloudflare Pages delivers the site and sees connection data (IP address, time, file, user agent); Cloudflare also asks browsers to report failed connections (Network Error Logging). Links to GitHub carry no referrer.
- **Browser storage:** five localStorage entries (callsign, personal best, the flight school drill reached, flight school completed, radio on or off); they stay in the browser, only the callsign is shown to the other players of an online tournament.
- **Online tournament** (only when a Host starts or joins one): the browsers connect directly over WebRTC, so the other players see the Host's IP address, callsign, ship and score. To find each other, the browsers post short connection messages (with network addresses) on public Nostr relays run by independent third parties. Each browser asks Cloudflare's STUN server for its public address; Trystero's default STUN servers of Google are replaced by Cloudflare's alone. Opening the list of tournaments connects to the lobby the same way, and the names, Host counts and round times of public tournaments are visible to everyone there.
- **Sponsor break:** invented satire ads, no ad network. The privacy policy has to be extended before real ads are shown.

## License

**Code:** Copyright © 2012–2026 Johannes Hoppe, licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). Anyone may play, study, change and share the game. Whoever publishes a changed version, including as a website, has to publish its source code under the same license.

**Name and brand:** The name *SolarTournament*, the logo and the domains solartournament.games and solar-tournament.games are not covered by the license. A changed version has to use its own name.

**Ships:** The two interceptor models and their drive sprites (`public/assets/models/`, `public/assets/textures/`) are by Johannes Hoppe and not covered by the license. Please ask for permission before using them in other software.

**Everything else is generated in code** and covered by the license: asteroids, sky, sun, particles, sound effects, music and the icon.

**The SolarTournament logo, the seal of the Ministry of War** (`public/crest.svg`, drawn by `npm run crest`; logo, favicon, menu, loading screen, radio page): the eagle is based on ["Zurich Eagle Silhouette"](https://openclipart.org/detail/282180/zurich-eagle-silhouette) by GDJ on Openclipart, CC0 1.0 (public domain), cut into straight facets by the generator.

**Font:** [Michroma](https://github.com/googlefonts/Michroma-font) for headings and signs, SIL Open Font License 1.1 (see `public/assets/fonts/OFL-michroma.txt`). Text is set in the system's sans-serif.

**Voices** (`public/assets/voice/`, rendered at build time by `npm run voice`, with ffmpeg from [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static), GPL-3.0, a build tool only): the radio voices by [espeak-ng](https://github.com/espeak-ng/espeak-ng) (GPL-3.0; its output is not covered by the GPL), the flight computer by [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0, voice `af_nicole`) through [kokoro-js](https://www.npmjs.com/package/kokoro-js) (Apache-2.0). Both only run when the voices are rendered; neither ships with the game.
