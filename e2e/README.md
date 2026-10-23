# e2e

Browser tests with Playwright, run against the dev server on port 5173 in Chromium with software WebGL (`playwright.config.ts`). First once: `npm run e2e:install`.

- `solo.spec.ts` (`npm run e2e`): a solo round of every mode and every course of the flight school start without errors; the hangar sells an upgrade and keeps it.
- `online.spec.ts` (`npm run e2e`): two or three tabs of one tournament (`?local=1`) see the same world, a torpedo of one hits the other, they agree on Capture the Flag and the battleship, and they cast out a cheater.
- `balance.spec.ts` (`npm run balance`, about ten minutes, not part of `npm run e2e`): every mode played out by bots in time-lapse; a bot of middling skill must hold its own, so a Host can too.
- `game.ts`: shared helpers (open the game, wait, play a few seconds).

Run the browser tests before pushing changes to the network or the round's flow, and the balance runs after changes to bots, weapons, damage or a mode's rules. One deathmatch can turn any way, so a single red balance run can be chance: run it again before changing anything.
