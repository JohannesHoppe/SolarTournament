# src/test

Helpers for the unit tests (`npm test`, Vitest in Node), not part of the game.

- `field.ts`: an asteroid field with the real rock shapes (in the detail a test asks for) and plain boxes for hull pieces.
- `pilot.ts`: flies a course of rings with the game's flight model, gravity, coils and rock collisions, like a bot of a given skill; the plausibility tests (`src/game/courses.test.ts`) use it to prove a course can be flown.
