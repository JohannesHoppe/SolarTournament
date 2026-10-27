# src/game

The round and its rules. `game.ts` holds the `Game` class: states (menu, playing, paused, results), the round's flow, lasers, collisions, the camera and the clone's body; it hands the other parts of this folder what they need each frame.

| File | What it does |
|---|---|
| `game.ts` | The game: round flow and each round's opening show, scoring, respawns, warnings, the menus' wiring |
| `alarms.ts` | The tiered alarms (caution, warning, critical), their tones (a countdown beat for an impact or a torpedo), and the escape load of a gravity well |
| `race.ts` | Round and room modes; when a round takes a new start from its clock (online only by a jitter's worth once known); the race course of gates (a smooth loop of the shape that runs through least rock, its gates off the racing line's bows, flown at the speed limit; in a planet's air along its cloud deck), its points, where a flight crosses a ring's plane, and how a racer comes at its next gate clear of the housings |
| `survival.ts` | Last Clone Standing: clones per round, the solar flare's plasma coming from the sun and the safe pocket it leaves |
| `flags.ts` | Capture the Flag: sides, bases, sponsor cores, taking one (touch or hook shot), captures (the core itself through the ring); a core in tow as a trailer on the hook's rope (mass, jerks, bumps), adrift with its thrusters braking; the way a carrier flies home through the ring; how a core is shown (faded where it would hide the ship or the crosshair) |
| `fleet.ts` | The President's Fleet: the battleship, its parts, phases and sinking |
| `torpedoes.ts` | Torpedoes: launch, the flight (top speed, nose first, a seeker that reads its target late, less agile than a ship), the fuse at the hull, burnout, shot down by lasers; one on a hook's rope (a bomb on a string: its motor against the rope, its fuse live for every ship, the kill its holder's) |
| `comet.ts` | Comets crossing the arena: schedule and route (bent and swallowed by a well), the shower's pieces, the head breaking rock and shoving hull, the comet as the scene shows it (head, coma, the two harmless tails streaming away from the sun, the shower glinting orange, dust streaking past inside a tail) and how deep a point lies in a tail |
| `items.ts` | Sponsor probes and what they carry; a probe on a hook's cable, and its flight back to its slot once the cable is gone |
| `hook.ts` | The hook: harpoon (it bites rock, ships, probes, torpedoes and a core of Capture the Flag), cable, winch (one force on both ends, so a probe comes in fast and barely moves its ship), swing; the cable as a rope between two bodies (see world/bodies), also a core's tow cable, and the tug of war on it; the cables' lines; which of two hooks that bit one probe or torpedo at once keeps it (the lower id, alike on every browser) |
| `racingline.ts` | The ideal line through gates or rings, bowing around rock as an elastic band that bends no tighter than the autopilot turns at the speed limit, with a quarter to spare; where a racer flies for (back on a wide loop to a gate it missed); how tight a line bends |
| `laps.ts` | Lap clock, splits, the best lap and its ghost |
| `hangar.ts` | Solar Coins, the wallet's cap, upgrades and their prices; the hangar as the browser keeps it, and what in it only an edit puts there |
| `school.ts` | The flight school: five courses, their drills and markers (ring courses tilted clear of rock); the completed courses as the browser keeps them |
| `coach.ts` | Nicole's briefings and tips in real rounds |
| `moments.ts` | The own pilot's big moments (streaks, revenge, a knockout, …): banner, crowd and announcer |
| `sponsors.ts`, `satire-ads.ts` | The sponsor break before a respawn, how long a Host's and a bot's next clone takes, and the invented sponsors; `sponsors.test.ts` holds a bot to a Host's soonest wait |

Every rule here is also written down in the repository's README with its numbers; a change to one changes the other in the same commit. The `*.test.ts` files test the deterministic parts (`npm test`); `courses.test.ts` flies every race course, and every course of the flight school in the default arena, with a bot of middling skill, and the dash into cover from the cover drill's torpedo; `playability.test.ts`, `hostrace.test.ts` and `hostrace2.test.ts` fly them with a simulated Host at the mouse (see `src/test/human.ts`): what it cannot fly, no Host will; `torpedoes.test.ts` flies torpedoes against ships flying straight, breaking, jinking and dodging; `school.test.ts` judges a drill done before failed, so the last torpedo's hit and a kill with the shot that overheats count.
