# tools

Programs that run on a developer's machine or in a build, never in the player's browser. Each writes something the game uses, or checks the repository.

| Folder | What it makes or checks | Run it with |
|---|---|---|
| [`voice/`](voice/) | The rendered voices (radio, announcer, Nicole) into `public/assets/voice/`; Nicole's clone | `npm run voice` (also part of `npm run dev` and `npm run build`) |
| [`crest/`](crest/) | The seal of the Ministry of War, `public/crest.svg` | `npm run crest` |
| [`i18n/`](i18n/) | Lists the texts a language's catalog still lacks | `npm run i18n -- de` |
| [`dupes/`](dupes/) | Finds style rules declared twice | `npm run dupes` (with jscpd) |
| [`check/`](check/) | Runs every quality gate and sums them up | `npm run check`, `npm run check:full` |

They are TypeScript run directly by Node (type stripping), except the clone, which is Python.
