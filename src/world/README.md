# src/world

The arena a round is fought in. Everything that every browser must build alike (the field's layout, the rock shapes, fragments) comes from seeded randomness, so peers see the same world.

| File | What it does |
|---|---|
| `arenas.ts` | The seven arenas: field layout, well, sun, storms; which one a tournament round uses |
| `asteroids.ts` | The field: rocks, ice, debris or hull (shoved by a comet), orbits, gravity, collisions, raycasts, line of sight |
| `rocks.ts` | Generates the 16 asteroid shapes with integer math, identical on every browser |
| `surface.ts` | A rock's measured surface, as collisions see it |
| `bodies.ts` | Bodies and their masses (ship, core, probe, torpedo, wreckage, the field's pieces by volume and density, the battleship; rings immovable); the rope that only pulls (between two browsers as a stiff spring, each end pulled where it is run) and the bump, both split by mass |
| `shapes.ts` | Ice, station debris and the world ship's hull sections |
| `gates.ts` | The rings of the tournament as structures (coil housings, windings, struts, lights), shared by race gates, school rings and Capture the Flag bases |
| `powercore.ts` | The sponsor core of Capture the Flag as a structure: an armored reactor canister with glowing windings, sign plates and a cage for the tow cable; fades to its outline |
| `boxes.ts` | A sphere or a ray against a box (wreck and battleship hulls) |
| `wrecks.ts` | The pieces a destroyed ship breaks into |
| `arena.ts` | The arena's edge and its grid |
| `belt.ts` | The asteroid belt beyond the arena, scenery only |
| `landmarks.ts` | Each arena's scenery: planets, the sun, the black hole |
| `flare.ts` | The solar flare's plasma on screen: a sphere of roiling fire with filaments |
| `space.ts` | Stars, nebula, the sun's light and shadows (heated by a solar flare), dust |

`asteroids.test.ts`, `arenas.test.ts` and `wrecks.test.ts` check layouts, snapshots and collisions, `bodies.test.ts` the rope and the bump (`npm test`).
