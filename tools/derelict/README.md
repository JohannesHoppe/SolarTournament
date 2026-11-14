# tools/derelict

The search for the Derelict's free dead: start states whose loops about the wreck last.

| File | What it does |
|---|---|
| `orbits.search.ts` | Tries start states about each half of the wreck in turn (1 to 2.6 km from the half's centre of mass, 150 to 1,500 m off the hull, moving across the pull at 0.8 to 1.15 times the speed that holds a body going round the half at that distance, in every sense and inclination) and steps each exactly as the game does (`FreeFall` of `src/world/wreckgravity.ts`: the rods of the whole wreck, the keel's girder included, velocity Verlet, 10 s a step). It keeps a state only if it is bound and its path stays at least 30 m off every box of the hull and within 2 km of it for the whole horizon, looked at every 30 s. It writes the states it keeps into `src/world/wreckorbits.ts`, with the horizon and the seed in its comment. |
| `vitest.config.ts` | Runs the search under Vitest, which reads the game's sources as the unit tests do. |

Run it with `npm run orbits`; `ORBIT_SEED` (2584), `ORBIT_DAYS` (365), `ORBIT_COUNT` (24) change the search, and `ORBIT_WRITE=0` only reports. The same seed finds the same states, bit for bit. A run of a year's horizon keeps 24 in about two minutes; most fail within a few days, striking the hull or wandering off. Run it again whenever the wreck's layout, its boxes, its masses or the game's stepping change: `src/world/derelict.test.ts` steps every stored state for three days and fails once one strikes the hull.
