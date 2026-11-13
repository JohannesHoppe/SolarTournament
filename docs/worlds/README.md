# Flying over worlds

Design of races and fights flown over the ground of a world: its gravity, the hover field that keeps a ship gliding over its ground, lift in its air, race tracks from one place to another, and the overdrive that rams whatever lies under the crosshair. Every step is built: step 1 (the hover field, the overdrive's one rule, torpedoes under gravity), step 2 (the first race world), step 3 (lift in air, and the Throat as a race world in it), step 4 (branches and the boost), step 5 (deathmatches over worlds) and step 6 (speed felt), their rules in the README. What is built moves into the repository's `README.md` with its numbers, in the same commit. The rules keep to the game's physics (README, "Realistic physics"): where they bend it, they say so.

## Why

A race through the free space of a round arena asks little of a pilot: nothing passes close, nothing tells how fast the ship flies, and the course bends gently. Speed is felt against something near: a ground rushing past a few metres under the hull, the walls of a canyon, a ridge to jump. And the risk that makes it fun must never be the ground itself, which a pilot touches all the time at that height.

So: **races are flown over worlds**, low over their ground under their gravity, some in their air. **Deathmatches** are fought half in free space, as the seven arenas are, and half over worlds. The mix of free fall, gravity and air is the game's range.

## The hover field

Every ship carries a **hover field** (the one name for it everywhere: "hover field", in English in every language, never translated, as the HUD's terms are). It pushes against the gravity of a large body (a planet, a moon, a planetoid such as Psyche) and so holds a ship off that body's ground. Where no such body pulls, it has nothing to push against: in free space and against a rock of the field it does nothing, and rock stays as deadly as it is.

- **Where.** Over every piece of a world's ground (the field's pieces flagged `ground`: the Boneyard's crater floor, Vesta's flank, Occator's terrace and steps, every moon's relief, a race world's ground). Not over the racks, modules, hulls, walls or rocks standing on it: those are hard as they are.
- **How hard.** It pushes along the ground's normal with the world's own gravity `g` times `(H / h)²`, where `h` is the height of the hull's underside over the ground and `H` the ride height (5 m). At the ride height it carries exactly the ship's weight, so a ship left alone settles there; lower it pushes harder by the square (a quarter of the height, sixteen times the weight); higher it fades, and beyond `4 H` (20 m) it is gone. A damping term takes out the bounce (critically damped at the ride height). On a world of strong gravity the field is stiff; on Psyche's 0.015 g it is soft and a ship sinks onto the ground slowly, as it falls there slowly.
- **Touching the ground never hurts.** Where the field is too weak to hold a ship (a dive at speed, a soft world), the hull touches the ground: it slides over it, never bounces off it and never takes damage (the field cushions it at contact). The speed across the ground is kept but for a light scrape (a share of it lost per second while touching, sparks under the hull, a grinding through the hull). A ship cannot be destroyed by a world's ground, in any mode, in the campaign too: no clone dies of the Boneyard's floor in the first mission.
- **Walls.** The ground of a world bends up into slopes and the walls of a canyon. The field holds a ship off whatever of the ground is under it along the ground's normal, so a slope is ridden up and a wall of the ground is glided along, never hit; this is what lets a race run down Europa's Crack. Only what stands on the ground (a rack, a module, a hull, a rock) is an obstacle.
- **Bots** glide alike: the field is physics, not a pilot's choice.
- **The autopilot** rides the ground within 100 m of it: it flies the nose's way along the ground and leaves the world's pull and the field along the ground's normal to carry the ship; within the field's reach it brings the hull to the ride height (2 m/s per metre off it, up to 50 m/s), so the ship hugs the ground's shape instead of flying straight through its hills, and a ship a crest threw higher comes down in an arc; a nose pointing away from the ground steeper than about 10° climbs.

## Gravity

A world pulls straight down with its own gravity (the field's `fall`, already there for the campaign's places: Europa 0.13 g, Callisto 0.13 g, Titan 0.14 g, Vesta 0.03 g, Ceres 0.03 g, Psyche 0.015 g). A ship that flies off a ridge or out of a canyon flies a real arc and comes down. The drive (13 g) and the thrusters (10 g) are far stronger than any of these worlds' pull, so gravity bends a jump, it never pins a ship down. A race world may pull harder (up to about 1 g) for longer jumps that land sooner; that is chosen per world by how its races feel.

## Lift in air

In a world's air (Titan's, Venus's clouds, Jupiter's deck, and the race worlds that have one) a ship's fins and hull give it **lift** (built: README, Jupiter's air, Lift): a push across its flight towards the nose, by its slip as a flat plate's lift grows (all of it from 15° to 75°), up to `LIFT · density · (v / 250 m/s)²` (15 g right under a deck at the speed limit, on top of the thrusters' 10 g), trimmed by the flight computer to 20 g. So in air a ship turns far tighter the faster it flies, as a fighter aircraft does, and the drag it pays rises with the lift it takes (induced drag, a fifth of the lift at all of it). The autopilot counts the lift as a pull from outside, and the clone feels it. Jupiter's deck becomes the arena where a ship carves; its haze and heat stay as they are. A race world with an air is built: the Throat of Kraken Mare, its sea 300 m under Titan's deck, where the lift at the speed limit reaches the trim.

