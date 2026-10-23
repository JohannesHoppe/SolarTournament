# src/ship

The ships and who flies them. Human and alien interceptor (and the Sovereign) fly by the same rules; only their looks differ.

| File | What it does |
|---|---|
| `ship.ts` | A ship: hull, hit zones, holes and decompression, laser heat, drive animation |
| `flight.ts` | The Newtonian flight model and its flight computer (`steer()`), and path steering, the autopilot's way of flying: the stick turns the path, drive and thrusters bend it |
| `flight.test.ts` | Path steering: how tight it turns at the speed limit, flying straight on when let go, the nose by the stick when slow |
| `impact.ts` | Striking a surface: the bounce, the scrape, the damage; two ships ramming each other, hurt by where they are struck |
| `models.ts` | The interceptors' low-poly hulls, built in code, each in its own wear (see `view/surfaces.ts`) under a clear lacquer, shaded round with hard edges, with the light strips of the neon trim fitted along their flanks and across their sterns, hidden until worn |
| `bots.ts` | The bot AI: where to fly, dogfights, aiming with spread, keeping clear of other ships and of the rings' housings, shoving a rival into rock, a hand that eases commands in, the skills of each bot |
| `tints.ts` | The colors ships are marked in: the palette of neon tints a Host picks from (kept in the browser), each bot's own, the Sovereign's ivory and gold, how two Hosts with the same choice are told apart, the side's color in Capture the Flag |
| `tints.test.ts` | The palette: bright, clear of the HUD's azure, the sides' colors, red and each other; every bot its own tint; the tie rule between Hosts |

Bots are tuned with the balance runs (`npm run balance`, see `e2e/`): run them after every change here.
