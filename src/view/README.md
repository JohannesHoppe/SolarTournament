# src/view

What the screen shows besides the 3D world: the HUD as DOM elements, and the passes and effects drawn over the picture. Nothing here changes the game's state.

| File | What it does |
|---|---|
| `hud.ts` | The flight computer's projection: gauges, markers (the next ring's brackets and where the flight crosses its plane among them, the crosshair orange over a hull, the target's range and closure rate; the ships' markers, their arrows at the screen's edge with the ships' names placed clear of each other and of the HUD), the fixed references (center, sun, the arena's big things, bases, battleship) at their place or the screen's edge, height and climb, the alarms and the escape gauge, the round's panel, the boot of a fresh clone's link; writes the DOM only when a value changes |
| `attitude.ts` | Horizon line, pitch ladder, bank scale with its sky pointer and heading tape on a canvas, as in a fighter's head-up display; as sharp as the picture's resolution, drawn anew only when the camera turns |
| `plane.ts` | The reference plane's polar grid and the drop lines from ships, gates and the waypoint down or up to it: lines over everything, faded with distance, built once |
| `radar.ts` | The radar sphere on a canvas |
| `effects.ts` | Particles and laser beams, pooled; a cheaper picture emits a share of the particles |
| `killcam.ts` | Records the last seconds and replays the own clone's death in slow motion, each ship put between the two kept frames around the moment shown (tested in `killcam.test.ts`) |
| `chase.ts` | The chase camera's field of view, how fast it follows and where it hangs, looking along the nose |
| `guide.ts` | The racing line: a dashed ribbon with pulses of light, orange in the brake zones |
| `ghost.ts` | The best lap's hologram |
| `impostor.ts` | A billboard for a shape seen from far away (the belt's rocks, the field's farthest rocks and ice): a camera-facing quad showing one of a few pre-rendered views, lit from the shape's own baked normal map and the real sun so it tracks a solar flare; an ice piece's painted in the ice's color and glow (tested in `impostor.test.ts`) |
| `showcase.ts` | The title screen: a landing pad of gunmetal and steel with the seal inlaid in gold, the ship hovering above it, turning slowly on the spot and throwing its shadow onto it |
| `glitch.ts` | The disturbed link: a corrupted-stream shader and the HUD's glitch |
| `datamosh.ts` | The clone's death: its last picture rots |
| `lensing.ts` | The black hole's gravitational lens; a cheaper picture marches fewer steps along each pixel's ray looking for its source |
| `textures.ts` | Canvas textures: glows, sparks, smoke, and the canvas every texture drawn in code starts from; the running light of the neon trim |
| `surfaces.ts` | The surfaces of everything built in code: worn depot paint (and where its lacquer is gone), the world ship's craters and burns, the battleship's polished armor plates, the rings' plating; texture coordinates for flat faces, the reflection map |
| `marks.ts` | The bot or Host mark before a name, the swatch of a pilot's tint beside it, and the star that marks the lead browser in the standings |
| `ink.ts` | What an element shows on screen (its plate, or the text and children inside it; a fixed reference's glyph and label): the HUD keeps the names at the edge clear of it, the layout test measures by it |
| `quality.ts` | The picture's quality: the ladder of looks from the full picture to the cheapest (resolution, bloom, shadows, lacquer, particles, rock detail, the belt, the gas giant landmark's segments, the black hole's lens, the title screen's pad), the tiers low, medium and high as presets on it, the guess of a device's tier, the Host's choice as the browser keeps it, the governor that moves along the ladder with the frame rate (telling a screen capped below the target frame rate from a slow device; one each for the menu and a running round), the benchmark's features (tested in `quality.test.ts`) |
| `graphics.ts` | Applies the rung of the ladder to the renderer, the bloom, the sun's shadows, the hulls' lacquer, the particles, the rocks, the belt, the gas giant landmark, the black hole's lens, the title screen's pad and the reference plane's grid; feeds the governor the frame times and holds back a knob that compiles shaders until a hitch goes unseen |
| `bloom.ts` | The bloom at a share of the picture's resolution |

The styles of all of it live in `src/style.css`.
