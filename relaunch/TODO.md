# TODO

## Roadmap

Abgearbeitet von oben nach unten. Jeder erledigte Punkt ist auch in der README dokumentiert.

### 1. Spielbar für neue Spieler

- [x] Gamepad-Steuerung
- [ ] Touch-Steuerung für Handy und Tablet mit nipplejs (wie in der Bitmap-Ansicht von ordpool: fester Stick links, dynamischer Stick rechts, Schutz gegen hängende Sticks)
- [ ] Flugschule: geführtes Tutorial für Schub, Driften, Flip-and-burn, Kollisionswarnung, Hitze im Schatten

### 2. Multiplayer

- [ ] Peer-to-Peer-Multiplayer ohne Server (Trystero), Turnier-Link zum Teilen, Bots füllen freie Plätze
- [ ] Host entscheidet über Treffer, Interpolation entfernter Schiffe

### 3. Das Turnier als Show

- [ ] Zuschauer-Modus: Übertragung mit automatischer Regie-Kamera
- [ ] Zeitlupen-Wiederholung bei Abschüssen (Kill-Cam)
- [ ] Cockpit-Radio: Musik und Kommentator, dumpf durch den Rumpf
- [ ] Publikumsgunst (Hype) für spektakuläre Manöver
- [ ] Sponsoren auf den Schiffen, Sponsor-Aufträge
- [ ] Klon-Zähler mit HUD-Bildfehlern bei vielen Kopien

### 4. Arenen mit eigener Physik

- [ ] Saturnringe: tausende Eisbrocken
- [ ] Kessler-Feld: Trümmer einer zerstörten Station
- [ ] Gasriese: starke Schwerkraft, Swing-by als Waffe
- [ ] Sonnennah: brutale Hitze, Sonnenstürme stören die Ortung

### 5. Spielmodi

- [ ] Slingshot-Rennen mit Checkpoints um Gravitationsfelder
- [ ] Last Clone Standing: drei Klone, danach nur mit längerer Werbung
- [ ] Teams: Menschen gegen Aliens

### 6. Taktik

- [ ] Torpedos: wenige Schuss, zielsuchend, mit dem Laser abschießbar
- [ ] Täuschkörper und Schleichfahrt: kaltes Schiff ohne Antrieb ist schwerer zu orten

### 7. Verbreitung

- [ ] Abschuss-Clip als kurzes Video zum Teilen
- [ ] Bestenliste ohne eigenen Server

## Domains

- `solartournament.com` registrieren (Hauptadresse).
- `solartournament.games` registrieren („Solar Tournament Games“).
- Beide waren am 2026-10-18 frei. `solartournament.org` ist fremd vergeben (bezahlt bis 2027-01-28).
- `.game` ist mit rund 300 $/Jahr zu teuer, `.games` kostet nur ein paar Euro.

## Werbung im Sponsor-Break

- Echtes Werbenetzwerk anbinden: eine Klasse, die `AdProvider` aus `src/sponsors.ts` implementiert, ersetzt `PlaceholderAd`.
- Nur ein Format, das „Werbung ansehen gegen Belohnung“ ausdrücklich erlaubt (Rewarded Ads). Werbenetzwerke verbieten, Klicks auf die Werbung selbst zu belohnen; deshalb bootet der Klon über einen eigenen Knopf, nicht über einen Klick auf die Anzeige. Die Richtlinien des gewählten Netzwerks vor der Anbindung prüfen.
- Datenschutz: Consent-Banner (DSGVO), sobald personalisierte Werbung ausgeliefert wird.
