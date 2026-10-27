# functions

Server code: Cloudflare Pages Functions of the same Pages project as the site (never a separate Worker). There is one:

- `turn.ts` (`GET /turn`): hands out short-lived credentials for Cloudflare's TURN relay, for players whose networks block direct connections. The TURN key stays here, read from the project's environment; the function keeps its own monthly budget of relay traffic and hands out nothing once it is spent or cannot be read. Its answers name only fixed reasons; what an upstream service answered goes to the function's log. `src/net/turn.test.ts` checks that.

Its variables are set in the Cloudflare dashboard (secrets) and in `wrangler.toml` (plain values); the repository's CLAUDE.md names them. Cloudflare builds and deploys it with every push.
