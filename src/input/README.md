# src/input

How the Host steers. Every device ends up in the same `Controls`, so the rest of the game never asks which one is used.

- `input.ts`: keyboard, mouse flight (the ship turns towards the pointer), gamepad; dodge detection (a thruster tapped twice); `CONTROLS`, the keys of each device as the HUD and the flight school show them; `device`, the one the Host steered with last. Around a press of Command (macOS sends no keyup for a key let go while it is held) every key but the modifiers counts as let go, and a key pressed with Command is not held.
- `input.test.ts`: the keyboard around Command.
- `sheet.ts`: the controls sheet's rows for each device and its tabs (F1, the pause menu's Controls), filled in the Host's language, what the ship lacks (gear not bought, the campaign's hull not fitted) grey and struck through.
- `touch.ts`: the touch controls with nipplejs: a fixed stick on the left to turn (fine in its middle, full rate only at its rim: `turnShape`), a stick under the right thumb for the thrusters, hold buttons for drive, fire, brake, flip, hook and self-destruct (the last two shown only on a ship that carries them).
- `touch.test.ts`: the turn stick's answer to the finger.

The key table for players is in the repository's README, section "Controls".
