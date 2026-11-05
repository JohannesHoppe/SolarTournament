# The campaign: story and design bible

> **Spoilers, all of them.** This file holds every twist of the solo campaign. Johannes plays it first and wants to be surprised: he does not read past this box until he has flown it to the end.

The campaign is the road of one nobody from a scrapyard in the asteroid belt to the President's Ballroom on the Moon, where the Hosts of the Presidential Games are admitted. It is solo only. Online rounds stay fair and alike for everyone: nothing earned here counts online beyond what the tournament hangar already allows (see section 5, "Online").

Built so far (`src/campaign/`, flown on the address with `?campaign`): the campaign's state and save, the mission runner on the flight school's drills, the pay with the yard's cut, the prologue and chapter 1 in a first Boneyard on Psyche (racks in rows, the lane, the depot with bay 3 and its landing pad, Psyche below): Cold Boot (Nicole booting and crashing, Rask's call, the flight into the bay and onto the pad), Lamplighter, Live Target, Canister Sweep, The Cutter (fitted on the Bond), First Cut and Docking Lane, each begun on the pad, briefed by Rask over the comm (his own voice, his hologram), one running on into the next; short of what the catalogue below plans for them (the canister of the sweep towed on a cable, the ore glints of the first cut, Patience moored as a solid hull for the docking lane, but no hits taken off the pay, no scenes in person yet). Section 10 maps the rest onto what the game already does and names the first slice to build.

---

## 1. Premise and arc

### The pitch

A Host with a debt, a hull without a gun and a flight computer pulled out of a bin works its way out of the Boneyard on Psyche, through the Belt, the moons of Jupiter and Saturn, past Pluto and out into the dark beyond the planets, to be admitted to the Presidential Games. Menial jobs buy a mining cutter, the cutter buys a laser, the laser buys the first escort contracts, and the escorts buy the ratings. On the way the ship turns from scrap into the fourth ship of the game, and the broken voice in the cockpit turns back into someone.

Tone: the universe's satire (sponsors, ratings, a demented President, a regime that renames everything) over a warm heart. The jokes are the regime's; the feelings belong to the Host, Nicole and the people who help them. Every chapter has one wild thing to fly (a race, a brawl, a dive), one quiet thing to find, and one turn of the story.

Size: a prologue and nineteen chapters in five acts, about seventy missions, some twenty-three places (two more as side trips). For a Host who plays every story mission and a fair share of the side jobs, some fifteen to twenty hours.

### The rules of the campaign's world

These follow from the universe as the README tells it and hold everywhere in the campaign.

- **The Host never flies.** The clone in the cockpit is the pilot; the Host lies in a link couch and lives everything it lives. The Host is silent: others talk to the Host, the Host answers by flying.
- **The Host stays; only the clones travel.** The Host's body lies in couch 14 of the couch cellar under the Boneyard's depot on Psyche, among the couches of Rask's other debtors, fed by tubes, and it stays there through the whole campaign, bound by the Bond. Clones are printed wherever the work is: by the yard's printer on Psyche, later by Patience's printer aboard. The link is radio, and radio is slow, which does not matter: the clone in the cockpit decides everything itself anyway, and its life reaches the Host as fast as light allows, live on Psyche, some forty minutes late from Jupiter, hours late from the outer planets, nearly three days late from the black hole of section 8. The HUD shows the link's delay; Nicole, in the cockpit, is always live. A Host dies at Jupiter and lives the death forty minutes later in a couch in a cellar. Getting out of that couch, out of that cellar, is the oldest wish the Host has. (The Games keep their Hosts close: their couches ride with the Ministry's tournament ships to every arena, so a round's deaths are lived as they happen.)
- **A dead clone, a living hull.** In the campaign a clone's death kills the cockpit, not the ship: the canopy bursts, the drive shuts itself down, and a tug brings the hull back to its dock (the yard's bay, later Patience's clamp), where it is patched and the next clone climbs in. The ship is the one hull the Host has; it survives every death.

