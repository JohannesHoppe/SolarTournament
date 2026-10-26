# src/ship

The ships and who flies them. Human and alien interceptor (and the Sovereign) fly by the same rules; only their looks differ.

| File | What it does |
|---|---|
| `ship.ts` | A ship: its body (an interceptor's mass, see world/bodies), hull, hit zones, holes and decompression, laser heat, the clone's g-force strain, drive animation; how one ship's nose lies on another, as the lock warning and the bots read it |
| `flight.ts` | The Newtonian flight model and its flight computer (`steer()`), and path steering, the autopilot's way of flying: steering moves a course in the world, and drive and thrusters bring the flight onto it at every speed |
| `flight.test.ts` | Path steering with realistic input (`src/test/cockpit.ts`): the pointer held off center, a hand sweeping it, a turn about at 150 m/s, the autopilot taking over from free drift, switching modes in a turn, gravity, a steady turn and race bends at full speed, the nose at rest; how fast the flight comes onto the course and how far it swings past; a recorded flight replaying the same |
| `computer.ts` | The own ship's flight computer besides path steering: the upright hold, the brake to rest, the aim assist; the game and the simulated Host of the tests fly with it |
| `impact.ts` | Striking a surface: the bounce and the scrape (a bump of bodies, see world/bodies; a livelier body passes its own restitution), the damage; two ships ramming each other, hurt by where they are struck |
| `models.ts` | The interceptors' low-poly hulls, built in code, each in its own wear (see `view/surfaces.ts`) under a clear lacquer, shaded round with hard edges, with the light strips of the neon trim fitted along their flanks and across their sterns, hidden until worn |
| `bots.ts` | The bot AI: where to fly, dogfights, aiming with spread (wider under g-force strain), keeping clear of rock along the tube its hull sweeps, of other ships and of the rings' housings, shoving a rival into rock, a hand that eases commands in, the timing of a race's start, the skills of each bot; it knows only what a Host's sensors show |
| `bots.test.ts` | Bots fly by the Hosts' rules: their commands stay within a Host's stick, drive and thrusters and never move the ship themselves, no target behind rock, beyond sight or in a storm, a thief chased but not fired at unseen, the hull kept clear of a rock the line of flight only just misses, hunters read from noses and only within the bot's own sight, the even skills of a made-up name (also one every object inherits), the start's timing, the skill curve (the better, the quicker and closer, but never faster than a quick Host nor exact); the clone's strain and the nose on a ship as the sensors see it |
| `tints.ts` | The colors ships are marked in: the palette of neon tints a Host picks from (kept in the browser), each bot's own, the Sovereign's ivory and gold, how two Hosts with the same choice are told apart, the side's color in Capture the Flag |
| `tints.test.ts` | The palette: bright, clear of the HUD's azure, the sides' colors, red and each other; every bot its own tint; the tie rule between Hosts |

Bots fly by the same rules as Hosts and know only what a Host's sensors show; a new ability of a ship is given to bots through their controls, never by setting their state. Bots are tuned with the balance runs (`npm run balance`, see `e2e/`): run them after every change here.
