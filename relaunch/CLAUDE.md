# SolarTournament – Einführung für Entwickler

SolarTournament ist ein Weltraum-Shooter im Browser: three.js, TypeScript, Vite, statisch gehostet. Kurze Runden (5 Minuten), Schiffe kämpfen in einem Asteroidenfeld gegeneinander. Multiplayer läuft künftig Peer-to-Peer ohne eigenen Server.

Der Code im übergeordneten Verzeichnis (`../`) ist das Original von 2012 (CopperLicht, Node.js, Socket.IO). Es dient nur noch als Quelle für Assets und Ideen und wird nicht verändert.

## Leitlinie: ein eigenes Universum nach zwei Prinzipien

SolarTournament hat ein eigenes Universum. Wir orientieren uns an beliebten Serienhits, übernehmen aber nur zwei Spielprinzipien:

- **A: Realistische Physik wie in The Expanse.** Grund: Es war einfach eine geile Serie. Was fliegt, kollidiert, brennt und kaputtgeht, verhält sich so, wie es da draußen wäre, solange es Spaß macht: Newtonsche Flugphysik, kein Schall im Vakuum, keine Schilde, Laser schlagen durch. Wo wir für den Spielspaß bewusst davon abweichen (z. B. die übertriebene Schwerkraft der Asteroiden), steht das ausdrücklich in der README.
- **B: Bewusstseinsübertragung auf Klone wie in Altered Carbon.** Die Piloten haben ihr Bewusstsein auf geklonte menschliche Körper übertragen. Stirbt ein Klon, wacht der Pilot im nächsten auf. Daraus erklärt sich der Respawn.

Namen, Begriffe und Figuren aus den Serien übernehmen wir nicht; die Welt füllen wir mit eigenen Ideen.

## Pflicht: Jedes Spielprinzip wird dokumentiert

Alles, was wir uns für das Spiel ausdenken, muss dokumentiert sein, damit wir das SolarTournament-Universum später durchgängig verstehen können: Physik, Schadensmodell, Regeln, Punkte, Story, Welt.

- **README.md** erklärt das Universum und die Spielphysik für Spieler und Entwickler, mit den tatsächlichen Zahlenwerten.
- Jede Änderung an einer Spielregel oder Konstante aktualisiert die README im selben Commit. README und Code dürfen nie auseinanderlaufen.
- Neue Story-Elemente (Zeit, Welt, Figuren, Hintergründe) kommen in den Abschnitt „The universe“ der README.
- Konstanten im Code tragen einen Kommentar mit Einheit und Begründung.

## Einheiten

1 Welteinheit = 5 cm. Ein Schiff ist etwa 35 m lang. Geschwindigkeiten im Code in Einheiten/s, im HUD in m/s (Faktor 0,05). 1 g = 196,2 Einheiten/s².

## Befehle

```
npm install
npm run dev         # Dev-Server auf http://127.0.0.1:5173/
npm run typecheck
npm run build       # statische Seite in dist/
npm run deploy      # baut und veröffentlicht auf Cloudflare Pages (Projekt „solartournament“)
```

Gehostet wird auf Cloudflare Pages (`wrangler.toml`). Veröffentlichen nur, wenn Johannes darum bittet.

Nie `npx` verwenden, immer die Scripts aus `package.json`.

## Aufbau (`src/`)

