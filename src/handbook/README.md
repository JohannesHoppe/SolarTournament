# src/handbook

The numbers of the Pilot's Handbook (`handbook.html` in the repository's root, started by `src/handbook-page.ts`). The handbook's texts carry them as placeholders (`{limit} m/s`), so a translation never repeats a number and every language shows the same one, in its own number format.

- `numbers.ts`: `FROM_CODE` takes each number from the game's own constants (the speed limit from `ship/flight.ts`, the coil's boost from `game/race.ts`, …), so it follows the code by itself; `FROM_README` holds the few the page cannot import (they live inside the round's flow in `game/game.ts`), each with the README's words for it.
- `numbers.test.ts`: finds every `FROM_README` number in the README with its words, checks that every placeholder has a number and every number is used, and fails on a digit written into a handbook text. That the texts are in every catalog, the i18n test checks.

A rule players use that changes updates the handbook's text and, where it has one, its number here.
