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
- **ffmpeg** encodes the MP3 files and decodes the clone store. `ffmpeg.ts` fetches a static build of ffmpeg 6.1.1 (the release `b6.1.1` of the ffmpeg-static project, one binary per platform) only when the build cache lacks it, and uses it only if its SHA-256 is the one pinned there for the machine's platform (macOS on Apple silicon and Intel, Linux x86-64 and ARM64); a download that does not match stops the build. It is kept in `_solartournament/ffmpeg/` in the build cache, so Cloudflare fetches it once and not for every build.
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
   │  Chatterbox + Whisper       nicole-de-….flac  every German line, one after the other
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
3. **Store** (the release `voice-nicole`). The cloned lines of a language sit in one lossless FLAC file, one after the other, with an index saying where each line starts. Both are assets of a GitHub release of the repository: public, versioned, but not part of the Git history (generated audio in the history would bloat every clone of the repository forever). The index carries the audio's fingerprint, and the release keeps the audio under it (`nicole-de-1d66db33fb6d98eb.flac`, the index as `nicole-de.json`): an index always finds the very audio it was written for, so no build ever cuts one recording by another's clips.
4. **Build** (`render.ts`, run by `npm run build` and `npm run dev`). It downloads each language's index and audio, cuts out every line Nicole says, and puts them into that language's sprite, together with the announcer. A line not cloned yet (new or just changed) is spoken by the fallback: Kokoro's Nicole reading the phonemes espeak-ng spells it in, with a heavy English accent, until its clone is there.
5. **Game.** The browser loads the radio sprite and the sprite of the Host's language, and plays a line by cutting it from the sprite.

## Who does the cloning: the workflow "Voice"

The cloning does not depend on anyone's computer. The GitHub Actions workflow `.github/workflows/voice.yml` runs whenever the lines, their translations or these tools change on `main`, and can be started by hand (Actions → Voice → Run workflow). For each language it downloads the store, clones what is missing, and puts the store back into the release. New lines take minutes. Cloning every line of a language from scratch takes a few hours; a job stops after about five hours and keeps what it has, and running the workflow again goes on from there. The three languages run side by side.

The store is guarded on its way: a download that fails stops the job instead of starting from an empty store; `clone.py` refuses an audio that is not the one its index was written for; the audio goes up under its fingerprint before its index, and older audio of the language goes only once the new index is up; and the store written every ten lines goes up even when a clone breaks off. Without a voice print in the release, only German runs and makes the print (even with nothing to clone), the other languages follow on the next run, so all three speak with the same voice.

The workflow keeps code of others away from any token that writes. The clone jobs run Chatterbox, Whisper and their packages with a token that may only read; they hand their store on as an artifact. A separate upload job holds the token that writes the release and runs nothing but the shell, `jq` and `gh`: it puts a store up only if the fingerprint its index names is the sha256 of its audio. The workflow's actions are pinned to their commits, npm installs without install scripts, and every Python package is locked by its hash (below).

## The Python lock

What `clone.py` runs on is locked file by file, so a run installs exactly what was checked and nothing a package index or a Git branch offers that day:

- `clone/requirements.in` names what is wanted: Chatterbox's dependencies at its pinned commit (without its demo app, gradio), Perth (Resemble AI's watermarker) as the archive of one commit, and `soundfile`. Whisper runs through `transformers`.
- `clone/requirements.txt` is the lock: every package at one version with the hashes of its files, torch and torchaudio as PyTorch's CPU builds for Python 3.11 on Linux x86-64 (by URL and hash; the runner has no GPU, and the CUDA builds are gigabytes larger), and Chatterbox as the archive of the commit in `CLONE.code`. The workflow installs it with `pip install --require-hashes --no-deps`, so nothing outside the file comes in. Chatterbox's own metadata names Perth by a Git branch; installing without dependencies keeps that branch out.
- `clone/build-requirements.in` and `.txt`: the build tools of the two packages that come as source (setuptools for Chatterbox, uv_build for Perth), installed first, so that pip builds them without fetching tools of its own (`--no-build-isolation`).
- `prepare.ts` refuses a lock that names another Chatterbox commit or another `soundfile` than `nicole.ts`.

**Locking again** (another Chatterbox commit, a package with a security fix). pip-tools makes the lock; it is only needed for this and never runs in the workflow. With Python 3.11, in a throwaway virtual environment outside the repository:

```
python3.11 -m venv /tmp/lock && /tmp/lock/bin/pip install pip-tools==7.6.2
cd tools/voice/clone
/tmp/lock/bin/pip-compile --generate-hashes --allow-unsafe --strip-extras --no-emit-index-url --output-file requirements.txt requirements.in
/tmp/lock/bin/pip-compile --generate-hashes --allow-unsafe --strip-extras --no-emit-index-url --output-file build-requirements.txt build-requirements.in
node lock.ts
```

`requirements.in` follows Chatterbox's `pyproject.toml` at the new commit (and Perth's commit, if it moves); `lock.ts` swaps torch and torchaudio for their CPU builds and adds Chatterbox at the commit in `CLONE.code`. pip-compile resolves for the machine it runs on; the packages here pull in nothing that only Linux needs, so a lock made on a Mac holds on the runner (worth checking again after larger changes). Look at what changed before committing: a new package or a new maintainer is a new dependency (see CLAUDE.md, "Supply chain").