- **Holograms in flight, people in person.** Whoever calls the ship while it flies or waits in its clamps comes in as a hologram over the console (see `src/view/hologram.ts`): a projector, a cone of light, a see-through bust in one color, scanlines and flicker, torn by every hit. Each character has a silhouette of its own, recognizable at a glance: Rask fat and greasy, double chin, cigar, gold tooth, a strand combed over his bald head. For the moments that count the clone climbs out: short scenes through its own eyes (Rask's office in the depot, later the galley of Patience), the people there in the flesh, and whatever the clone feels there (a sweaty handshake, a slap on the back) reaches the Host as everything else does.
- **Clones outside the Games cost.** In the Games the sponsors pay for every body. Outside them, a cheap printer prints the Host's clones, and the sponsor break still pays: watch the ad, and the body is free. A Host can always watch the ad. Nobody ever does anything else.
- **Clones have numbers.** The printer stamps every body it prints. The HUD shows the clone's number with every new link ("Establishing live link to clone 0031"), and it counts the Host's real deaths. This looks like flavor for twelve chapters. It is not.
- **Ratings are fame.** The regime measures everyone by ratings, so fame in the campaign is ratings: earned by work that is broadcast, and by style (the moments the game already knows: streaks, a perfect start, a knockout, a supernova).

### Who the Host is at the start

The Host has no name on any register, and no memory of one. All the campaign ever learns is what the Host signed: a **Bond** with Yardmaster Oskar Rask of the Psyche Boneyard. For 25,000 Solar Coins Rask provided a Host license, a couch in his cellar, a printing contract on his yard's cheap printer, and a hull from his stock: **Lot 7731**, the worst fighter in a yard of forty thousand. Rask takes 40 % of every payout until the Bond is paid. The yard's first link is cheap, and it burns the oldest memories first: the Host does not remember signing, nor anything before it. Rask says they come back, mostly. They never do, and the campaign never says who the Host was: a name, a face, a place before the Bond stay open, touched now and then (an old log, a song, a word somebody uses) and never answered.

Lot 7731 has no laser, a cracked drive bell, thrusters at half strength, no armor panels on one flank and a flight computer short of memory, which crashes and boots again in the middle of a sentence. It flies. Barely.

What drives the Host on at first is plain: the Bond, and the way out of it, out of couch 14 and the cellar under the depot. Every Host admitted to the Presidential Games has its debts bought out by the Ministry of War ("Freedom through Games", the posters say), and admission makes a Host famous. Later the drive changes: the voice in the cockpit has a past, and someone is waiting at the end of it.

### The road to admission

The Ministry of War admits a Host to the Games when it has three things: the rating rank **Contender**, a **sponsor**, and a pass of the Ministry's **Final Trial**. The Final Trial is held where the Ministry chooses. For this Host, it chooses the Ninth Planet.

### The twists, in the order the Host learns them

1. **Lot 7731 is no depot fighter.** Under the depot paint lies an off-white band with a dark blue stripe, and a stencil: PAAA 01 · S2. The hull is **Scout Two**, one of the two scouts of the world ship PAAA 01, captured in the battle that broke it and misfiled in the Boneyard ever since. Pim rebuilt it around depot parts, which is why it flies like an interceptor. (End of Act I.)
2. **The salvaged flight computer is Nicole, the first one.** Every voice of the PAAA 01 was a copy of its navigator, **Nicole Aster**: the voice that was to guide the settlers to another star. The Ministry salvaged a copy from the wreck and made the seductive product that sits in every cockpit of the Games. The one in Scout Two is older and untouched, and she guards what she knows: her memories open only to a pilot she trusts. (Grows through Act II; certain at Europa.)
3. **The bandits of the Lanes are strays.** A clone whose link breaks without dying goes on living: a person with all its Host's memories up to the cut, and no Host. The regime calls them strays and hunts them; they call themselves **the Loose**. Their deaths are final. And the Games' house pilots, the eight callsigns every Host fights, are strays the Navy caught and linked to the Ministry. (Ganymede, Act II.)
4. **One stray is the Host.** At Io the link cut in the flux tube; the screen froze, Nicole said they had lost the clone, the printer printed the next. Two hours later Patience found the Magpie adrift, its canopy open, its cockpit empty. That clone lived. It calls itself **Spare**, and it has been raiding the Host's convoys since. (Reveal at Enceladus, Act III.)
5. **The world ship did not break by accident.** The President's first order, at the very start of his reign, was "Nobody leaves." The Navy stopped the PAAA 01 at the edge of the system and broke it; the broadcast called it a tragedy, and the first Presidential Games, the Memorial Games, were fought around the wreck. The Derelict is not a memorial. It is the scene of the crime. (Triton and the Derelict, Act IV.)
6. **The Host's rise was arranged.** Rask recognized the hull and the computer and sold the secret to the Ministry. Commissioner Dolores Quill of the Admissions Office has been clearing the Host's way ever since (the forgiven Bond, the fast-tracked trials), so that the old Nicole would come to trust a pilot and lead the Ministry to the last witness of the Memorial Games. Spare has known for a long time; he raided the Host to stop the Host from rising. (Pluto, Act IV.)
7. **The Ninth Planet is a black hole.** The regime sells plots on "the President's Planet", warm seas and beachfront property. There is no planet. There is a primordial black hole, and the Ministry feeds it comets to make it glow for the broadcast. (Act IV's end.)
8. **Nicole Aster is alive.** She fled the battle in Scout One, flew to the only place the Navy did not guard, set the scout into an orbit around the hole and went into the cold sleep. She is still there. (The Ninth.)
9. **The price of admission.** The Host is admitted, by acclaim: the last fight at the hole went out live and broke every rating. The conditions: the Host forgets what it found, the Magpie's Nicole is certified to the Ministry's firmware, and the Ministry keeps Spare.

### The ending, and how it hooks into the tournament

Admission buys the Host out of the Bond, and out of the cellar: for the first time in the campaign the Host wakes in its own body, carried out of couch 14 under the depot to a couch on the Ministry's ship, and sees its own face, which it does not know. (In the Games, a Host's couch rides with the tournament; a clone's life is lived as it happens.)

At the Ballroom on the Moon the Ministry installs its firmware. Nicole's last free words are for the Host: remember the orbit, remember me. Then a clean chime, and a voice everyone who ever played the flight school knows: "Hi, I am Nicole. Your personal flight computer."

The campaign ends where the game begins. The Host's first round of the Games is an ordinary round of the tournament, flown in the Magpie, now unlocked for every mode. On the roster of house pilots a ninth callsign stands among the eight: **Spare**.

What the Host carries into the Games, nobody else knows. Nicole's line in the sponsor break, "There is a real me, you know. Somewhere out there. Keep fighting, and maybe one day I will tell you where", was always the product talking. Now the Host knows it is true, and knows where. And there is one place left in the system that could thaw a sleeper after so long: the medical deck of the President's own carrier, paid for by every hospital he closed. Every round of the President's Fleet is now a round against the one ship the Host needs to get aboard. That is the door to whatever comes after the campaign.

---

## 2. Acts and chapters

| Act | Chapter | Place | Story | Earned |
|---|---|---|---|---|
| Prologue | 0 Lot 7731 | Psyche, the Boneyard | The link boots at 31 % into a wreck in a rack of forty thousand. Rask explains the Bond. Nicole crackles. | The hull; Nicole: navigation |
| **I Debt** | 1 The Boneyard | Psyche | Menial jobs for Rask's cut. Pim, the yard's undocumented kid welder, patches the hull and names it the Magpie. The mining cutter. Hedda Kroll's Patience docks and takes the Host on. | Mining cutter; thrusters patched |
| | 2 Rheasilvia | Vesta | Rockborn claims on the slopes of the giant central peak. Claim-jumpers, the Saw Brothers, saw rigs off their rocks; the cutter is a poor weapon. The first echo of Nicole's past. | Thrusters to stock, the dodge; Nicole's voice repaired (whole sentences) |
| | 3 Occator | Ceres | The Rockborn capital among the bright spots. The military laser from Navy surplus; the first real escort. Rask sells the Bond to the Tallymen, repo pirates. The Wall Run: Pim's family over the Solar Wall. Pim strips the paint: PAAA 01 · S2. | Laser; main drive to stock; Nicole: targeting |
| **II Lanes** | 4 Stickney | Mars, Phobos | Navy town under the red planet. The Phobos race: the rival Perihelion, who has never died. The Tallymen come to repossess the Magpie; mid-fight a Navy cutter announces the Bond is bought by "an anonymous benefactor". | Armor panels; Nicole: racing line; rank Regional Feed |
| | 5 Valhalla | Callisto | Jupiter fills the sky. *Lanes Watch*, a bounty show on the bandits of the Jupiter lanes, signs the Host. The Loose rob convoys but never kill a clone. | Radiators I; Nicole: radar |
| | 6 Lineae | Europa | An ice tanker through the radiation belt. A dive into a crack of the ice shell finds a science station and Nicole's voice saying her own name: Nicole Aster, navigator. | Plating I; Nicole: threat warnings |
| | 7 Flux | Io | The flux-tube race. Torpedoes. An escort through the tube; the link cuts. The Magpie is found adrift, cockpit empty, Nicole's logs blank for two hours. | Torpedo tube; drive I |
| | 8 Hollow Jack | Ganymede | The bounty on the Loose's chief. He dies for good: a stray, no printer. The truth about strays and house pilots. His harpoon. Victory Cola signs the Host. | The hook; rank Sponsored |
| **III Ratings** | 9 The Circuit | Titan | The Victory Cola Circuit: air races in Titan's orange haze over the methane seas, pit fights under the announcer, Perihelion again. Sponsor probes start appearing. | Second torpedo; thrusters I; neon trim |
| | 10 Plumes | Enceladus | Escorting the sponsor's yacht through the plumes; a staged bandit attack, then a real one. Spare: "Hello, Host." | Plating II; Nicole's voice fully restored; rank Prime Time |
| | 11 Two Faces | Iapetus | A cache on the great ridge; Spare tries to get there first. Commissioner Quill comes aboard Patience with a fast track to the trials. | Drive II; radiators II |
| | 12 The Ring Trials | Saturn's rings | The broadcast qualifiers: race, deathmatch, Capture the Flag, and the President's carrier itself. The Ministry's invitation to the Final Trial at the Ninth Planet. | Torpedo tubes I; rank Contender |
| **IV The Dark** | 13 Verona | Uranus, Miranda | Down the tallest cliff in the system to the Loose's hideout. Spare's people. A Navy sweep. The overdrive. | Overdrive; thrusters II |
| | 14 Memorial | Neptune, Triton; the Derelict | Through Triton's geysers to the Navy's oldest admiral, who tells the truth because he no longer knows what year it is. The Derelict's bridge holds the last log. | Thrusters III; Nicole's memory: Scout One's course |
| | 15 Last Light | Pluto and Charon | The last station before the dark. Spare shows the Ministry's file: the Host was used. The Host goes anyway. Patience signs on as a Feeder. | Nicole: escape gauge and orbit readout; plating III |
| | 16 The Long Ladder | Haumea, Eris | The depots ("rungs") on the way out. A race inside Haumea's ring. Perihelion, now the Ministry's hunter, at Eris. | Drive III; radiators III |
| | 17 Lantern and Granary | Planets X and XI (the game's own) | The settlers who bought plots on the Ninth. The Feeders' store of ice. The Magpie and Patience ride a comet out. | Torpedo tubes II and III; the Magpie complete |
| | 18 The Ninth | The primordial black hole | No planet: a hole, fed to glow. Scout One, and Nicole Aster asleep. The Ministry comes. Perihelion's first death, live. The last tow, with Patience's printer wrecked. Quill's deal. | Admission |
| **V The Games** | 19 The Ballroom | The Moon, Earth | The parade over the President's Ballroom. The certification. The first round of the Games. | The Magpie for the tournament |

Side trips (optional, from Act II on): **Mercury** (sun miners in the Caloris basin; the Terminator Run, a race along the line between day and night) and **Venus** (Victory Cola's cloud city, a race through the acid cloud deck). They pay coins and ratings and hold one echo each, so a completionist hears all of Nicole's past.

---

## 3. Mission catalogue

Every mission names its type, its goal and how it fails in game terms, what it pays (coins ☉ before Rask's cut, and ratings) and what it is built from. "School" means the flight school's drill machinery (`src/game/school.ts`): markers, rings, buoys, debris, drones, sparring bots of a set skill, success and failure conditions, Nicole's lines and repetitions. A mission fails and repeats like a drill: Nicole says why, and the attempt starts over. Bot skills are the bots' skill values (0 to 1; the Games' middling bot is 0.5).

Story missions run once; most others stay on the place's **job board** as repeatable contracts afterwards (full pay the first time, half after; a gold medal for time or a clean run pays a bonus once).

### Prologue and Act I: Debt

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 0.1 | Cold Boot | story | Leave rack 7731 and fly to the yard office beacon: turn, burn, brake, stop within 40 m. Cannot fail. | — | School: turn, drive, brake, stopAt |
| 1.1 | Lamplighter | menial | Relight six dead row beacons: hold within 40 m of each for 3 s before the shift ends (6 min). Fails on time. | ☉ 150 · 10 | School: stopAt, markers |
| 1.2 | Live Target | menial | A sponsor's "Hunt a Hull" experience: paying tourists fire red shots at the Magpie. Survive 90 s inside a 1 km sphere by jinking; every hit takes ☉ 10 off the pay. A death ends it with what was earned. | up to ☉ 300 · 15 | School: the slide drill's gunner, three of them |
| 1.3 | Canister Sweep | menial | Fly through eight salvage canisters drifting between the racks, one at a time, and deliver each through the crusher ring. Fails after 8 min. | ☉ 200 · 10 | Probe pickup; a ring; new: one carried piece of cargo |
| 1.4 | The Cutter | shop | Buy the mining cutter (☉ 1,200) at Rask's counter; Pim fits it. | — | Shipyard |
| 1.5 | First Cut | mining | Break three rocks of the spoil field with the cutter and fly through 20 ore glints. Cannot fail; the cutter overheats fast. | ☉ 40 per ore · 20 | Rock breaking; new: ore glints, the cutter's short reach |
| 1.6 | Docking Lane | escort | Patience docks; shoot twelve pieces of debris drifting into its lane within 2 min. Three strikes on its hull fail it. | ☉ 600 · 40; Patience takes the hull on | School: debris; new: the hauler as a solid body |
| 2.1 | Claim Survey | exploration | Fly within 100 m of five claim buoys on the central peak's flanks, in the order the claims are filed. Fails on 8 min. | ☉ 400 · 20 | Markers; the Belt's buoys |
| 2.2 | Cut and Haul | mining | Mine 40 ore from a claimed rock beside a working rig; every beam on the rig costs ☉ 50. | ☉ 35 per ore · 25 | Rock breaking; the Belt's rigs (a beam on a rig counts as a hit on its rock already) |
| 2.3 | Saw Brothers | fight | Three claim-jumpers (skill 0.15) saw at a rig; shoot two of them down with the cutter. The rig falls at 30 hits; that fails it. | ☉ 1,200 · 80 | Sparring bots; new: a rig's health |
| 2.4 | The Peak Run | race | The Rockborn kids' race: six gates around the central peak, two laps, three rivals (skill 0.2). Top two wins. | ☉ 800 · 60; Pim's thruster parts | Race; a new course |
| 2.5 | Practice Log | exploration | Fly into a lit tunnel of a half-cut rock and hold still at its end for 3 s: echo 1. | 20 | Mining's tunnels; markers |
| 3.1 | Surplus | shop | Buy a Navy surplus laser (☉ 6,000) in the market under Occator's rim. | — | Shipyard |
| 3.2 | Ore Barge | escort | Escort an ore barge on its lane out of Occator; two waves of scrappers (skill 0.2, then 0.3). The barge's health at zero fails it. | ☉ 2,000 · 120 | New: an escorted ship on a lane (see section 10) |
| 3.3 | Repo Men | fight | The Tallymen, holders of the Bond, come for the Magpie. They hook it and reel it towards their tug: shoot three down, or break the cable by shooting the tug's winch. Dragged within 100 m of the tug fails it. | ☉ 1,500 · 150 | Bots with the hook (bots use it already) |
| 3.4 | Wall Run | escort | Lead Pim's family's refugee barge past the finished stretch of the Solar Wall: over it, outside the searchlights' cones. A barge held in a cone for 3 s is seen; seen twice fails it. | ☉ 1,000 · 200 | Escort; new: searchlight cones |
| 3.5 | Scout Two | story | In Pim's workshop the paint comes off. A scene on the hangar's pad. | — | The title screen's pad |

### Act II: Lanes

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 4.1 | Stickney Grand | race | Three laps around Phobos, the course diving into the Stickney crater; Perihelion (skill 0.65) and four others. Top three goes to *Lanes Watch*. | ☉ 2,500 · 250 | Race; new: a moon's surface (see section 10) |
| 4.2 | Bond Day | fight | Ma Tally and six Tallymen (skill 0.35) in Phobos's grooves. Kill four. At the fourth, a Navy cutter hails: the Bond is bought; the Tallymen leave. | ☉ 2,000 · 200; the Bond is gone | Deathmatch with a scripted end |
| 4.3 | Groove Shoot | exploration | A sponsor's camera drone films the Magpie flying a groove under 60 m above the ground for 30 s. | ☉ 1,200 · 150 | Surface; new: a height band |
| 5.1 | Pilot Episode | bounty | *Lanes Watch* goes on air: the Tallyman "Red Ledger" (skill 0.4) and two wingmen. Kills of the target pay; style moments pay double ratings. | ☉ 3,000 · 300 | Deathmatch; a named target; moments |
| 5.2 | Ice Run | escort | Three ice tugs through a field to Ganymede. The Loose (skill 0.45) hook the tugs away instead of shooting them, and never fire at the Magpie's drive. One tug lost is allowed. | ☉ 2,500 · 200 | Escort; bots with the hook |
| 5.3 | Valhalla Sprint | race | Gates in a straight line over the rings of the Valhalla basin, at the speed limit, against the clock. Gold under 40 s. | ☉ 1,500 · 150 | School: the full-speed course |
| 5.4 | Callisto Echo | exploration | Echo 3, in an old Navy listening post among the craters. | 30 | Markers |
| 6.1 | Dose | escort | Escort an ice tanker out through Jupiter's radiation belt. A dose meter fills while in the belt; full, the clone dies. Loose raiders slow the tanker. The tanker lost fails it. | ☉ 3,500 · 250 | Escort; new: the dose (a hazard like heat) |
| 6.2 | Under the Lineae | exploration | Fly down a crack of the ice shell, 200 m wide, to a science station, and hold at its dish: echo 4. | ☉ 1,000 · 100 | Surface as a canyon; markers |
| 6.3 | The Quiet Man | bounty | A Loose raider (skill 0.5) who shoots only drives and never finishes a clone. Shoot him down, or let him go when he turns away (fewer ratings; Nicole remembers it later). | ☉ 2,500 · 250 or · 100 | Duel; a choice |
| 7.1 | Flux Tube Race | race | Gates through the Io plasma torus. The nearer the flux tube, the more the link glitches (the picture breaks up as on a hit). Perihelion again. Top two. | ☉ 4,000 · 350 | Race; the link glitch |
| 7.2 | Tube Fitting | shop | The first torpedo tube (☉ 2,000), fitted by Io's sulfur miners. | — | Shipyard |
| 7.3 | Blackout | story escort | Escort a sulfur freighter through the tube. At two thirds of the way the link cuts: the picture freezes white, no datamosh, LINK LOST. A new clone boots on Patience's printer; the freighter made it alone. Then Patience's log: the Magpie recovered adrift, canopy open, cockpit empty. Cannot fail. | ☉ 2,000 · 150 | Escort; new: the link cut |
| 8.1 | Hollow Jack | bounty | Hollow Jack (skill 0.7, shoves and hooks) and three of the Loose among Ganymede's ice. Kill Jack. | ☉ 6,000 · 600 | Deathmatch; a named target |
| 8.2 | The Harpoon | salvage | Fly through the piece of Jack's wreck that holds his harpoon before it drifts out of the arena. | the hook | Wreckage; probe pickup |
| 8.3 | Swing Shift | skill | In a tug yard, hook three rocks in turn and let go faster than 65 m/s each time. | ☉ 1,000 · 100 | School: the hook drill |
| 8.4 | Sponsor Night | story | Bellamy Crisp of Victory Cola signs the Host. Rank Sponsored. | — | A scene |

### Act III: Ratings

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 9.1 | Qualifying Heat | race | Three laps through Titan's haze over Kraken Mare, the course dipping into the thick air. Top three. | ☉ 4,000 · 400 | Race; Jupiter's air with Titan's numbers |
| 9.2 | Pit Fight | arena | A five-minute deathmatch in the haze, the announcer on air. Place top three. | ☉ 4,000 · 500 | Deathmatch; air |
| 9.3 | Haze Duel | duel | Perihelion alone, in air where the eye sees 600 m and the radar twice that. Win. He breaks off before his clone dies (he always does). | ☉ 3,000 · 400 | Duel; the senses in haze |
| 9.4 | Circuit Final | race | The final: win it. | ☉ 6,000 · 800 | Race |
| 9.5 | Methane Echo | exploration | Echo 7, low over the methane sea, where the haze hides it from the eye but not from the radar. | 40 | Markers; radar |
| 10.1 | Plume Yacht | escort | Escort Crisp's yacht through the plumes. Staged "bandits" fire to miss, for the cameras. Then real raiders (skill 0.65) shoot the actors and go for the yacht. | ☉ 5,000 · 500 | Escort; scripted waves |
| 10.2 | Hello, Host | story duel | A grey interceptor with "SPARE" sprayed on its flank fights exactly like the Host and breaks off at half health. His hail. | · 300 | Duel; new: a bot replaying the Host's recorded flight habits (optional, see section 10) |
| 10.3 | Tiger Stripes | race | A time trial down the four stripes, through gates at the vents, for a Victory Cola ad. Gold under the ad's 60 s. | ☉ 2,500 · 300 | Race against the clock; the plumes as drill dust |
| 11.1 | The Ridge | exploration | Fly the equatorial ridge low and find the cache (echo 8) before Spare's two wingmen do. | ☉ 2,000 · 300 | Surface; markers; bots racing to a point |
| 11.2 | Office Hours | story | Commissioner Quill aboard Patience: the fast track. | — | A scene |
| 11.3 | Last of the Tallymen | bounty | Ma Tally's last tug at the dark face. Kill her and three escorts (skill 0.5). | ☉ 5,000 · 500 | Deathmatch |
| 12.1 | Trial I: the Race | Games | A race in the Rings of Saturn. Top three. | ☉ 5,000 · 1,000 | The existing arena and mode |
| 12.2 | Trial II: the Deathmatch | Games | A deathmatch in the Rings. Top two. | ☉ 5,000 · 1,200 | Existing |
| 12.3 | Trial III: Capture the Flag | Games | Win it. | ☉ 5,000 · 1,200 | Existing |
| 12.4 | Trial IV: the Carrier | Games | The President lends his carrier to the trials: the President's Fleet. Sink it. | ☉ 8,000 · 1,600 | Existing |
| 12.5 | The Invitation | story | Rank Contender. Quill's letter: the Final Trial at the Ninth Planet. | — | A scene |

### Act IV: The Dark

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 13.1 | Verona Drop | exploration | Down the face of Verona Rupes to a hangar in the cliff: under 250 m/s, never more than 300 m off the face, through six buoys. | · 300 | Surface; markers |
| 13.2 | Among the Loose | story | Spare's people. The overdrive, a reactor dump the Games license and the Loose hack in. | the overdrive | A scene |
| 13.3 | The Sweep | defense | A Navy sweep (six at skill 0.5) at the hideout's mouth; Spare flies as the Host's wingman. Keep the mouth clear for 4 min. | ☉ 6,000 · 500 | Deathmatch with an ally (Capture the Flag's sides) |
| 14.1 | Geyser Field | race | Through Triton's nitrogen geysers to the Navy's Memorial Station; a geyser's column shoves a ship it catches. | ☉ 3,000 · 300 | Race; new: columns that shove |
| 14.2 | The Old Admiral | story | Fleet Admiral Vey's confession. | — | A scene |
| 14.3 | The Memorial | exploration | The Derelict: into the bow's torn end and up the bridge tower's decks to its log (echo 9), past a Navy guard (four at skill 0.5). | ☉ 4,000 · 400 | The existing Derelict arena |
| 14.4 | Grave Shift | fight | Out again with the guard on the Magpie's tail; reach the arena's edge. | ☉ 3,000 · 300 | Deathmatch; the edge as the goal |
| 15.1 | Heart Run | race | The Feeder pilots' race over the nitrogen plain of Pluto's heart. Win it, and the Feeders take Patience on. | ☉ 5,000 · 500 | Race; surface |
| 15.2 | The File | story | Spare comes aboard Patience unarmed. | — | A scene |
| 15.3 | Last Light | escort | Patience joins a Feeder convoy past Charon; the Ministry's pickets (skill 0.55) check every ship. | ☉ 6,000 · 400 | Escort |
| 16.1 | Haumea's Ring | race | Gates on Haumea's ring while the elongated body turns beneath it once in four hours. Win. | ☉ 6,000 · 600 | Race; ice of the Rings |
| 16.2 | Rung Two | escort | A fuel barge to the depot at Eris. | ☉ 6,000 · 400 | Escort |
| 16.3 | The Hunter | duel | Perihelion and two Navy fighters at Eris. Win; he breaks off again, swearing. | ☉ 5,000 · 600 | Duel |
| 17.1 | Kiln | story | The settlers on Lantern who bought plots on the Ninth, with their brochures. Carry their letters to the Feeders. | · 200 | Courier rings |
| 17.2 | Granary | stealth | Slip into the Feeders' store of ice, out of the tugs' sensor cones, to the comet bound for the Ninth. Seen twice fails it. | · 400 | Searchlight cones again |
| 17.3 | Ride the Comet | story | Hook the comet's nucleus and hold on in its coma while it is pushed out; its shower is the danger. | · 500 | Comets; the hook |

### Act IV's end: The Ninth

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 18.1 | The Drain | exploration | The "planet" is the hole. Find Scout One among the ice the Feeders parked: hold the crosshair on a body for 2 s to scan it. | · 500 | The Event Horizon's field; new: the scan |
| 18.2 | Scout One | story | Dock beside it. The pod. Nicole Aster. | — | A scene |
| 18.3 | The Feeders' Comet | defense | The Ministry throws a comet at Scout One. Hook Scout One and drag it out of the route before the head arrives, then shoot the shower's pieces near it. | · 800 | Comets aimed at the hole (they are already); hook towing a body |
| 18.4 | First Death | duel | Perihelion and four Navy fighters; Spare beside the Host. Kill Perihelion. His first death, on every screen in the system. | · 1,500 | Duel with an ally |
| 18.5 | Orbit | final | Patience is crippled and her printer wrecked: no clone comes after this one. A death goes black, without an ad, and the mission restarts at its checkpoint; three days later, in the cellar on Psyche, the Host lives whatever happened. Tow Scout One on the hook into a stable orbit inside the disk's glare until the orbit readout says STABLE ORBIT, then let go. Scout One in the hole, or the orbit leaving the arena, fails it. | · 2,000 | Orbit readout; the hook towing; new: no printer |
| 18.6 | The Deal | story | Quill on the cruiser's channel. | admission | A scene |

### Act V: The Games

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 19.1 | The Parade | formation | Fly with the new Hosts through ten rings over the Ballroom's dome, Earth hanging above, staying within 60 m of the Magpie's slot marker. | · 500 | Rings; a moving marker |
| 19.2 | Certification | story | The firmware. | — | A scene |
| 19.3 | Your First Round | Games | A round of the Games in any arena and mode, in the Magpie. | the Magpie unlocked | The tournament |

### Side jobs on every job board

Each place adds three repeatable contracts drawn from its missions' machinery: a **mining run** (ore against the clock), a **courier run** (rings in order, a gold time) and an **ambush** (a wave of the place's bandits). Mercury and Venus offer the **Terminator Run** and the **Cloud Line**, and Earth's orbit, once reached, the existing Satellite Junkyard as a scrapping job for the Orbital Freedom Network ("Junk forever. Your shift starts now.").

### The echoes

Twelve fragments of Nicole's past, one hidden in each of twelve places, found by flying to a point and holding still. Each plays in the voice she has at that moment. Found in order they tell her story; missed ones can be found later.

1. Vesta: "Scout Two, navigator's practice log. Can you hear me, little ship? Good. We will be talking a lot."
2. Ceres: "They painted the emblem on the hull today. Five stars. Somebody cried. I think it was me."
3. Callisto: "Departure minus thirty days. The children keep asking whether the stars are warm."
4. Europa: "This is Nicole Aster, navigator of the PAAA 01. If anyone finds this voice, it is a copy. The real one has gone somewhere better."
5. Io: "Our route dives past the dark mass, burns at the bottom of its well, and leaves. Nobody has ever gone so fast."
6. Ganymede: "The new government sends its compliments. And a fleet."
7. Titan: "Scout Two, you are faster than me. If I ever tell you to run, run."
8. Iapetus: "They are firing on the habitat ring. They are firing on the habitat ring."
9. The Derelict: "Scout Two is taken. I am alone in Scout One. Course: the dark mass. Cold sleep at arrival."
10. Pluto: "If you are hearing this, you have my voice, and I have no idea what they made of it. I am sorry."
11. Granary: "Orbit set. Pod sealed. Wake me when the stars are allowed."
12. Mercury and Venus: two short ones about the ship's crew, for the completionist (her pilot friend Teodor; the gardener of biodome four).

---

## 4. Progression

### The economy

- **Coins (☉).** The campaign pays in Solar Coins, the currency of the universe. It keeps its own wallet: nothing crosses into the tournament hangar's wallet, so the tournament's cap, prices and checks stay as they are.
- **Rask's cut.** Until chapter 4 every payout loses 40 % to the Bond. The Bond's balance shows on the job board; it shrinks, and then, at Phobos, it is simply gone (twist 6, early clue).
- **Ratings.** Paid by missions and by style. Broadcast work (*Lanes Watch*, the Circuit, the trials) pays double for moments: a double kill, a perfect start, a knockout. Ratings are never spent.
- **No repair bills, no lost money on death.** Death costs the attempt and nothing else; the ad pays for the body. The grind stays fun when failing is cheap and trying again is quick.

### Rating ranks

| Rank | Ratings | What it opens |
|---|---|---|
| Unrated | 0 | The Boneyard's jobs |
| Background | 50 | Vesta's claims ("seen in a crowd shot") |
| Local Feed | 250 | Ceres, escort contracts |
| Regional Feed | 1,200 | *Lanes Watch*, bounties, the Jupiter system |
| Sponsored | 3,500 | A sponsor, the Titan Circuit; sponsor probes appear in missions (the sponsors drop them only for rated pilots) |
| Prime Time | 7,000 | The Ring Trials |
| Contender | 12,000 | The Ministry's invitation to the Final Trial |
| Chosen | (by story) | Admission to the Presidential Games |

### The ship's equipment, in the order it is earned

The Magpie starts below the Games' stock interceptor in every respect and ends at the top of the tournament hangar's ladder. "Stock" is the interceptor every Host flies before buying anything. Steps I to III are the tournament hangar's upgrades, at its prices.

| When | Equipment | Price ☉ | What changes |
|---|---|---|---|
| Prologue | The hull | (the Bond) | Main drive at 60 % push (a cracked bell), thrusters at 50 % and no dodge, one flank without armor panels (hits there count double), no laser, no torpedoes, no hook, no overdrive |
| 1 | Pim's patch | free | Thrusters to 70 % |
| 1 | Mining cutter | 1,200 | A laser that breaks rock: reach 400 m, every shot 35 % of the heat capacity |
| 2 | Thruster rebuild | 1,500 | Thrusters to stock; the dodge |
| 2 | A rig's drive bell | 800 | Main drive to 80 % |
| 3 | Military laser | 6,000 | The Games' laser |
| 3 | Drive overhaul | 1,600 | Main drive to stock |
| 4 | Armor panels | 1,500 | The bare flank closed: stock armor |
| 5 | Radiators I | 1,000 | |
| 6 | Plating I | 1,500 | |
| 7 | Torpedo tube | 2,000 | One torpedo per clone |
| 7 | Main drive I | 1,000 | |
| 8 | The hook | 1,500 (fitting) | Jack's harpoon and a tug's winch |
| 9 | Second tube | 2,000 | Two torpedoes: stock |
| 9 | Thrusters I | 1,000 | |
| 10 | Plating II | 3,000 | |
| 11 | Main drive II, radiators II | 2,500 each | |
| 12 | Torpedo tubes I | 1,500 | |
| 13 | The overdrive | 3,000 (fitting) | The Loose's gift |
| 13 | Thrusters II | 2,500 | |
| 14 | Thrusters III | 5,000 | |
| 15 | Plating III | 6,000 | |
| 16 | Main drive III, radiators III | 5,000 each | |
| 17 | Torpedo tubes II, III | 3,000, 6,000 | Complete |

The looks come from Pim and cost little: neon trim and drive flame on the hangar's three steps each, from chapter 9 on, at its prices. The nova core is the sponsors' and appears only as a probe, from rank Sponsored on.

### Keeping the grind fun

- **Short loops.** A menial job lasts two to four minutes. The cutter is reached in about twenty minutes of play, the laser in about two hours.
- **Every chapter shows on the ship.** Pim fits each part on the pad (the title screen's showcase), and the Magpie looks different afterwards (section 5).
- **Medals.** Each repeatable contract has a gold time or a clean run, worth a bonus once. Speedrunners get their sport; others never need it.
- **The tally.** Pim stencils a tally mark under the canopy for every clone lost. It is the Host's real count. Hedda glances at it now and then and says something.
- **Nicole grows.** Her modules restore the HUD piece by piece (below), so a Host feels the ship getting smarter, not only stronger.

### Nicole's restoration

Nicole starts as a salvaged unit: she can fly the ship (the autopilot, the brake, the impact warning are hers from the start: no Host should die for want of them), but most of what the HUD shows in the Games is missing. Her modules cost salvage parts (a few hundred coins each), but she installs one only when the story says she trusts the Host enough: each comes with a chapter.

| Chapter | Module | What returns |
|---|---|---|
| Prologue | Navigation | Markers, the course marker, the X where the flight crosses the next ring's plane |
| 2 | Voice I | Whole sentences instead of chopped words |
| 3 | Targeting | The crosshair glowing over a drive; ships' marks and names |
| 4 | Racing line | The dashed line and its orange bends |
| 5 | Radar | The radar sphere |
| 6 | Threat | ON YOUR TAIL, the lock warning, the torpedo countdown |
| 10 | Voice II | Her own voice, clean |
| 15 | Wells | The escape gauge and the orbit readout |
| 19 | Ministry certification | The Games' Nicole (the end) |

**Her voice, stage by stage.** It is always the same woman: the same voice model, only a different filter and a different way of speaking. The Host should hear the tournament's Nicole under the static long before understanding why.

- *Salvage* (prologue to chapter 1): a narrow band, bit-crushed; whole sentences, formal, but short of memory: now and then she crashes mid-sentence (NAVIGATION UNIT · MEMORY FAULT · REBOOTING), boots with her greeting and has forgotten what she said before; she calls the Host "Host". No flirting: there is not enough of her for it.
- *Voice I* (chapters 2 to 9): clean but thin, a faint crackle; whole sentences, dry humor, curious about the Host. She says "darling" for the first time in chapter 3, by accident, and apologizes for it. Twice she switches the radio's propaganda off herself ("I do not like that man").
- *Voice II* (chapters 10 to 18): her own, warm and quick and brave; playful as the tournament's Nicole is, but nothing in her ever asks the Host to die for anyone.
- *Ministry* (chapter 19 on): the tournament's Nicole, as she is.

After chapter 10 the campaign's hangar lets the Host choose the radio filter of her voice (salvage crackle or clean), as a look only.

---

## 5. The fourth ship: the Magpie

### Its history

The PAAA 01 carried two scouts to fly ahead of it: fast, long-legged ships with room for one pilot in a cockpit and one sleeper in a pod behind it, made to cross the dark before the world ship and report. Scout One was Nicole Aster's. Scout Two was the spare, flown by whoever was on watch, and it carried a copy of her voice like every computer aboard.

In the battle the Navy captured Scout Two in its bay. Nobody knew what to make of a ship that was no fighter, so a quartermaster filed it under "interceptor, damaged" and sent it to the depot on Psyche, where it lay in rack 7731 for longer than anyone remembers, under seven coats of depot paint.

Pim rebuilds it around what the Boneyard has in plenty: depot interceptors' drives, thrusters and armor. That is why it flies by the same rules as every ship of the Games. It is the people's answer to the Sovereign: the Sovereign is the regime's gift, ivory and gold and not a rivet on it; the Magpie is built by hand from stolen parts, and every rivet shows.

It gets its name from Pim in chapter 1: "Magpie. 'Cause everything on you is nicked."

### Stage by stage

1. **Lot 7731** (prologue). Grey depot primer, flaking. One canopy pane welded over with a plate and a periscope camera beside it. One fin a stub. One drive bell cracked, its glow uneven. The depot's red stencil LOT 7731 · SCRAP on both flanks. A single red tail light.
2. **Patched** (chapters 1 to 3). Olive panels from depot fighters, each a slightly different olive; Rockborn plates in yellow and black hazard stripes over the bare flank; the mining cutter's boom under the nose, striped as a moving part; Pim's spray stencil of a magpie on the fin; WE DIG sprayed across a hatch.
3. **Scout Two** (chapters 3 to 8). Pim strips the paint off the nose: the old off-white livery shows, with its dark blue stripes above and below (the same band as the Derelict's), the five stars of the united Earth's emblem and the stencil PAAA 01 · S2 in letters built from bars. The military laser's pod; the torpedo tube in a salvaged pod; radiator fins of a Jupiter tug, bronze and copper, tinted by heat.
4. **Rigged** (chapters 8 to 13). The harpoon's winch on the belly; a Victory Cola decal, as the contract requires (Pim puts it on upside down); neon trim; the tally marks in rows under the canopy.
5. **Magpie** (chapter 13 to the end). The whole livery, hand-brushed: panels in matte black and chalk white, as the bird is colored, every brush stroke showing. The old PAAA band kept on the nose, with S2 and the five stars. A film of salvaged flip paint along the wing edges that shifts from blue to green as the angle changes, as the bird's feathers do. A neon tube in sun orange, bent by hand into a magpie, on the fin. The overdrive's reactor vents tinted straw and blue. The knot sigil of the Loose, small, behind the cockpit. Behind the canopy the hump of the old sleeper pod.

Its hull is built in code like the others: the interceptor's proportions with a scout's long nose and sensor mast, the pod's hump behind the cockpit, two drive bells. Its collider, hit radius and flight model are the interceptor's.

### Online

The Magpie is unlocked for every mode once the campaign ends. It flies like a complete interceptor, as the Sovereign does, and online the tournament's cap holds for it as for every ship (an upgrade counts for one step). It is a trophy, not a better ship. Other Hosts see it in its looks; its pilot could be marked in chalk white with a blue-green shimmer, as the Sovereign's in ivory and gold, if that stays clear of the palette and the HUD's azure. A new ship type that other browsers see raises the protocol's version.

---

## 6. Worlds

Everything up to Pluto is the real solar system as known; numbers are given only where well established, and where a fact is uncertain the text says less. The sky of every place is the real one (from anywhere in the solar system, and even from the black hole, the stars stand where they stand seen from Earth). The sun shrinks and dims with distance by the square: at Jupiter it gives a 27th of Earth's light, at Pluto in 2584 about a 2,400th (noon there is about as bright as dusk on Earth), at the black hole a point still brighter than the full moon seen from Earth.

A place in the game is a **landmark** (the body in the sky, from real maps where they exist), a **field** a few kilometers across (rock, ice, junk, hull, or a patch of surface), a **mood** (the light and color the arenas already have) and a **station**.

### The Belt

- **Psyche: the Boneyard.** A body about 220 km across on average, in the outer main belt, thought to be rich in metal. The Ministry's depot: on its plains, racks of decommissioned fighters run to the horizon in rows, forty thousand of them, olive gone grey, lit by floodlights on lattice masts. Cranes walk the rows. The yard office is a stack of containers with a neon sign, RASK SALVAGE · EVERY BOLT A BARGAIN, half its letters dead. The sun is small and hard; the rows' shadows are long. Flown: menial jobs among the racks, the spoil field's rocks. Mood: the Belt's dusty warmth, but colder and greyer, steel instead of sand.
- **Vesta: Rheasilvia.** About 525 km across. Its south pole is a basin some 500 km wide, struck so hard that pieces thought to come from that blow still fall on Earth as meteorites; in its middle rises a central peak more than twice as tall as Earth's highest mountain. The Rockborn hold claims on its flanks: rigs, buoys and their neon slogans, as in the Belt arena. The vista: the peak's slope falling away below the field, the curve of the basin's rim on the horizon. Flown: claims, mining, the kids' race around the peak.
- **Ceres: Occator.** About 940 km across, the largest body of the belt and a dwarf planet, about a third of the belt's mass. In the crater Occator lie bright spots of salt left by brine from below; seen from orbit they shine on the dark surface like two lamps left on. The Rockborn capital is built into Occator's rim: terraces of habitat domes, markets in old mine galleries, graffiti in neon along the rim (NO WALL IN SPACE). The lone mountain Ahuna Mons stands on the horizon. Flown: the market, escorts out of the crater, the start of the Wall Run.
- **The Solar Wall.** On the lane from the Belt to Mars hangs the finished stretch of the President's wall: a lattice of girders some 340 km long, searchlights sweeping, picket boats at its ends, an enormous neon sign THE SOLAR WALL · MARS PAYS on its middle span. Space around it is open in every direction for millions of kilometers. Nicole, chapter 3: "It is a wall, in space. We go over it." Flown: the Wall Run, out of the searchlights' cones.

### Mars

- **Phobos: Stickney.** Mars's larger moon, about 22 km across, a lumpy grey body scored with long grooves, its crater Stickney some 9 km wide. It circles Mars so low and fast that seen from Mars it rises in the west, twice a day, and it is slowly spiraling in: some tens of millions of years from now it will break up or strike Mars. Mars hangs some 40° across in its sky: rust and ochre, the great volcanoes, the canyon system that would span a continent on Earth, a dust storm smearing one hemisphere. In Stickney sits Navy town: barracks, the Wall's construction office, a racetrack of gates around the moon. Flown: the Stickney Grand, the Bond fight in the grooves.

### Jupiter

Jupiter's moons lie inside a magnetic field that traps radiation fierce enough to kill an unshielded person in hours near the inner moons; Callisto, the outermost of the four, lies mostly outside the worst of it, which is why the Lanes' traffic gathers there.

- **Callisto: Valhalla.** About 4,820 km across, the most heavily cratered body known, dark, with the multi-ring basin Valhalla on its face like ripples frozen in a pond. Jupiter hangs about eight times as wide as the full moon seen from Earth, banded in cream and rust, the Great Red Spot turning on it. Station: Lanes Watch's studio, a converted ice-tug depot, its neon sign blinking ON AIR. Flown: bounties, convoys, the Valhalla Sprint.
- **Europa: the Lineae.** About 3,120 km across, a shell of ice over an ocean, its face crossed by long reddish-brown cracks. Jupiter fills some 12° of its sky. The radiation is intense. A science station clings in a crack, its dish pointing at the ice; nobody has found life down there, and its last scientist keeps looking. Flown: the tanker through the belt, the dive into the crack.
- **Io: Flux.** About 3,640 km across, the most volcanic body known: hundreds of active volcanoes, a surface of sulfur yellow, orange and white, plumes rising high above it. Jupiter fills some 19° of its sky. Io sheds a ring of charged gas along its orbit, and between Io and Jupiter runs a current of millions of amperes along the field's lines: the flux tube, where Jupiter's auroras have a spot of their own. In the game the tube shows as a faint violet glow and a rising static on the link. Station: sulfur miners in shielded bunkers. Flown: the Flux Tube Race, the Blackout.
- **Ganymede.** About 5,270 km across, the largest moon in the solar system, larger than Mercury, the only moon with a magnetic field of its own (with auroras of its own); bright grooved ground beside dark old ground. The Loose hide in its tug yards. Flown: Hollow Jack, the harpoon, the hook yard.

### Saturn

- **Titan: the Circuit.** About 5,150 km across, the second largest moon, wrapped in a nitrogen air thicker than Earth's (about one and a half times the pressure at the ground) and an orange haze that hides the surface. Its gravity is about a seventh of Earth's; at the poles lie seas of liquid methane and ethane, the largest Kraken Mare. Above the haze Saturn hangs ringed and tilted; below it, the world is orange twilight. The Victory Cola Circuit floats its grandstands on pontoons in the sea, under giant neon cans. Flown: races and pit fights in the haze (drag, haze and reach work as in Jupiter's air, with Titan's numbers).
- **Enceladus: the Plumes.** About 500 km across, its surface among the most reflective in the solar system, almost pure white. From four long cracks at its south pole, the "tiger stripes", jets of water vapor and ice grains rise and feed one of Saturn's rings. Saturn fills nearly 30° of its sky. Flown: the yacht escort in the glittering plumes, the stripes' time trial.
- **Iapetus: Two Faces.** About 1,470 km across, one hemisphere dark as soot, the other bright as snow, a ridge up to some 20 km high running along its equator like a seam. Its orbit is tilted, so the rings show opened from it. Flown: the ridge, the cache, Quill's visit.
- **The rings.** The existing Rings of Saturn arena, where the trials are held, with the Ministry's grandstand barges and a sky full of sponsor screens.

### The ice giants

- **Uranus: Miranda.** Uranus lies on its side, its axis tipped 98°, a pale cyan ball with faint dark rings, each of its poles in some 42 years of day and then 42 of night. Miranda, about 470 km across, is a patchwork of terrains pieced together, and on it stands Verona Rupes, a cliff thought to be among the tallest in the solar system. Uranus fills over 20° of the sky. The Loose have their hideout in the cliff's face: lights in the ice, a hangar mouth. Flown: the drop, the sweep.
- **Neptune: Triton.** Neptune's true color is only a little bluer than Uranus' pale cyan (the deep blue of old pictures was enhanced); its winds are the fastest measured on any planet. Triton, about 2,700 km across, circles it backwards, which says it was captured from the Kuiper belt; geysers of nitrogen rise from its pinkish surface. The Navy's Memorial Station, oldest of its bases, sits there; the Derelict drifts on its own path some way off. Flown: the geyser field, the admiral, the Derelict.
- **The Derelict.** The existing arena, the world ship PAAA 01, broken in two. In the campaign the bow's torn end leads into its decks.

### Pluto and the Kuiper belt

- **Pluto and Charon: Last Light.** Pluto is about 2,380 km across; Charon about 1,210, more than half its size. Both keep the same face to each other, so Charon hangs fixed in Pluto's sky. Pluto's heart is a plain of nitrogen ice a thousand kilometers wide, broken into slowly overturning cells, edged by mountains of water ice several kilometers high; Charon has a reddish-brown polar cap and a belt of great canyons across its middle. In 2584 Pluto is near the far end of its 248-year orbit, about 49 AU out, and its thin air, which hazed it blue when it was first visited, has largely frozen onto the ground (as astronomers expected it would as Pluto recedes): the game shows fresh frost and only a faint haze. Station: Last Light, on Charon's face towards Pluto, the last place with a bar, kept by Odile. Flown: the Heart Run, the convoy.
- **Haumea.** An elongated dwarf planet, about twice as long as it is wide, spinning once in about four hours, the fastest of the large bodies of the solar system; it has a ring and two small moons, its surface crystalline water ice. The Long Ladder's first rung, a fuel depot, is moored in its ring. Grand: the white egg turning beneath the ring as a ship races along it.
- **Eris.** About 2,330 km across, nearly Pluto's size and more massive, one of the most reflective bodies known, with a moon, Dysnomia. In 2584 it is again near the far end of its 559-year orbit, about 95 AU out, three times as far from the sun as Neptune. Rung two of the Ladder.
- (Optional on the way: **Arrokoth**, a small red body of two lobes joined at a neck, about 36 km long, the farthest body visited by a spacecraft in the early 21st century; the game's comet nucleus is already shaped like it.)

### Beyond: the game's own

These bodies are invented for the game. They are numbered by when they were found, not by distance, which is why the Ninth lies farthest out.

- **Planet X: Lantern** (about 200 AU). A world about the size of Mars, its thick hydrogen air holding in the heat of its own core, so that under the air lies an ocean of warm, dark water: a real idea about such worlds, made real here. From space it is a black disk against the stars, its night lit by lightning deep in its air and by the flares of the settlers' heat wells. Settlers came for the heat; many now wait for passage to the Ninth, whose plots they bought from brochures. Station: Kiln.
- **Planet XI: Granary** (about 350 AU). A small, cold ice world in a broad ring that is not natural: the Feeders' store of comets, parked in a ring around it, thousands of them, each tagged with a blinking Ministry beacon. The regime calls it Abundance. Station: the Feeders' yard, huge tugs with arms like cranes.
- **The Ninth** (about 500 AU): see section 8. Official name: the President's Planet. Its brochure shows palm trees.

### Inner system

- **The Moon: the Ballroom.** The President's ballroom, as the radio promised: a gilded dome on the lunar highlands, its own neon portrait of the President across it, Earth hanging overhead, blue and white with the lights of its cities on the night side. Flown: the parade.
- **Earth.** Seen from the Moon, and from the existing Satellite Junkyard.
- *Side:* **Mercury**, where the sun looks two to three times as wide as from Earth, sun miners work in the Caloris basin, and the Terminator Run races along the moving line between day and night. **Venus**, where some 50 km up the air has Earth's pressure and a bearable temperature; Victory Cola's cloud city floats there above the sulfuric acid clouds, whose upper layers race around the planet in about four days.

---

## 7. Characters

The Host is silent. Everyone else has a voice; the existing ones keep theirs.

**Nicole** (the flight computer). Section 4 gives her stages. What she knows and when: nothing, at first; she is a navigation unit with gaps. With each module she remembers more, and the echoes are her own logs. From chapter 6 she knows her name, from chapter 9 she suspects she is a copy, from chapter 14 she knows what was done to her ship. Her secret is the Host's goal: the original is alive.

**The Orange President** (the regime's voice on Radio 2584). Unchanged: superlatives, hollow boasts, blaming the predecessor, renaming things. New lines for the campaign's places (section 9). He appears in person once, at the Ballroom, in his current body. He does not remember the world ship, which is worse than if he did.

**The announcer** (Radio 2584). Unchanged: cynical, delighted by every death. He works the Circuit, *Lanes Watch*, the trials and the finale's broadcast.

**Yardmaster Oskar Rask.** Big, genial, loud; owns the Psyche Boneyard and the Bond. Talks like a salesman with a proverb for everything ("Every bolt's a debt, every debt's a bolt"). Calls everyone "darling", which Nicole hates. Role: the first boss and the first door out. Secret: he recognized Scout Two and the computer in it, and sold the Host to the Ministry. He shows up again in chapter 15's file, and in the epilogue the radio announces his new yard on Ceres, "sponsored by the Ministry of War".

**Pim.** A Rockborn girl of fifteen or so, the Boneyard's best welder, not on any register. Fast, slangy, fearless, tags everything she touches. She patches the Magpie, names it, and builds it stage by stage for the rest of the campaign from Patience's workshop. Secret: she is Hedda's granddaughter, smuggled over the Wall as a baby; with no register entry she can never be printed. Hers is the only life on board that cannot come back, which is what makes chapter 18 frightening.

**Captain Hedda Kroll.** Rockborn, sixties, captain of the ore hauler *Patience*: 600 m of ore bins on a spine, a ring habitat, a workshop, a printer rented under the Bond, a berth for the clones (number 9) and a docking clamp for the Magpie. Short sentences, gravel voice, a rolling R ("Rrright."). Was a Host in the Games once: "I stopped counting at eleven hundred. Don't you start counting. Counting's how it gets in." Role: home, transport, the voice of experience. Secret: she quit the Games after a death she has never told anyone about; she smuggles Rockborn over the Wall. She tells the Host about the death at Pluto, the night before the Ladder.

**Rennick "Perihelion" Szabo.** A Martian racer, washed out of the Navy, the Circuit's darling, sponsored by everyone. Drawls; calls the Host "scrap". The broadcast calls him "the Undying": in eleven years of racing, not one of his clones has died. Secret: he is terrified of it; he breaks off every fight before his clone can die, and his record is a fear, not a skill. Role: the rival of Acts II and III, then the Ministry's hunter, his admission promised for the Host's head. At the Ninth the Host kills his clone: his first death, live, in front of the system. He does not come back to the fight. The epilogue's radio has him admitted to the Games anyway; his ratings were tremendous.

**Commissioner Dolores Quill.** Office of Admissions, Ministry of War. Bright, chirpy, speaks in form numbers and congratulations, never threatens and never has to. She is on her ninth body and mentions it like a hairstyle. Role: the Host's helpful patron from chapter 11, the face of the deal at the end. Secret: she runs the search for Scout One (the Ministry's file calls it Operation Lullaby), and she has been steering the Host since chapter 4.

**Ma Tally.** Boss of the Tallymen, a firm of repo pirates licensed by the sponsors to take back what debtors owe, ship and clone included. Speaks like a debt collector reading out a statement. Role: the nasty bandits of Acts I to III, the ones it feels good to shoot. Dies in chapter 11. Her clones keep calling in for a while, outraged at the cost.

**The Saw Brothers.** Claim-jumpers at Vesta, three of them, giggling over the comm while they cut other people's rigs off their rocks. The first fight.

**Hollow Jack.** Chief of the Loose in the Jupiter lanes. Dry, tired, funny. He robs convoys and never kills a clone ("Clones are people too, Host. Mostly."). He is a stray of a famous Games pilot whose Host died forty years ago. His death in chapter 8 is final, and it is the first death in the game that is. His harpoon becomes the Magpie's hook.

**Spare.** The Host's clone, lost to the flux tube at Io and living on. He has all of the Host's memories up to that minute, so he knows the Magpie, Nicole, Pim and Hedda as the Host does, and he has lived a year the Host has not. His voice is the first time the Host hears its own voice from outside: choose one that has neither Nicole's color nor the announcer's, and put it through a cockpit microphone. He is not the Host's enemy; he raided the Host's convoys to keep the Host from rising, because he read the Ministry's file. At the Ninth he flies beside the Host and covers the escape; the Navy takes him. In the epilogue he is a house pilot of the Games, his link the Ministry's. The game's subtitles show his clone number, which is the real number of the clone the Host lost at Io; his lines never speak it.

**Fleet Admiral Corwin Vey.** The Navy's oldest officer, at Triton, on his fortieth or so body; every transfer copied his confusion along. Courtly, gentle, drifting between centuries. He commanded the battle at the world ship and is proud of it; he tells the truth because he no longer knows it is a secret.

**Bellamy Crisp.** Director of Excitement at Victory Cola. Speaks in taglines and exclamation marks. Sponsors the Host, the Circuit and, as chapter 10 reveals, the bandits on *Lanes Watch* (bandits are great for ratings).

**Odile.** Keeper of Last Light on Charon, the last bar before the dark. Old, slow, kind, sings the world ship's departure song when the bar is empty; nobody else alive knows it. She knew Nicole Aster's name before the Host did, and says nothing until asked.

**Navigator Nicole Aster.** The woman the voice was copied from. Navigator of the PAAA 01, who chose its course past the dark mass. She fled the battle in Scout One and has slept in its pod since. She is heard only in the echoes and seen once, through the frosted window of the pod: a woman in a navigator's suit, asleep, the five stars on her shoulder.

---

## 8. The black hole

**What it is.** A primordial black hole: not the remains of a star, but one formed in the first instant of the universe from a dense lump of the early cosmos, small and old. Early in the 21st century, astronomers noticed that the orbits of the most distant bodies beyond Neptune cluster as if something heavy, several times Earth's mass, pulled on them from some hundreds of AU out, and one proposal was that this hidden ninth planet might be a black hole of that mass instead. In SolarTournament's universe it was. It circles the sun about 500 AU out (the game's figure), far beyond the planets and the heliopause, at the inner edge of where the sun's hold thins out into the space between stars.

**What it would really look like.** A hole of about five Earth masses has a horizon about 9 cm across: a fist of nothing. Alone, it would be dark: nothing falls into it. Far from it, it pulls exactly as a planet of the same mass would; only close in, where a planet's ground would be, does its pull keep growing beyond anything a planet allows. In the game it is drawn and pulls as in the Event Horizon arena (a horizon of 350 m, 1 g at 2 km), the same deliberate deviation the README already declares for that arena.

**Why it glows.** Because the Ministry feeds it. Matter falling into a hole heats up and shines, and the Feeders, huge tugs working out of Granary, push comets from the outer system into it for the broadcast. The glowing disk is the President's light show, and the ice the arena's rocks are made of is what the Feeders parked in orbit around it, waiting its turn. The comets that cross the Event Horizon arena and fall in are their deliveries.

**Why nobody comes back.** From 500 AU, light takes nearly three days to reach Earth: whatever a clone there lives reaches its Host three days late, and no word of the inner system reaches it any sooner. A clone there is alone in a way no other clone is. The Games' rounds at the Event Horizon are flown by Hosts whose couches ride on the Ministry's transports parked beside it. The sun is a point of light there, still brighter than the full moon seen from Earth; the stars stand where they always do.

**How one gets there: the Long Ladder.** The Feeders need fuel, so the Ministry built a chain of depots from Pluto outward: Haumea's ring, Eris, Lantern, Granary, and the Feeders' station at the hole. A hauler with a fusion drive far better than anything of the 21st century, burning steadily at a third of a g and turning around halfway to brake, covers the 500 AU in about four months, at a top speed of about 5 % of light's. Patience can do that, barely, as a Feeder pushing a comet; the Magpie rides in her clamp, and the clone aboard sleeps most of the way in a cold berth.

**Why the PAAA 01 meant to go there.** The world ship was never going to stay; it was going to another star. Its navigators had found the dark mass and planned to dive past it, deep into its well, and burn at the bottom: a burn counts for the most where a ship already falls fastest, and the hole's well is deeper than any planet's. It would have flung the world ship out of the system faster than anything ever had. When the Navy broke the ship, Nicole Aster flew the escape the course already held: Scout One to the dark mass, an orbit, the cold sleep.

**Why the Host goes there.**
1. The Ministry holds the Host's Final Trial there (Quill's invitation; in truth the Ministry's way of following Nicole to Scout One).
2. Nicole's restored memory holds Scout One's course and orbit, and she wants to go home.
3. Spare begs the Host not to. The Host goes anyway: if the Ministry is going, someone who wants her alive had better be there first.

**What happens there.** The Host finds Scout One in the glare of the disk, among the parked ice; Nicole Aster sleeps in its pod. The Ministry throws a comet at it; Perihelion and the Navy come for it; the Host's last clone, with no printer behind it, tows Scout One into an orbit inside the disk's glare, where the Ministry's own light show blinds its sensors. As long as the Ministry keeps feeding the hole for the cameras, it cannot find her. The ratings will never let it stop.

---

## 9. Sample dialogue

Lines for the voices are written the way `src/music/lines.ts` writes them: Nicole in whole sentences, the radio's voices in lower case. Stage directions in italics.

### The opening: Lot 7731

*Black. Static. ESTABLISHING LIVE LINK TO CLONE 0001. The bar stalls. LINK QUALITY 31 %. RETRYING. The picture tears in like a broken stream.*

*A cockpit. The canopy is cracked; one pane is a welded plate. Outside, under floodlights on lattice masts, racks of dead fighters run to a metal horizon, row after row, thousands of them. The sun is a small, hard, white disk.*

**NICOLE** *(salvage)*: Link. Est... established. Host. Do you. Read.

**NICOLE**: Navigation. Online. Weapons. None. Pilot. Alive.

**RASK** *(comm, warm, much too loud)*: Goooood morning, Host! Rise and shine, the printer's warm and so's your debt. Welcome to the Boneyard. Forty thousand fighters, and you got the worst one. Lot seven seven three one. No gun, half a drive, and a flight computer we fished out of a bin. Bargain of the century.

**RASK**: Here's the deal you signed. License, printer, hull: twenty-five thousand coins. I take forty percent of everything you earn till it's paid. Die all you like, darling, the printer's included. The ads are free.

**NICOLE**: Host. That man. Calls you. Darling.

**NICOLE**: I do not. Like it.

**RASK**: Fly out of your rack and come see me at the office. Mind the cranes. They don't care about you either.

**NICOLE**: Turn. Marker. Ahead.

### Nicole's lines for the first missions (salvage voice)

- Turn. Marker in your. Crosshair.
- Turning. Takes you. Nowhere.
- Burn. Fifty meters. Per second.
- Brake. I flip. You stop.
- Beacon. Hold. Three seconds.
- Shots. Incoming. Left. Right. Do not fly. Straight.
- They pay. Per second. We are worth. Five coins.
- Canister. Through the ring. Gently.
- Rock. Cut it. The cutter. Runs hot.
- Ore. Fly through. The glints.
- Clone lost. Printer. Warming. That. Hurt. I know.
- Good, Host. Good.

When the first voice module is in (chapter 2): "There. Do you hear that? Whole sentences. I have missed them more than I can tell you."

### Pim

**PIM**: Oi! Lot seven thousand whatever! That's my rack you're scraping. Wait. You're the one Rask sold the bin computer to? Shiny. Hold still, I'm welding your thrusters. Don't fire anything. You haven't got anything. Good.

**PIM** *(later, on the pad, spray can in hand)*: Magpie. 'Cause everything on you is nicked. I'm putting it on the fin. Don't tell Rask.

### Hedda

**HEDDA**: Patience, Captain Kroll. You the nobody that cleared my lane? Rrright. I need a gun that works for food. Yours doesn't work. You'll do.

**HEDDA** *(looking at the tally under the canopy)*: Don't count them. I stopped at eleven hundred. Counting's how it gets in.

### The paint comes off (chapter 3)

*The pad. Pim's grinder screams over the nose. Grey flakes away, then olive, then an off-white band with a dark blue stripe, five stars, letters made of bars.*

**PIM**: That's not depot. That's old. That's really old. P, A, A, A. Zero one. S two.

**NICOLE**: Scout Two.

**NICOLE**: We are Scout Two. I do not know how I know that. Thank you, darling. Oh. I am sorry. Old habit. I do not know where it is from either.

### Hollow Jack (chapter 8)

**JACK**: Nice shooting, Host. Nobody's going to print me, you know. My Host died forty years back. I'm just what was left over.

**NICOLE** *(Voice I, very quiet)*: Host. He has no link. There is no one at the other end.

**JACK**: You know where strays go when the Navy catches us? Watch the Games sometime. The house pilots. They never say no. Tell your sponsor I said...

*Static. The marker goes out.*

**NICOLE**: He is not coming back. That one was not coming back.

**ANNOUNCER**: and the bandit is down. permanently. ladies and gentlemen, the ratings.

### Spare (chapter 10)

**SPARE**: Hello, Host. Don't shoot. You'd only be killing yourself. Again.

**SPARE**: Io. The flux tube. The link went white, and then it was just me in there. Quiet. You don't know what quiet sounds like after the link. You've never been alone in your own head.

**NICOLE**: Host. His flight. It is yours. Every habit. It is exactly yours.

**SPARE**: Hi, Nicole. You sound better. They call us strays. I call myself Spare. You had plenty of them.

**SPARE**: Stop flying where they want you, Host. Please. I know how you think. That's the problem.

### The admiral (chapter 14)

**VEY**: Ah, a visitor. Is it the launch already? Tell the President the world ship has not cleared the pickets. No. No, that was. What year is it? Never mind. He said: nobody leaves. A beautiful order. Short. So I gave it to the guns. The habitat ring first, he said, the cameras like the ring. Do you know, they cheered? On Earth. The Memorial Games, they called it. I got a medal. I have it somewhere. I have had it in forty bodies.

### The file (chapter 15)

**SPARE**: Rask sold you the day you signed. Not the debt. The hull, and her. Operation Lullaby. Quill's been sweeping your road for a year so Nicole would trust somebody enough to remember where she went. You're not a Contender, Host. You're a sniffer dog.

**NICOLE** *(Voice II)*: Then let us be faster than the hunters, darling. I know the way. I have always known the way. I only needed a reason to remember it.

### Scout One (chapter 18)

*The disk's glare. Among the parked ice a small ship, dark and frosted, long nose, a hump behind its cockpit: the Magpie's twin. Through the pod's window a woman sleeps, five stars on her shoulder.*

**NICOLE**: Hello, me.

**NICOLE**: She looks so young. I always thought I would feel something grand. I feel like I left the stove on for a very long time.

**SPARE**: Company. Navy cruiser, four fighters, and him.

**PERIHELION**: Evening, scrap. Nothing personal. They promised me the Games.

### The deal (chapter 18)

**QUILL**: Host! Congratulations on completing your Final Trial! Your ratings are, and I quote the Ministry's own figure, the highest since the Memorial Games. The President watched. He would love to meet you. Form one A, admission. Three tiny conditions. One, you forget what you found. Two, your flight computer is certified to the Ministry's current firmware. Three, we keep the stray. He's being admitted too, in a sense. Sign here, and you will never owe anyone a coin again.

### The Ballroom (chapter 19)

**PRESIDENT** *(radio)*: new hosts. tremendous hosts. i picked them myself

**PRESIDENT** *(in person, to the Host)*: what a ship. very old. i like old things. i am one thousand years young. never been better

**NICOLE** *(Voice II, the technician's cable already in)*: They are taking my voice, darling. Listen. Do not tell me where she is; I will not remember. Remember for me. There is a real me. Out there. Promise you will...

*Static. A clean chime.*

**NICOLE** *(the tournament's)*: Hi, I am Nicole. Your personal flight computer.

### New radio lines for the campaign

- President: "nobody leaves. why would anyone leave the greatest system", "ninth planet. beautiful planet. beachfront property. act now", "the wall in space is going up. very fast. some say too fast", "the strays are not people. they are leftovers. very sad", "the memorial games. the most beautiful tragedy in history".
- Announcer: "live from titan. the air is thick. the clones are thin", "lanes watch. tonight a nobody hunts a bandit. place your bets", "the undying is dead. folks, i think the printer just fainted", "a new host is admitted. the old one did not survive the paperwork".

Every new line needs its German, Spanish and French, in the catalogs' voices (section 10).

---

## 10. Building it

### What exists, and what the campaign takes from it

| Campaign need | Existing code | What to add |
|---|---|---|
| Missions as scripted steps with goals, failure and Nicole's lines | `src/game/school.ts`: drills with markers, rings, buoys, debris, drones, sparring bots, `done` and failure conditions, repetitions, praise | A mission runner on the drill machinery: several drills in one place, payouts, ratings, a checkpoint |
| Races in new places | `src/game/race.ts`, `src/game/racingline.ts` | Courses laid out per place; rivals by name and skill |
| Fights, bounties, trials | Deathmatch, Last Clone Standing, Capture the Flag, the President's Fleet; `src/ship/bots.ts` and the bots' skills | A named target; scripted waves; an ally (Capture the Flag's sides already make one) |
| Escorts | `src/game/fleet.ts` flies a big ship on a lane and keeps it clear of heavy pieces | A small escorted ship (barge, tanker, yacht, Patience) on a lane, with health; bots that target it |
| Tow jobs, the hook, Scout One | `src/game/hook.ts`, `src/game/cable.ts`, Capture the Flag's towed core in `src/game/flags.ts` | Towing a body bigger than a core |
| The orbit at the hole | `src/game/orbit.ts` (ORBIT READY, STABLE ORBIT) and the Event Horizon arena | Nothing new: a towed body's orbit read the same way |
| Comets thrown at the hole | `src/game/comet.ts` aims them at the hole already | A comet aimed at a chosen point |
| Thick air (Titan, Venus) | `src/world/air.ts`, `src/view/haze.ts` | A second air with its own numbers |
| Rocks, ice, rigs, buoys, junk, the Derelict | `src/world/asteroids.ts`, `rocks.ts`, `ice.ts`, `mining.ts`, `shapes.ts`, the arenas | New field layouts per place; racks of dead fighters as field pieces |
| Places | `src/world/arenas.ts` (field, landmark, mood, references), `src/world/landmarks.ts`, the real sky in `src/world/starmap.ts` | A landmark per body from real maps under licenses like those already used (see README, License); the mood |
| Pickups (salvage, ore, Jack's harpoon) | Probes in `src/game/items.ts` | Ore glints; a carried canister |
| The shipyard | `src/game/hangar.ts` | A campaign wallet of its own; steps below stock; weapons fitted (cutter, laser, tubes, hook, overdrive) |
| Nicole's modules | The HUD in `src/view/hud.ts`, `radar.ts`, `guide.ts`; tips in `src/game/coach.ts` | Switching HUD pieces and tips off until their module is in |
| Nicole's voice stages | `src/sound/speaker.ts`, the voice pipeline (`tools/voice/`) | A filter per stage on the same voice; new lines rendered and cloned like the others |
| Ratings from style | `src/game/moments.ts`, `src/game/streaks.ts` | Paying ratings for moments |
| Death and the ad | `src/game/sponsors.ts`, `src/game/satire-ads.ts` | The clone number at every link; the cut without a death (Blackout); the last mission's black, without an ad |
| Scenes on the pad | `src/view/showcase.ts` | The Magpie's stages; Pim's fitting scenes |
| The link glitch | `src/view/glitch.ts` | Glitch by nearness to the flux tube |

**New mechanics**, each small and each used several times:
- **A surface**: a patch of a moon's ground a few kilometers across that collides (as a height field), the moon's sphere around it as scenery. Phobos, Europa's crack, Iapetus' ridge, Miranda's cliff, Pluto's heart.
- **Cones** that see: searchlights and sensor cones that spot a ship held in them (Wall Run, Granary).
- **A dose**: a hazard that fills like heat while inside a zone (Jupiter's radiation).
- **A scan**: the crosshair held on a body for 2 s, as a torpedo's lock is (the Ninth).
- **Columns that shove**: Triton's geysers.
- **Spare's flight** (optional): a bot whose habits come from the Host's own recordings (`src/recorder.ts` keeps them already). A plain bot of skill 0.65 does the job if this proves too much.

**Rules that hold for all of it.** The campaign is solo, so nothing of it goes over the network until the Magpie is unlocked (a new ship type others see raises the protocol's version). Bots in the campaign obey the Hosts' rules like every bot. The fields come from seeded randomness and the mathematics from `src/detmath.ts`, as everywhere. Every text the Host sees or hears is written in English and wrapped for translation, with German, Spanish and French in the same commit; Nicole's new lines are cloned like her others. The campaign's save is a new localStorage entry, so the privacy policy names it in the same commit. The README's universe section gets what the campaign makes canon (the strays, the Loose, the Ninth, the Magpie), the handbook gets the rules a Host uses, and both only once built.

### The first slice: the prologue and chapter 1, end to end

The Boneyard on Psyche, from the first link to Patience leaving with the Host aboard: missions 0.1 and 1.1 to 1.6, about forty-five minutes of play. It proves the whole loop (job, pay, buy, the ship changes, the story moves) before anything bigger is built.

What it needs:
1. **The campaign's state and save**: chapter, missions done, wallet, the Bond's balance, the Magpie's parts, Nicole's modules, the clone count; a menu entry "Campaign" beside the solo round and the flight school.
2. **The hub**: the Boneyard's job board, Rask's counter (the shop) and Pim's pad (the title screen's showcase with the Magpie on it).
3. **The scrap ship**: an interceptor below stock (drive at 60 %, thrusters at 50 % then 70 %, no dodge, a bare flank taking double damage, no weapons), with the HUD pieces of the later modules switched off.
4. **The place**: Psyche as a landmark (a huge, dark, faintly metallic body below the field), a field of racks of dead interceptors (the hull models as static pieces with box colliders) plus the spoil field's rocks; the Belt's mood made colder.
5. **The mission runner** on the school's drills: Lamplighter (stopAt), Live Target (the slide drill's gunners), Canister Sweep (probe pickups and a ring, one canister carried), First Cut (rock breaking, ore glints), Docking Lane (debris, Patience as a solid body with strikes counted).
6. **The mining cutter**: a laser with 400 m of reach and 35 % heat a shot.
7. **Nicole's salvage voice**: the filter, and her new lines for the slice in four languages; Rask's, Pim's and Hedda's lines (new voices, rendered like the announcer's).
8. **The payout and the cut**: coins after Rask's 40 %, ratings to Background.
9. **The Magpie's first two looks**: Lot 7731 and Patched, on the pad.

Then chapter 2 adds the first fights and a race on top of the same parts, and each chapter after it adds one or two of the new mechanics above, in the order the story asks for them.
