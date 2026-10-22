# The voices of SolarTournament

Everything the game says out loud is rendered ahead of time, by the tools in this folder. No speech engine ships with the game and nothing is synthesized in the player's browser: the browser only plays back MP3 files. This page explains where those files come from, step by step, and above all how Nicole, the flight computer, comes to speak German, Spanish and French in her own voice.

## Who speaks

| Voice | What it says | Made with |
|---|---|---|
| **The regime** | The radio's station calls, track titles and the Orange President's propaganda, in English and German | espeak-ng, a robotic voice ("robosoft") |
| **The announcer** | Comments on kills, laps, wins, in the Host's language | espeak-ng, a lively male voice |
| **Nicole** | The flight computer: every line of the flight school, every warning, every bit of comfort | English: Kokoro. German, Spanish, French: her clone, made with Chatterbox |

## The tools, in plain words

- **espeak-ng** is a classic rule-based speech synthesizer: small, fast, clearly robotic. It speaks the regime and the announcer, and it can write any sentence down as phonemes (the sounds of a language).
- **Kokoro** is a small neural speech model (82 million parameters, Apache-2.0). Its voice `af_nicole` is Nicole: breathy, close, a little too warm. Kokoro speaks English well, but has no German, Spanish or French voices of its own.
- **Chatterbox Multilingual** (Resemble AI, MIT license) is a larger neural speech model (about 3 GB) that speaks 23 languages and can **clone** a voice: give it a few seconds of someone speaking, and it speaks any text, in any of its languages, in that voice. No training is involved. The model is used as it is, with a short recording as a reference.
- **Whisper** (OpenAI; the `whisper-small` model, Apache-2.0) is a speech recognizer. Here it only checks the clone's work: it listens to every sentence Chatterbox spoke and writes down what it heard, so a mumbled or garbled take is caught and done again.
- **ffmpeg** encodes the MP3 files and decodes the clone store; it comes with the `ffmpeg-static` package.
- **Perth** is Resemble AI's watermark: every sentence Chatterbox speaks carries an inaudible mark saying it was made by an AI. It cannot be switched off, and we would not want to.

## How Nicole learns other languages

Nicole was born in English: Kokoro's `af_nicole`. For the other languages she is cloned, line by line, in five steps.

```
 the lines                       (src/music/lines.ts, in English)
   │  translated                 (src/i18n/de.ts, es.ts, fr.ts)
   ▼
 1. prepare.ts ──────────────►  lines.json        every line of each language, with its key
   │                             reference.wav     18 s of English Nicole (Kokoro)
   ▼
 2. clone.py   ──────────────►  nicole-conds.pt   Nicole's voice as Chatterbox holds it
   │  Chatterbox + Whisper       nicole-de.flac    every German line, one after the other
   │                             nicole-de.json    where each line starts and how long it is
   ▼
 3. the release "voice-nicole"   on GitHub, as assets: outside the repository's history
   │
   ▼
 4. render.ts (npm run build)    downloads the store, cuts out each line
   │
   ▼
 5. voice-de.mp3 + voice-de.json  the sprite the game plays, beside the announcer's lines
```

1. **Prepare** (`clone/prepare.ts`). It collects Nicole's lines in each language from the translation catalogs and gives each line a **key**: a fingerprint of the language, the exact text and the clone settings. A line whose text changes gets a new key, and so is cloned again; a line that stays the same keeps its key and its recording forever. It also renders the **reference**: Nicole saying a few sentences in English, about 18 seconds, with Kokoro.
2. **Clone** (`clone/clone.py`). Chatterbox listens to the reference once and turns it into Nicole's voice print (the "conditionals"). That print is saved (`nicole-conds.pt`) and used for every later run, so Nicole keeps exactly the same voice even if Kokoro should ever change. Then, for every line not yet cloned, Chatterbox speaks it sentence by sentence (long lines in one go tend to ramble), with the settings chosen by ear. Whisper listens to each sentence; if what it hears differs too much from the text, or the sentence runs on far too long, the sentence is spoken again with another seed, up to four times, and the best take is kept. Every take uses a fixed seed derived from the line's key, so a line is reproducible.
3. **Store** (the release `voice-nicole`). The cloned lines of a language sit in one lossless FLAC file, one after the other, with an index saying where each line starts. Both are assets of a GitHub release of the repository: public, versioned, but not part of the Git history (generated audio in the history would bloat every clone of the repository forever). The index carries the audio's fingerprint, so a build never cuts an old recording by a new index.
4. **Build** (`render.ts`, run by `npm run build` and `npm run dev`). It downloads each language's index and audio, cuts out every line Nicole says, and puts them into that language's sprite, together with the announcer. A line not cloned yet (new or just changed) is spoken by the fallback: Kokoro's Nicole reading the phonemes espeak-ng spells it in, with a heavy English accent, until its clone is there.
5. **Game.** The browser loads the radio sprite and the sprite of the Host's language, and plays a line by cutting it from the sprite.

