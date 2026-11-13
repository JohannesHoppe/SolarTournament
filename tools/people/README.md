# tools/people

The campaign's people (Rask, Pim, Hedda, the Saw Brothers, three in one bust, Ma Tally, the Navy cutter's officer, Hollow Jack, Bellamy Crisp, Spare, Commissioner Quill, Admiral Vey, Perihelion, Kesh and the President), made from figures of MakeHuman: their busts as their holograms call in, and their figures in the flesh for the scenes in person; and the Derelict's frozen dead, eight figures of the world ship's colonists. MakeHuman's assets (base mesh, targets, skins, clothes, hair) are CC0, and its project makes no claim on what is made with them (its `LICENSE.md`, section D), so the busts are the game's own.

Not part of a build: run only when a person changes. It needs Blender (5.2 LTS) with the extension MPFB (2.0.18, from Blender's extension platform) and MakeHuman's system assets (`makehuman_system_assets_cc0.zip`, loaded into MPFB). These are Python scripts Blender runs.

| File | What it does |
|---|---|
| `human.py` | Builds a figure in MPFB from a person's description (phenotype, hair, eyebrows, clothes, skin, targets), rigged with the game engine's rig so its clothes follow a pose; used by `people.py` and `frozen.py` |
| `frozen.py` | The Derelict's dead (`KINDS`: men and women, young and old, in everyday clothes, the crew's coveralls, one under an old helmet built in the script, as MakeHuman has no pressure suit, and a pair): poses each (`POSES`: crouched in free fall, limp and spread, curled up against the cold, reaching, slack, holding on to each other) on its rig, bakes the pose, packs every part's texture into an atlas (the opaque parts as JPEG, the skin at 512 px and the clothes at 256; the hair and eyebrows cut out by their alpha as PNG), thins it to a near level of 3,500 triangles and a far one of 600 (a pair half again as many) and writes `public/assets/people/frozen-<n>.glb`, with pictures from the front and the side for review |
| `people.py` | Builds each person in MPFB from a phenotype (gender, age, weight, muscle, …), a few targets (Rask's fat face and double chin, Hedda's age, Kesh's broad shoulders and forearms), hair (Kesh's shaved at the sides, `shave`), eyebrows and clothes (Kesh's work apron cut from her coverall's front, `apron`); saves `<who>.blend` and a picture of the bust for review; every person, or only those named after the folder |
| `bust.py` | Cuts the bust out of a figure (head and neck of the skin, the clothes and hair down to the chest, the arms away), thins it out to a budget of triangles, turns it to the game's axes and writes `public/assets/people/<who>.bin` (see `bustParts` in `src/view/products.ts`) |
| `figure.py` | Poses a figure of `people.py` (the upper arms down at the sides, or Rask's and Kesh's turned in), bakes the pose into its meshes, thins them out, gives each part one plain texture (the skin at 1,024 px, clothes at 512, small parts at 256; JPEG but for what is cut out by its alpha), lays a person's own colors over a texture where MakeHuman has none (`TINTS`: the President's sprayed-on tan and his hair dyed gold, Bellamy Crisp's suit in his cola's red, Kesh's apron in worn leather) and writes `public/assets/people/<who>.glb` for the scenes in person |

```
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python tools/people/people.py -- /tmp/people
for who in rask pim hedda saw tally navy jack crisp spare quill vey perihelion kesh president; do $B -b /tmp/people/$who.blend --python tools/people/bust.py -- public/assets/people/$who.bin 3600; done
for who in rask pim hedda quill spare president crisp kesh; do $B -b /tmp/people/$who.blend --python tools/people/figure.py -- $who public/assets/people/$who.glb 24000; done
$B -b --python tools/people/frozen.py -- public/assets/people /tmp/frozen
```
