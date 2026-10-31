# .github/workflows

The GitHub Actions of the repository. Cloudflare Pages builds the site itself, from the two stage branches only, which `ci.yml` moves.

- `ci.yml` (workflow "CI"): every push to `main` renders the voice sprites, checks types and duplicates, runs the unit tests and the site's build; only a commit that passes them all goes on to `stage_test` and, while `PROMOTE_PROD` is on (no players yet), `stage_prod`. Its sprites go up to the release `voice-sprites` under their inputs' key with a pointer per commit (the newest 30 kept), and Cloudflare's build takes them from there (`tools/voice/prebuilt.ts`). The check job, which runs our code and its packages, may only read; the publish job, which runs nothing but the shell, jq, git and gh, writes the release and the two branches. A newer push cancels an older run.

- `voice.yml` (workflow "Voice"): clones Nicole's lines into German, Spanish and French whenever the lines, their translations or the clone tools change on `main`, or by hand (Actions → Voice → Run workflow), and keeps them as assets of the release `voice-nicole`. The clone jobs, which run Chatterbox, Whisper and their packages, may only read; a separate upload job, which runs no code of others, checks each store they hand on and writes the release. See `tools/voice/README.md`.
- `relays.yml` (workflow "Relays"): every Monday, and by hand, checks the public Nostr relays of the online tournament (`npm run relays`) and commits `src/net/relays.json` to `main` when the healthy relays changed. It runs only the repository's own code, installs without install scripts and holds no secret besides the `GITHUB_TOKEN`, which only the pushing step sees. See `tools/relays/README.md`.
- `cla.yml`: checks every pull request for the signed Contributor License Agreement (`contributors/<login>.txt`, see `CONTRIBUTING.md`), labels it `cla: missing` or `cla: signed` and comments when that changes. It never runs code from the pull request.

The actions they use are pinned to their commits, and each job gets only the permissions it needs.
