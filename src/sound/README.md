# src/sound

What the pilot hears besides the radio. There is no sound in vacuum: everything comes muffled through the hull, except the flight computer's beeps and voice in the headset.

- `audio.ts`: the hull's low-pass, the drive's rumble, beeps, the link's static.
- `sounds.ts`: synthesized effects (laser, explosion).
- `speaker.ts`: Nicole, the flight computer: plays her lines from the pre-rendered voice sprite, with lessons that are never cut off and chatter that gives way.

The voice itself is rendered ahead of time by `tools/voice/`.
