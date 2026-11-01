# tools/seo

What search engines and link previews read. Google asks for one address per language and its crawler sends no language of its own, so a page that speaks the browser's language would only ever be found in English.

- `pages.ts`: called by the build (`pageShell` in `vite.config.ts`), it writes each page a search can land on (`index`, `about`, `handbook`, `radio`) in each language into `dist/`, with its texts and the handbook's numbers in place, and adds its canonical address, its siblings (`hreflang`), the link preview's tags and, on the home page, the structured data. It also writes `sitemap.xml` and the rules of `_headers` that keep the raw Pages addresses and every stage but production out of the search results. `src/seo.test.ts` checks all of it on the real pages.

The addresses stay in the site's root, where the pages' relative paths hold: `/`, `/about`, `/handbook` and `/radio` in English (a browser in another language still reads them in its own), `/de`, `/about-de`, `/handbook-de` and `/radio-de` in German, the same with `es` and `fr`. A page written out in a language says so in `data-locale`: it speaks that language whatever the browser's, and the Host's pages stay in it from then on (`initLocale` in `src/i18n/i18n.ts`). A title and a description are ordinary texts of their page (`data-i18n`, `data-i18n-attr`) with their translations in the catalogs. The dev server serves the English sources only; see the result with `npm run build`.

The legal pages speak German only and get `noindex` from the page shell. Nothing here claims a rating: Google shows a rich result for an app only with real ones.
