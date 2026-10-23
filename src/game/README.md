# src/game

The round and its rules. `game.ts` holds the `Game` class: states (menu, playing, paused, results), the round's flow, lasers, collisions, the camera and the clone's body; it hands the other parts of this folder what they need each frame.

| File | What it does |
|---|---|
| `game.ts` | The game: round flow and each round's opening show, scoring, respawns, warnings, the menus' wiring |
| `alarms.ts` | The tiered alarms (caution, warning, critical), their tones, and the escape load of a gravity well |
| `race.ts` | Round and room modes; the race course of gates and its points |
| `survival.ts` | Last Clone Standing: clones per round, the solar flare closing in |
| `flags.ts` | Capture the Flag: sides, bases, sponsor cores, captures |
| `fleet.ts` | The President's Fleet: the battleship, its parts, phases and sinking |
| `torpedoes.ts` | Torpedoes: launch, homing, fuse, shot down by lasers |
| `comet.ts` | Comets crossing the arena: schedule and route (bent and swallowed by a well), the shower's pieces, the head breaking rock and shoving hull, the comet as the scene shows it |
| `items.ts` | Sponsor probes and what they carry |
| `hook.ts` | The hook: harpoon, cable, winch, swing |
| `racingline.ts` | The ideal line through gates or rings, bowing around rock |
| `laps.ts` | Lap clock, splits, the best lap and its ghost |
| `hangar.ts` | Solar Coins, upgrades and their prices |
| `school.ts` | The flight school: five courses, their drills and markers |
| `coach.ts` | Nicole's briefings and tips in real rounds |
| `moments.ts` | The own pilot's big moments: banner, crowd and announcer |
| `sponsors.ts`, `satire-ads.ts` | The sponsor break before a respawn, and its invented sponsors |

Every rule here is also written down in the repository's README with its numbers; a change to one changes the other in the same commit. The `*.test.ts` files test the deterministic parts (`npm test`); `courses.test.ts` flies every race course and ring drill with a bot of middling skill.
