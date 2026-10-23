# src/i18n

The game in English, German, Spanish and French.

- `i18n.ts`: `t('…')` translates a text where it is used, `msg('…')` marks one kept in a table and shown later through `t()`, `translatePage()` translates the pages' fixed texts (`data-i18n`, `data-i18n-attr`); the language chosen.
- `de.ts`, `es.ts`, `fr.ts`: the catalogs, keyed by the exact English text, each with its glossary and the voices' tone at the top.
- `i18n.test.ts`: fails on a text without translation, a translation without text, or broken placeholders.

`npm run i18n -- de` lists what a catalog still lacks. A new or changed text gets all three translations in the same commit; spoken lines are rendered again in every language (see `tools/voice/`).
