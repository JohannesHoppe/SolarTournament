# TODO

## Domains

- `solartournament.com` registrieren (Hauptadresse).
- `solartournament.games` registrieren („Solar Tournament Games“).
- Beide waren am 2026-10-18 frei. `solartournament.org` ist fremd vergeben (bezahlt bis 2027-01-28).
- `.game` ist mit rund 300 $/Jahr zu teuer, `.games` kostet nur ein paar Euro.

## Werbung im Sponsor-Break

- Echtes Werbenetzwerk anbinden: eine Klasse, die `AdProvider` aus `src/sponsors.ts` implementiert, ersetzt `PlaceholderAd`.
- Nur ein Format, das „Werbung ansehen gegen Belohnung“ ausdrücklich erlaubt (Rewarded Ads). Werbenetzwerke verbieten, Klicks auf die Werbung selbst zu belohnen; deshalb bootet der Klon über einen eigenen Knopf, nicht über einen Klick auf die Anzeige. Die Richtlinien des gewählten Netzwerks vor der Anbindung prüfen.
- Datenschutz: Consent-Banner (DSGVO), sobald personalisierte Werbung ausgeliefert wird.
