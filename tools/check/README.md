# tools/check

One command for every quality gate, so none is forgotten.

- `check.ts`: runs the gates one after another and sums them up in a table (pass or FAIL, seconds); every gate runs even when an earlier one failed, and the exit code is not zero when any failed.
  - `npm run check`: types (`typecheck`), duplicated code and style rules (`dupes`), the unit tests (`test`, the translations' completeness among them). A few minutes at most; run it before every commit.
  - `npm run check:full`: the same, then the voices (`voice`, rendered before the dev server needs them), the browser tests (`e2e`, against the dev server, which it starts if none runs) and the balance runs (`balance`, about ten minutes). Run it after changes to bots, weapons, damage, a mode's rules, the network or the round flow, and every few merges.
