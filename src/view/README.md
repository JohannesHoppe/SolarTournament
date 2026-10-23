# src/view

What the screen shows besides the 3D world: the HUD as DOM elements, and the passes and effects drawn over the picture. Nothing here changes the game's state.

| File | What it does |
|---|---|
| `hud.ts` | The flight computer's projection: gauges, markers (the next ring's brackets and where the flight crosses its plane among them), the alarms and the escape gauge, the round's panel, the boot of a fresh clone's link; writes the DOM only when a value changes |
| `attitude.ts` | Horizon line, pitch ladder and heading tape on a canvas, as in a fighter's head-up display |
| `radar.ts` | The radar sphere on a canvas |
| `effects.ts` | Particles and laser beams, pooled |
| `killcam.ts` | Records the last seconds and replays the own clone's death |
| `guide.ts` | The racing line: a dashed ribbon with pulses of light, orange in the brake zones |
| `ghost.ts` | The best lap's hologram |
| `showcase.ts` | The title screen: a landing pad of gunmetal and steel with the seal inlaid in gold, the ship hovering above it, turning slowly on the spot and throwing its shadow onto it |
| `glitch.ts` | The disturbed link: a corrupted-stream shader and the HUD's glitch |
| `datamosh.ts` | The clone's death: its last picture rots |
| `lensing.ts` | The black hole's gravitational lens |
| `textures.ts` | Canvas textures: glows, sparks, smoke, and the canvas every texture drawn in code starts from; the running light of the neon trim |
| `surfaces.ts` | The surfaces of everything built in code: worn depot paint (and where its lacquer is gone), the world ship's craters and burns, the battleship's gleam, the rings' plating; texture coordinates for flat faces, the reflection map |
| `marks.ts` | The bot or Host mark before a name |

The styles of all of it live in `src/style.css`.