## Torpedoes

Torpedoes obey the same physics as ships: a world's gravity, a well's pull and the push of its columns bend their flight, the air drags them (a third as hard per tonne as a ship: a slender body nose first, built: `TORPEDO_DRAG`) and, with the lift of their fins, lets them turn tighter the faster they fly; but a torpedo's computer counters them with its drive and thrusters, as a ship's autopilot holds gravity off, and flies straight lines: fired at the horizon without a lock it holds its line and never sinks to the ground; with a lock it steers for its aim with the outside forces taken out first. Only where they are stronger than its thrusters (a well up close) do they bend it. They have no hover field: a world's ground sets one off as rock does, so one chasing a ship that dives into a canyon can strike its wall.

## What the HUD shows

Gravity and air decide how hard a ship can turn, so the flight computer shows them wherever they act, and nothing of them in free space (built: README, What the HUD shows of a world, under the names GRAVITY, AIR, HOVER and GRIP):

- **GRAV** the world's pull (`0.13 g`), while one pulls.
- **AIR** the air's density as a share of its density under the cloud deck (`62 %`), while there is air.
- **HOVER** the height over the ground (`5 m`), while the hover field carries; orange while the hull scrapes the ground.
- **GRIP** the hardest turn the ship can fly now, in g: thrusters, drive and lift at its speed, in the air where it is (`32 g`). The racing line's orange stretches, where a bend is too tight for the ship's speed, reckon with the same grip.

## Race tracks

