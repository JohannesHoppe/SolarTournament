# tools/relays

Keeps the list of public Nostr relays the online tournament finds peers through, `src/net/relays.json`. Every browser of the game connects to all relays of the list (see `src/net/transport.ts`); the build allows exactly these, plus Trystero's built-in ones as the fallback, in the Content Security Policy (`vite.config.ts`).

- `check.ts` (`npm run relays`, about a minute and a half): gathers candidates, checks them and rewrites the list when the healthy relays changed.

**Candidates.** The relays already in the list, Trystero's built-in list, and a relay directory: the NIP-66 relay discovery events (kind 30166) that independent relay monitors publish, read from `wss://relay.nostr.watch`, `wss://monitorlizard.nostr1.com` and `wss://relaypag.es`. Of the directory, only relays that at least two monitors reported within the last hour, with no requirement the game cannot meet (auth, payment, proof of work, restricted writes), at most 150, the most often reported first. A directory that does not answer is skipped; the other candidates remain.

**The check.**

1. Read: every candidate gets Trystero's subscription (a NIP-01 `REQ` for an ephemeral kind and an `#x` topic) and has to answer with `EOSE` within 5 seconds.
2. Write: the readers (the list's first, then Trystero's, then the fastest, 64 at most) are probed in three rounds 15 seconds apart. Each round subscribes, publishes three ephemeral events at once, built by Trystero's own code as the game signals (a joining browser sends its announcement and first offers in such a burst), and passes when the relay accepts every one (`OK`, not rate-limited) and hands each back on the subscription. A relay that refuses once is not asked again, so a relay gets at most nine events per run, none of them stored (kinds 20000–29999 are ephemeral).

**The list.** The relays that passed every round: those already in the list keep their place, so browsers of builds a week apart still share their relays; then the fastest (median time from opening the socket to the event coming back, measured from wherever the check runs), one per operator (registrable domain), 12 in all. The file holds the relays in alphabetical order and the date they last changed; it is only rewritten when they change. With fewer than 6 healthy relays it stays as it is and the check fails.

The workflow `.github/workflows/relays.yml` runs the check every Monday and commits a changed list to `main`. Run it by hand after a Trystero update, or when online tournaments stop finding each other, and commit the new list.
