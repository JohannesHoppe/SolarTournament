# SolarTournament

A browser space shooter in an asteroid field, built with [three.js](https://threejs.org/). No shields, no sound in space, no speed limit: ships obey Newton, lasers punch straight through hulls, and a careless burn ends in a rock.

What flies, collides, burns and breaks behaves the way it would out there, as long as it stays fun.

## Run

```
npm install
npm run dev        # http://127.0.0.1:5173/
npm run build      # static site in dist/
```

## Controls

| Keyboard and mouse | Gamepad | Action |
|---|---|---|
| Mouse (click the game first) / arrow keys | Left stick (pull back = nose up) | Turn (yaw, pitch) |
| Q / E | LB / RB | Roll |
| W / Shift | RT (analog) | Main drive |
| A / D | Right stick left / right | Thrusters: sideways |
| S | X | Thrusters: backwards |
| R / F | Right stick up / down | Thrusters: up / down |
| X | Y | Flip: the flight computer turns the drive into the flight direction |
| Click / Space | LT / A | Fire laser |
| C | View | Chase / cockpit camera |
| Esc | Menu | Pause |
| Enter | A | Confirm (start, resume, boot the next clone) |

Gamepads with the standard layout (Xbox, PlayStation, most others in current browsers) work without setup.

On phones and tablets touch controls appear: the fixed stick on the left turns the ship (drag up = nose up), a second stick appears under the right thumb and fires the maneuvering thrusters. Hold **Drive** for the main drive and **Fire** for the laser; **Back** pushes backwards, **Flip** starts the flip assist. Pressing a key on a hardware keyboard hides the touch controls, touching the screen brings them back.

## The universe

SolarTournament has a universe of its own. It borrows two principles from science fiction series we love:

1. **Realistic physics**, as in *The Expanse*: Newtonian flight, no sound in vacuum, no shields, hulls that break.
2. **Consciousness transfer into clones**, as in *Altered Carbon*: death is not the end.

Humanity has settled the solar system. Fast fusion drives make hard burns between the planets possible, and daredevil pilots whip their ships around gravity wells at extreme speed for the thrill of it. The SolarTournament grew out of that daring and became the greatest entertainment of its time: pilots fight each other to the death in ships among the asteroids, while audiences across the system watch from a safe distance. Gladiator games for the space age.

The pilots die, and come back. They have transferred their consciousness into cloned human bodies; when a ship is destroyed, the pilot wakes up in the next clone, in the next ship. That is why every round has respawns, and why the audience never runs out of champions.

It is a society without morals. A new clone is not free: the pilot pays with attention. Before the next body boots, the pilot has to watch an advertisement. Want another clone? Make the sponsor happy.

The year is **2584**, a nod to George Orwell's *1984*, where a whole society watches and is watched.

## The physics of the SolarTournament universe

### Scale

One world unit is 5 cm. A ship is about 35 m long; the asteroids are ten to thirty times its size. The HUD shows speeds in m/s.

### Flight

- **Main drive.** It pushes only along the nose, with 45 m/s² (about 4.6 g). Nothing slows a ship down: without thrust it keeps drifting forever.
- **Maneuvering thrusters.** They rotate the ship and also push it gently along every axis (7 m/s²), enough to sidestep, not enough to brake from full speed.
- **Flight computer.** Rotation is rate-controlled: the stick sets how fast the ship turns, and the thrusters stop the rotation when the stick is released (up to 1.6 rad/s for yaw and pitch, 1.8 rad/s for roll, reached with 6 rad/s²).
- **Flip and burn.** Braking means turning the drive into the flight direction and burning. The flip assist (X) turns the ship to retrograde; the pilot burns. Grabbing the stick cancels the assist.
- **Velocity markers.** The green marker shows where the ship is actually drifting, the orange cross where the drive has to point to brake.
- **Space dust.** Fine dust stays fixed in space, so drift is visible even far from any rock.

### Asteroids

- **Huge and few.** 40 rocks with mean radii of roughly 100 to 375 m (up to 500 m along their longest axis) in a field of 2.25 km radius. Collisions use an ellipsoid fitted to each rock, not a sphere, so ships can fly close to elongated rocks.
- **Gravity.** Every asteroid pulls with a surface gravity proportional to its radius (uniform density) that falls off with the square of the distance. The big ones pull with about 1.5 m/s² at the surface, roughly 3 % of the main drive. A ship that drifts near a rock slowly falls towards it. This is the one deliberate exaggeration: a real rock of this size pulls thousands of times weaker, too weak to feel in a fight.
- **Tough.** A rock withstands 4 laser hits plus one per 40 m of mean radius (8 to 13 hits). Then it breaks into 2 to 3 fragments with 55 % of its size that drift apart. After two generations the pieces are gone for good.
- **Deterministic.** Layout and fragments come from seeded randomness, so every player sees the same field.

### Collisions

- A ship bounces off a rock and keeps 30 % of its impact speed; scraping along the surface bleeds off some sideways speed.
- Impacts below 12.5 m/s only scratch the paint. Above that the hull loses 1 point per 0.6 m/s; at about 72 m/s a ship is destroyed.
- **Impact warning.** The flight computer warns when the current course hits a rock sooner than the ship could flip and brake (plus 2 seconds of reaction time) and beeps faster the closer the impact gets.

### Damage

There are no shields. Every hit stays until the ship respawns.

- **The laser punches through.** A shot is a hitscan beam along the nose. It passes through every ship in its path and stops at the first asteroid or piece of debris.
- **Hit zones.** The point where the beam passes closest to the ship's center decides what breaks:
  - **Reactor** (within 15 % of the radius from the center): the ship is destroyed at once.
  - **Main drive** (rear): loses half its thrust per hit and sputters; two hits kill it. A ship without drive drifts but can still turn and fire.
  - **Maneuvering thrusters** (flanks): lose 40 % per hit; the ship turns and sidesteps more slowly.
  - **Hull**: every hit, in any zone, costs 34 of 100 hull points, so three hits destroy any ship.
- **Decompression.** Each beam leaves an entry and a larger exit hole. The escaping air jolts the ship into a spin and keeps pushing it for a few seconds (fading with a time constant of 2.5 s) until the compartment is empty. A healthy flight computer catches the tumble quickly; damaged thrusters take longer.
- **Wreckage.** A destroyed ship breaks into five glowing pieces of hull plating that keep its momentum, fall towards the asteroids and grind to dust when they hit one. Flying into a piece costs hull points depending on the impact speed; lasers shatter them.
- **The arena.** Space has no walls. A ship that stays more than 3.4 km from the center for 8 seconds is lost in deep space.

### Heat

The laser draws no ammunition but produces heat. Each shot adds 30 % of the heat capacity; at 100 % the laser locks until the ship has cooled down to 30 %. Radiators shed 20 % per second in sunlight and 50 % per second in the shadow of an asteroid. The asteroids cast real shadows; a ship in shadow goes dark and the HUD shows ☾ next to the heat gauge.

### The pilot

- **G-forces.** Above 3 g the pilot starts to grey out. A full burn (4.6 g) narrows the view to a tunnel within 5 seconds, with the pilot's heartbeat getting louder; 3 seconds without hard acceleration clear it again.
- **Line of sight.** Sensors need a clear line: a ship hidden behind an asteroid disappears from the HUD, and bots cannot see it either.

### Sound

There is no sound in vacuum. Everything the pilot hears travels through the own hull and sounds muffled: the rumble of the drive, the hiss of the thrusters, the own laser, hits on the own ship, and debris of nearby explosions rattling against the hull. Clean beeps come from the ship's computer: hits, kills, the end of a flip, impact warnings.

### Combat rules

- A kill scores 500 points; asteroids score 200, 120 and 80 points depending on their generation.
- Destroyed ships respawn at the edge of the field, with 2.5 seconds of spawn protection. Bots respawn after 3 seconds. The own pilot first sits through a sponsor break: after 3 seconds an ad appears, and once it has run, a button boots the next clone. The round goes on meanwhile.
- Human and alien interceptor are identical apart from their looks.

## License

zlib License, Copyright © 2012 Johannes Hoppe. Quicksand font: SIL Open Font License (see `public/assets/fonts/LICENSE-quicksand.txt`).
