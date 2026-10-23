# tools/voice/clone

The two steps that clone Nicole into German, Spanish and French. The whole pipeline, in plain words, is in [`../README.md`](../README.md); the workflow `.github/workflows/voice.yml` runs these steps on GitHub.

- `prepare.ts` (Node): writes into a work folder the lines to clone with their keys (`lines.json`), how many each language still lacks (`todo.json`), the Python requirements, and the English reference recording.
- `clone.py` (Python 3.11): clones the missing lines of one language with Chatterbox, checks every sentence with Whisper, and writes the store (`nicole-<language>.flac` and its index; the release keeps the audio under its fingerprint); a run without a voice print makes it first, even with nothing to clone.
