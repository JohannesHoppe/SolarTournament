# src/ship

The ships and who flies them. Human and alien interceptor (and the Sovereign) fly by the same rules; only their looks differ.

| File | What it does |
|---|---|
| `ship.ts` | A ship: hull, hit zones, holes and decompression, laser heat, drive animation |
| `flight.ts` | The Newtonian flight model and its flight computer (`steer()`), and path steering, the autopilot's way of flying: steering moves a course in the world, and drive and thrusters bring the flight onto it at every speed |
| `flight.test.ts` | Path steering with realistic input (`src/test/cockpit.ts`): the pointer held off center, a hand sweeping it, a turn about at 150 m/s, the autopilot taking over from free drift, switching modes in a turn, gravity, a steady turn and race bends at full speed, the nose at rest; how fast the flight comes onto the course and how far it swings past; a recorded flight replaying the same |
| `computer.ts` | The own ship's flight computer besides path steering: the upright hold, the brake to rest, the aim assist; the game and the simulated Host of the tests fly with it |
| `impact.ts` | Striking a surface: the bounce, the scrape, the damage; two ships ramming each other, hurt by where they are struck |
| `models.ts` | The interceptors' low-poly hulls, built in code, each in its own wear (see `view/surfaces.ts`) under a clear lacquer, shaded round with hard edges, with the light strips of the neon trim fitted along their flanks and across their sterns, hidden until worn |
| `bots.ts` | The bot AI: where to fly, dogfights, aiming with spread, keeping clear of other ships and of the rings' housings, shoving a rival into rock, a hand that eases commands in, the skills of each bot |

Bots are tuned with the balance runs (`npm run balance`, see `e2e/`): run them after every change here.
