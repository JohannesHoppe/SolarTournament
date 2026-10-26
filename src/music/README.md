# src/music

Radio 2584, the station of the games: hard techno generated from a track's title, the same notes on every browser, and the lines all voices speak.

| File | What it does |
|---|---|
| `songs.ts` | A track from its seed: flavor, form, energy curve, step patterns, fills |
| `band.ts` | The Tone.js instruments and how one sixteenth is played |
| `radio.ts` | Plays the track on the round's clock and keeps it in step |
| `preview.ts` | Renders a track offline as WAV (radio page downloads, development) |
| `crowd.ts` | The stadium's crowd on the broadcast: a recorded roar, looped, through overdriven loudspeakers; swells, erupts, hushes; on air only while a round is flown and seen (`air`, from `Game.stadiumOnAir`), cheering a round's end and fading out under the results (`finale`) |
| `voice.ts` | Loads the pre-rendered voice sprites for the Host's language |
| `lines.ts` | Every line spoken: the regime, the announcer, Nicole's lessons and tips |
| `transmission.ts` | Shows what the radio says, in neon, while it is spoken |

A new or changed line in `lines.ts` needs its translations in `src/i18n/`; the voice is rendered again by `tools/voice/` and Nicole's clone by the workflow Voice. `songs.test.ts` checks that a title always gives the same song; `crowd.test.ts` that the crowd is heard only on air, cheers a round's end and fades out, and tries its recording again only after a pause once it failed.
