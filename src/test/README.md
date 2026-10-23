# src/test

Helpers for the unit tests (`npm test`, Vitest in Node), not part of the game.

- `field.ts`: an asteroid field with the real rock shapes (in the detail a test asks for) and plain boxes for hull pieces.
- `honest.ts`: an honest ship flown wildly with the game's flight model (slammed sticks, flips, path steering, beams), blown about by shoves, hits and venting air, on a browser that stutters and a link that stalls; returns its states and beams as another browser receives them, for the cheat checks (`src/net/plausible.test.ts`) to prove they never take it for a cheat.
- `pilot.ts`: flies a course of rings with the game's flight model, gravity, coils and rock collisions, like a racing bot of a given skill (along the line, and for a ring's center near it, as the game's racers do), from rest or drifting, and counts the rings passed and missed; the plausibility tests (`src/game/courses.test.ts`) use it to prove a course can be flown.
