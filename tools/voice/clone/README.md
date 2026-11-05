# tools/voice/clone

The two steps that clone Nicole and the campaign's people (Rask, Pim, Hedda) into German, Spanish and French, and the lock of the Python packages they run on. The whole pipeline, in plain words, is in [`../README.md`](../README.md); the workflow `.github/workflows/voice.yml` runs these steps on GitHub.

- `prepare.ts` (Node): writes into a work folder every speaker's lines to clone with their keys (`lines.json`), how much each language's job has to do (`todo.json`, a missing voice print counted for the German job only) and the English reference recordings of the speakers without a voice print; refuses a Python lock that names another Chatterbox or `soundfile` than `../nicole.ts`.
- `clone.py` (Python 3.11): clones the missing lines of one language with Chatterbox, speaker after speaker with the model loaded once, checks every sentence with Whisper, and writes each speaker's store (`<speaker>-<language>.flac` and its index; the release keeps the audio under its fingerprint); a speaker without a voice print gets one in the German job, even with nothing to clone, and waits in the others.
- `requirements.in`: the Python packages `clone.py` needs, the input of the lock.
- `requirements.txt`: the lock, every package by version and hash (made by pip-compile and `lock.ts`, never edited by hand); installed with `pip install --require-hashes --no-deps`.
- `build-requirements.in`, `build-requirements.txt`: the build tools of Chatterbox and Perth, which come as source, and their lock; installed before `requirements.txt`.
- `lock.ts` (Node): finishes `requirements.txt` after pip-compile: torch and torchaudio as PyTorch's CPU builds, Chatterbox as the archive of its commit. How to lock again: `../README.md`, "The Python lock".
