# Flying over worlds

Design of races and fights flown over the ground of a world: its gravity, the hover field that keeps a ship gliding over its ground, lift in its air, race tracks from one place to another, and the overdrive that rams whatever lies under the crosshair. Step 1 (the hover field, the overdrive's one rule, torpedoes under gravity), step 2 (the first race world), the lift in air of step 3 and step 6 (speed felt) are built, their rules in the README; the rest is planned. What is built moves into the repository's `README.md` with its numbers, in the same commit. The rules keep to the game's physics (README, "Realistic physics"): where they bend it, they say so.

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

In a world's air (Titan's, Venus's clouds, Jupiter's deck, and the race worlds that have one) a ship's fins and hull give it **lift** (built: README, Jupiter's air, Lift): a push across its flight towards the nose, by its slip as a flat plate's lift grows (all of it from 15° to 75°), up to `LIFT · density · (v / 250 m/s)²` (15 g right under a deck at the speed limit, on top of the thrusters' 10 g), trimmed by the flight computer to 20 g. So in air a ship turns far tighter the faster it flies, as a fighter aircraft does, and the drag it pays rises with the lift it takes (induced drag, a fifth of the lift at all of it). The autopilot counts the lift as a pull from outside, and the clone feels it. Jupiter's deck becomes the arena where a ship carves; its haze and heat stay as they are. A race world with an air (Titan's Kraken Mare) waits for the race worlds of step 2.

## Torpedoes

Torpedoes obey the same physics as ships: a world's gravity, a well's pull and the push of its columns bend their flight, the air drags them (a third as hard per tonne as a ship: a slender body nose first, built: `TORPEDO_DRAG`) and, with the lift of their fins, lets them turn tighter the faster they fly; but a torpedo's computer counters them with its drive and thrusters, as a ship's autopilot holds gravity off, and flies straight lines: fired at the horizon without a lock it holds its line and never sinks to the ground; with a lock it steers for its aim with the outside forces taken out first. Only where they are stronger than its thrusters (a well up close) do they bend it. They have no hover field: a world's ground sets one off as rock does, so one chasing a ship that dives into a canyon can strike its wall.

## What the HUD shows

Gravity and air decide how hard a ship can turn, so the flight computer shows them wherever they act, and nothing of them in free space (built: README, What the HUD shows of a world, under the names GRAVITY, AIR, HOVER and GRIP):

- **GRAV** the world's pull (`0.13 g`), while one pulls.
- **AIR** the air's density as a share of its density under the cloud deck (`62 %`), while there is air.
- **HOVER** the height over the ground (`5 m`), while the hover field carries; orange while the hull scrapes the ground.
- **GRIP** the hardest turn the ship can fly now, in g: thrusters, drive and lift at its speed, in the air where it is (`32 g`). The racing line's orange stretches, where a bend is too tight for the ship's speed, reckon with the same grip.

## Race tracks

- **From one place to another** (built: the Crack, 27.5 km). A track runs from a start to a finish across a world (some tens of kilometres), not around a loop in a ball of space. Its gates are laid low over the ground, through canyons, over ridges, between the things that stand on it, close past rock and wreckage; the open space above is not the track.
- **Branches.** A track splits in places into two ways that join again: one shorter and riskier (a narrow canyon, a jump, a wall close by), one longer and safer. Either counts; the gates of both are marked. There is no single racing line: the line is drawn for the way the pilot is on.
- **Crash and back** (built on the race worlds). A ship destroyed in a race is printed again at once (1 s, no sponsor break) at the last gate it passed, already flying along the track at race speed (150 m/s), so a crash costs seconds, never the race.
- **Speed felt** (built). The view widens with speed, more low over the ground and close past anything; the motion streaks thicken there and the hover field lifts the ground's dust under the hull; the hull rushes with the field's buffeting and grinds where it glides on the ground, and in air a close pass by anything rushes too (in vacuum nothing outside is heard, so a rock passed close stays silent); the camera trembles a little in the field's buffeting.

## The overdrive

**One rule everywhere: the overdrive puts the ship onto the line of the crosshair.** What it flies at is, first, whatever the aim assist holds (a ship or a torpedo), else the first thing the laser would hit on the nose's line (rock, ice, junk, wreckage, the battleship, a ring), else the point 2 km ahead in empty space. The shove (200 m/s) first takes out the drift across the line to it, relative to how that moves (a rock on its orbit, empty space standing still), and puts the rest along the line; a drift across larger than the shove takes all of it. After the shove the ship flies where the crosshair shows. Rock stays deadly: an overdrive into a rock kills the clone.

**In a race it is a boost with a risk.** It recharges in 8 s instead of 20, and every shove heats the drive (a gauge of its own, beside the laser's heat): 40 per shove, shedding 10 a second; past 100 the drive burns out, offline for 6 s and 20 hull points lost. Two shoves close together are safe, a third too soon is not. The clone's strain stays as it is.

## Modes and worlds

- **Races** are flown over worlds only. The first worlds come from the campaign's places, whose grounds are built: Europa's Lineae and the Crack (200 m wide, 800 m deep), Callisto's rings of ridges at Valhalla, Phobos's grooves at Stickney, Titan's Kraken Mare with its air. A world for races is a tournament arena of its own (in `RACE_WORLDS`, built: the Crack), with its track and gravity; the campaign's place stays the campaign's. Until every race has its world, races are flown in the seven arenas of free space too.
- **Deathmatches** are fought in the seven arenas of free space and, as often, over worlds (the round's arena chosen alike on every browser, `arenaOfRound`).
- Capture the Flag, Last Clone Standing and the President's Fleet stay in free space until a world suits them.

## Steps

1. **Built: the hover field, the overdrive's one rule, and torpedoes under gravity and drag.** The field over every world's ground (the campaign's places first: no clone dies of a floor), its push, damping and the glide that never hurts; the autopilot riding the ground; the overdrive at whatever the crosshair shows. Tests: a ship dropped onto every place's ground at any speed never takes damage and settles at the ride height; a ship flown low over a relief keeps within the field; the simulated Host's tests (`playability`, `hostrace`) pass; the overdrive's shove at a rock, a moving ship and empty space.
2. **Built: a race world.** Europa's Crack as the first race arena (`RACE_WORLDS`), with the HUD's GRAVITY, AIR, HOVER and GRIP: a track from deep in the Crack down the canyon and back over the ice plain, its gates on the ground; the start and the crash-and-back respawn; `courses.test.ts` and the simulated Host fly it.
3. **Lift in air.** Built: the lift and its drag for every ship and torpedo in every air (Jupiter's deck carving, Titan's and Venus's air in the campaign), the grip and the racing line's bends reckoning with it. Still to come, on step 2's race worlds: Titan's Kraken Mare as a race world with air.
4. **Branches and the overdrive as a boost** in races, with the drive's heat gauge.
5. **Deathmatches over worlds** in the rotation of rounds.
6. **Built: speed felt:** view, streaks, lifted dust, the rush and the grind through the hull, the tremble.

Every step changes the README, the Pilot's Handbook and their translations in the same commit, and the network's `PROTOCOL` where what other browsers read changes.
