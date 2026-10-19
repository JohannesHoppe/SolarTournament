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
- [ ] Sync wreckage over the network (every browser creates it on its own; laser hits on wreckage stay local)

### 3. The tournament as a show

- [ ] Spectator mode: broadcast with an automatic director camera
- [ ] Slow-motion replay of kills (kill cam)
- [x] Radio 2584: generative music with Tone.js, in sync for all pilots
- [ ] Radio 2584: commentator, jingles, samples as in Johannes' inscription experiments (`haushoppe/deconstructed-inscriptions`)
- [x] Glitch of the link to the clone on hits, impacts and death
- [ ] Audience favor (hype) for spectacular maneuvers
- [ ] Sponsors on the ships, sponsor missions
- [ ] Clone counter with HUD artifacts after many copies

### 4. Arenas with their own physics

- [ ] Saturn's rings: thousands of chunks of ice
- [ ] Kessler field: debris of a destroyed station
- [ ] Gas giant: strong gravity, swing-by as a weapon
- [ ] Close to the sun: brutal heat, solar storms disturb the sensors

### 5. Game modes

- [ ] Slingshot race with checkpoints around gravity wells
- [ ] Last Clone Standing: three clones, after that only with longer ads
- [ ] Teams: humans against aliens

### 6. Tactics

- [ ] Torpedoes: few shots, homing, can be shot down with the laser
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
- Privacy policy (`datenschutz.html`, section 6 "Werbung"): it announces the planned ad network. Before the first real ad is shown, analyze the chosen network exactly (what it collects, cookies and storage, third-country transfers, consent) and take over its own privacy wording for section 6: name, processed data, legal basis, consent.
