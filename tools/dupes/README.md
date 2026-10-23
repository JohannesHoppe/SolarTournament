# tools/dupes

Half of `npm run dupes`, the check that nothing is written twice (the other half is jscpd, configured in `.jscpd.json`, which finds repeated stretches of code and markup).

- `css.ts`: finds style rules that declare the same set of at least three declarations under different selectors in the same media query; they belong under one selector list. A rule that must repeat another carries the comment `css-dupes: <reason>` right before it.

`npm run build` runs the check and fails on a duplicate, so Cloudflare never deploys one.
