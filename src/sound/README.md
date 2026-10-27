# src/sound

What the pilot hears besides the radio. There is no sound in vacuum: everything comes muffled through the hull, except the flight computer's beeps and voice in the headset. Only in a planet's air (Jupiter's, under its cloud deck) does sound from outside come in, through the hull as well: the wind and thunder.

- `audio.ts`: the hull's low-pass, the drive's rumble, beeps, the link's static, dust pattering on the hull in a comet's tail; in a planet's air the wind roaring by the air's push and the speed, and thunder after lightning (a crack close by, a long roll far off).
- `sounds.ts`: synthesized effects (laser, explosion).
- `speaker.ts`: Nicole, the flight computer: plays her lines from the pre-rendered voice sprite, with lessons that are never cut off and chatter that gives way, and tells whether one of a set of lines is being said.

The voice itself is rendered ahead of time by `tools/voice/`.
