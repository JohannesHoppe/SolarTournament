# src/net

The online tournament, without a game server: browsers find each other through public Nostr relays and then talk directly over WebRTC (Trystero). One browser leads (the one longest in the room) and runs the bots and the shared rules; every browser runs its own ship and decides its own shots.

| File | What it does |
|---|---|
| `transport.ts` | The wire: Trystero (with STUN and the TURN relay from `/turn`), or a BroadcastChannel for local tests (`?local=1`) |
| `session.ts` | The protocol: message types, rate limits, who leads, starting over after a lost link |
| `online.ts` | Who owns which ship, what goes over the network, the lead's bots |
| `validate.ts` | Checks the shape of every message from other browsers |
| `plausible.ts` | Checks whether what a browser reports could have happened; a majority of the flying Hosts casts out a cheater |
| `room.ts` | A room as its link describes it: code, name, mode, bots; the link a friend follows into it (shared by the share button) |
| `lobby.ts` | Public tournaments announce themselves; the list listens |

Every message from outside is untrusted: it passes `validate.ts`, then the plausibility checks. Test with two tabs (`?local=1#t=<code>`) or `npm run e2e`; `datenschutz.html` names every data flow that goes over the network.
