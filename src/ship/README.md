# src/ship

The ships and who flies them. Human and alien interceptor (and the Sovereign) fly by the same rules; only their looks differ.

| File | What it does |
|---|---|
| `ship.ts` | A ship: its body (an interceptor's mass, see world/bodies), hull, hit zones, holes and decompression, laser heat, the clone's g-force strain, drive animation; how one ship's nose lies on another, as the lock warning and the bots read it |
| `flight.ts` | The Newtonian flight model and its flight computer (`steer()`), and path steering, the autopilot's way of flying: the stick turns the path, drive and thrusters bend it |
| `flight.test.ts` | Path steering: how tight it turns at the speed limit, flying straight on when let go, the nose by the stick when slow |
| `impact.ts` | Striking a surface: the bounce and the scrape (a bump of bodies, see world/bodies; a livelier body passes its own restitution), the damage; two ships ramming each other, hurt by where they are struck |
| `models.ts` | The interceptors' low-poly hulls, built in code, each in its own wear (see `view/surfaces.ts`) under a clear lacquer, shaded round with hard edges, with the light strips of the neon trim fitted along their flanks and across their sterns, hidden until worn |
| `bots.ts` | The bot AI: where to fly, dogfights, aiming with spread (wider under g-force strain), keeping clear of other ships and of the rings' housings, shoving a rival into rock, a hand that eases commands in, the timing of a race's start, the skills of each bot; it knows only what a Host's sensors show |
| `bots.test.ts` | Bots fly by the Hosts' rules: their commands stay within a Host's stick, drive and thrusters and never move the ship themselves, no target behind rock, beyond sight or in a storm, a thief chased but not fired at unseen, hunters read from noses, the start's timing; the clone's strain and the nose on a ship as the sensors see it |

Bots fly by the same rules as Hosts and know only what a Host's sensors show; a new ability of a ship is given to bots through their controls, never by setting their state. Bots are tuned with the balance runs (`npm run balance`, see `e2e/`): run them after every change here.