Cloudflare's build usually runs before the workflow has finished: the new lines then play with the fallback voice until the next deploy builds the voices again. A store that cannot be had (its index out of reach with no copy of it in the cache, or its audio not fetched: a timeout, an upload under way) is handled by where the build runs. On a developer's machine the sprites speak those lines with the fallback, keep no stamp and nothing in the cache, so the next build tries again. A build for the site (`CI` or `CF_PAGES` set, as Cloudflare Pages and GitHub Actions do) stops with an error instead, so the site never goes out without Nicole's clones; running the deployment again tries again.

## What makes Nicole Nicole, and where it is written down

Everything is pinned, so that the same inputs always give the same voice:

| What | Where |
|---|---|
| Kokoro model and revision, Nicole's English voice and speed | `COMPUTER_VOICE` in `nicole.ts` |
| The reference sentences and their speed | `REFERENCE` in `nicole.ts` |
| Chatterbox code (Git commit), model (Hugging Face revision), the V3 weights | `CLONE` in `nicole.ts` |
| The chosen settings: emotion (`exaggeration` 0.8), closeness to the text (`cfg` 0.3), freedom of sampling (`temperature` 0.8) | `CLONE` in `nicole.ts` |
| What checks the takes: Whisper's model and revision, the Python package of the store (`soundfile`) | `CHECK` in `nicole.ts` (not part of a line's key: they choose a take, they shape no voice) |
| Nicole's voice print, the reference, the cloned lines | the release `voice-nicole` |

The settings are the maintainer's choice by ear ("variant D"): unmistakably a machine, feeling and unfeeling at once, monotonous and aloof, with an English accent that stays. Changing any value of `CLONE` changes every key, and every line is cloned again on the next run.

## Recipes

**A new or changed line.** Nothing to do: commit it with its translations, the workflow clones it, the next build picks it up.

**Clone again from scratch** (other settings, another model). Change `CLONE` in `nicole.ts` and push; to start over with a new voice print too, delete `nicole-conds.pt` from the release first.

**Clone on your own machine** (Python 3.11):

```
gh release download voice-nicole --dir <work folder> --pattern nicole-de.json --pattern nicole-conds.pt --pattern reference.wav
gh release download voice-nicole --pattern nicole-de-<fingerprint>.flac --output <work folder>/nicole-de.flac
node tools/voice/clone/prepare.ts <work folder>
python3.11 -m venv .venv && .venv/bin/pip install --require-hashes --no-deps -r tools/voice/clone/build-requirements.txt
PATH=.venv/bin:$PATH .venv/bin/pip install --require-hashes --no-deps --no-build-isolation -r tools/voice/clone/requirements.txt
.venv/bin/python tools/voice/clone/clone.py <work folder> de
cp <work folder>/nicole-de.flac <work folder>/nicole-de-<new fingerprint>.flac
gh release upload voice-nicole <work folder>/nicole-de-<new fingerprint>.flac --clobber
gh release upload voice-nicole <work folder>/nicole-de.json --clobber
```

The fingerprint is the first 16 characters of `audio` in the index (`nicole-de.json`), before and after cloning. If the release had no voice print, `clone.py` made one: upload `nicole-conds.pt` and `reference.wav` too, before any other language is cloned. The workflow does all of this by itself, and also removes audio no index names any more.

The first run downloads Chatterbox (about 3 GB) and Whisper into the Hugging Face cache.

**Lost everything.** The repository has all it takes: the workflow rebuilds whatever the release lacks from the pinned models. The release keeps the voice print, so even a re-run from scratch speaks with the same Nicole.

## Files

| File | What it does |
|---|---|
| `render.ts` | Renders all sprites (`npm run voice`, run by build and dev): radio, announcer, Nicole |
| `clonestore.ts` | The build cache's clone stores for `render.ts`: a store taken from the cache only if it is the audio its index names, written whole or not at all, the language's earlier stores removed |
| `ffmpeg.ts` | ffmpeg for `render.ts`: the release it comes from, the SHA-256 of each platform's binary, fetched only when the cache lacks it |
| `nicole.ts` | What Nicole is made of: Kokoro voice, reference, clone settings, the release, the keys of her lines |
| `clone/prepare.ts` | Writes the list of lines to clone and the reference, checks the Python lock against `nicole.ts` |
| `clone/clone.py` | Clones the missing lines of one language with Chatterbox, checks them with Whisper |
| `clone/requirements.in`, `clone/requirements.txt` | The Python packages `clone.py` runs on, and their lock with hashes |
| `clone/build-requirements.in`, `clone/build-requirements.txt` | The build tools of the two packages that come as source, and their lock |
| `clone/lock.ts` | Finishes the lock after pip-compile: torch's CPU builds, Chatterbox at its commit |
| `.github/workflows/voice.yml` | Runs prepare and clone for every language (reading only) and updates the release (a job of its own) |

## Licenses

espeak-ng and the ffmpeg build are GPL-3.0; the audio they produce is not covered by the GPL. Kokoro and the Whisper model are Apache-2.0, Chatterbox (code and weights) and Perth are MIT. None of them is part of the game: they only run where the voices are made. The rendered voices are not kept in the repository.
