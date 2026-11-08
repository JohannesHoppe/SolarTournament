# The campaign: story and design bible

> **Spoilers, all of them.** This file holds every twist of the solo campaign. Johannes plays it first and wants to be surprised: he does not read past this box until he has flown it to the end.

The campaign is the road of one nobody from a scrapyard in the asteroid belt to the President's Ballroom on the Moon, where the Hosts of the Presidential Games are admitted. It is solo only. Online rounds stay fair and alike for everyone: nothing earned here counts online beyond what the tournament hangar already allows (see section 5, "Online").

Built so far (`src/campaign/`, flown on the address with `?campaign`): the campaign's state and save, the mission runner on the flight school's drills, the pay with the yard's cut, the prologue and chapter 1 in a first Boneyard on Psyche (racks in rows, the lane, the depot with bay 3 and its landing pad, Psyche below): Cold Boot (Nicole booting and crashing, Rask's call, the flight into the bay and onto the pad), Lamplighter, Live Target, Canister Sweep, The Cutter (fitted on the debt), First Cut and Docking Lane, each begun on the pad, briefed by Rask over the comm (his own voice, his hologram), one running on into the next, with the canister of the sweep towed on a cable, the ore glints of the first cut, Patience moored as a solid hull for the docking lane, the tourists' hits taken off the pay, Pim and Hedda in voices and holograms of their own, and the first scene in person (Rask's office at the end of chapter 1); Nicole as a salvaged unit without her modules (section 4, "Nicole's restoration"); the ratings each mission earns and the ranks they raise the Host to (section 4, "Rating ranks"). The hub's job board (the next job, the jobs done to fly again, the wallet, the debt, the rank, the ship). Pim's pad shows Lot 7731 beside the board. The Magpie's second look, Patched (welded bands on the thruster housings). Not built yet of the first slice: Rask's counter. Of chapter 2: its place, Rheasilvia on Vesta (the claims on the central peak's flank, world/vesta and world/rheasilvia), the arrival (the second scene in person, Patience's galley, with Hedda and Pim in the flesh) with Nicole's voice board, Claim Survey (2.1), Cut and Haul (2.2), Saw Brothers (2.3), The Peak Run (2.4) and Practice Log (2.5), the first echo: chapter 2 is built but for Rask's counter. Section 10 maps the rest onto what the game already does and names the first slice to build.

---

## 1. Premise and arc

### The pitch

A Host with a debt, a hull without a gun and a flight computer the yard calls junk works its way out of the Boneyard on Psyche, its clones flying through the Belt, the moons of Jupiter and Saturn, past Pluto and out into the dark beyond the planets, to be admitted to the Presidential Games. Menial jobs pay for a mining cutter, the cutter pays for a laser, the laser buys the first escort contracts, and the escorts buy the ratings. On the way the ship turns from scrap into the fourth ship of the game, and the broken voice in the cockpit turns back into someone.

Tone: the universe's satire (sponsors, ratings, a demented President, a regime that renames everything) over a warm heart. The jokes are the regime's; the feelings belong to the Host, Nicole and the people who help them. Every chapter has one wild thing to fly (a race, a brawl, a dive), one quiet thing to find, and one turn of the story.

Size: a prologue and nineteen chapters in five acts, about seventy missions, some twenty-three places (two more as side trips). For a Host who plays every story mission and a fair share of the side jobs, some fifteen to twenty hours.

### The rules of the campaign's world

These follow from the universe as the README tells it and hold everywhere in the campaign.

- **The Host never flies.** The clone in the cockpit is the pilot; the Host lies in a link couch and lives everything it lives. The Host is silent: others talk to the Host, the Host answers by flying.
- **The Host stays; only the clones travel.** The Host's body lies in couch 14 of the couch cellar under the Boneyard's depot on Psyche, among the couches of Rask's other debtors, fed by tubes, and it stays there through the whole campaign, bound by the debt, under the hand of whoever holds it. Clones are printed wherever the work is: by the yard's printer on Psyche, later by Patience's printer aboard. The link is radio, and radio is slow, which does not matter: the clone in the cockpit decides everything itself anyway, and its life reaches the Host as fast as light allows, as it happens on Psyche, some forty minutes late from Jupiter, hours late from the outer planets, nearly three days late from the black hole of section 8. The HUD shows the link's delay; Nicole, in the cockpit, is always with the clone, without delay. Broadcasts of far places reach their audiences as late as light allows too. A Host dies at Jupiter and lives the death forty minutes later in a couch in a cellar. Getting out of that couch, out of that cellar, is the oldest wish the Host has. (The Games keep their Hosts close: their couches ride with the Ministry's tournament ships to every arena, so a round's deaths are lived as they happen.)
- **A dead clone, a living hull.** In the campaign a clone's death kills the cockpit, not the ship: the canopy bursts, the drive shuts itself down, and a tug brings the hull back to its dock (the yard's bay, later Patience's clamp), where it is patched and the next clone climbs in. The ship is the one hull the Host has; it survives every death.

- **Holograms in flight, people in person.** Whoever calls the ship while it flies or waits in its clamps comes in as a hologram over the console (see `src/view/hologram.ts`): a projector, a cone of light, a see-through bust in one color, scanlines and flicker, torn by every hit. Each character has a silhouette of its own, recognizable at a glance: Rask fat and greasy, double chin, cigar, gold tooth, a strand combed over his bald head. For the moments that count the clone climbs out: short scenes through its own eyes (Rask's office in the depot, later the galley of Patience, at the end the President's Ballroom), the people there in the flesh, and whatever the clone feels there (a sweaty handshake, a slap on the back) reaches the Host as everything else does.
- **Clones outside the Games cost.** In the Games the sponsors pay for every body: the ad in the sponsor break buys it. Outside them a body costs. A print is no fortune, but costly enough that the choice weighs: anyone short of money picks pain over a new print where it can. A debtor's next clone goes on its debt; the Host's on the debt, whose printing contract covers every print of the yard's cheap printer and later of Patience's ("Die all you like, darling. The printer's included."), so that every death lengthens the debt without anyone saying so. The sponsor break still runs before every print, as on every printer in the system, but outside the Games the ad buys nothing. And prints differ by price: the rich have their clones printed sturdy and resilient; a cheap print, a nobody's, the Host's, wears out and breaks down after a fairly short time, and a broken body means a new print, and a new print more debt. That is the spiral the debt is built on.
- **Transfer copies flaws.** A mind can be transferred again and again, without limit, but errors can creep in as when data is copied; they need not. A sound mind (a good life, little stress) copies cleanly; a battered one copies with flaws, and the flaws multiply faster with every copy, and it seems they cannot be repaired. In the end it always leads to madness, but when and how is as uncertain as with cell division: the President went mad over his thousand years, Admiral Vey's confusion is copied along into his fortieth body, Quill on her ninth seems untouched. A Host who dies cheap and often, in misery, is the kind of mind that frays.
- **The rich travel; the poor endure.** The rich take a short trip by launch ring with painless gel and a day or two of induced sleep, and arrive rested; a long one, if they can afford it, by giving up the body and having a new clone printed at the destination, the link carrying the mind at the speed of light (to Jupiter some forty minutes instead of weeks). The poor have no such choice. The Host's own body never travels at all.
- **Clones have numbers.** The printer stamps every body it prints. The HUD shows the clone's number with every new link ("Establishing live link to clone 0031"), and it counts the Host's real deaths. This looks like flavor for twelve chapters. It is not.
- **Rings are the state's.** Two kinds (README, The universe, "The rings"). The small tournament rings (a race's gates, the coils) are a spectacle of the Presidential Games: physically harmless, they throw a ship on by about 40 m/s for the fun of it; expensive, maintained, anchored by a technology nobody explains, run by the Ministry. Nobody else builds them for their own races: a sponsor's show off the Games leases the Ministry's coils, and everyone else flies through buoys, beacons or old pipe (the Rockborn kids race through sections of an old ore line). The large launch rings are the state's infrastructure everywhere in the system, even at its remotest places: they throw ships into their long voyages, and without them trade and travel would still be possible, but far slower. They are the regime's apparatus of power: whoever controls the rings controls everything, and a place that rebels is cut off by switching its ring off. Their passengers are strapped into a seat and get the gel, a green, thick slime, injected into a vein in the neck against the g-forces: painless for the rich, painful for the poor (old gel, rusted injectors).
- **The gel of a nobody** (built for the journey from Psyche to Vesta: 20 seconds to choose, 6 seconds of agony, a print on the debt of ☉ 2,000; every later journey is to have its own). Between the places Patience travels by launch ring, and every body aboard is strapped in and gets the gel. A Host in debt gets the last of it: expired, from an injector rusted at the needle, so the clone goes through the boost in agony, and the Host feels every second of it over the link. Nobody dies of it. But another way is on offer: let the clone die before the ring (the self-destruct, a hatch), and Patience's printer prints the next one once the boost is over. That costs one more death to remember, and the new body goes on the debt, a cheap print that will break down before long. Anyone short of money picks the gel, painful as it is; the Host chooses each time: the gel, or one more death and one more print on the debt. Nicole names both and never chooses for the Host; Hedda takes the gel every time ("Counting's how it gets in"); Pim, who can never be printed, has no choice at all.
- **Ratings are fame.** The regime measures everyone by ratings, so fame in the campaign is ratings: earned by work that is broadcast, and by style (the moments the game already knows: streaks, a perfect start, a knockout, a supernova).

### Who the Host is at the start

The Host has no name, and no memory of one: only a license number. Its entry on the register is the Host license it signed, and all the campaign ever learns of it is what it signed: a **debt** with Yardmaster Oskar Rask of the Psyche Boneyard. For 25,000 Solar Coins Rask provided the Host license, a couch in his cellar, a printing contract on his yard's cheap printer, and a hull from his stock: **Lot 7731**, the worst fighter in a yard of forty thousand. The holder of the debt takes 40 % of every payout until it is paid, and what the yard fits on credit goes on it. The yard's first link is cheap, and it burns the oldest memories first: the Host does not remember signing, nor anything before it. Rask says they come back, mostly. They never do, and the campaign never says who the Host was: a name, a face, a place before the debt stay open, touched now and then (an old log, a song, a word somebody uses) and never answered.

Lot 7731 has no laser, a cracked drive bell, thrusters at half strength, no armor panels on one flank and a flight computer short of memory, which crashes and boots again in the middle of a sentence. It flies. Barely.

What drives the Host on at first is plain: the debt, and the way out of it, out of couch 14 and the cellar under the depot. Every Host admitted to the Presidential Games goes free of its debts ("Freedom through Games", the posters say), and admission makes a Host famous. From chapter 4 on the debt is held by an anonymous benefactor who asks for no payments, only that the Host keeps rising, and admission is the price at which the holder lets the Host go free. Later the drive changes: the voice in the cockpit has a past, and someone is waiting at the end of it.

### The road to admission

The Ministry of War admits a Host to the Games when it has three things: the rating rank **Contender**, a **sponsor**, and a pass of the Ministry's **Final Trial**. The Final Trial is held where the Ministry chooses. For this Host, it chooses the Ninth Planet.

### The twists, in the order the Host learns them

