# .github/workflows

The GitHub Actions of the repository. Deploying is not one of them: Cloudflare Pages builds the site itself from every push.

- `voice.yml` (workflow "Voice"): clones Nicole's lines into German, Spanish and French whenever the lines, their translations or the clone tools change on `main`, or by hand (Actions → Voice → Run workflow), and keeps them as assets of the release `voice-nicole`. The clone jobs, which run Chatterbox, Whisper and their packages, may only read; a separate upload job, which runs no code of others, checks each store they hand on and writes the release. See `tools/voice/README.md`.
- `cla.yml`: checks every pull request for the signed Contributor License Agreement (`contributors/<login>.txt`, see `CONTRIBUTING.md`), labels it `cla: missing` or `cla: signed` and comments when that changes. It never runs code from the pull request.

The actions they use are pinned to their commits, and each job gets only the permissions it needs.
