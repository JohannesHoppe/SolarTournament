# tools/i18n

Collects every English text that needs a translation, so nothing visible stays English by accident.

- `sources.ts`: finds the texts: the first argument of every `t()` and `msg()` in `src/`, the texts and attributes the pages (`index.html`, `radio.html`, `handbook.html`) mark with `data-i18n` and `data-i18n-attr`, and every line the voices speak. The unit test `src/i18n/i18n.test.ts` uses it too.
- `list.ts`: prints them as JSON with where each is used; `npm run i18n -- de` (or `es`, `fr`) prints only those the catalog still lacks.

Translations go into `src/i18n/de.ts`, `es.ts` and `fr.ts`.