## Who does the cloning: the workflow "Voice"

The cloning does not depend on anyone's computer. The GitHub Actions workflow `.github/workflows/voice.yml` runs whenever the lines, their translations or these tools change on `main`, and can be started by hand (Actions → Voice → Run workflow). For each language it downloads the store, clones what is missing, and puts the store back into the release. New lines take minutes. Cloning every line of a language from scratch takes a few hours; a job stops after about five hours and keeps what it has, and running the workflow again goes on from there. The three languages run side by side.

Cloudflare's build usually runs before the workflow has finished: the new lines then play with the fallback voice until the next deploy builds the voices again.

## What makes Nicole Nicole, and where it is written down

Everything is pinned, so that the same inputs always give the same voice:

| What | Where |
|---|---|
| Kokoro model and revision, Nicole's English voice and speed | `COMPUTER_VOICE` in `nicole.ts` |
| The reference sentences and their speed | `REFERENCE` in `nicole.ts` |
| Chatterbox code (Git commit), model (Hugging Face revision), the V3 weights | `CLONE` in `nicole.ts` |
| The chosen settings: emotion (`exaggeration` 0.8), closeness to the text (`cfg` 0.3), freedom of sampling (`temperature` 0.8) | `CLONE` in `nicole.ts` |
| Nicole's voice print, the reference, the cloned lines | the release `voice-nicole` |

The settings are the maintainer's choice by ear ("variant D"): unmistakably a machine, feeling and unfeeling at once, monotonous and aloof, with an English accent that stays. Changing any value of `CLONE` changes every key, and every line is cloned again on the next run.

## Recipes

**A new or changed line.** Nothing to do: commit it with its translations, the workflow clones it, the next build picks it up.

**Clone again from scratch** (other settings, another model). Change `CLONE` in `nicole.ts` and push; to start over with a new voice print too, delete `nicole-conds.pt` from the release first.

**Clone on your own machine** (Python 3.11):

```
node tools/voice/clone/prepare.ts <work folder>
gh release download voice-nicole --dir <work folder> --pattern 'nicole-*' --pattern reference.wav
python -m venv .venv && .venv/bin/pip install -r <work folder>/requirements.txt
.venv/bin/python tools/voice/clone/clone.py <work folder> de
gh release upload voice-nicole <work folder>/nicole-de.flac <work folder>/nicole-de.json --clobber
```

The first run downloads Chatterbox (about 3 GB) and Whisper into the Hugging Face cache.

**Lost everything.** The repository has all it takes: the workflow rebuilds whatever the release lacks from the pinned models. The release keeps the voice print, so even a re-run from scratch speaks with the same Nicole.

## Files

| File | What it does |
|---|---|
| `render.ts` | Renders all sprites (`npm run voice`, run by build and dev): radio, announcer, Nicole |
| `nicole.ts` | What Nicole is made of: Kokoro voice, reference, clone settings, the release, the keys of her lines |
| `clone/prepare.ts` | Writes the list of lines to clone, the Python requirements and the reference |
| `clone/clone.py` | Clones the missing lines of one language with Chatterbox, checks them with Whisper |
| `.github/workflows/voice.yml` | Runs prepare and clone for every language and updates the release |

## Licenses

espeak-ng is GPL-3.0; the audio it produces is not covered by the GPL. Kokoro and the Whisper model are Apache-2.0, Chatterbox (code and weights) and Perth are MIT. None of them is part of the game: they only run where the voices are made. The rendered voices are not kept in the repository.