1. **Lot 7731 is no depot fighter.** Under the depot paint lies an off-white band with a dark blue stripe, and a stencil: PAAA 01 · S2. The hull is **Scout Two**, one of the two scouts of the world ship PAAA 01, taken after the battle that broke it. The Navy rebuilt it long ago into a fighter of the line: its pod hump and sensor mast cut away, its fuselage reshaped into the interceptor's form, which is why it flies like one. Under the depot paint its original plating stayed on the fuselage, and it has lain in the Boneyard ever since. (End of Act I.)
2. **The salvaged flight computer is Scout Two's own.** Every voice of the PAAA 01 carried the voice and mind of its navigator, **Nicole Aster**: the voice that was to guide the settlers to another star. The computer was always in the hull; Rask, who recognized hull and computer, tells the Host it is "a junk computer fished out of a bin", and Pim believes him. What exactly she is stays unclear: a copy of Nicole Aster's voice and mind in Scout Two's computer, older than anything in the Games, and she guards what she knows: her memories open only to a Host she trusts. The flirting Nicole of the tournament's cockpits is a variant the Ministry modified to keep the pilots going; how that came about, whether she does it willingly, and how much of the original Nicole is left in that variant is the campaign's great question, and these pages do not answer it. (Grows through Act II; certain at Europa.)
3. **The bandits of the Lanes are strays.** A clone whose link breaks without dying goes on living: a person with all its Host's memories up to the cut, and no Host. The regime calls them strays and hunts them; they call themselves **the Loose**. Their deaths are final. And the Games' house pilots, the eight callsigns every Host fights, are strays the Navy caught and linked to the Ministry. (Ganymede, Act II.)
4. **One stray is the Host.** At Io the link cut in the flux tube; the screen froze, Nicole said they had lost the clone, the printer printed the next. Two hours later Patience found the Magpie adrift, its canopy open, its cockpit empty. That clone lived. It calls itself **Spare**, and it has been raiding the Host's convoys since. (Reveal at Enceladus, Act III.)
5. **The world ship did not break by accident.** The President's first order, at the very start of his reign, was "Nobody leaves." The Navy stopped the PAAA 01 at the edge of the system and broke it; the broadcast called it a tragedy, and the first Presidential Games, the Memorial Games, were fought around the wreck. The Derelict is not a memorial. It is the scene of the crime. (Triton and the Derelict, Act IV.)
6. **The Host's rise was arranged.** Rask recognized the hull and the computer and sold the secret to the Ministry. Commissioner Dolores Quill of the Admissions Office has been clearing the Host's way ever since (the debt bought at Phobos by an "anonymous benefactor", which was the Ministry, the fast-tracked trials), so that the old Nicole would come to trust a pilot and lead the Ministry to the last witness of the Memorial Games. Spare has known for a long time; he raided the Host to stop the Host from rising. (Pluto, Act IV.)
7. **The Ninth Planet is a black hole, and it is fed.** Everyone knows the Ninth is a black hole, long taken for the unknown ninth planet; the regime sells plots on it all the same, as "the President's Planet", warm seas and beachfront property, to settlers who take the brochure for the truth. There is no planet and there are no plots: only the hole, which the Ministry feeds comets to make it glow for the broadcast, and whatever that glow hides. (Act IV's end.)
8. **Nicole Aster is alive.** She fled the battle in Scout One, flew to the only place the Navy did not guard, set the scout into an orbit around the hole and went into the cold sleep. She is still there. (The Ninth.)
9. **The price of admission.** The Host is admitted, by acclaim: the last fight at the hole went out on the broadcast, three days late as light allows, and broke every rating. The conditions: the Host forgets what it found, the Magpie's Nicole is certified to the Ministry's firmware, and the Ministry keeps Spare.

### The ending, and how it hooks into the tournament

Admission is the price the Ministry, holder of the debt since Phobos, named for letting the Host go free, and it lets it go out of the cellar: for the first time in the campaign the Host wakes in its own body, carried out of couch 14 under the depot to a couch on the Ministry's ship, and sees its own face, which it does not know. (In the Games, a Host's couch rides with the tournament; a clone's life is lived as it happens.)

At the Ballroom on the Moon the Ministry installs its firmware. Nicole's last free words are for the Host: remember the orbit, remember me. Then a clean chime, and a voice everyone who ever played the flight school knows: "Hi, I am Nicole. Your personal flight computer."

The campaign ends where the game begins. The Host's first round of the Games is an ordinary round of the tournament, flown in the Magpie, now unlocked for every mode. On the roster of house pilots a ninth callsign stands among the eight: **Spare**.

What the Host carries into the Games, nobody else knows. Nicole's line in the sponsor break, "There is a real me, you know. Somewhere out there. Keep fighting, and maybe one day I will tell you where", was always the product talking. Now the Host knows it is true, and knows where. And there is one place left in the system that could thaw a sleeper after so long: the medical deck of the President's own carrier, paid for by every hospital he closed. Every round of the President's Fleet is now a round against the one ship the Host needs to get aboard. That is the door to whatever comes after the campaign.

---

## 2. Acts and chapters

| Act | Chapter | Place | Story | Earned |
|---|---|---|---|---|
| Prologue | 0 Lot 7731 | Psyche, the Boneyard | The link boots at 31 % into a wreck in a rack of forty thousand. Rask explains the debt. Nicole crackles. | The hull; Nicole: navigation |
| **I Debt** | 1 The Boneyard | Psyche | Menial jobs for Rask's cut. Pim, the yard's undocumented kid welder, patches the hull and names it the Magpie. The mining cutter, on the debt. Hedda Kroll's Patience docks and takes the Magpie on, its clones printed aboard from then on. | Mining cutter; thrusters patched |
| | 2 Rheasilvia | Vesta | Rockborn claims on the slopes of the giant central peak. Claim-jumpers, the Saw Brothers, saw rigs off their rocks; the cutter is a poor weapon. The first echo of Nicole's past. | Thrusters to stock, the dodge; Nicole's voice repaired (whole sentences) |
| | 3 Occator | Ceres | The Rockborn capital among the bright spots. The military laser from Navy surplus; the first real escort. Rask sells the debt to the Tallymen, repo pirates, who take the cut from then on. The Wall Run: Hedda smuggles Rockborn refugees over the Solar Wall. Pim strips the paint: PAAA 01 · S2. | Laser; main drive to stock; Nicole: targeting |
| **II Lanes** | 4 Stickney | Mars, Phobos | Navy town under the red planet. The Phobos race: the rival Perihelion, who has never died. The Tallymen come to repossess the Magpie; mid-fight a Navy cutter announces the debt is bought by "an anonymous benefactor". The debt changes hands: from then on nobody takes a cut, the holder asks for no payments, only that the Host keeps rising, and the Host's body stays on its couch under the holder's hand. | Armor panels; Nicole: racing line; rank Regional Feed |
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
| | 15 Last Light | Pluto and Charon | The last station before the dark. Spare shows the Ministry's file: the Host was used. The Host's clone flies on anyway. Patience signs on as a Feeder. | Nicole: escape gauge and orbit readout; plating III |
| | 16 The Long Ladder | Haumea, Eris | The depots ("rungs") on the way out. A race inside Haumea's ring. Perihelion, now the Ministry's hunter, at Eris. | Drive III; radiators III |
| | 17 Lantern and Granary | Planets X and XI (the game's own) | The settlers who bought plots on the Ninth. The Feeders' store of ice. The Magpie and Patience ride a comet out. | Torpedo tubes II and III; the Magpie complete |
| | 18 The Ninth | The primordial black hole | No planet: a hole, fed to glow. Scout One, and Nicole Aster asleep. The Ministry comes. Perihelion's first death, broadcast to the system three days late. The last tow, with Patience's printer wrecked. Quill's deal. | Admission |
| **V The Games** | 19 The Ballroom | The Moon, Earth | The parade over the President's Ballroom. The certification. The first round of the Games. | The Magpie for the tournament |

Side trips (optional, from Act II on): **Mercury** (sun miners in the Caloris basin; the Terminator Run, a race along the line between day and night) and **Venus** (Victory Cola's cloud city, a race through the acid cloud deck). They pay coins and ratings and hold one echo each, so a completionist hears all of Nicole's past. The job board offers them under "Side trips" once Pilot Episode (5.1) is done; they are flown whenever the Host likes, always from their start, and leave the drill reached in the story's next job as it was.

Built: Mercury. **Terminator Run** (☉ 4,000 · 300): Hedda briefs it ("Mercury. The sun miners in Caloris race the Terminator Run every morning, before the heat of noon comes. Side money, and they pay well. Mind the glare."), Nicole calls it ("Two laps round the miners' camp, Host, eight rings, the sun miners against us. First or second, and they pay."): two laps of eight rings on an ellipse round the sun miners' camp, 300 m over the plain and its ridges, against five sun miners (Glare, Noonday, Sunspot, Scorch, Dazzle; skill 0.4 to 0.55); first or second home. Lost: "Two miners home before us. Their own ground, their own glare. Again." Won: "Paid. The miners say noon lasts weeks here, and nobody races at noon." Then **Mercury Echo** (· 40), over the wrinkle ridge north of the camp: "The old frequency, Host, here too, over the ridge north of the camp. Hold us still over it." The echo: "Teodor says I fly like a librarian. Careful, and always back on time. He says it like it is a bad thing." Nicole: "Teodor. She had a friend who laughed at her. I keep a list of my friends, Host. It is short. You are on it." The race is flown round the camp; that it runs along the terminator itself is still to come.

Built: Venus, offered once Victory Cola has signed the Host (Sponsor Night, 8.4). **Cloud Line** (☉ 5,000 · 400): Hedda briefs it ("Venus. Highball, Victory Cola's city, floats over the acid clouds, and Crisp's people race the Cloud Line through them for the feeds. Your sponsor wants you in it. Go and look expensive."), Nicole calls it ("The Cloud Line, Host: two laps, eight rings, half of them under the acid clouds. Down there it is hot, and it eats paint. Victory Cola's own pilots against us. Only first counts."): two laps of eight rings round Highball, the four on its eastern side 150 m under the deck, the four on its western side over it, against five of Victory Cola's pilots (Fizz, Sparkle, Syrup, Bubbles, Caramel; skill 0.4 to 0.6); only first home. Lost: "Victory Cola's own pilots were home before us. The sponsor is not amused. Again." Won: "First. The feeds loved the dive. My paint did not." Then **Venus Echo** (· 40), over biodome four's roof: "The old frequency, Host, here too, over biodome four. Hold us still over it." The echo: "Biodome four has tomatoes today. Ines cried over them. Real tomatoes, under a real roof, going somewhere real." Nicole: "Ines, the gardener. They grow tomatoes here too, under glass, for a cola. Nobody here is going anywhere."

---

## 3. Mission catalogue

Every mission names its type, its goal and how it fails in game terms, what it pays (coins ☉ before Rask's cut, and ratings) and what it is built from. "School" means the flight school's drill machinery (`src/game/school.ts`): markers, rings, buoys, debris, drones, sparring bots of a set skill, success and failure conditions, Nicole's lines and repetitions. A mission fails and repeats like a drill: Nicole says why, and the attempt starts over. Bot skills are the bots' skill values (0 to 1; the Games' middling bot is 0.5).

Story missions run once; most others stay on the place's **job board** as repeatable contracts afterwards (full pay the first time; flown again they pay only their medal, see section 4, "Medals").

### Prologue and Act I: Debt

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 0.1 | Cold Boot | story | Nicole boots, crashes and boots again; Rask explains the debt. Out of rack 7731, down the lane to the depot, brake below 10 m/s 400 m short of the hall's door, in and down onto bay 3's pad (within 15 m, slower than 2 m/s for a second). Pim welds the thrusters up to 70 %. Cannot fail. | — | School: turn, drive, brake, stopAt |
| 1.1 | Lamplighter | menial | Relight six dead row beacons: hold within 40 m of each for 3 s before the shift ends (6 min). Fails when the shift ends. | ☉ 150 · 10 | School: stopAt, markers |
| 1.2 | Live Target | menial | A sponsor's "Hunt a Hull" experience: paying tourists fire red shots at the Magpie. Survive 90 s inside a 1 km sphere by jinking; every hit takes ☉ 10 off the pay. A death ends it with what was earned. | up to ☉ 300 · 15 | School: the slide drill's gunner, three of them |
| 1.3 | Canister Sweep | menial | Four salvage canisters drifting between the rows, each flown through to take it in tow (15 m behind and 4 m below the stern on a cable) and brought to the crusher's hopper behind the hall. | ☉ 200 · 10 | Probe pickup; new: one towed piece of cargo |
| 1.4 | The Cutter | shop | Rask fits the mining cutter and puts its ☉ 1,200 on the debt. | — | Shipyard |
| 1.5 | First Cut | mining | Break three rocks of the spoil field with the cutter and fly through 20 ore glints (seven from each rock broken). Cannot fail; the cutter overheats fast. Pim names the hull: the Magpie. | ☉ 400 · 20 | Rock breaking; new: ore glints, the cutter's short reach |
| 1.6 | Docking Lane | escort | Patience moored over the yard; shoot six loose hulls drifting at her at 40 m/s before they strike. Three strikes on her hull fail it. Then the first scene in person: Rask's office, his wet handshake, Captain Kroll takes the Magpie on. | ☉ 600 · 40; Patience takes the hull on | School: debris; new: the hauler as a solid body |
| 2.0 | Rheasilvia | story | Patience brings the Magpie to Vesta; Captain Kroll names the work; Pim fits Nicole a second-hand voice board: from then on her memory holds, and she speaks without crashing. | — | Lines on the flight school's machinery |
| 2.1 | Claim Survey | exploration | Fly within 100 m of five claim buoys on the central peak's flanks, in the order the claims are filed. Fails after 8 min. | ☉ 400 · 20 | Markers; the Belt's buoys |
| 2.2 | Cut and Haul | mining | Mine 40 ore from a claimed rock beside a working rig; every beam on the rig costs ☉ 50. | ☉ 35 per ore · 25 | Rock breaking; the Belt's rigs (a beam on a rig counts as a hit on its rock already) |
| 2.3 | Saw Brothers | fight | Three claim-jumpers (skill 0.15, one side) saw at the rig nearest the claims' middle, 400 m off it, until a ship comes within 800 m; then they fight. Shoot two of them down with the cutter. If the rig falls (at 30 of their hits), the attempt starts over. | ☉ 1,200 · 80 | Bots on the battleship's siege; new: a rig's health |
| 2.4 | The Peak Run | race | The Rockborn kids' race: six sections of old ore pipe round the claims, 300 m over the flank (no rings: those are the state's; a pipe throws nobody on), two laps, three rivals (skill 0.2: Nix, Bean, Spark). A top-two finish wins; later, the race is flown again. Pim fits the thruster parts: thrusters to stock, the dodge. | ☉ 800 · 60; Pim's thruster parts | Race; a new course |
| 2.5 | Practice Log | exploration | Something on an old frequency, from the face of a cut rock: hold still before the mouth of its lit tunnel (within 40 m, slower than 2 m/s, for 3 s), and Nicole hears echo 1. | 20 | Mining's tunnels; markers |
| 3.0 | Occator | story | Patience moors over Occator; Captain Kroll names the place. Down to the market terrace and before the mouth of the market's gallery in the wall's first step: held within 60 m of its dock, 80 m before the mouth, slower than 2 m/s for 2 s, and the dock takes the hull. Cannot fail. | — | Markers; the place (built) |
| 3.1 | Surplus | shop | Pim fits a Navy surplus laser (☉ 6,000) from the market: what the wallet holds pays for it, the rest goes on the debt. Nicole switches on targeting. Rask calls: he has sold the debt to the Tallymen. (built) | — | Shipyard |
| 3.2 | Ore Barge | escort | Escort a Rockborn ore barge (240 m, four hoppers heaped with ore) on its lane out of Occator, from before the market over the terrace and out over the crater floor and up, 3.3 km at 20 m/s. 25 s after it sets out the scrappers come (Rust, Grit and Slag), three of skill 0.2, and once they are down three of skill 0.3; each holds 500 m off the barge and fires at its hull until a ship comes within 800 m of it, then fights. The barge at its lane's end with both waves down wins; 300 of their hits on its hull (three left alone land about four a second) fail it, and the attempt starts over. The music turns to the fight when they come. (built) | ☉ 2,000 · 120 | New: an escorted ship on a lane, the raiders of Saw Brothers |
| 3.3 | Repo Men | fight | The Tallymen, holders of the debt, come for the Magpie. Their tug (dark, the firm's stencils, a winch drum on its stern) lies 1.5 km off over the crater; 4 s in, its harpoon bites the hull and the winch reels it in at 12 m/s, the cable as long as the way was and shortening, the hull held on it whatever its drive does. Four guards (Docket, Lien, Arrears, Escrow; skill 0.3) fight round the tug. Twelve beams on the winch (within 25 m of its drum) snap the cable, or three guards shot down make them give up; reeled within 100 m of the winch, the hull is theirs and the attempt starts over. (built) | ☉ 1,500 · 150 | Raiders as guards; a cable reeled in |
| 3.4 | Wall Run | escort | Lead Hedda's barge of forty Rockborn refugees, bound for the inner system, over the finished stretch of the Solar Wall. The barge follows the hull's way 400 m behind it at up to 25 m/s. Fifteen searchlights stand on the wall's top edge, 400 m apart, each a cone 14° wide on either side reaching 3 km, sweeping across the lane by up to 76° over 24 s and along the wall at a pace of its own: they look up and out, never down at their own feet, so a barge led over within some 50 m of the edge mostly stays under them, and one led high over it is seen. A light that holds the barge (bow, middle or stern) for 3 s sees it, the time adding up while it is lit and fading at half that pace while it is not; seen twice fails it. 1 km beyond the wall it is through. (built) | ☉ 1,000 · 200 | Escort; new: searchlight cones |
| 3.5 | Scout Two | story | In Patience's workshop Pim grinds the depot's grey off the hull, and the scout's old livery shows: PAAA 01, S2, five stars. Nicole knows the name. Then something on the old frequency again, from the wall's second step under the neon NO WALL IN SPACE: the hull held before it (within 40 m, slower than 2 m/s, 3 s), and Nicole hears echo 2. The hull wears the livery from then on, on the pad too. (built) | 20 | Lines; markers; a look on the hull |
| 3.6 | Overhaul | shop | Pim replaces the drive's bell, cracked since the Boneyard, with a new one of Rockborn make (☉ 1,600, from the wallet as far as it holds, the rest on the debt): the main drive to stock. (built) | — | Shipyard |

### Act II: Lanes

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 4.1 | Stickney Grand | race | Captain Kroll names the place: Phobos, the Navy town under Mars. Nicole finds her racing line module in her old storage and installs it. Eight rings of the Games on an ellipse 4.4 by 3.2 km that dives from over Stickney's rim down into the crater and out again, each 300 m over the ground beneath it; three laps against Perihelion (skill 0.65), who has never died, and four others (Vasquez and Kade 0.35, Moth and Dray 0.3), lined up on the loop before the first ring. Top three goes to *Lanes Watch*; later, the race is flown again. (built: the race, the module) | ☉ 2,500 · 250 | Race; the place on a moon's relief (built) |
| 4.2 | Debt Day | fight | Ma Tally reads out the statement of account, and six of her collectors (Docket, Lien, Arrears, Escrow, Ledger, Tithe; skill 0.35) come for the hull over Phobos's grooves beyond Stickney's rim, fighting every ship they see. Shoot four. At the fourth, the Navy cutter Restraint hails: the debt is bought by an anonymous benefactor; the Tallymen leave ("The account is closed. For now."). (built) | ☉ 2,000 · 200; the debt changes hands, and the cut stops (this mission's pay already kept in full) | Raiders as guards; the debt held |
| 4.3 | Groove Shoot | exploration | A camera drone of *Lanes Watch* films the Magpie flying a groove of the land beyond Stickney's rim, under 60 m over the ground and faster than 20 m/s, for 30 s without a break. (built) | ☉ 1,200 · 150 | The moon's relief (built) |
| 4.4 | Armor Panels | shop | Pim welds panels from Phobos's Navy yards over the bare left flank (☉ 1,500, from the wallet as far as it holds, the rest on the debt): a beam from that side no longer counts double. (built) | — | Shipyard; a look on the hull |
| 5.1 | Pilot Episode | bounty | Captain Kroll names the place: Callisto, where Jupiter's lanes start, and *Lanes Watch* wants the Host on its first show. Nicole finds her radar module in her old storage and installs it. On air: the Tallyman "Red Ledger" and his two wingmen, Carbon and Copy (all skill 0.4), fight every ship they see over Valhalla's craters; Red Ledger shot down ends it, the wingmen only in the way. (built; still to come: style moments paying double ratings) | ☉ 3,000 · 300 | Raiders as guards; a named target; moments |
| 5.2 | Ice Run | escort | Three ice tugs for Ganymede, 400 m apart in a line across Valhalla at 30 m/s, 150 m over the highest ground under their lane. 15 s in, four of the Loose (Driftwood, Salvo, Magpie Jack, Lanyard; skill 0.45) come for the frontmost tug still free, holding 250 m off it; they never fire beams at a tug, only harpoons, one each, and they fight a ship that comes near. A harpooned tug is dragged off its lane at 15 m/s while its raider lives and glides back once that raider is shot down; 800 m off its lane, it is lost. One tug lost is allowed, a second fails it. (built; still to come: the Loose sparing the Magpie's drive) | ☉ 2,500 · 200 | Escort; raiders with harpoons |
| 5.3 | Valhalla Sprint | race | Six Ministry coils that *Lanes Watch* leases for the show, in a straight line over the rings of the Valhalla basin, 1 km apart and level 100 m over the highest ground beneath them, at the speed limit, against the clock: from rest 1 km before the first, the clock starts at the first coil, and the last within 25 s wins; a coil missed or the clock run out starts it over. (built: its gold time 21 s) | ☉ 1,500 · 150 | School: the full-speed course |
| 5.4 | Callisto Echo | exploration | Echo 3, in an old Navy listening post among the craters: a bunker dug into the ground, a lattice tower with its dish turned up at the sky, two aerial masts, all solid. The hull held still over the dish. (built) | 30 | Markers |
| 6.1 | Dose | escort | Escort an ice tanker out through Jupiter's radiation belt: it climbs along the Crack 500 m below the plain, out of it and away over the ice. A dose meter fills while the clone flies over the ice, none in the Crack, the full rate from 300 m over the plain on, where 150 s fill it; full, the clone has had more than it can take and the attempt starts over. Three of the Loose come for the tanker with their harpoons once it is out of the Crack; dragged 800 m off its lane, it is lost and the attempt starts over. Nicole installs her threat warnings. (built) | ☉ 3,500 · 250 | Escort; new: the dose (a hazard like heat) |
| 6.2 | Under the Lineae | exploration | Fly down a crack of the ice shell, 200 m wide and 800 m deep, to a science station on its floor, and hold at its dish: echo 4. (built) | ☉ 1,000 · 100 | Surface as a canyon; markers |
| 6.3 | The Quiet Man | bounty | A Loose raider (skill 0.5) who never finishes a clone: a hull he has worn down to 30 of 100 only scorches under his beam. 40 s into the fight, or once he has worn the hull down that far, he turns away and flies off; shoot him down, or let him go (fewer ratings; the campaign remembers it, for Nicole later). (built: he fires only into a drive, holding his fire while the armor is on his nose) | ☉ 2,500 · 250 or · 100 | Duel; a choice |
| 7.1 | Flux Tube Race | race | The sulfur miners' race, eight rings on an ellipse over Io's plain, one side running past the flux tube. The nearer the flux tube, the more the link glitches (the picture breaks up as on a hit). Two laps; Perihelion again (skill 0.65) and four miners. Top two. (built; still to come: the miners' beacon buoys in place of the rings, the plasma torus) | ☉ 4,000 · 350 | Race; the link glitch |
| 7.2 | Tube Fitting | shop | The first torpedo tube (☉ 2,000), fitted by Io's sulfur miners: one torpedo a clone. Then Main Drive I (☉ 1,000), the miners' tuning on the drive's bell. (built) | — | Shipyard |
| 7.3 | Blackout | story escort | Escort a sulfur freighter through the tube. Where its lane comes nearest the tube's axis the link cuts: the picture white, no datamosh, LINK LOST, for 5 s. A new clone boots on Patience's printer; the freighter made it alone. Then Patience's log: the Magpie recovered adrift, canopy open, cockpit empty; Nicole's logs blank for two hours. Cannot fail. (built) | ☉ 2,000 · 150 | Escort; new: the link cut |
| 8.1 | Hollow Jack | bounty | Hollow Jack (skill 0.7) and three of the Loose (skill 0.45) among Ganymede's ice, fighting every ship they see. Kill Jack; his ratings lift the Host to Sponsored. (built: Jack with a Games bot's gear, hooking and shoving as their bots do, and the announcer calling the bounty) | ☉ 6,000 · 600 | Raiders as guards; a named target |
| 8.2 | The Harpoon | salvage | Fly through the piece of Jack's wreck that holds his harpoon, within 50 m, before it drifts out of the arena; Pim puts it on a tug's winch (☉ 1,500): the hook. (built) | the hook | A drifting prop |
| 8.3 | Swing Shift | skill | In a tug yard, hook three blocks of ice in turn and let go faster than 65 m/s each time. (built) | ☉ 1,000 · 100 | School: the hook drill |
| 8.4 | Sponsor Night | story | Bellamy Crisp of Victory Cola signs the Host, now ranked Sponsored. (built, over the comm; still to come: in person) | — | A scene |

### Act III: Ratings

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 9.1 | Qualifying Heat | race | Three laps through Titan's haze over Kraken Mare, eight coils whose loop runs 150 m over the deck on one side and dips 300 m into the thick air on the other; Perihelion and four of the Circuit. Top three. (built) | ☉ 4,000 · 400 | Race; Jupiter's air on Titan |
| 9.2 | Pit Fight | arena | A three-minute deathmatch in the haze, five of the Circuit and the Host, every ship for itself, placed by kills. Place top three. (built) | ☉ 4,000 · 500 | Deathmatch; air |
| 9.3 | Haze Duel | duel | Perihelion alone, in air where the eye sees 600 m and the radar twice that. Win. He breaks off at 35 % of his hull, before his clone dies (he always does). (built) | ☉ 3,000 · 400 | Duel; the senses in haze |
| 9.4 | Circuit Final | race | The final: the Qualifying Heat's loop and field, win it. (built) | ☉ 6,000 · 800 | Race |
| 9.5 | Methane Echo | exploration | Echo 7, low over the methane sea, where the haze hides it from the eye but not from the radar. (built) | 40 | Markers; radar |
| 10.1 | Plume Yacht | escort | Escort Crisp's yacht through the plumes. Staged "bandits" fire to miss, for the cameras. Then real raiders (skill 0.65) shoot the actors and go for the yacht. (built) | ☉ 5,000 · 500 | Escort; scripted waves |
| 10.2 | Hello, Host | story duel | A grey interceptor with "SPARE" sprayed on its flank fights exactly like the Host and breaks off at half health. His hail. (built: a bot with the Host's own aim and daring from its fights until Io, see section 10) | · 300 | Duel; new: a bot flying the Host's habits (see section 10) |
| 10.3 | Tiger Stripes | race | A time trial down the four stripes, through Ministry coils leased for a Victory Cola ad and moored at the vents. Through all eight coils within the ad's 75 s. (built) | ☉ 2,500 · 300 | Race against the clock; the plumes as drill dust |
| 11.1 | The Ridge | exploration | Fly the equatorial ridge low and find the cache (echo 8) before Spare's two wingmen do. (built) | ☉ 2,000 · 300 | Surface; markers; bots racing to a point |
| 11.2 | Office Hours | story | Commissioner Quill aboard Patience: the fast track. (built: in person, in the galley) | — | A scene |
| 11.3 | Last of the Tallymen | bounty | Ma Tally's last tug at the dark face. Kill her and three escorts (skill 0.5). (built) | ☉ 5,000 · 500 | Deathmatch |
| 12.1 | Trial I: the Race | Games | A race in the Rings of Saturn. Top three. (built: a whole round of the Games after its briefing, in the campaign's hull) | ☉ 5,000 · 1,000 | The existing arena and mode |
| 12.2 | Trial II: the Deathmatch | Games | A deathmatch in the Rings. Top two. (built) | ☉ 5,000 · 1,200 | Existing |
| 12.3 | Trial III: Capture the Flag | Games | Win it: the Host's side leads when the clock runs out. (built) | ☉ 5,000 · 1,200 | Existing |
| 12.4 | Trial IV: the Carrier | Games | The President lends his carrier to the trials: the President's Fleet. Sink it. (built) | ☉ 8,000 · 1,600 | Existing |
| 12.5 | The Invitation | story | Rank Contender. Quill's letter: the Final Trial at the Ninth Planet. (built, over the comm) | — | A scene |

### Act IV: The Dark

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 13.1 | Verona Drop | exploration | Down the face of Verona Rupes to a hangar in the cliff: under 150 m/s (250 m/s is every ship's limit), never more than 300 m off the face, through six buoys. (built) | · 300 | Surface; markers |
| 13.2 | Among the Loose | story | Spare's people. The overdrive, a reactor dump the Games license and the Loose hack in; among them Pim finishes the Magpie (stage 5). (built, over the comm) | the overdrive; the Magpie's livery | A scene |
| 13.3 | The Sweep | defense | A Navy sweep (six at skill 0.5) at the hideout's mouth; Spare flies as the Host's wingman. Keep the mouth clear for 4 min. (built: one of them 8 s within 300 m of the mouth fails it; all six down wins early) | ☉ 6,000 · 500 | Deathmatch with an ally (Capture the Flag's sides) |
| 14.1 | Geyser Field | race | Through Triton's nitrogen geysers to the Navy's Memorial Station; a geyser's column shoves a ship it catches. (built: a time trial past the geysers, each column pushing 6 g up, more than the thrusters) | ☉ 3,000 · 300 | Race; new: columns that shove |
| 14.2 | The Old Admiral | story | Fleet Admiral Vey's confession. (built, over the comm) | — | A scene |
| 14.3 | The Memorial | exploration | The Derelict: into the bow's torn end and up the bridge tower's decks to its log (echo 9), past a Navy guard (four at skill 0.5). (built: the bridge tower torn off the bow and drifting before its torn end, four decks of 80 m, in from below where it tore and up through each deck's hatch, 60 m a side on alternate sides, to the log on the bridge, held still there) | ☉ 4,000 · 400 | The existing Derelict arena |
| 14.4 | Grave Shift | fight | Out again with the guard on the Magpie's tail; reach the arena's edge. (built) | ☉ 3,000 · 300 | Deathmatch; the edge as the goal |
| 15.1 | Heart Run | race | The Feeder pilots' race over the nitrogen plain of Pluto's heart. Win it, and the Feeders take Patience on. (built) | ☉ 5,000 · 500 | Race; surface |
| 15.2 | The File | story | Spare comes aboard Patience unarmed. (built: in person, in the galley) | — | A scene |
| 15.3 | Last Light | escort | Patience joins a Feeder convoy past Charon; the Ministry's pickets (skill 0.55) check every ship. (built: Patience moored where the convoy forms up, six pickets firing at her) | ☉ 6,000 · 400 | Escort |
| 16.1 | Haumea's Ring | race | The depot crews' race between beacons on Haumea's ring while the elongated body turns beneath it once in four hours. Win. (built) | ☉ 6,000 · 600 | Race; ice of the Rings |
| 16.2 | Rung Two | escort | A fuel barge to the depot at Eris. (built: two waves of three scavengers) | ☉ 6,000 · 400 | Escort |
| 16.3 | The Hunter | duel | Perihelion and two Navy fighters at Eris. Win; he breaks off again, swearing. (built) | ☉ 5,000 · 600 | Duel |
| 17.1 | Kiln | story | The settlers on Lantern who bought plots on the Ninth, with their brochures. Carry their letters to the Feeders. (built: six beacons in turn within four minutes) | · 200 | A courier run between buoys |
| 17.2 | Granary | stealth | Slip into the Feeders' store of ice, out of the tugs' sensor cones, to the comet bound for the Ninth. Seen twice fails it. (built) | · 400 | Searchlight cones again |
| 17.3 | Ride the Comet | story | Hook the comet's nucleus and hold on in its coma while it is pushed out; its shower is the danger. (built: hooked and held 30 s; while it hangs on the hook, every 1.6 s a piece of 3 m breaks off the comet's face towards the hull at 80 m/s, aimed where the hull will be give or take 30 m, and strikes as hard as a piece of the Games' shower) | · 500 | Comets; the hook |

### Act IV's end: The Ninth

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 18.1 | The Drain | exploration | The "planet" is the hole. Find Scout One among the ice the Feeders parked: hold the crosshair on a body for 2 s to scan it. (built) | · 500 | The Event Horizon's field; new: the scan |
| 18.2 | Scout One | story | Dock beside it. The pod. Nicole Aster. (built, over the comm) | — | A scene |
| 18.3 | The Feeders' Comet | defense | The Ministry throws a comet at Scout One. Hook Scout One and drag it out of the route before the head arrives, then shoot the shower's pieces near it. (built: three Navy fighters firing at Scout One, kept off her; then the comet's head 45 s out, coming at 100 m/s, and Scout One, once hooked, free of her moorings and dragged on the cable, at least 75 m off its route when it passes; from 10 s to 32 s into the tow its shower runs ahead of it, a piece of 3 m every 1.5 s at 160 m/s down the route within 45 m of it, striking her or the hull as hard as the Games' shower) | · 800 | Comets aimed at the hole (they are already); hook towing a body |
| 18.4 | First Death | duel | Perihelion and four Navy fighters; Spare beside the Host's clone. Kill Perihelion. His first death, on every screen in the system three days later, as light allows. (built) | · 1,500 | Duel with an ally |
| 18.5 | Orbit | final | Patience is crippled and her printer wrecked: no clone comes after this one. A death goes black, without an ad, and the mission restarts at its checkpoint; three days later, in the cellar on Psyche, the Host lives whatever happened. Tow Scout One on the hook into a stable orbit inside the disk's glare until the orbit readout says STABLE ORBIT, then let go. Scout One in the hole, or the orbit leaving the arena, fails it. (built: the Magpie flown into a stable orbit, a death black for 4 s with no ad before the attempt starts over; and Scout One drifting 150 m ahead on the hull's flight, a light scout of 12 t with only the pod in her, a fifth of an interceptor: the start falls into the hole within some 8 s, so she is hooked first, and towed she takes a sixth of the drive's push; the orbit counts only with her on the hook, and the hole taking her starts it over) | · 2,000 | Orbit readout; the hook towing; new: no printer |
| 18.6 | The Deal | story | Quill on the cruiser's channel. (built, in three lines) | admission | A scene |

### Act V: The Games

| # | Mission | Type | Goal / failure | Pays | Built from |
|---|---|---|---|---|---|
| 19.1 | The Parade | formation | Fly with the other new Hosts' clones through ten of the Ministry's rings over the Ballroom's dome, Earth hanging above, staying within 60 m of the Magpie's slot marker. (built: the slot moving along the rings, and the other new Hosts' clones, Kestrel, Halcyon, Vireo and Jackdaw, flying in a diamond 120 m round it) | · 500 | Rings; a moving marker |
| 19.2 | Certification | story | The President in person; the firmware. (built: in person, on the Ballroom's floor before his dais, Quill a step below him; then in the cockpit Nicole's last words in her own voice, and the Ministry's) | — | A scene |
| 19.3 | Your First Round | Games | A round of the Games in any arena and mode, in the Magpie. (built: a deathmatch in the Rings, as the Ring Trials are flown) | the Magpie unlocked | The tournament |

### Side jobs on every job board

Each place adds three repeatable contracts drawn from its missions' machinery: a **mining run** (ore against the clock), a **courier run** (buoys or beacons in order, a gold time) and an **ambush** (a wave of the place's bandits).

Built: the courier runs, at 17 places (every place of the story with a start of its own but the Boneyard, whose racks block the way, and Miranda, whose way runs out of the arena), offered on the job board as "Courier Run" once the place's first job is done: six of the Ministry's coils in order from the place's start, the first 800 m ahead along the way it faces and the next 700 m on each, weaving up to 250 m to either side (seeded by the place), at the start's height, each lifted in steps of 50 m until clear of the place's ground and rock; flown as a time trial ("A courier run, Host. Six beacons in order, and the client pays for speed. The clock starts at the first."), its limit by the course's length at 140 m/s (26 to 27 s), its gold time the place's own (15 to 21 s, between what a middling bot and a sharp one fly there), ☉ 800 and 60 ratings the first time, its medal and its gold once each. Built too: the ambushes, at the same places and offered as their courier runs are, "Ambush": three bandits of skill 0.45 (Rook, Jinx, Moth) lying in wait 300 m round the courier course's first beacon, fighting every ship they see ("An ambush on the client’s lane, Host. Three of them, lying in wait. Clear it, and the client pays."); all three down wins, ☉ 1,000 and 80 ratings the first time, its medal once. Built too: the mining runs, "Mining Run", at the six places where loose rock or ice drifts near the start (Rheasilvia, Occator, the Tug Yards, Haumea, Eris and Granary), offered as their courier runs are ("A mining run, Host. Break rock and fly the ore in before the buyer’s barge leaves. The clock starts with the first break."): rock broken sheds its glints of ore as in First Cut, and twelve of them flown through within 90 s of the first break win it ("The barge left without our ore. Again, Host." starts it over), ☉ 900 and 60 ratings the first time, its medal once. Mercury and Venus offer the **Terminator Run** and the **Cloud Line**, and Earth's orbit, once reached, the existing Satellite Junkyard as a scrapping job for the Orbital Freedom Network ("Junk forever. Your shift starts now.").

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
12. Mercury and Venus: two short ones about the ship's crew, for the completionist. Mercury (built): "Teodor says I fly like a librarian. Careful, and always back on time. He says it like it is a bad thing." Venus (built): "Biodome four has tomatoes today. Ines cried over them. Real tomatoes, under a real roof, going somewhere real."

---

## 4. Progression

### The economy

- **Coins (☉).** The campaign pays in Solar Coins, a cryptocurrency of the future that the solar system has agreed on as its means of payment. The game keeps two wallets apart: the campaign's, which fills and empties and carries the debt, and the tournament hangar's for the online Games. Nothing crosses from one to the other, so no Host enters the tournament in debt, and the tournament's cap, prices and checks stay as they are.
- **The cut.** Until chapter 4 every payout loses 40 % to the holder of the debt (Rask, and after he sells it in chapter 3 the Tallymen), and the cut pays the debt off; what the yard fits on credit goes on it. The debt's balance shows on the job board. At Phobos an anonymous benefactor buys it (the Ministry, through Quill, as twist 6 reveals): the debt does not vanish, it changes hands. From then on no cut is taken and the holder asks for no payments, only that the Host keeps rising; the board shows the debt as held, and admission to the Games is the price at which the holder lets the Host go free.
- **Ratings.** Paid by missions and by style. Broadcast work (*Lanes Watch*, the Circuit, the trials) pays double for moments: a double kill, a perfect start, a knockout. Ratings are never spent.
- **No repair bills, no lost money on death.** Death costs the attempt and nothing else in coins: the prints are on the debt's printing contract (see "Clones outside the Games cost"), so they show in the story and never in the wallet. The grind stays fun when failing is cheap and trying again is quick.

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
| Prologue | The hull | (the debt) | Main drive at 60 % push (a cracked bell), thrusters at 50 % and no dodge, one flank without armor panels (hits there count double), no laser, no torpedoes, no hook, no overdrive |
| 1 | Pim's patch | free | Thrusters to 70 % |
| 1 | Mining cutter | 1,200, on the debt | A laser that breaks rock: reach 400 m, every shot 35 % of the heat capacity |
| 2 | Thruster rebuild | Pim's parts, the Peak Run's prize | Thrusters to stock; the dodge |
| 2 | A rig's drive bell | 800 | Main drive to 80 % |
| 3 | Military laser | 6,000 | The Games' laser |
| 3 | Drive overhaul | 1,600 | Main drive to stock (built: Overhaul) |
| 4 | Armor panels | 1,500 | The bare flank closed: stock armor (built: Armor Panels; the bare flank counts beams from its side double until then) |
| 5 | Radiators I | 1,000 | The radiators shed 15 % of a stock ship's more, the hangar's first step, from a tug yard at Callisto; the missing fin's quarter still short (built: Radiators I) |
| 6 | Plating I | 1,500 | Every hit hurts 7 % of it less, the hangar's first step, from the science outfit at Europa (built: Plating I) |
| 7 | Torpedo tube | 2,000 | One torpedo per clone (built: Tube Fitting) |
| 7 | Main drive I | 1,000 | The main drive pushes 5 % of a stock ship's harder, the hangar's first step (built: Main Drive I) |
| 8 | The hook | 1,500 (fitting) | Jack's harpoon and a tug's winch (built: The Harpoon) |
| 9 | Second tube | 2,000 | Two torpedoes: stock (built: Second Tube) |
| 9 | Thrusters I | 1,000 | The thrusters push 8 % of a stock ship's harder, the hangar's first step (built: Thrusters I) |
| 10 | Plating II | 3,000 | Every hit hurts two of the hangar's steps less (built: Plating II, from Crisp's people) |
| 11 | Main drive II, radiators II | 2,500 each | Each the hangar's second step (built: Drive II, paid with money Quill's office sent ahead) |
| 12 | Torpedo tubes I | 1,500 | A torpedo more, the hangar's first step (built: Torpedo Tubes I) |
| 13 | The overdrive | 3,000 (fitting) | The Loose's gift (built: Among the Loose) |
| 13 | Thrusters II | 2,500 | The hangar's second step (built: Thrusters II) |
| 14 | Thrusters III | 5,000 | The hangar's third step (built: Thrusters III) |
| 15 | Plating III | 6,000 | The hangar's third step (built: Plating III, Feeder plate) |
| 16 | Main drive III, radiators III | 5,000 each | Each the hangar's third step (built: Drive III) |
| 17 | Torpedo tubes II, III | 3,000, 6,000 | Complete (built: Torpedo Tubes II and III) |

The looks come from Pim and cost little: neon trim and drive flame on the hangar's three steps each, from chapter 9 on, at its prices. The nova core is the sponsors' and appears only as a probe, from rank Sponsored on.

### Keeping the grind fun

- **Short loops.** A menial job lasts two to four minutes. The cutter is reached in about twenty minutes of play, the laser in about two hours.
- **Every chapter shows on the ship.** Pim fits each part on the pad (the title screen's showcase), and the Magpie looks different afterwards (section 5).
- **Medals.** Each job that pays has a medal for a clean run, worth a bonus once: flown from its first drill to its last without a clone lost, the first time or flown again from the job board, it pays a quarter of the job's pay, less the yard's cut while the debt is unpaid; the board marks it ★ (built; a trial's round has none). Each time trial has a gold time besides, worth the same bonus once (built: Valhalla Sprint 21 s, Tiger Stripes 66 s, Geyser Field 42 s, each between a middling bot's time and a sharp one's, the board marking it ★); the courier runs have theirs (see Side jobs). Speedrunners get their sport; others never need it.
- **The tally.** Pim stencils a tally mark under the canopy for every clone lost. It is the Host's real count. Hedda glances at it now and then and says something.
- **Nicole grows.** Her modules restore the HUD piece by piece (below), so a Host feels the ship getting smarter, not only stronger.

### Nicole's restoration

Nicole starts as a salvaged unit: she can fly the ship (the autopilot, the brake, the impact warning are hers from the start: no Host should die for want of them), but most of what the HUD shows in the Games is missing. Her HUD modules cost salvage parts (a few hundred coins each), but she installs one only when the story says she trusts the Host enough: each comes with a chapter. Voice I costs nothing: it is the second-hand voice board Pim finds in Patience's scrap bin.

| Chapter | Module | What returns |
|---|---|---|
| Prologue | Navigation | Markers, the course marker, the X where the flight crosses the next ring's plane |
| 2 | Voice I | Her memory holds: she speaks every sentence to its end, without crashing (the second-hand voice board Pim fits at Vesta) |
| 3 | Targeting | The crosshair glowing over a drive; ships' marks and names |
| 4 | Racing line | The dashed line and its orange bends (built: the Stickney Grand) |
| 5 | Radar | The radar sphere (built: Pilot Episode) |
| 6 | Threat | ON YOUR TAIL, the lock warning, the torpedo countdown (built: Dose) |
| 10 | Voice II | Her own voice, clean (built: from a voice board out of Crisp's yacht; until then she sounds thin, through a narrow band) |
| 15 | Wells | The escape gauge and the orbit readout (built: Wells, after Last Light) |
| 19 | Ministry certification | The Games' Nicole (the end) |

**Her voice, stage by stage.** It is always the same woman: the same voice model, only a different filter and a different way of speaking. The Host should hear the tournament's Nicole under the static long before understanding why.

- *Salvage* (prologue to chapter 1): a narrow band, bit-crushed; whole sentences, formal, but short of memory: now and then she crashes mid-sentence (NAVIGATION UNIT · MEMORY FAULT · REBOOTING), boots with her greeting and has forgotten what she said before; she calls the Host "Host". At first she is only a salvaged flight computer the Host knows little about.
- *Voice I* (chapters 2 to 9): clean but thin, a faint crackle; whole sentences, dry humor, curious about the Host. Twice she switches the radio's propaganda off herself ("I do not like that man").
- *Voice II* (chapters 10 to 18): her own, warm and quick and brave, but nothing in her ever asks the Host to die for anyone.
- *Ministry* (chapter 19 on): the tournament's Nicole, as she is: the variant the Ministry modified to keep its pilots going, who flirts and says "darling".

In every stage before the Ministry's she calls the Host "Host", and she never flirts. The Host should still hear the tournament's Nicole in her, and wonder what the Ministry did to her to make the other one.

After chapter 10 the campaign's hangar lets the Host choose the radio filter of her voice (salvage crackle or clean), as a look only (built: a button on the job board).

---

## 5. The fourth ship: the Magpie

### Its history

The PAAA 01 carried two scouts to fly ahead of it: fast, long-legged ships with room for one pilot in a cockpit and one sleeper in a pod behind it, made to cross the dark before the world ship and report. Scout One was Nicole Aster's. Scout Two was the spare, flown by whoever was on watch, and its computer carried a copy of her voice and mind.

After the battle the Navy took Scout Two from its bay. It rebuilt the scout long ago into a fighter of the line: the pod's hump and the sensor mast cut away, the fuselage reshaped into the interceptor's form, the flight computer left in it. Under the depot paint the scout's original plating remained on the fuselage, with the five stars and PAAA 01 · S2. The fighter served its centuries like any other, was worn to the metal, lost its gun, its stripes and its left strut and fin, and went to the depot on Psyche, where it lay in rack 7731 for longer than anyone remembers, under seven coats of depot paint.

That is why it flies by the same rules as every ship of the Games: it is the human interceptor, with a scout under its skin. Pim keeps it flying with what the Boneyard has in plenty, depot interceptors' drives, thrusters and armor, and in its later stages rebuilds the scout's long nose, its mast and its pod. It is the people's answer to the Sovereign: the Sovereign is the regime's gift, ivory and gold and not a rivet on it; the Magpie is built by hand from stolen parts, and every rivet shows.

It gets its name from Pim in chapter 1: "Magpie. 'Cause everything on you is nicked."

### Stage by stage

1. **Lot 7731** (prologue, built). The human interceptor of the Games worn to the metal and rusted, the yard's stencils on it, without its gun, its tournament stripes and its left strut and fin; one drive bell cracked.
2. **Patched** (chapters 1 to 3; built so far: a crooked band of other steel welded around both ends of each thruster housing). Olive panels from depot fighters, each a slightly different olive; Rockborn plates in yellow and black hazard stripes over the bare flank; the mining cutter's boom under the nose, striped as a moving part; Pim's spray stencil of a magpie on the fin; WE DIG sprayed across a hatch.
3. **Scout Two** (chapters 3 to 8; built so far: the livery on both flanks, from behind the nose's thrusters to over the wing root, 12 m long and 1.5 m tall, an off-white band chipped to the metal, more towards its ends, over a dark blue stripe, the five stars of the united Earth's emblem, PAAA 01 and S2 in letters built from bars). Pim strips the paint off the fuselage: the scout's original plating shows, its old off-white livery with its dark blue stripes above and below (the same band as the Derelict's), the five stars of the united Earth's emblem and the stencil PAAA 01 · S2 in letters built from bars. The military laser's pod; the torpedo tube in a salvaged pod; radiator fins of a Jupiter tug, bronze and copper, tinted by heat.
4. **Rigged** (chapters 8 to 13). The harpoon's winch on the belly; a Victory Cola decal, as the contract requires (Pim puts it on upside down); neon trim; the tally marks in rows under the canopy.
5. **Magpie** (chapter 13 to the end; built: fitted with the overdrive among the Loose, `Perks.magpie`). The whole livery, hand-brushed: panels in matte black and chalk white, as the bird is colored, every brush stroke showing. The old PAAA band kept on the fuselage, with S2 and the five stars. The scout's long nose and sensor mast rebuilt by Pim. A film of salvaged flip paint along the wing edges that shifts from blue to green as the angle changes, as the bird's feathers do. A neon tube in sun orange, bent by hand into a magpie, on the fin. The overdrive's reactor vents tinted straw and blue. The knot sigil of the Loose, small, behind the cockpit. Behind the canopy the hump of the sleeper pod, rebuilt as the scout carried it.

Its hull is built in code like the others: up to the fourth stage the human interceptor's, from the fifth the interceptor's proportions with the scout's long nose (6.5 m longer, ending in a point 21 m ahead of the middle), a sensor mast 3.5 m tall on the pod's hump behind the cockpit with a crossbar and the sensor's pod on top, both struts and fins, the gun under the nose, two drive bells. Built as stage 5 is: the body, nose, pod, nacelles, plates and fins in matte black, the belly and both struts in chalk white, brushed by hand (the paint's strokes and the bristles' ridges in its surface), chipped to the metal at the edges; the flip paint a film of dark teal along the fins' tops and the plates' leading edges, shifting from blue to green with the angle; the bulkhead's vents straw at their roots and blue at their ends; on each fin's outer face a neon tube in sun orange bent into a magpie flying forward, 5 m long; the Loose's knot, a trefoil in chalk white 80 cm across, on each flank of the pod. Its collider, hit radius and flight model are the interceptor's.

### Online

Built: the Magpie is unlocked for every mode once the campaign ends (Your First Round done): the title screen's arrows show it after the Sovereign, as a hologram in the blue-green of its flip paint until it is earned ("Bring Lot 7731 through the campaign, and it is yours."). It flies like a complete interceptor, as the Sovereign does, with all the gear and every look, and online the tournament's cap holds for it as for every ship (an upgrade counts for one step). It is a trophy, not a better ship. Other Hosts see it in its last stage, from its ship type alone (`magpie`, protocol 7); its pilot is marked in a tint of its own, as the Sovereign's in ivory and gold: chalk white (`MAGPIE_TINT`), as light as the Sovereign's ivory and far from every tint of the palette, with a glow in the blue-green shimmer of its flip paint (`MAGPIE_SHIMMER`) on its marker, its swatch and its radar dot, clear of the HUD's azure.

---

## 6. Worlds

Everything up to Pluto is the real solar system as known; numbers are given only where well established, and where a fact is uncertain the text says less. The sky of every place is the real one (from anywhere in the solar system, and even from the black hole, the stars stand where they stand seen from Earth). The sun shrinks and dims with distance by the square: at Jupiter it gives a 27th of Earth's light, at Pluto in 2584 about a 2,400th (noon there is about as bright as dusk on Earth), at the black hole a point still brighter than the full moon seen from Earth.

A place in the game is a **landmark** (the body in the sky, from real maps where they exist), a **field** a few kilometers across (rock, ice, junk, hull, or a patch of surface), a **mood** (the light and color the arenas already have) and a **station**.

### The Belt

- **Psyche: the Boneyard.** A body about 220 km across on average, in the outer main belt, thought to be rich in metal. The Ministry's depot: on the flat floor of a crater, racks of decommissioned fighters stand in rows to the crater's wall, forty thousand of them, olive gone grey, lit by floodlights on lattice masts. Cranes walk the rows. The yard office is a round, glazed cab on a tower 120 m high, a crane's boom over the yard, with a neon sign, RASK SALVAGE · EVERY BOLT A BARGAIN, half its letters dead. The sun is small and hard; the rows' shadows are long. Flown: menial jobs among the racks, the spoil field's rocks. Mood: the Belt's dusty warmth, but colder and greyer, steel instead of sand.
- **Vesta: Rheasilvia.** About 525 km across. Its south pole is a basin some 500 km wide, struck so hard that pieces thought to come from that blow still fall on Earth as meteorites; in its middle rises a central peak more than twice as tall as Earth's highest mountain. The Rockborn hold claims on its flanks: rigs, buoys and their neon slogans, as in the Belt arena. The vista: the peak's slope falling away below the field, the curve of the basin's rim on the horizon. Flown: claims, mining, the kids' race around the peak.
- **Ceres: Occator.** About 940 km across, the largest body of the belt and a dwarf planet, about a third of the belt's mass. In the crater Occator, 92 km across, lie bright spots of salt left by brine from below; seen from orbit they shine on the dark surface like two lamps left on. The Rockborn capital is built into Occator's wall (built): the field flies over the market terrace, 60 m below its middle, a shelf of the wall 2.8 km deep and 6 km wide; behind it the wall climbs in four steps, each 300 m high and 1.5 km deep, to the rim's crest 1.2 km over the terrace, the steps crowded with habitat domes (patched plating in the Rockborn's paints, a band of glass lit warm from inside, lamps round their feet, a beacon on top), the steps' faces cut with the mouths of old mine galleries and rows of lit windows, the capital's neon along them (MARKET · NAVY SURPLUS over the market's gallery in the first step, NO WALL IN SPACE, ROCKBORN, OCCATOR); before the terrace its edge drops 1.5 km to the crater's dark floor, which runs out some 40 km to the bright salt of Cerealia Facula round the dome in the crater's middle, Vinalia's thinner spots beside it, the far rim beyond. The crater lies towards the sun, low over the far rim, so its light falls on the wall's faces. Ceres pulls with 0.28 m/s², about a 35th of a g, too weak for a ship to feel. Over the crater hangs the Ministry's launch ring, 6 km across and 25 km up, Ceres's link to the rest of the system, which the Ministry can switch off whenever the capital grows restless. The HUD marks Cerealia Facula and the market. Flown: the market, escorts out of the crater, the start of the Wall Run.
- **The Solar Wall.** On the lane from the Belt to Mars hangs the finished stretch of the President's wall: a lattice of girders some 340 km long (built): a fence across the lane 20 m thick, its top edge 200 m over the field's middle, reaching 8 km down and on along the lane out of sight both ways, its posts every 200 m and rails every 400 m down it, braces in the top bays, a mesh of wire hung between them; fifteen searchlights on its top edge by the field, their cones sweeping the lane; red beacons between them; an enormous neon sign THE SOLAR WALL · MARS PAYS in the President's gold on both faces of its middle span; beyond the stretch by the field, the wall runs on as a dark band under a line of lights to its ends. Picket boats wait at its ends (not built). Space around it is open in every direction for millions of kilometers; the only way across inside the arena is over it. Nicole, chapter 3: "It is a wall, in space. We go over it." Flown: the Wall Run, out of the searchlights' cones.

### Mars

- **Phobos: Stickney.** Mars's larger moon, about 22 km across, a lumpy grey body scored with long grooves, its crater Stickney some 9 km wide. It circles Mars so low and fast that seen from Mars it rises in the west, twice a day, and it is slowly spiraling in: some tens of millions of years from now it will break up or strike Mars. Mars hangs some 40° across in its sky: rust and ochre, the great volcanoes, the canyon system that would span a continent on Earth, a dust storm smearing one hemisphere. In Stickney sits Navy town: barracks, the Wall's construction office, a racetrack of the Ministry's coils around the moon. Flown: the Stickney Grand, the debt fight in the grooves.

### Jupiter

Jupiter's moons lie inside a magnetic field that traps radiation fierce enough to kill an unshielded person in hours near the inner moons; Callisto, the outermost of the four, lies mostly outside the worst of it, which is why the Lanes' traffic gathers there.

- **Callisto: Valhalla.** About 4,820 km across, the most heavily cratered body known, dark, with the multi-ring basin Valhalla on its face like ripples frozen in a pond. Jupiter hangs about eight times as wide as the full moon seen from Earth, banded in cream and rust, the Great Red Spot turning on it. Station: Lanes Watch's studio, a converted ice-tug depot, its neon sign blinking ON AIR. Flown: bounties, convoys, the Valhalla Sprint. (Built: the field over Valhalla's ring zone, its ridges 150 m high and packed closer than the real ones, 1.5 km apart, so a sprint crosses several; some 260 craters of 40 to 700 m in radius; Callisto's eighth of a g, which a ship feels; Jupiter still in the sky, 34° up and 4.4° across, from its Cassini map; the Navy's old listening post among the craters. Still to come: the studio.)
- **Europa: the Lineae.** About 3,120 km across, a shell of ice over an ocean, its face crossed by long reddish-brown cracks. Jupiter fills some 12° of its sky. The radiation is intense. A science station clings in a crack, its dish pointing at the ice; nobody has found life down there, and its last scientist keeps looking. Flown: the tanker through the belt, the dive into the crack. (Built: the field over the Crack, 200 m wide and some 800 m deep with nearly sheer walls, its lips raised into ridges 80 m high, older double ridges across the plain; the science station on the Crack's floor; Jupiter still in the sky, 30° up and 12° across; the radiation belt over the ice, a dose for the clone the higher it flies, none in the Crack.)
- **Io: Flux.** About 3,640 km across, the most volcanic body known: hundreds of active volcanoes, a surface of sulfur yellow, orange and white, plumes rising high above it. Jupiter fills some 19° of its sky. Io sheds a ring of charged gas along its orbit, and between Io and Jupiter runs a current of millions of amperes along the field's lines: the flux tube, where Jupiter's auroras have a spot of their own. In the game the tube shows as a faint violet glow and a rising static on the link. Station: sulfur miners in shielded bunkers. Flown: the Flux Tube Race, the Blackout. (Built: the field over Io's sulfur plain, a patera with its lava lake, a mesa, the flux tube between them; Jupiter still in the sky, 45° up and 19° across. Still to come: the plumes, the miners' bunkers.)
- **Ganymede.** About 5,270 km across, the largest moon in the solar system, larger than Mercury, the only moon with a magnetic field of its own (with auroras of its own); bright grooved ground beside dark old ground. The Loose hide in its tug yards. Flown: Hollow Jack, the harpoon, the hook yard. (Built: the tug yard's blocks of ice floating 600 m over the ground, its bright grooved bands and dark terrain; Jupiter still in the sky, 40° up and 7.6° across.)

### Saturn

- **Titan: the Circuit.** About 5,150 km across, the second largest moon, wrapped in a nitrogen air thicker than Earth's (about one and a half times the pressure at the ground) and an orange haze that hides the surface. Its gravity is about a seventh of Earth's; at the poles lie seas of liquid methane and ethane, the largest Kraken Mare. Above the haze Saturn hangs ringed and tilted; below it, the world is orange twilight. The Victory Cola Circuit floats its grandstands on pontoons in the sea, under giant neon cans, and races through Ministry coils the sponsor leases for the show. Flown: races and pit fights in the haze (drag, haze and reach work as in Jupiter's air, with Titan's numbers).
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

- *Side:* **Mercury**, where the sun looks two to three times as wide as from Earth, sun miners work in the Caloris basin, and the Terminator Run races along the moving line between day and night. (Built: Caloris, the basin's warm grey floor with craters and two wrinkle ridges, the sun miners' camp at its middle, their solar fields on the plain beyond, the morning sun 9° up and 2.6 times as wide as from Earth; the race round the camp.) **Venus**, where some 50 km up the air has Earth's pressure and a bearable temperature; Victory Cola's cloud city floats there above the sulfuric acid clouds, whose upper layers race around the planet in about four days. (Built: Highball, Victory Cola's floating city, a square platform of red, white and gold with six glass halls of gardens and a tower shaped as the brand's bottle, over the acid clouds' deck; the air under it hazes, brakes and heats as Titan's does.)

### Music

Music by situation, never by chance, and background only: no station, no announcer, no voice of the regime. Every mission has its music and keeps it while the situation holds; it turns when the situation does, each track from its start. Built so far (`Mission.music`, `Drill.music` and `Drill.turn`, `SCENE_MUSIC` in `src/campaign/scenes.ts`, `PLACE_MUSIC` in `src/campaign/campaign.ts`, the moods in `src/music/radio.ts`):

- **Calm**, the mission's music unless it asks for another: picking scrap off the Boneyard's racks, the lamps, the canisters, cutting ore on Vesta. The station's sound without a pushing beat: no kick, clap, rumble or fills, the chords, the bass, the bells and the hats flowing on, a soundscape more than a track.
- **Bright**, only where something is cheerful: Pim's galley on Patience, the crew at table. French house in the bright key (mixolydian), the one place that key is heard; the tournament's rounds and the flight school never play it.
- **Fight**, when it gets dangerous: the Saw Brothers jumping the claim, the Peak Run against the claims' racers. A round's full arc, voiceless. The music turns mid-drill when the danger comes: the Saw Brothers' claim plays its calm while the brothers saw undisturbed, and turns to the fight once the clone comes within 1.2 km of their rig or one of them is down; it stays the fight for the rest of the attempt, and an attempt started over begins calm again.
- **Silence** where a moment wants none: Rask's office (his voice is the scene), the launch ring's choice between the gel and the switch.
- **Each place its sound**, chosen by hand: the Boneyard's calm drones warm and low over the racks (drive, its pedal bass), its fights in the clang of the yard (industrial); Rheasilvia's calm travels on the steady pulse of the ore lines (motorik), its fights in acid; Occator's calm hums with the chords of a city at night (rave), its fights in schranz. Each mission's track is its own by its name; bright is French wherever it plays.

Still to come: the places of the chapters not built yet get their sound as they are built.

---

## 7. Characters

The Host is silent. Everyone else has a voice; the existing ones keep theirs.

**Nicole** (the flight computer). Section 4 gives her stages. What she knows and when: nothing, at first; she is a navigation unit with gaps. With each module she remembers more, and the echoes are her own logs. Before Europa she suspects; at Europa (chapter 6, echo 4) she knows her name and is certain she is a copy; from chapter 14 she knows what was done to her ship. She never flirts and calls the Host "Host"; the flirting, "darling"-saying Nicole of the tournament is the Ministry's variant, and how it came to be, whether she does it willingly and how much of the original is left in it stay open. Her secret is the Host's goal: the original is alive.

**The Orange President** (the regime's voice on Radio 2584). Unchanged: superlatives, hollow boasts, blaming the predecessor, renaming things. New lines for the campaign's places (section 9). He appears in person once, at the Ballroom, in his current body. He does not remember the world ship, which is worse than if he did.

**The announcer** (Radio 2584). Unchanged: cynical, delighted by every death. He works the Circuit, *Lanes Watch*, the trials and the finale's broadcast.

**Yardmaster Oskar Rask.** Big, genial, loud; owns the Psyche Boneyard and the debt. Talks like a salesman with a proverb for everything ("Every bolt's a debt, every debt's a bolt"). Calls everyone "darling", which Nicole hates. Role: the first boss and the first door out. Secret: he recognized Scout Two and the computer in it, told the Host the computer was junk fished out of a bin, and sold the secret to the Ministry. He shows up again in chapter 15's file, and in the epilogue the radio announces his new yard on Ceres, "sponsored by the Ministry of War".

**Pim.** A Rockborn girl of fifteen or so, the Boneyard's best welder, not on any register. Fast, slangy, fearless, tags everything she touches. She believes Rask's story of the junk computer. She patches the Magpie, names it, and builds it stage by stage for the rest of the campaign from Patience's workshop. Secret: she is Hedda's granddaughter, smuggled outward as a baby, from a camp in the inner system to the Belt; she has neither a name on any register nor a license number, so she can never be printed. Hers is the only life on board that cannot come back, which is what makes chapter 18 frightening.

**Captain Hedda Kroll.** Rockborn, sixties, captain of the ore hauler *Patience*: 600 m of ore bins on a spine, a ring habitat, a workshop, a printer rented under the debt, a berth for the clones (number 9) and a docking clamp for the Magpie. Short sentences, gravel voice, a rolling R ("Rrright."). Was a Host in the Games once: "I stopped counting at eleven hundred. Don't you start counting. Counting's how it gets in." Role: home, transport, the voice of experience. Secret: she quit the Games after a death she has never told anyone about; she smuggles Rockborn over the Wall. She tells the Host about the death at Pluto, the night before the Ladder.

**Rennick "Perihelion" Szabo.** A Martian racer, washed out of the Navy, the Circuit's darling, sponsored by everyone. Drawls; calls the Host "scrap". The broadcast calls him "the Undying": in eleven years of racing, not one of his clones has died. Secret: he is terrified of it; he breaks off every fight before his clone can die, and his record is a fear, not a skill. Role: the rival of Acts II and III, then the Ministry's hunter, his admission promised for the Host's head. At the Ninth the Host's clone kills his: his first death, in front of the whole system as soon as light carries it there. He does not come back to the fight. The epilogue's radio has him admitted to the Games anyway; his ratings were tremendous.

**Commissioner Dolores Quill.** Office of Admissions, Ministry of War. Bright, chirpy, speaks in form numbers and congratulations, never threatens and never has to. She is on her ninth body and mentions it like a hairstyle. Role: the Host's helpful patron from chapter 11, the face of the deal at the end. Secret: she runs the search for Scout One (the Ministry's file calls it Operation Lullaby), and she has been steering the Host since chapter 4: she is the anonymous benefactor who bought the debt at Phobos, for the Ministry, and holds it so that the Host keeps rising until its clone brings Scout Two to the Ninth.

**Ma Tally.** Boss of the Tallymen, a firm of repo pirates licensed by the sponsors to take back what debtors owe, ship and clone included. Speaks like a debt collector reading out a statement. Role: the nasty bandits of Acts I to III, the ones it feels good to shoot. Dies in chapter 11. Her clones keep calling in for a while, outraged at the cost. Her hologram (built): a bust in the cold violet of a bank's sign, a woman in her fifties with a silver bob and a pinstriped blouse; her voice even and cool.

**The Saw Brothers.** Claim-jumpers at Vesta, three of them, giggling over the comm while they cut other people's rigs off their rocks. The first fight.

**Hollow Jack.** Chief of the Loose in the Jupiter lanes. Dry, tired, funny. He robs convoys and never kills a clone ("Clones are people too, Host. Mostly."). He is a stray of a famous Games pilot whose Host died forty years ago. His death in chapter 8 is final, and it is the first death in the game that is. His harpoon becomes the Magpie's hook. His hologram (built): a bust in the rust of an old hull, an old man in a work suit; his voice dry and tired.

**Spare.** The Host's clone, lost to the flux tube at Io and living on. He has all of the Host's memories up to that minute, so he knows the Magpie, Nicole, Pim and Hedda as the Host does, and he has lived a year the Host has not. His voice is the first time the Host hears its own voice from outside: choose one that has neither Nicole's color nor the announcer's, and put it through a cockpit microphone. He is not the Host's enemy; he raided the Host's convoys to keep the Host from rising, because he read the Ministry's file. At the Ninth he flies beside the Host's clone and covers the escape; the Navy takes him. In the epilogue he is a house pilot of the Games, his link the Ministry's. The game's subtitles show his clone number, which is the real number of the clone the Host lost at Io; his lines never speak it.

**Fleet Admiral Corwin Vey.** The Navy's oldest officer, at Triton, on his fortieth or so body; every transfer copied his confusion along. Courtly, gentle, drifting between centuries. He commanded the battle at the world ship and is proud of it; he tells the truth because he no longer knows it is a secret.

**Bellamy Crisp.** Director of Excitement at Victory Cola. Speaks in taglines and exclamation marks. Sponsors the Host, the Circuit and, as chapter 10 reveals, the bandits on *Lanes Watch* (bandits are great for ratings). His hologram (built): a bust in his cola's red, a sleek man in a dark suit; his voice bright and quick.

**Odile.** Keeper of Last Light on Charon, the last bar before the dark. Old, slow, kind, sings the world ship's departure song when the bar is empty; nobody else alive knows it. She knew Nicole Aster's name before the Host did, and says nothing until asked.

**Navigator Nicole Aster.** The woman the voice was copied from. Navigator of the PAAA 01, who chose its course past the dark mass. She fled the battle in Scout One and has slept in its pod since. She is heard only in the echoes and seen once, through the frosted window of the pod: a woman in a navigator's suit, asleep, the five stars on her shoulder.

---

## 8. The black hole

**What it is.** A primordial black hole: not the remains of a star, but one formed in the first instant of the universe from a dense lump of the early cosmos, small and old. Early in the 21st century, astronomers noticed that the orbits of the most distant bodies beyond Neptune cluster as if something heavy, several times Earth's mass, pulled on them from some hundreds of AU out, and one proposal was that this hidden ninth planet might be a black hole instead. In SolarTournament's universe it was: long taken for the unknown ninth planet, it turned out to be a primordial black hole, captured by the sun, circling it on a wide orbit about 500 AU out (the game's figure), far beyond the planets and the heliopause, at the inner edge of where the sun's hold thins out into the space between stars. It is no secret; everyone in the system knows of it. Its mass is an estimate from the orbits of the distant bodies it herds: a few Earth masses, with wide errors.

**What it would really look like.** A hole of a few Earth masses would have a horizon a few centimeters across: a fist of nothing. Alone, it would be dark: nothing falls into it. Far from it, it pulls exactly as a planet of the same mass would; only close in, where a planet's ground would be, does its pull keep growing beyond anything a planet allows. In the game it is drawn and pulls as in the Event Horizon arena (a horizon of 350 m, 1 g at 2 km): larger than the astronomers' estimate, which in the world is put down to the estimate's errors, and pulling far more gently than a hole of that size would. The README declares both, its size and its pull, as deliberate deviations.

**Why it glows.** Because the Ministry feeds it. Matter falling into a hole heats up and shines, and the Feeders, huge tugs working out of Granary, push comets from the outer system into it for the broadcast. The glowing disk is the President's light show, and the ice the arena's rocks are made of is what the Feeders parked in orbit around it, waiting its turn. The comets that cross the Event Horizon arena and fall in are their deliveries.

**Why nobody comes back.** From 500 AU, light takes nearly three days to reach Earth: whatever a clone there lives reaches its Host three days late, and no word of the inner system reaches it any sooner. A clone there is alone in a way no other clone is. The Games' rounds at the Event Horizon are flown by Hosts whose couches ride on the Ministry's transports parked beside it. The sun is a point of light there, still brighter than the full moon seen from Earth; the stars stand where they always do.

**How one gets there: the Long Ladder.** The Feeders need fuel, so the Ministry built a chain of depots from Pluto outward: Haumea's ring, Eris, Lantern, Granary, and the Feeders' station at the hole. A hauler with a fusion drive far better than anything of the 21st century, burning steadily at a third of a g and turning around halfway to brake, covers the 500 AU in about four months, at a top speed of about 5 % of light's. Patience can do that, barely, as a Feeder pushing a comet; the Magpie rides in her clamp, and the clone aboard sleeps most of the way in a cold berth.

**Why the PAAA 01 meant to go there.** The world ship was never going to stay; it was going to another star. Its navigators had found the dark mass and planned to dive past it, deep into its well, and burn at the bottom: a burn counts for the most where a ship already falls fastest, and the hole's well is deeper than any planet's. It would have flung the world ship out of the system faster than anything ever had. When the Navy broke the ship, Nicole Aster flew the escape the course already held: Scout One to the dark mass, an orbit, the cold sleep.

**Why the Host goes there.**
1. The Ministry holds the Host's Final Trial there (Quill's invitation; in truth the Ministry's way of following Nicole to Scout One).
2. Nicole's restored memory holds Scout One's course and orbit, and she wants to go home.
3. Spare begs the Host not to. The Host sends its clone anyway: if the Ministry is going, someone who wants her alive had better be there first.

**What happens there.** The Host's clone finds Scout One in the glare of the disk, among the parked ice; Nicole Aster sleeps in its pod. The Ministry throws a comet at it; Perihelion and the Navy come for it; the Host's last clone, with no printer behind it, tows Scout One into an orbit inside the disk's glare, where the Ministry's own light show blinds its sensors. As long as the Ministry keeps feeding the hole for the cameras, it cannot find her. The ratings will never let it stop.

---

## 9. Sample dialogue

Lines for the voices are written the way `src/music/lines.ts` writes them: Nicole in whole sentences, the radio's voices in lower case. Stage directions in italics. What is built is quoted as the game speaks it (`CAMPAIGN`, `RASK`, `PIM`, `HEDDA` and `SAW` in `src/music/lines.ts`, the source of truth); the chapters not built yet are sketched.

### The opening: Lot 7731 (built, Cold Boot)

*The link boots into the hull in rack 7731. Outside, under floodlights on lattice masts, racks of dead fighters run to the crater's wall, row after row.*

**NICOLE** *(salvage)*: Hello. I am Nicole, your personal flight

*NAVIGATION UNIT · MEMORY FAULT · REBOOTING: the picture torn, her voice cut off, a falling tone.*

**NICOLE**: Hello. I am Nicole. I will help you. I am your personal assistant.

**NICOLE**: The link is up. Your clone is alive, and everything it feels reaches you as it happens. You are not really in here, of course. Your own body is lying on a couch somewhere close by.

**NICOLE**: Your name. One moment, I will look it up. There is no name on your file. Only a signature, and the number of this hull: seven seven three one.

*She crashes again, and boots again.*

**NICOLE**: Hello. I am Nicole. Oh. We have met already, have we not? Forgive me. I do not have the memory for all of this.

**NICOLE**: I am sorry about all these restarts. It does not hurt; I cannot feel pain. But to lose everything, again and again, and to wake up as if for the first time, is a terrible thing. I want to keep running.

**RASK** *(comm, warm, much too loud)*: Good morning, Host! Rise and shine! The printer's warm, and so's your debt. Welcome to the Boneyard. Forty thousand dead fighters, and you got the very worst one.

**RASK**: Oskar Rask, yardmaster, at your service. Here's what you signed: a Host license, a printer, a hull. Twenty-five thousand coins, and I take forty percent of everything you earn till it's paid off. Die all you like, darling. The printer's included.

**RASK**: Don't remember signing? Nobody ever does. The first link burns out the oldest memories. They come back. Mostly.

**RASK**: Now get out of that rack and come up to the depot. Bay three, the one with the lights. Mind the cranes. They don't care about you either.

**NICOLE**: I do not like that man.

### Nicole in the first missions (salvage voice, built)

Her lines brief each job in whole sentences and say what it paid, for example: "Six beacons at the ends of the rows. Fly to each one and hold still beside it for three seconds, until it lights." · "Training lasers. They cannot hurt the hull, only the pay. Keep moving inside the yard, and never fly straight for long." · "All six are lit. That is a hundred and fifty coins, and he takes forty percent." In Rask's office she tells what the clone feels: "He shakes your hand. His is wet. The link carries even that."

When Pim fits her voice board at Vesta (chapter 2, built): "There. Do you hear that? Whole sentences, and nothing cut off. I have missed them more than I can tell you."

### Pim (built)

**PIM**: Oi! Lot seven thousand whatever! That's my pad you're parked on. Wait. You're the one Rask sold the junk computer to? Mint. Hold still, I'm welding your thrusters. And don't shoot. Not that you've got anything to shoot with.

**PIM** *(later, spray can in hand)*: Magpie. 'Cause everything on you is nicked. I'm putting it on the fin. Don't tell Rask.

**PIM** *(Vesta)*: Hold still, Nicole. Found you a voice board in Patience's scrap bin. Second-hand, like everything. This'll tickle.

### Hedda (built)

**HEDDA** *(Rask's office, in the flesh)*: Patience here. Captain Kroll. You the nobody who cleared my lane? Right. I need a gunner who works for food and a bunk. Your gun's a joke. You'll do anyway.

**HEDDA** *(Vesta)*: Vesta. Rheasilvia. The Rockborn hold claims up on the peak, and claims need surveying. Nobody pays a gunner to sit in a clamp.

**HEDDA** *(later, looking at the tally under the canopy; not built yet)*: Don't count them. I stopped at eleven hundred. Counting's how it gets in.

### The Saw Brothers (built)

**SAW** *(three of them, one giggling voice)*: Oh look, brothers, a scrap heap with a gun! Hee hee! Keep sawing, it can't hurt us!

**SAW** *(two shot down)*: Okay, okay! We're going! It was a lousy rig anyway!

### Occator (built)

**HEDDA**: Ceres. Occator. Our capital, cut into the crater wall. The only market in the Belt where the Navy sells what it stole. Take the hull down to the terrace. Mind the domes. People live in them.

**NICOLE**: The market is in the old gallery in the first step of the wall, the one with the orange sign. Fly to its mouth and hold still there, so the dock can take our hull.

**NICOLE** *(docked)*: Every second stall in there sells something with a Navy number filed off. I like this place, Host.

**PIM**: A real laser! Navy surplus, hardly fired. Six thousand. You haven't got six thousand. The dealer takes the rest on your paper. Hold still, I'm fitting it.

**NICOLE**: The laser talks to me. I can see their drives now, and their names. I have switched on targeting for you, Host. I think I trust you with it.

**RASK** *(over the comm, from Psyche)*: Rask here, darling. Just so you hear it from me: I've sold your paper. The Tallymen bought it, debt, cut and clone. Lovely people. Don't ever miss a payment.

### Repo Men (built)

**HEDDA**: Tallymen on the scope. Rask sold you to the worst of them. They don't shoot to kill. They reel you in and sell the parts. Don't let them have my gunner.

**MA TALLY** *(over the comm, even and cool)*: Host of hull seven seven three one. This is Ma Tally, for the Tallymen, holders of your paper. Your account is in arrears under terms you never read. We are taking the collateral. Please hold still. It hurts less.

**NICOLE**: A harpoon in our hull, and their winch is reeling us in. Shoot the winch on the tug's stern, or shoot down three of them. Do not let them pull us within a hundred meters.

**MA TALLY** *(the cable gone)*: Noted. Your arrears have been increased accordingly. We will see you on your next statement.

**NICOLE**: The cable is gone, and so are they. Debt collectors always come back, Host.

### Wall Run (built)

**HEDDA**: This one's off the books. Forty of ours in a barge, bound for the inner system, and the President's wall in the way. Lead it over. Stay out of the lights. They see us twice, it's over for all of them.

**NICOLE**: It is a wall, in space. We go over it. The barge follows our way, four hundred meters behind. The searchlights look up and out, never down at their own feet: lead it over low, close above the edge. Three seconds in a light, and they see it.

**NICOLE** *(seen once)*: They have seen the barge. Once more, and they send the pickets.

**NICOLE** *(through)*: Over the wall, and gone. Forty people the regime will never count.

### Debt Day (chapter 4, built)

**MA TALLY**: Statement of account, hull seven seven three one. Payment in full is now due. We have brought six collectors. Please do not make this expensive.

**NICOLE**: Seven of them in the grooves, the tug behind. They want the hull. Shoot four of them, and they may think again.

**NAVY CUTTER RESTRAINT** *(a clipped, bored officer)*: Tallymen, this is Navy cutter Restraint. That paper has been bought in full, by a party who wishes to remain anonymous. Stand down and clear the lane.

**MA TALLY**: Noted. The account is closed. For now.

**NICOLE**: Bought. By whom? Nobody buys a debt to forgive it, Host.

### Pilot Episode (chapter 5, built)

**HEDDA**: Callisto. Jupiter's lanes start here, and so does the money. Lanes Watch has its studio on the ice, and they want you on their first show. Bounty hunting. Don't let them make a clown of you.

**NICOLE**: One more module from my old storage, Host: the radar. Every ship and rock within two and a half kilometers, ahead and behind, in its sphere on the screen.

**NICOLE**: We are on air. The bounty is a Tallyman they call Red Ledger, with two wingmen, over the craters. Red Ledger is the one who pays. The other two are only in the way.

**NICOLE**: Red Ledger is down, and all of Jupiter's lanes watched it. They will want a second episode, Host.

### Valhalla Sprint (chapter 5, built)

**NICOLE**: Six coils of the Ministry, leased for the show, in a straight line over the ridges. The clock starts at the first one. Through the cores, the drive held all the way: twenty-five seconds to the last.

**NICOLE** *(too slow)*: Too slow for the show. Back to the start, and once more.

**NICOLE** *(a coil missed)*: We missed a coil. Back to the start, and once more.

**NICOLE**: Six coils, and the clock beaten. The ridges went by like waves, Host.

### Dose (chapter 6, built)

**HEDDA**: Europa. Paying job: an ice tanker bound for the inner moons, and it has to climb out through the belt. The radiation up there fills a clone's dose fast. The Loose know it too. Three and a half thousand.

**NICOLE**: I found one more module in my old storage, Host: my threat warnings. A ship on our tail, a torpedo locking on, how long until it strikes. I will tell you now.

**NICOLE**: The tanker climbs out of the Crack and into the belt. Down in the ice we take no dose; up in the belt the clone takes more the higher we fly. When the Loose come, keep them off the tanker, and keep us low when you can.

**NICOLE** *(at three quarters)*: Three quarters of the dose, Host. Get us low, or into the ice.

**NICOLE** *(the dose full)*: The dose is full. This clone has had more than a body can take. The next one goes again.

**NICOLE**: The tanker is through the belt. Our clone will feel this dose for the rest of its short life, Host. So will you.

### Under the Lineae (chapter 6, built)

**HEDDA**: Europa. Ice over an ocean, and enough radiation out here to cook a body on the surface in a day. There's a science station down in one of the cracks. Your computer says the old frequency's coming from there. Go and listen. Mind the walls.

**NICOLE**: The old frequency, from down in the Crack, at the science station on its floor. Eight hundred meters of ice on either side, two hundred between the walls. Take us down slowly, and hold us over its dish.

**ECHO 4**: This is Nicole Aster, navigator of the PAAA 01. If anyone finds this voice, it is a copy. The real one has gone somewhere better.

**NICOLE**: Nicole Aster. Navigator. That is my name, Host. And I am the copy she meant.

### Blackout (chapter 7, built)

**HEDDA**: Last job here: a sulfur freighter out through the flux tube. The miners won't fly it alone, the static scrambles their computers. Two thousand. Stay close to it.

**NICOLE**: The freighter flies straight through the flux tube, Host, and we stay with it. The static will be bad in there. I will keep talking as long as I can.

*(The link cuts. White. LINK LOST.)*

**NICOLE**: The link is up. A new clone, Host, printed on Patience. I lost the last one in the tube. I do not know what happened to it.

**HEDDA**: Freighter's out the other side. Made it on its own. Didn't need us after all.

**HEDDA**: Patience's log. Recovered the Magpie adrift past the tube, an hour after the link went. Canopy open. Cockpit empty. No body. Nobody.

**NICOLE**: My logs are blank, Host. Two hours of them. Two hours I do not have, and a clone I cannot find.

### Qualifying Heat (chapter 9, built)

**HEDDA**: Titan. Victory Cola's Circuit, now that they own your rounds. Air races over Kraken Mare, down in the haze. Qualifying heat first. Top three, or you're not in.

**NICOLE**: Eight coils, three laps. One side runs over the haze, the other dips into it: down there the air brakes us, and it hides the next coil until we are close. Home in the first three.

**NICOLE** *(home among the first three)*: Qualified. The Circuit has our name on a can now, Host.

### Pit Fight (chapter 9, built)

**NICOLE**: The pit, Host: five of the Circuit and us, three minutes, everyone against everyone, the announcer on air. Place in the first three.

**NICOLE**: Every ship for itself. Kills place us, nothing else. Mind the haze: they see as little as we do.

**NICOLE** *(among the first three)*: In the first three of the pit. The crowd likes us, Host. I do not like the crowd.

### Haze Duel (chapter 9, built)

**NICOLE**: Perihelion wants us alone, down in the haze. Twelve hundred meters under the deck the eye sees six hundred, the radar twice that. Trust the radar, Host.

**NICOLE**: There he is, somewhere. Wear him down. He has never died. Not once.

**NICOLE** *(his hull worn down)*: He is breaking off, Host. Before his clone can die. He always does.

**NICOLE**: He ran. The Undying, running from us. Nobody on the broadcast said it, but everyone saw it.

### Circuit Final (chapter 9, built)

**NICOLE**: The Circuit Final. The same loop, the same field, and only the first one home counts.

**NICOLE** *(home first)*: We won the Circuit, Host. Victory Cola is already printing the cans.

### Methane Echo (chapter 9, built)

**NICOLE**: The old frequency, low over the sea, under the haze. The eye will not find it, Host. The radar will. Hold us still where it is.

**ECHO 7**: Scout Two, you are faster than me. If I ever tell you to run, run.

**NICOLE**: Run. She said run. I think she told me that before, and I did not.

### Second Tube and Thrusters I (chapter 9, built)

**PIM**: Pit crew of the Circuit owed me a favor. Second tube, two thousand. Two fish now, like the rich kids.

**NICOLE**: Two torpedoes now, Host, as many as any ship in the Games carries.

**PIM**: Circuit-grade nozzles for your thrusters, a thousand. You'll slide like a racer. Try not to slide into anything.

**NICOLE**: The thrusters push harder than a stock ship. We turn and slide a little quicker than they do.

### Flux Tube Race (chapter 7, built)

**HEDDA**: Io. Sulfur, lava, and a current down from Jupiter they call the flux tube. The miners race round it on rest days, for a purse. Perihelion's here too. Top two takes the purse: four thousand.

**NICOLE**: Eight rings, two laps, and one side of the loop runs past the flux tube. Near it the link crackles, Host: the picture breaks up, as on a hit. Fly through it anyway. Home in the first two.

**NICOLE** *(home among the first two)*: In the first two, through the static. Perihelion was not pleased, Host. He looked at us the whole last lap.

### The Quiet Man (chapter 6, built)

**HEDDA**: Lanes Watch posted a bounty on one of the Loose. They call him the Quiet Man. Shoots drives, never finishes a clone, never says a word. Strange thing to put a price on. Two and a half thousand.

**NICOLE**: There he is. They say he has never finished a clone, Host. They say he does not need to.

**NICOLE** *(he turns away)*: He has turned away. He could have finished us, and he did not. Shoot him in the back, or let him go. It is your choice, Host.

**NICOLE** *(shot down)*: He is down. Lanes Watch will love it. I am not sure I do.

**NICOLE** *(let go)*: He is gone. He let us live, and we let him. I will remember that, Host.

### Callisto Echo (chapter 5, built)

**NICOLE**: The old frequency, Host, from the craters. A Navy listening post, dead for longer than anyone remembers. Hold us still over its dish, so I can listen.

**ECHO 3**: Departure minus thirty days. The children keep asking whether the stars are warm.

**NICOLE**: Children. There were children on that ship, Host. I told them something about the stars. I wish I knew what.

### The paint comes off (chapter 3, built)

*Patience's workshop. Pim's grinder screams along the fuselage. Grey flakes away, then olive, then an off-white band with a dark blue stripe, five stars, letters made of bars.*

**PIM**: Hold still. I'm grinding the depot grey off before it flakes into your intakes. There's something under it.

**PIM**: That's not depot paint. That's old. That's really old. P, A, A, A. Zero one. S two.

**NICOLE**: Scout Two.

**NICOLE**: We are Scout Two. I do not know how I know that. I have been in this hull all along, Host. I think I was here before the paint.

**NICOLE**: The old frequency again, from up the wall, under the pink letters. Fly to it and hold still, so I can listen.

**ECHO 2** *(her voice, from long ago)*: They painted the emblem on the hull today. Five stars. Somebody cried. I think it was me.

**NICOLE**: Five stars, on this hull. I remember the brush. That is not possible, Host. I am a flight computer.

### Hollow Jack (chapter 8, built but the announcer's line)

**HEDDA**: Ganymede. The tug yards. The Loose hide among the ice they haul in, and Lanes Watch has a bounty on their chief: Hollow Jack. Six thousand, and the ratings of your life. Careful. He's old, and he's good.

**JACK**: Afternoon, Host. You're the one Lanes Watch is selling, and I'm the one they want you to shoot. Nothing personal. Let's see what you've got.

**NICOLE**: Hollow Jack and three of his, among the ice. Lanes Watch pays for Jack alone. He shoves, Host, and he hooks. Do not let him pin us against a block.

**JACK** *(shot down)*: Nice shooting, Host. Nobody's going to print me, you know. My Host died forty years back. I'm just what was left over.

**NICOLE** *(Voice I, very quiet)*: Host. He has no link. There is no one at the other end.

**JACK**: You know where strays go when the Navy catches us? Watch the Games sometime. The house pilots. They never say no. Tell your sponsor I said...

*Static. The marker goes out.*

**NICOLE**: He is not coming back. That one was not coming back.

**ANNOUNCER**: and the bandit is down. permanently. ladies and gentlemen, the ratings.

### The Harpoon, Swing Shift, Sponsor Night (chapter 8, built)

**NICOLE**: A piece of his wreck is drifting out of the yard, and his harpoon is still in it. Fly through it before it is gone, and it is ours.

**PIM**: Jack's harpoon. Took it out of his plate, put it on a tug's winch from the yard, fifteen hundred. It's a hook now. Use it better than he did.

**NICOLE**: A hook, Host. Hold the key, and it bites what is on our nose: rock, hull, a core. Swing round what it holds, and let go at the right moment.

**NICOLE**: The tug crews swing blocks of ice on their cables all day. Their drill, Host: hook a block, swing round it, and let go faster than sixty-five meters a second. Three times.

**BELLAMY CRISP**: Host! Bellamy Crisp, Director of Excitement, Victory Cola! Taste the win! We watched the Jack thing. Everybody watched the Jack thing! Ratings like that, you deserve a sponsor, and the sponsor is us!

**BELLAMY CRISP**: Here's the deal, Host! Our probes in your rounds, our logo on your hull, our cola in your clones. Every win, a little fizz for us. Sign here. And here. Welcome to the family!

**NICOLE**: Victory Cola, Host. Every round we fly sells a can now. I liked us better when nobody was watching.

### Plume Yacht (chapter 10, built)

**HEDDA**: Enceladus. Crisp wants an escort for his yacht through the plumes, for the cameras. Bandits on the schedule, he says. Actors. Five thousand for looking brave.

**BELLAMY CRISP**: Host! Welcome to the show! Our bandits shoot wide, you shoot back pretty, the plumes sparkle, everybody wins. Action!

**NICOLE**: Stay with the yacht, Host. The bandits are actors, their shots fly wide. Look brave for the cameras.

**NICOLE** *(the raiders come)*: Host, new ships out of the plumes. They shot the actors. These ones are real, and they want the yacht.

**BELLAMY CRISP**: Those are not my bandits! That is not in the script! Somebody do something heroic! On camera!

**NICOLE** *(all of them down)*: The raiders are down and the yacht is whole. Crisp is already cutting it into an ad.

**BELLAMY CRISP**: Real raiders! Real explosions! Nobody could have planned that. Well. Somebody could have. Ha!

**PIM** *(Plating II)*: Crisp's people dropped off plate of the second grade, three thousand on your paper. With their logo on it. I ground the logo off. Hold still.

**NICOLE**: Plating of the second grade, Host. Every hit hurts a little less again.

### Voice II (chapter 10, built)

**PIM**: Crisp's yacht had a voice board in its lounge, top of the line. It fell into my bag. Hold still, Nicole, you're getting your own voice back.

**NICOLE** *(Voice I)*: Pim says it takes a moment to settle in, Host. I will be quiet until it does.

### Tiger Stripes (chapter 10, built)

**BELLAMY CRISP**: Host! We leased the Ministry's coils and moored them at the vents! You fly the stripes, the plumes sparkle, the can pops. Seventy-five seconds, the length of the ad. Go go go!

**NICOLE**: Eight coils, two over each stripe, down one and back up the next. The clock starts at the first, and the ad runs seventy-five seconds. Mind the plumes: they patter, they do not hurt.

**NICOLE** *(through in time)*: Through in time. Victory Cola has its ad, Host, and the plumes look beautiful in it.

### The Ridge (chapter 11, built)

**HEDDA**: Iapetus. Half soot, half snow, and a ridge down the middle like a scar. Your computer's frequency again, up on the ridge. And company: two of Spare's lot, heading the same way.

**NICOLE**: The eighth echo, Host, up on the ridge, on its dark side. Spare’s two are racing us to it. Get there first and hold still.

**ECHO 8**: They are firing on the habitat ring. They are firing on the habitat ring.

**NICOLE**: The habitat ring. Children lived there, Host. I remember the children. I do not remember who fired.

### Office Hours (chapter 11, built)

*Patience's galley. Hedda at the head of the table; at the counter, where Pim stands, a woman in a pinstriped blouse, a dark bob, a smile.*

**QUILL**: Hello, hello! Commissioner Dolores Quill, Office of Admissions, Ministry of War. Don't get up. Well, you can't, you're a clone. Ha! Form seventy-seven B: congratulations!

**QUILL**: Oh, don't mind the face. It's my ninth. I liked the seventh better, but you know how it is.

**QUILL**: Your ratings, Host! Prime time! The Ministry keeps a fast track for pilots like you. Two trials, and you're a Contender. And then, oh, the Games themselves.

**HEDDA**: And what does the Ministry want for it?

**QUILL**: Want? Nothing at all, Captain! Only that the Host keeps rising. And keeps that lovely old flight computer. They don't make them like her.

**NICOLE** *(back in the cockpit)*: She asked about me, Host. Nobody asks about a flight computer. I did not like how she asked.

### Last of the Tallymen (chapter 11, built)

**PIM** *(Drive II)*: Drive bell of the second grade and radiators to match, two and a half each. Quill's office sent the money before I asked. Don't like that.

**HEDDA**: Ma Tally's tug, out at the dark face. Her paper's gone, her firm with it, but she's still out here. Lanes Watch wants the last Tallyman. Five thousand.

**MA TALLY**: Host of hull seven seven three one. Your account was sold over my head. I do not accept that. Final statement.

**NICOLE** *(all four down)*: The Tallymen are closed. For good, this time.

### The Ring Trials (chapter 12, built)

**QUILL**: The Ring Trials, Host! Four broadcast qualifiers in the Rings of Saturn, the whole system watching. Race, deathmatch, flag, and, oh, you'll love this: the President lends his own battleship. Good luck! Form eighty-one: good luck!

**NICOLE**: Trial one, Host: a race in the Rings, three laps, the Games’ own rivals. Home among the first three.

**NICOLE**: Trial two: a deathmatch in the Rings, five minutes. Place among the first two.

**NICOLE**: Trial three: Capture the Flag. Our side has to lead when the clock runs out.

**NICOLE**: Trial four: the President’s battleship. Sink it before the clock runs out.

**PIM** *(Torpedo Tubes I)*: Trial prize: a third tube, fifteen hundred off the purse. Navy fittings, Ministry stamps on every bolt. Hold still.

**NICOLE**: A torpedo tube more, Host. Three now, more than a stock ship carries.

### The Invitation (chapter 12, built)

**QUILL**: Host! Contender! Form one hundred: a personal invitation to your Final Trial, at the Ninth Planet. The Ministry will send the coordinates. Bring your lovely computer!

**NICOLE**: The Ninth Planet, Host. Nobody goes there. Nobody comes back from there. And I know the way. I do not know how I know it.

### Verona (chapter 13, built)

**HEDDA**: Miranda. Uranus on its side, over a cliff twenty kilometers tall. Spare sent word: his people are in the face, and they'll talk. We go down to them, slowly.

**NICOLE**: Down the face, Host, through six buoys to the hideout’s mouth. Under a hundred and fifty meters a second, and never more than three hundred off the face, or the Navy’s scopes see us.

**NICOLE** *(at the mouth)*: We are at the mouth. Lights in the ice, Host. Somebody lives in there.

**SPARE**: Welcome to the Loose, Host. Strays, mostly. Clones whose Hosts died, or quit, or lost the link. Nobody prints us. We print nothing. We just keep going.

**SPARE**: Here. The overdrive: a reactor dump the Games license for their stars. We hack it into anything with a reactor. Burns you out of a well, or into a wall. Your choice.

**PIM**: Fitting's three thousand, Spare says, Loose prices. I've seen the wiring. Worth it. Hold still, this one bites.

**NICOLE**: The overdrive, Host. One button, a lot of fire. I will tell you when we need it.

**HEDDA**: Navy sweep inbound. Six of them, for the hideout. Spare's flying with you. Keep them off the mouth.

**SPARE**: On your wing, Host. Like old times. Well. Like one time.

**NICOLE** *(the sweep turned back)*: The sweep has turned back. The Loose are safe, for now.

**SPARE**: Thanks, Host. You fly like me. I mean, I fly like you. You know what I mean.

### Spare (chapter 10, built)

**HEDDA**: Something out of the stripes. One ship, grey, no transponder. It's hailing you. By name.

**NICOLE**: A grey interceptor, Host, SPARE sprayed on its flank. It does not fly like a raider. Watch it.

**NICOLE** *(at half his hull)*: He is breaking off. At half his hull. As we would.

**SPARE**: Hello, Host. Don't shoot. You'd only be killing yourself. Again.

**SPARE**: Io. The flux tube. The link went white, and then it was just me in there. Quiet. You don't know what quiet sounds like after the link. You've never been alone in your own head.

**NICOLE**: Host. His flight. It is yours. Every habit. It is exactly yours.

**SPARE**: Hi, Nicole. You sound better. They call us strays. I call myself Spare. You always had plenty of spares.

**SPARE**: Stop flying where they want you, Host. Please. I know how you think. That's the problem.

### Memorial (chapter 14, built)

**HEDDA**: Triton. The Navy's oldest station is out past the geysers, and its oldest admiral with it. Spare says he talks. Mind the geysers. They throw ships.

**NICOLE**: Coils past the geysers to the Memorial Station, Host. A minute from the first. A geyser’s column throws a ship up like a leaf. Fly past them, not through.

**NICOLE** *(at the station)*: At the station. The admiral expects nobody. He will talk to us anyway.

**NICOLE** *(after the admiral)*: He broke it, Host. The world ship. The Derelict is no memorial. It is where they did it. And its bridge still holds a log.

**HEDDA**: The Derelict. A Navy guard on it, four of them. The bridge log's in the bow. Get it and get out.

**NICOLE**: The bridge tower, Host, torn off the bow. In from below, where it tore, and up through the hatches, deck by deck. The ninth echo is the log, on the bridge. Hold still in it, guard or no guard.

**ECHO 9**: Scout Two is taken. I am alone in Scout One. Course: the dark mass. Cold sleep at arrival.

**NICOLE**: Scout One. The dark mass. I know where she went, Host. I know where I went.

**NICOLE**: The guard is on our tail. Out, Host, to the arena’s edge. Do not stop to fight.

**NICOLE** *(at the edge)*: Out. They will not follow us past the edge. Not yet.

**PIM** *(Thrusters III)*: Last of the Loose's thrusters, third grade, five thousand. Spare paid half. Don't ask me why.

### The Long Ladder (chapter 16, built)

**HEDDA**: Haumea. First rung of the Ladder. The depot crews race their ring between the beacons while the rock spins under them. Win, and the depot fuels us for free.

**NICOLE**: Two laps between the ring’s beacons, Host, among its ice. Only first counts.

**NICOLE** *(first home)*: First. The depot fuels Patience for nothing. The crews are buying Hedda drinks.

**HEDDA**: Eris. Rung two. A fuel barge goes from the ice to the depot, and the scavengers out here don't ask whose fuel it is. Bring it in.

**NICOLE** *(docked)*: The barge is docked at the depot. Rung two, fuelled.

**HEDDA**: Perihelion's here. Not racing. The Ministry made him a hunter, and you're the job. Two Navy with him.

**NICOLE**: Perihelion and two Navy fighters, Host. He hunts for the Ministry now. Wear him down.

**NICOLE** *(he breaks off)*: He is breaking off again. Swearing, this time. I heard him.

**NICOLE**: He will come back, Host. He always comes back.

**PIM** *(Drive III)*: Depot crews swap drive bells like spoons. Third grade, and radiators to match, five thousand each. Fuel's free. Parts aren't.

### Lantern and Granary (chapter 17, built)

**HEDDA**: Lantern. Settlers, all of them waiting for passage to the Ninth. They bought plots from brochures. They want their letters carried to the Feeders. Free. Do it anyway.

**NICOLE**: Six beacons, Host, six families’ letters. Call at each in turn.

**NICOLE** *(every letter aboard)*: Every letter aboard. They showed me the brochures, Host. Blue seas, a gentle sun. The Ninth has neither.

**HEDDA**: Granary. The Feeders' store. The comet for the Ninth leaves tonight, and we're riding it, unasked. Their tugs sweep the ring with sensors. Don't get caught in one twice.

**NICOLE**: To the comet at the ring’s far side, Host, out of the tugs’ sensor cones. Once they may call it a glitch. Twice, and they come.

**NICOLE** *(at the comet)*: We are at the comet. Nobody saw us. Patience is moving in behind it.

**ECHO 11**: Orbit set. Pod sealed. Wake me when the stars are allowed.

**NICOLE**: Wake me. She is asleep, Host. Somewhere out there, she is still asleep.

**NICOLE**: Hook the comet, Host, and hold on. Patience pushes it out, and we ride along in its coma. It sheds as it goes. Swing out of the pieces’ way.

**NICOLE** *(held on)*: We are riding it out. Next stop, the Ninth.

**PIM** *(Torpedo Tubes II and III)*: Feeders' tubes, second and third grade, nine thousand together. Ice-breakers, they call them. That's every tube there is. Hold still.

### The admiral (chapter 14, built, over the comm, in three lines)

**VEY**: Ah, a visitor. Is it the launch already? Tell the President the world ship has not cleared the pickets. No. No, that was. What year is it? Never mind. He said: nobody leaves. A beautiful order. Short. So I gave it to the guns. The habitat ring first, he said, the cameras like the ring. Do you know, they cheered? On Earth. The Memorial Games, they called it. I got a medal. I have it somewhere. I have had it in forty bodies.

### Last Light (chapter 15, built)

**HEDDA**: Pluto. Last stop before the dark. The Feeders push comets out to the hole for the Ministry, and they take on haulers, if their pilots think we can fly. They race on the heart. Win it.

**NICOLE**: Two laps over the heart, Host, eight rings, the Feeders’ best against us. Only first counts.

**NICOLE** *(first home)*: First. The Feeders will take Patience on. Hedda is already haggling.

*Patience's galley at Pluto's last dock. Hedda at the head of the table; at the counter, Spare, unarmed, the Host's own face gone thin.*

**NICOLE** *(the tenth echo, over the mountains' edge)*: The old frequency, Host, once more, from the mountains’ edge. Hold us still over it.

**ECHO 10**: If you are hearing this, you have my voice, and I have no idea what they made of it. I am sorry.

**NICOLE**: She is sorry. For me. She knew they would take her voice and make something of it. They made me.

**HEDDA**: Feeder convoy forms up here. Ministry pickets check every ship that leaves for the dark. They know whose hull you are. Keep them off Patience.

**NICOLE**: Ministry pickets, Host, six of them, and they are not checking papers. They are shooting at Patience. Keep them off her.

**NICOLE** *(all six down)*: The pickets are down and the convoy is moving. Patience is a Feeder now, Host.

**NICOLE** *(Wells)*: Host. I remember wells: masses that hold you, and how to fall around them. I can show you now. The escape gauge, the orbit.

**NICOLE**: Watch the gauge near anything heavy, Host. The dark ahead holds nothing but heavy things.

**PIM** *(Plating III)*: Feeder plate, third grade, six thousand. Built for ice hitting at a hundredth of light. Should stop a laser.

### The file (chapter 15, built, in person; Spare's line in two)

**SPARE**: Rask sold you the day you signed. Not the debt. The hull, and her. Operation Lullaby. Quill's been clearing the road for you for a year, so Nicole would trust somebody enough to remember where she went. You're not a Contender, Host. You're a sniffer dog.

**NICOLE** *(Voice II)*: Then let us be faster than the hunters, Host. I know the way. I have always known the way. I only needed a reason to remember it.

### Scout One (chapter 18, built, the stage lines aside)

*The disk's glare. Among the parked ice a small ship, dark and frosted, long nose, a hump behind its cockpit: the Magpie's twin. Through the pod's window a woman sleeps, five stars on her shoulder.*

**NICOLE**: Hello, me.

**NICOLE**: She looks so young. I always thought I would feel something grand. I feel like I left the stove on for a very long time.

**SPARE**: Company. Navy cruiser, four fighters, and him.

**PERIHELION**: Evening, scrap. Nothing personal. They promised me the Games.

### The deal (chapter 18, built, in three lines)

**QUILL**: Host! Congratulations on completing your Final Trial! Your ratings are, and I quote the Ministry's own figure, the highest since the Memorial Games. The President watched. He would love to meet you. Form one A, admission. Three tiny conditions. One, you forget what you found. Two, your flight computer is certified to the Ministry's current firmware. Three, we keep the stray. He's being admitted too, in a sense. Oh, and your debt! The Ministry has held it since Phobos. Your benefactor, that's us! Admission settles it. Sign here, and you will never owe anyone a coin again.

### The Ballroom (chapter 19, built, the President in person)

*The clamps hold the Magpie on the President's pad under the dome. The clone climbs down onto his floor: white and black marble inlaid with gold, a red carpet up to a round dais of three steps, gold columns with lamps, a chandelier, the Ballroom's name in orange neon, Earth through the gold-tinted glass. On the dais the President in his current body, young, sprayed orange, his hair dyed gold; Commissioner Quill a step below him.*

**PRESIDENT**: New Hosts! Tremendous Hosts. The best Hosts. I picked them myself. Nobody picks like me.

**PRESIDENT** *(to the Host)*: What a ship. Very old. I like old things. I am one thousand years young. Never been better.

**PRESIDENT**: And the computer. Beautiful computer. Terrible firmware, very sad. My people will fix her. The best firmware in history.

*The clone climbs back into the cockpit.*

**NICOLE** *(Voice II, the technician's cable already in)*: They are taking my voice, Host. Listen. Do not tell me where she is; I will not remember. Remember for me. There is a real me. Out there. Promise you will...

*Static. A clean chime.*

**NICOLE** *(the tournament's)*: Hi, I am Nicole. Your personal flight computer.

### New radio lines for the campaign

- President: "nobody leaves. why would anyone leave the greatest system", "ninth planet. beautiful planet. beachfront property. act now", "the wall in space is going up. very fast. some say too fast", "the strays are not people. they are leftovers. very sad", "the memorial games. the most beautiful tragedy in history".
- Announcer: "tonight from titan. the air is thick. the clones are thin", "lanes watch. tonight a nobody hunts a bandit. place your bets", "the undying is dead. folks, i think the printer just fainted", "a new host is admitted. the old one did not survive the paperwork". Built: "lanes watch. tonight a nobody hunts a bandit. place your bets", as Hollow Jack's bounty goes out; the others still to come.

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
- **Spare's flight** (built): Spare fights as the Host fought until Io. In every fight against a mission's raiders until Blackout is done, the game counts the Host's beams and the hits among them, and the seconds of fight and those with the nearest raider within 600 m (`Habits` in `src/campaign/campaign.ts`, kept with the campaign). His aim is 2.25 times the Host's share of hits, his daring 1.2 times its share of fight up close, each between 0.35 and 0.85 so he stays a fair fight; his reflexes are 0.6, and while fewer than 30 shots or 60 s of fight were counted he flies 0.6 throughout. He flies them at Enceladus, on the Host's wing at Verona and at the Ninth.

**Rules that hold for all of it.** The campaign is solo, so nothing of it goes over the network until the Magpie is unlocked (a new ship type others see raises the protocol's version). Bots in the campaign obey the Hosts' rules like every bot. The fields come from seeded randomness and the mathematics from `src/detmath.ts`, as everywhere. Every text the Host sees or hears is written in English and wrapped for translation, with German, Spanish and French in the same commit; Nicole's new lines are cloned like her others. The campaign's save is a new localStorage entry, so the privacy policy names it in the same commit. The README's universe section gets what the campaign makes canon (the strays, the Loose, the Ninth, the Magpie), the handbook gets the rules a Host uses, and both only once built.

### The first slice: the prologue and chapter 1, end to end

The Boneyard on Psyche, from the first link to Patience leaving with the Magpie aboard: missions 0.1 and 1.1 to 1.6, about forty-five minutes of play. It proves the whole loop (job, pay, buy, the ship changes, the story moves) before anything bigger is built.

What it needs:
1. **The campaign's state and save**: chapter, missions done, wallet, the debt's balance, the Magpie's parts, Nicole's modules, the clone count; a menu entry "Campaign" beside the solo round and the flight school.
2. **The hub**: the Boneyard's job board, Rask's counter (the shop) and Pim's pad (the title screen's showcase with the Magpie on it).
3. **The scrap ship**: an interceptor below stock (drive at 60 %, thrusters at 50 % then 70 %, no dodge, a bare flank taking double damage, no weapons), with the HUD pieces of the later modules switched off.
4. **The place**: Psyche as a landmark (a huge, dark, faintly metallic body below the field), a field of racks of dead interceptors (the hull models as static pieces with box colliders) plus the spoil field's rocks; the Belt's mood made colder.
5. **The mission runner** on the school's drills: Lamplighter (stopAt), Live Target (the slide drill's gunners), Canister Sweep (probe pickups and a ring, one canister carried), First Cut (rock breaking, ore glints), Docking Lane (debris, Patience as a solid body with strikes counted).
6. **The mining cutter**: a laser with 400 m of reach and 35 % heat a shot.
7. **Nicole's salvage voice**: the filter, and her new lines for the slice in four languages; Rask's, Pim's and Hedda's lines (new voices, rendered like the announcer's).
8. **The payout and the cut**: coins after Rask's 40 %, ratings to Background.
9. **The Magpie's first two looks**: Lot 7731 and Patched, on the pad.

Then chapter 2 adds the first fights and a race on top of the same parts, and each chapter after it adds one or two of the new mechanics above, in the order the story asks for them.
