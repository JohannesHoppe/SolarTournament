# src/game

The round and its rules. `game.ts` holds the `Game` class: states (menu, playing, paused, results), the round's flow, lasers, collisions, the camera and the clone's body; it hands the other parts of this folder what they need each frame.

| File | What it does |
|---|---|
| `game.ts` | The game: round flow and each round's opening show, scoring, respawns, warnings, the menus' wiring |
| `alarms.ts` | The tiered alarms (caution, warning, critical), their tones (a countdown beat for an impact or a torpedo), and the escape load of a gravity well |
| `race.ts` | Round and room modes; the race course of gates (a gentle loop, flown at the speed limit), its points, where a flight crosses a ring's plane, and how a racer comes at its next gate clear of the housings |
| `survival.ts` | Last Clone Standing: clones per round, the solar flare's plasma coming from the sun and the safe pocket it leaves |
| `flags.ts` | Capture the Flag: sides, bases, sponsor cores, captures; how a core is shown (on its tow cable, out of the chase camera's view, faded where it would hide the ship or the crosshair) |
| `fleet.ts` | The President's Fleet: the battleship, its parts, phases and sinking |
| `torpedoes.ts` | Torpedoes: launch, the flight (top speed, nose first, a seeker that reads its target late, less agile than a ship), the fuse at the hull, burnout, shot down by lasers |
| `comet.ts` | Comets crossing the arena: schedule and route (bent and swallowed by a well), the shower's pieces, the head breaking rock and shoving hull, the comet as the scene shows it |
| `items.ts` | Sponsor probes and what they carry |
| `hook.ts` | The hook: harpoon, cable, winch, swing; the cables' lines (also a core's tow cable) |
| `racingline.ts` | The ideal line through gates or rings, bowing around rock; how tight a line bends |
| `laps.ts` | Lap clock, splits, the best lap and its ghost |
| `hangar.ts` | Solar Coins, upgrades and their prices |
| `school.ts` | The flight school: five courses, their drills and markers |
| `coach.ts` | Nicole's briefings and tips in real rounds |
| `moments.ts` | The own pilot's big moments (streaks, revenge, a knockout, …): banner, crowd and announcer |
| `sponsors.ts`, `satire-ads.ts` | The sponsor break before a respawn, and its invented sponsors |

Every rule here is also written down in the repository's README with its numbers; a change to one changes the other in the same commit. The `*.test.ts` files test the deterministic parts (`npm test`); `courses.test.ts` flies every race course and every course of the flight school with a bot of middling skill, and the dash into cover from the cover drill's torpedo; `torpedoes.test.ts` flies torpedoes against ships flying straight, breaking, jinking and dodging.
