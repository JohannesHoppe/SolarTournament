# e2e

Browser tests with Playwright, run against the dev server on port 5173 in Chromium with software WebGL (`playwright.config.ts`). First once: `npm run e2e:install`.

- `solo.spec.ts` (`npm run e2e`): a solo round of every mode and every course of the flight school start without errors; the hangar sells an upgrade and keeps it; two ships fly side by side through a gate at 100 m/s, and a dodge into the one at the rim knocks it into the housings, a kill for the kicker (without the dodge both pass).
- `online.spec.ts` (`npm run e2e`): two or three tabs of one tournament (`?local=1`) see the same world, a torpedo of one hits the other, they agree on Capture the Flag and the battleship, and they cast out a cheater.
- `layout.spec.ts` (`npm run e2e`): the HUD's pieces (round panel, alarms and message, transmission, radar, gauges, radio, kill feed, touch buttons), filled as full as they get, never cover each other, at 1280×720 and 800×360, with keyboard and with touch, in a race and in the flight school.
- `balance.spec.ts` (`npm run balance`, about ten minutes, not part of `npm run e2e`): every mode played out by bots in time-lapse; a bot of middling skill must hold its own, so a Host can too. Each round's development log (`src/devlog.ts`) goes with the result: its JSON in the test's folder under `test-results/` (`<mode>-<round>-<arena>.json`, attached to the report too), its summary in the annotations, and the deaths by cause in the detail of a failed check. Read a log with `node -e` or any JSON viewer: `summary.deaths`, `summary.afterDecision`, and the `death` events with the decisions before them say what killed the bots.
- `game.ts`: shared helpers (open the game, launch a solo round, play a few seconds) and the game as it hangs on the window (`window.game`).

Run the browser tests before pushing changes to the network or the round's flow, and the balance runs after changes to bots, weapons, damage or a mode's rules. One deathmatch can turn any way, so a single red balance run can be chance: run it again before changing anything.