| Datei | Inhalt |
|---|---|
| `main.ts` | Start: WebGL-Check, Assets laden, `Game` erzeugen |
| `game.ts` | Spielzustände, Rundenablauf, Laser, Kollisionen, Arena, Kamera, Pilot (G-Kräfte, Warnungen) |
| `flight.ts` | Newtonsches Flugmodell mit Bordcomputer (Drehraten-Regelung, `steer()`) |
| `ship.ts` | Schiff: Rumpf, Trefferzonen, Löcher mit Dekompression, Laser-Hitze, Antriebsanimation |
| `asteroids.ts` | Asteroidenfeld: Ellipsoid-Kollision, Raycast, Sichtlinie, Schwerkraft, Bruchstücke |
| `wrecks.ts` | Trümmer zerstörter Schiffe |
| `bots.ts` | Bot-KI: Soll-Geschwindigkeit, Drehen und Brennen, Zielen mit Streuung |
| `effects.ts` | Partikel (ein Draw-Call pro Textur), Laserstrahlen |
| `space.ts` | Sterne, Nebel, Sonne mit Schattenwurf, Raumstaub |
| `hud.ts` | DOM-HUD: Anzeigen, Marker, Warnungen, Tunnelblick |
| `audio.ts` | Ton durch den Rumpf (Tiefpass), Bordcomputer-Pieptöne, Antriebsgeräusch |
| `online.ts` | Online-Turnier: Besitz der Schiffe, was übers Netz geht, Bots des Hosts |
| `net/session.ts` | Turnier-Protokoll: Nachrichtentypen, Host-Wahl (am längsten im Raum), Raumcodes |
| `net/transport.ts` | Transport: Trystero (WebRTC über Nostr-Relays) und BroadcastChannel für lokale Tests (`?local=1`) |
| `school.ts` | Flugschule: Schritte mit Anleitung, Erfolgsbedingung und Wegpunkt |
| `sponsors.ts` | Sponsor-Break vor dem Respawn: `AdProvider`-Schnittstelle, Platzhalter-Werbung |
| `input.ts` | Tastatur, Maus (Pointer Lock als virtueller Stick) und Gamepad, führt alle Eingaben zu `Controls` zusammen |
| `touch.ts` | Touch-Steuerung mit nipplejs: fester Stick links, dynamischer Stick rechts, Halte-Tasten |
| `random.ts` | Deterministischer Zufallsgenerator |

`tools/extract-ccb/` lädt die alte CopperCube-Szene mit der Original-Engine und schreibt glTF-Modelle nach `public/assets/models/`. Aufruf: `npm run dev`, dann `http://127.0.0.1:5173/tools/extract-ccb/` öffnen.

## Lizenz

Der Code steht unter AGPL-3.0-or-later (`LICENSE`), das Repo ist öffentlich. Name, Logo und Domains sind nicht lizenziert, ebenso die Modelle, Texturen und Sounds in `public/assets/` (außer der Schrift). Neue Abhängigkeiten müssen mit der AGPL vereinbar sein. Fremde Assets kommen nur mit geklärter Lizenz ins Repo, und die Lizenz wird in der README genannt. Nie Schlüssel, Tokens oder Zugangsdaten committen. Das Menü verlinkt den Quellcode, so wie es die AGPL für ein Netzwerkspiel verlangt.

## Regeln für den Code

- **Determinismus:** Alles, was den gemeinsamen Weltzustand betrifft (Asteroidenfeld, Bruchstücke, Trümmer), entsteht aus dem Seed-Zufall (`Randomizer`), nie aus `Math.random()`. Sonst sehen Peer-to-Peer-Mitspieler unterschiedliche Welten. `Math.random()` ist nur für Optik erlaubt (Partikel, Flackern) und für Bot-Entscheidungen.
- **Menschen- und Alien-Schiff sind identisch**, nur das Aussehen unterscheidet sich (gemeinsamer Trefferradius).
- **Kein Schall von außen:** Der Spieler hört nur, was durch den eigenen Rumpf kommt, plus Pieptöne des Bordcomputers.
- **Performance:** Keine pro Frame erzeugten Objekte in heißen Schleifen; Scratch-Vektoren auf Modulebene wiederverwenden.

## Testen im Browser

Im Dev-Modus hängt das Spiel als `window.game` am Fenster. Damit lässt sich der Zustand auslesen und gezielt setzen (Playwright, `browser_evaluate`):

- Runde starten: `document.getElementById('start').click()`
- Tasten simulieren: `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`
- Zeit einfrieren für Screenshots: `game.timeScale = 0`
- Bots abschalten: andere Schiffe auf `alive = false` und `respawnAt = Infinity` setzen
- Multiplayer: zwei Tabs mit `?t=<code>&local=1` öffnen und in beiden „Online tournament“ klicken (BroadcastChannel, ohne Internet); ohne `local=1` läuft derselbe Test über Trystero und echte Nostr-Relays

Der Testbrowser rendert ohne GPU, die Framerate dort sagt nichts über echte Hardware. Spielgefühl und Ton lassen sich so nicht beurteilen, das testet Johannes selbst.
