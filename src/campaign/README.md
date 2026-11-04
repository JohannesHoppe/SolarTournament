# src/campaign

Lot 7731, the solo campaign (its design in `docs/campaign/`). It is built mission by mission; while it is in the making the title screen shows it without a click, and the address with `?campaign` lets it be flown.

| File | What it does |
|---|---|
| `campaign.ts` | The campaign's state as the browser keeps it (the missions done, the drill reached in the running one, the wallet, the Bond still owed, the parts fitted), the ship as far as it is fitted (`hullOf`: the scrap hull, below any of the Games', with the mining cutter once fitted), and a mission done: what it fits, its pay less the yard's cut while the Bond is unpaid |
| `missions.ts` | The missions in story order, each a run of drills on the flight school's machinery (`FlightSchool` with a mission instead of a course) at a place of the campaign: the prologue and chapter 1 in the Boneyard (Cold Boot: Nicole booting and crashing, Rask's call, out of the rack, down the lane and onto bay 3's pad; then Lamplighter, Live Target, Canister Sweep, The Cutter, First Cut and Docking Lane, each briefed by Rask and begun on the pad, one running on into the next) |
| `campaign.test.ts` | The pay and the cut, the cutter fitted on the Bond, the scrap hull, the state read back and refused, every mission with a name and drills |
