# src/ship

The ships and who flies them. Human and alien interceptor (and the Sovereign) fly by the same rules; only their looks differ.

| File | What it does |
|---|---|
| `ship.ts` | A ship: hull, hit zones, holes and decompression, laser heat, drive animation |
| `flight.ts` | The Newtonian flight model and its flight computer (`steer()`) |
| `impact.ts` | Striking a surface: the bounce, the scrape, the damage |
| `models.ts` | The interceptors' low-poly hulls, built in code, each in its own wear (see `view/surfaces.ts`), with the light strips of the neon trim fitted along their flanks and across their sterns, hidden until worn |
| `bots.ts` | The bot AI: where to fly, dogfights, aiming with spread, a hand that eases commands in, the skills of each bot |

Bots are tuned with the balance runs (`npm run balance`, see `e2e/`): run them after every change here.
