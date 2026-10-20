# TODO

## Roadmap

Worked through from top to bottom. Every finished item is also documented in the README.

### 1. Playable for new players

- [x] Gamepad controls
- [x] Touch controls for phones and tablets with nipplejs (as in ordpool's bitmap view: fixed stick left, dynamic stick right, protection against stuck sticks)
- [x] Flight school: guided tutorial for thrust, drifting, flip-and-burn, impact warning, heat in the shadow

### 2. Multiplayer

- [x] Peer-to-peer multiplayer without a server (Trystero), tournament link to share, bots fill free places
- [x] The shooter decides about hits, the owner applies the damage; prediction and smooth correction of remote ships
- [ ] TURN server for players behind strict firewalls (e.g. Cloudflare TURN; check costs and limits)
- [x] Sync wreckage over the network: pieces fly from where the owner saw the ship break up, shot or rammed pieces burst everywhere, newcomers get the pieces in flight

### 3. The tournament as a show

- [x] Spectator mode: broadcast with an automatic director camera
- [x] Slow-motion replay of kills (kill cam)
- [x] Radio 2584: generative music with Tone.js, in sync for all pilots
- [ ] Radio 2584: commentator, jingles, samples as in Johannes' inscription experiments (`haushoppe/deconstructed-inscriptions`)
- [ ] Radio 2584: now and then something cheerful in between (indie dance-pop after The Ting Tings). A first try (major key, claps, cowbell, choppy chords) did not sound right and is out again; revisit later
- [x] Glitch of the link to the clone on hits, impacts and death
- [ ] Audience favor (hype) for spectacular maneuvers
- [ ] Sponsors on the ships, sponsor missions
- [ ] Clone counter with HUD artifacts after many copies

### 4. Arenas with their own physics

- [x] Every round in another arena; tournaments walk through all of them in an order of their own
- [x] Rings of Kronos: chunks of ice in a thin sheet
- [x] Kessler field: debris of a destroyed station on crossing orbits
- [x] Gas giant: strong gravity, swing-by as a weapon
- [x] Corona: close to the sun, radiators barely cool, solar storms blind the sensors
- [x] Event horizon: a black hole that pulls everything in, with a gravitational lens
- [x] The derelict: a broken world ship as the only cover

### 5. Game modes

- [x] Race: three laps through eight gates, lasers on; rooms play deathmatch, race, or both in turn
- [ ] Slingshot race with checkpoints around gravity wells
- [ ] Last Clone Standing: three clones, after that only with longer ads
- [ ] Teams: humans against aliens

### 6. Tactics

- [x] Torpedoes: few shots, homing, can be shot down with the laser
- [ ] Decoys and silent running: a cold ship without drive is harder to detect

### 7. Spreading the game

- [ ] Kill clip as a short video to share
- [ ] Leaderboard without a server of our own

## Domains

- `solartournament.games` (main address) and `solar-tournament.games` (redirects to it) are registered at GoDaddy, DNS at Cloudflare.
- `solartournament.com` is not registered; it was available on 2026-10-18. `solartournament.org` belongs to someone else (paid until 2027-01-28).
- `.game` is too expensive at around $300/year; `.games` costs only a few euros.

## Ads in the sponsor break

- Connect a real ad network: a class implementing `AdProvider` from `src/game/sponsors.ts` replaces `SatireAds` (`src/game/satire-ads.ts`).
- **Johannes' rules for any ad network, not negotiable:**
  - Ads stay inside the small sponsor slot (`#ad-slot`). No full-screen ads of any kind: no interstitials, no vignettes, no rewarded video that takes over the screen, no anchor or side-rail overlays, no Auto ads.
  - No misleading ads (fake download or play buttons, fake system warnings, bait). Serious advertising only.
  - A network that breaks these rules is removed.
- Candidates checked on 2026-10-19:
  - Google AdSense **H5 Games Ads** (Ad Placement API): out. Its interstitial and rewarded formats are full-screen.
  - Google AdSense **display unit** (fixed size in `#ad-slot`, Auto ads off, vignette and anchor off): the only candidate open to a small site. Blocking controls exist (advertiser URLs, general and sensitive categories, Ad review center for single ads). Risk: Google forbids ads "on screens without publisher-content" or used "for … behavioral purposes"; a pure waiting screen may count as one. The sponsor break would need real content around the ad (Nicole's line, the round so far, who killed the clone). Needs the Google-certified CMP (Google offers its own) for personalized ads in the EEA, UK and Switzerland.
  - EthicalAds (no tracking, one small ad): developer sites with 50k+ pageviews a month only. Carbon Ads: hand-picked tech sites. Neither fits a game today.
  - AppLixir (rewarded video, 5,000 daily active users minimum) and AdinPlay/Venatus: built around video and full-screen formats; check against the rules above before considering them.
  - Direct sponsors in the slot, sold by hand: fits the lore and the rules best, needs an audience first.
- Ad networks forbid rewarding clicks on the ad itself; the clone boots from a button of its own, never from a click on the ad. Check the chosen network's policies before connecting it.
- Privacy: consent banner (GDPR) as soon as personalized ads are served.
- Privacy policy (`datenschutz.html`, section 6 "Werbung"): it states that only satire ads run and no ad network is connected. Before the first real ad is shown, analyze the chosen network exactly (what it collects, cookies and storage, third-country transfers, consent) and take over its own privacy wording for section 6: name, processed data, legal basis, consent.

## Later: a youth edition for Poki

Long term, not on the roadmap yet. First learn with SolarTournament what works (flight feel, rounds, bots, multiplayer); then, maybe, monetize it as a separate, colorful edition on [Poki](https://poki.com), the curated web games portal. This game stays as it is.

**Poki in short** (checked on 2026-10-20, from sdk.poki.com and its deals and quality guideline pages):

- Curated: every game is chosen by hand; Poki for Developers is a closed beta, games are submitted through a form. A free playtesting tool can be used before any deal, with no obligation to publish.
- Technical: first download under 8 MB, 16:9 canvas, Poki SDK mandatory. Only Poki's own ads; any other ad network, tracker or external service needs Poki's written consent. Soft release before the full launch.
- Money: ad revenue share. Players Poki brings: 50/50. Players the game brings itself (direct, bookmarks, search, own community): 100 % to the developer.
- Deals: web exclusive by default (Poki's pages say 5 years in one place, 7 in another; check the actual contract). Steam, app stores and consoles stay free; Discord and YouTube Playables count as web and would break exclusivity. Alternative: non-exclusive, a one-time flat license fee, no revenue share.
- Content: safe and inclusive for all ages. Mildly inappropriate content (light dating mechanics, suggestive jokes, violent scenes) must be removed or reframed. No look-alikes of known IPs.
- Chat or user-generated content only with Poki's approval and Poki's moderation tools.
- Multiplayer tools, free: Netlib (`@poki/netlib`, peer-to-peer over WebRTC datachannels, Poki hosts signaling and STUN/TURN; beta, contact Poki before going live) and AUDS (a data store for levels, leaderboards, turn-based play).

**What already fits:** a static site of about 3.3 MB, touch, gamepad, fullscreen on phones, bots that fill free places, tournament links, no free chat, the respawn break as the natural ad moment.

**What a youth edition would have to change:**

- Setting: no Orange President, no United Solar States, no deportations, no "die for the President", none of the announcer's racist satire lines. A neutral, cheerful sci-fi tournament instead.
- Nicole: a friendly flight computer, not flirting, not "a little indecent".
- Death: respawn without remembered pain and rotting souls. Cartoon explosions, no blood (there is none now either).
- Satire sponsors and the ad blocker scolding: out; Poki's ads only.
- Trystero and the public Nostr relays: replaced by Netlib (which also brings the TURN server from roadmap item 2).
- Onboarding: fun within seconds. The flight school shrinks to a few drills or becomes optional; the autopilot stays the default.
- Look: bright, colorful, "quietschebunt" (Johannes' word).
- Licensing: the game is AGPL and runs on solartournament.games. A web exclusive deal would need a separate license from Johannes as rights holder for the youth edition's own code and assets, and the edition must not appear on another web portal. Otherwise only the non-exclusive deal with a flat fee remains.

**Open conflict with the ad rules above:** Poki's SDK shows its own full-screen breaks (commercial breaks between rounds or after a death, rewarded breaks the player opts into). Johannes' rules for this game forbid every full-screen ad. For a youth edition on Poki, decide first whether those rules apply there too; if they do, Poki is out.
