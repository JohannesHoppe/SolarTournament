# .github/workflows

The GitHub Actions of the repository. Deploying is not one of them: Cloudflare Pages builds the site itself from every push.

- `voice.yml` (workflow "Voice"): clones Nicole's lines into German, Spanish and French whenever the lines, their translations or the clone tools change on `main`, or by hand (Actions → Voice → Run workflow), and keeps them as assets of the release `voice-nicole`. See `tools/voice/README.md`.
- `relays.yml` (workflow "Relays"): every Monday, and by hand, checks the public Nostr relays of the online tournament (`npm run relays`) and commits `src/net/relays.json` to `main` when the healthy relays changed. It runs only the repository's own code, installs without install scripts and holds no secret besides the `GITHUB_TOKEN`, which only the pushing step sees. See `tools/relays/README.md`.
- `cla.yml`: checks every pull request for the signed Contributor License Agreement (`contributors/<login>.txt`, see `CONTRIBUTING.md`), labels it `cla: missing` or `cla: signed` and comments when that changes. It never runs code from the pull request.

The actions they use are pinned to their commits.
