# src/input

How the Host steers. Every device ends up in the same `Controls`, so the rest of the game never asks which one is used.

- `input.ts`: keyboard, mouse flight (the ship turns towards the pointer), gamepad; dodge detection (a thruster tapped twice); `CONTROLS`, the keys of each device as the HUD and the flight school show them.
- `touch.ts`: the touch controls with nipplejs: a fixed stick on the left to turn, a stick under the right thumb for the thrusters, hold buttons for drive, fire, brake, flip and hook.

The key table for players is in the repository's README, section "Controls".
