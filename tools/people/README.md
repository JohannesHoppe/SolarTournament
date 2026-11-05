# tools/people

The busts of the campaign's people as their holograms call in (Rask, Pim, Hedda), made from figures of MakeHuman. MakeHuman's assets (base mesh, targets, skins, clothes, hair) are CC0, and its project makes no claim on what is made with them (its `LICENSE.md`, section D), so the busts are the game's own.

Not part of a build: run only when a person changes. It needs Blender (5.2 LTS) with the extension MPFB (2.0.18, from Blender's extension platform) and MakeHuman's system assets (`makehuman_system_assets_cc0.zip`, loaded into MPFB). These are Python scripts Blender runs.

| File | What it does |
|---|---|
| `people.py` | Builds each person in MPFB from a phenotype (gender, age, weight, muscle, …), a few targets (Rask's fat face and double chin, Hedda's age), hair, eyebrows and clothes; saves `<who>.blend` and a picture of the bust for review |
| `bust.py` | Cuts the bust out of a figure (head and neck of the skin, the clothes and hair down to the chest, the arms away), thins it out to a budget of triangles, turns it to the game's axes and writes `public/assets/people/<who>.bin` (see `bustParts` in `src/view/products.ts`) |

```
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python tools/people/people.py -- /tmp/people
for who in rask pim hedda; do $B -b /tmp/people/$who.blend --python tools/people/bust.py -- public/assets/people/$who.bin 3600; done
```