- **From one place to another** (built: the Crack, 25.5 km, and the Throat, 24.9 km). A world for races is laid out the way the best race tracks over worlds are: mostly open to the sky, narrow parts short and opening onto wide ones again, never more than a few kilometres of one kind in a row, a landmark ahead on the horizon. The Crack is a rift wider than it is deep, its walls climbing in terraces, two segments of it with a field of chaos terrain between them, slabs of ice across it to fly under, a gorge for the risky way, Jupiter low over the horizon ahead of its long straight. A track runs from a start to a finish across a world (some tens of kilometres), not around a loop in a ball of space. Its gates are laid low over the ground, through canyons, over ridges, between the things that stand on it, close past rock and wreckage; the open space above is not the track.
- **Branches** (built: the Crack's two; the Throat has none yet). A track splits in places into two ways that join again: one shorter and riskier (a narrow canyon, a jump, a wall close by), one longer and safer. Either counts; the gates of both are marked. There is no single racing line: the line is drawn for the way the pilot is on. A bot takes the risky way by its daring.
- **Crash and back** (built on the race worlds). A ship destroyed in a race is printed again at once (1 s, no sponsor break) at the last gate it passed, already flying along the track at race speed (150 m/s), so a crash costs seconds, never the race.
- **Speed felt** (built). The view widens with speed, more low over the ground and close past anything; the motion streaks thicken there and the hover field lifts the ground's dust under the hull; the hull rushes with the field's buffeting and grinds where it glides on the ground, and in air a close pass by anything rushes too (in vacuum nothing outside is heard, so a rock passed close stays silent); the camera trembles a little in the field's buffeting, and over the ground it looks a little down past the nose, so the ground and its horizon fill the picture, and leans as the ground banks.

## The overdrive

**One rule everywhere: the overdrive puts the ship onto the line of the crosshair.** What it flies at is, first, whatever the aim assist holds (a ship or a torpedo), else the first thing the laser would hit on the nose's line (rock, ice, junk, wreckage, the battleship, a ring), else the point 2 km ahead in empty space. The shove (200 m/s) first takes out the drift across the line to it, relative to how that moves (a rock on its orbit, empty space standing still), and puts the rest along the line; a drift across larger than the shove takes all of it. After the shove the ship flies where the crosshair shows. Rock stays deadly: an overdrive into a rock kills the clone.

**In a race it is a boost with a risk** (built). It recharges in 8 s instead of 20, the drive burns on after it, and it never takes a ship past the limit plus one shove (450 m/s); every shove heats the drive (a gauge of its own, beside the laser's heat): 40 per shove, shedding 1 a second, so that the recharge alone never cools it; past 100 the drive burns out, offline for 6 s and 20 hull points lost. Two shoves close together are safe (40, 72), a third too soon is not (104). The clone's strain stays as it is. Bots boost on their line's straights and keep their heat under the limit.

## Modes and worlds

- **Races** are flown over worlds only. The first worlds come from the campaign's places, whose grounds are built: Europa's ice (the Crack as a race world is a rift of its own, 300 m deep in terraces), Callisto's rings of ridges at Valhalla, Phobos's grooves at Stickney, Titan's Kraken Mare with its air. A world for races is a tournament arena of its own (in `RACE_WORLDS`, built: the Crack and the Throat), with its track and gravity; the campaign's place stays the campaign's. Until every race has its world, races are flown in the seven arenas of free space too.
- **Deathmatches** are fought in the seven arenas of free space and, as often, over worlds (built: `FIGHT_WORLDS`, Valhalla and the Lineae on their places' ground, the Lineae with a field of chaos terrain beside the Crack; the round's arena chosen alike on every browser, `arenaOfRound`, a room's deathmatches alternating between the two kinds).
- Capture the Flag, Last Clone Standing and the President's Fleet stay in free space until a world suits them.

## Steps

1. **Built: the hover field, the overdrive's one rule, and torpedoes under gravity and drag.** The field over every world's ground (the campaign's places first: no clone dies of a floor), its push, damping and the glide that never hurts; the autopilot riding the ground; the overdrive at whatever the crosshair shows. Tests: a ship dropped onto every place's ground at any speed never takes damage and settles at the ride height; a ship flown low over a relief keeps within the field; the simulated Host's tests (`playability`, `hostrace`) pass; the overdrive's shove at a rock, a moving ship and empty space.
2. **Built: a race world.** Europa's Crack as the first race arena (`RACE_WORLDS`), with the HUD's GRAVITY, AIR, HOVER and GRIP: a track down a terraced rift, under slabs of ice, across a field of chaos terrain, through a gorge or round the rift's bow, and back over the double ridges, Jupiter ahead, its gates on the ground; the start and the crash-and-back respawn; `courses.test.ts` and the simulated Host fly it.
3. **Built: lift in air.** The lift and its drag for every ship and torpedo in every air (Jupiter's deck carving, Titan's and Venus's air in the campaign), the grip and the racing line's bends reckoning with it; the Throat of Kraken Mare as a race world with air, its sea 300 m under the deck, its bends tighter than the autopilot turns at the limit in a vacuum and flown at the limit by carving.
4. **Built: branches and the overdrive as a boost** in races, with the drive's heat gauge: the Crack's two branches, either way flown whole by a middling bot, the boost's heat and burnout, bots boosting on straights.
5. **Built: deathmatches over worlds** in the rotation of rounds: Valhalla and the Lineae, the arena's edge around the field's middle over the ground, the clones printed low over it, the bots taking the ground for no rock, no comets.
6. **Built: speed felt:** view, streaks, lifted dust, the rush and the grind through the hull, the tremble.

Every step changes the README, the Pilot's Handbook and their translations in the same commit, and the network's `PROTOCOL` where what other browsers read changes.
