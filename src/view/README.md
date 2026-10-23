# src/view

What the screen shows besides the 3D world: the HUD as DOM elements, and the passes and effects drawn over the picture. Nothing here changes the game's state.

| File | What it does |
|---|---|
| `hud.ts` | The flight computer's projection: gauges, markers (the next ring's brackets and where the flight crosses its plane among them), the alarms and the escape gauge, the round's panel, the boot of a fresh clone's link; writes the DOM only when a value changes |
| `attitude.ts` | Horizon line, pitch ladder and heading tape on a canvas, as in a fighter's head-up display |
| `radar.ts` | The radar sphere on a canvas |
| `effects.ts` | Particles and laser beams, pooled; a cheaper picture emits a share of the particles |
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
| `quality.ts` | The picture's quality: the ladder of looks from the full picture to the cheapest (resolution, bloom, shadows, lacquer, particles, rock detail, the belt, the title screen's pad), the tiers low, medium and high as presets on it, the guess of a device's tier, the Host's choice as the browser keeps it, the governor that moves along the ladder with the frame rate, the benchmark's features (tested in `quality.test.ts`) |
| `graphics.ts` | Applies the rung of the ladder to the renderer, the bloom, the sun's shadows, the hulls' lacquer, the particles, the rocks, the belt and the title screen's pad; feeds the governor the frame times and holds back a knob that compiles shaders until a hitch goes unseen |
| `bloom.ts` | The bloom at a share of the picture's resolution |

The styles of all of it live in `src/style.css`.
