# src/net

The online tournament, without a game server: browsers find each other through public Nostr relays and then talk directly over WebRTC (Trystero). One browser leads (the one longest in the room) and runs the bots and the shared rules; every browser runs its own ship and decides its own shots.

| File | What it does |
|---|---|
| `transport.ts` | The wire: Trystero (over the relays of `relays.json`, Trystero's own when none of them answers within 10 seconds; with STUN and the TURN relay from `/turn`), or a BroadcastChannel for local tests (`?local=1`) |
| `relays.json` | The public Nostr relays every browser connects to; written by `npm run relays` (`tools/relays/`), checked every week, never edited by hand |
| `session.ts` | The protocol: message types (a hook's hold: rock, ship, core, torpedo, whose browser then decides for it, or probe, reeled in on every browser), rate limits, who leads, starting over after a lost link, the ping to every peer (once a second, the median of its last few round trips) |
| `online.ts` | Who owns which ship, what goes over the network, the lead's bots; the peer a ship's ping is measured to (a bot's is the lead that runs it) and whether a Host's ship belongs to the browser that leads |
| `validate.ts` | Checks the shape of every message from other browsers |
| `plausible.ts` | Checks whether what a browser reports could have happened (jumps, the nose's turn and the beams along it, novas, torpedoes, a torpedo or probe claimed by a hook only within its reach, kills, the evidence of hits), on the time its states were sent; a ship that fails a check again and again gets its Host reported, and a majority of the flying Hosts casts out a cheater |
| `room.ts` | A room as its link describes it: code, name, mode, bots; the link a friend follows into it (shared by the share button) |
| `lobby.ts` | Public tournaments announce themselves; the list listens |

Every message from outside is untrusted: it passes `validate.ts`, then the plausibility checks. Test with two tabs (`?local=1#t=<code>`) or `npm run e2e`; `datenschutz.html` names every data flow that goes over the network.
