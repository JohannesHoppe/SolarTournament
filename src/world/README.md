# src/world

The arena a round is fought in. Everything that every browser must build alike (the field's layout, the rock shapes, fragments) comes from seeded randomness, so peers see the same world.

| File | What it does |
|---|---|
| `arenas.ts` | The seven arenas: field layout, well, sun, storms, the fixed references the HUD marks; which one a tournament round uses |
| `reference.ts` | The reference plane through the field's center: height, climb, the bank's sky pointer, closure rate, an arena's fixed references |
| `asteroids.ts` | The field: rocks, ice, debris or hull (shoved by a comet), orbits, gravity, collisions, raycasts, line of sight; how close up a rock or an ice piece keeps its near mesh before the far one, then a billboard, takes over (the picture's quality) |
| `rocks.ts` | Generates the 16 asteroid shapes with integer math, identical on every browser: a full-detail shape for collisions, light near and far meshes for drawing (their fine relief a baked, object-space normal map, not triangles), and a billboard (see view/impostor) for the belt and for rocks and ice far from the field |
| `surface.ts` | A rock's measured surface, as collisions see it |
| `bodies.ts` | Bodies and their masses (ship, core, probe, torpedo, wreckage, the field's pieces by volume and density, the battleship; rings immovable); the rope that only pulls (between two browsers as a stiff spring, each end pulled where it is run) and the bump, both split by mass |
| `shapes.ts` | Ice, station debris and the world ship's hull sections |
| `gates.ts` | The rings of the tournament as structures (coil housings, windings, struts, lights, a station module with a sponsor's plate), all solid but the lights, shared by race gates, school rings and Capture the Flag bases |
| `powercore.ts` | The sponsor core of Capture the Flag as a structure: an armored reactor canister with glowing windings, sign plates and a cage for the tow cable; fades to its outline |
| `boxes.ts` | A sphere or a ray against a box (wreck and battleship hulls) |
| `wrecks.ts` | The pieces a destroyed ship breaks into |
| `arena.ts` | The arena's edge and its grid |
| `belt.ts` | The asteroid belt beyond the arena, scenery only; close to its inner edge real low-poly rocks, the rest of the ring billboards (see view/impostor); a cheaper picture draws a share of it |
| `landmarks.ts` | Each arena's scenery: planets, the sun, the black hole; the gas giant's cap at a cheaper segment count on a cheaper picture (see view/quality) |
| `flare.ts` | The solar flare's plasma on screen: a sphere of roiling fire with filaments |
| `space.ts` | Stars, nebula, the sun's light and shadows (heated by a solar flare; their map's size or none at all, as the picture's quality says), dust |

`asteroids.test.ts`, `arenas.test.ts` and `wrecks.test.ts` check layouts, snapshots and collisions (and that no field piece switches to its billboard within the arena across), `bodies.test.ts` the rope and the bump, `reference.test.ts` the reference plane in every arena, height, climb, the sky pointer, the closure rate and each arena's fixed references, `rocks.test.ts` that a rock's normal atlas, read row by row as the GPU reads it, holds the outward normal of every cell's direction (`npm test`).
