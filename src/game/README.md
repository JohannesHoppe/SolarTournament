# src/game

The round and its rules. `game.ts` holds the `Game` class: states (menu, playing, paused, results), the round's flow, lasers, collisions, the camera and the clone's body; it hands the other parts of this folder what they need each frame.

| File | What it does |
|---|---|
| `game.ts` | The game: round flow and each round's opening show, scoring, respawns, warnings, the menus' wiring |
| `alarms.ts` | The tiered alarms (caution, warning, critical), their tones (a countdown beat for an impact or a torpedo), and the escape load of a gravity well |
| `race.ts` | Round and room modes; the race course of gates (a gentle loop, flown at the speed limit), its points, where a flight crosses a ring's plane, and how a racer comes at its next gate clear of the housings |
| `survival.ts` | Last Clone Standing: clones per round, the solar flare's plasma coming from the sun and the safe pocket it leaves |
| `flags.ts` | Capture the Flag: sides, bases, sponsor cores, taking one (touch or hook shot), captures (the core itself through the ring); a core in tow as a trailer on the hook's rope (mass, jerks, bumps), adrift with its thrusters braking; the way a carrier flies home through the ring; how a core is shown (faded where it would hide the ship or the crosshair) |
| `fleet.ts` | The President's Fleet: the battleship, its parts, phases and sinking |
| `torpedoes.ts` | Torpedoes: launch, the flight (top speed, nose first, a seeker that reads its target late, less agile than a ship), the fuse at the hull, burnout, shot down by lasers; one on a hook's rope (a bomb on a string: its motor against the rope, its fuse live for every ship, the kill its holder's) |
| `comet.ts` | Comets crossing the arena: schedule and route (bent and swallowed by a well), the shower's pieces, the head breaking rock and shoving hull, the comet as the scene shows it |
| `items.ts` | Sponsor probes and what they carry; a probe on a hook's cable, and its flight back to its slot once the cable is gone |
| `hook.ts` | The hook: harpoon (it bites rock, ships, probes, torpedoes and a core of Capture the Flag), cable, winch (one force on both ends, so a probe comes in fast and barely moves its ship), swing; the cable as a rope between two bodies (see world/bodies), also a core's tow cable, and the tug of war on it; the cables' lines |
| `racingline.ts` | The ideal line through gates or rings, swerving around rock in gentle bumps; where a racer flies for (back on a wide loop to a gate it missed); how tight a line bends |
| `laps.ts` | Lap clock, splits, the best lap and its ghost |
| `hangar.ts` | Solar Coins, the wallet's cap, upgrades and their prices; the hangar as the browser keeps it, and what in it only an edit puts there |
| `school.ts` | The flight school: five courses, their drills and markers; the completed courses as the browser keeps them |
| `coach.ts` | Nicole's briefings and tips in real rounds |
| `moments.ts` | The own pilot's big moments (streaks, revenge, a knockout, …): banner, crowd and announcer |
| `sponsors.ts`, `satire-ads.ts` | The sponsor break before a respawn, and its invented sponsors |

Every rule here is also written down in the repository's README with its numbers; a change to one changes the other in the same commit. The `*.test.ts` files test the deterministic parts (`npm test`); `courses.test.ts` flies every race course and every course of the flight school with a bot of middling skill, and the dash into cover from the cover drill's torpedo; `playability.test.ts`, `hostrace.test.ts` and `hostrace2.test.ts` fly them with a simulated Host at the mouse (see `src/test/human.ts`): what it cannot fly, no Host will; `torpedoes.test.ts` flies torpedoes against ships flying straight, breaking, jinking and dodging.
