# tools/voice/clone

The two steps that clone Nicole into German, Spanish and French, and the lock of the Python packages they run on. The whole pipeline, in plain words, is in [`../README.md`](../README.md); the workflow `.github/workflows/voice.yml` runs these steps on GitHub.

- `prepare.ts` (Node): writes into a work folder the lines to clone with their keys (`lines.json`), how many each language still lacks (`todo.json`) and the English reference recording; refuses a Python lock that names another Chatterbox or `soundfile` than `../nicole.ts`.
- `clone.py` (Python 3.11): clones the missing lines of one language with Chatterbox, checks every sentence with Whisper, and writes the store (`nicole-<language>.flac` and its index; the release keeps the audio under its fingerprint); a run without a voice print makes it first, even with nothing to clone.
- `requirements.in`: the Python packages `clone.py` needs, the input of the lock.
- `requirements.txt`: the lock, every package by version and hash (made by pip-compile and `lock.ts`, never edited by hand); installed with `pip install --require-hashes --no-deps`.
- `build-requirements.in`, `build-requirements.txt`: the build tools of Chatterbox and Perth, which come as source, and their lock; installed before `requirements.txt`.
- `lock.ts` (Node): finishes `requirements.txt` after pip-compile: torch and torchaudio as PyTorch's CPU builds, Chatterbox as the archive of its commit. How to lock again: `../README.md`, "The Python lock".
