"""The Derelict's dead (see src/world/derelict.ts): figures of MakeHuman built with MPFB (human.py),
frozen in the poses a body takes in free fall or took against the cold, the pose baked into their
meshes, every part's texture packed into two atlases (what is opaque as JPEG, the hair and eyebrows
cut out by their alpha as PNG), thinned out to a near and a far level and written as a binary glTF,
public/assets/people/frozen-<n>.glb (meshes 'near' and 'far', y up, facing +z, the middle of the
body at the origin), with a picture of each for review. The crew in the ship's light emergency
suits (SUITS) are two of Quaternius's figures (Ultimate Modular Men Pack, CC0): his astronaut and
his SWAT figure, their glTFs given on the command line (named Astronaut and SWAT as the pack has
them, or suit-astronaut and suit-swat as this script writes them) and only ever imported as glTF,
posed the same way by the bones of their own rig; each is also written rigged as suit-<name>.glb.
Run in Blender: Blender -b --python frozen.py -- <out folder> <preview folder> [<suit .glb> ...] [n ...]."""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Matrix, Vector
sys.path.insert(0, os.path.dirname(__file__))
from human import human

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT, PREVIEW = ARGS[0], ARGS[1]
# the suits' glTFs by their names: astronaut, swat
SUIT_FILES = {os.path.splitext(os.path.basename(a))[0].lower().removeprefix('suit-'): a for a in ARGS[2:] if a.endswith(('.glb', '.gltf'))}
ONLY = {int(n) for n in ARGS[2:] if n.isdigit()}
# triangles of a body near and far (a pair of two bodies takes PAIR_SHARE times as many)
NEAR, FAR, PAIR_SHARE = 3500, 600, 1.5
# the suit's hard-edged plates tear open when thinned as far as a body: SUIT_SHARE times as many
SUIT_SHARE = 1.6
# the largest side of a part's texture in the atlas (px), by the part (the first match of its
# object's name); the rest CLOTHES
SIDES = [('low-poly', 64), ('shoes', 128), ('eyebrow', 128), ('helmet', 128), ('visor', 64), ('skin', 512), ('suit-', 64)]
CLOTHES = 256
# what is cut out by its alpha: hair and eyebrows
CUT_OUT = ('eyebrow', 'short0', 'bob0', 'long0', 'ponytail', 'braid', 'afro')

# The colonists of the world ship, men and women, young and old, in their everyday clothes, the
# crew's coveralls and one in a coverall under an old helmet, and a pair holding on to each other.
# Each with its pose (see POSES). The crew in the ship's light emergency suits are two figures of
# Quaternius's Ultimate Modular Men Pack (see SUITS).
MAN = dict(gender=1.0, muscle=0.5, weight=0.5, height=0.55, proportions=0.5)
WOMAN = dict(gender=0.0, muscle=0.45, weight=0.45, height=0.5, proportions=0.6)
KINDS = [
    dict(pose='crouch', people=[dict(phenotype=dict(MAN, age=0.5), hair='short02', eyebrows='eyebrow003', clothes=['male_casualsuit02', 'shoes02'], skin='middleage_caucasian_male')]),
    dict(pose='spread', people=[dict(phenotype=dict(WOMAN, age=0.3), hair='ponytail01', eyebrows='eyebrow001', clothes=['female_casualsuit01', 'shoes01'], skin='young_caucasian_female')]),
    dict(pose='curled', people=[dict(phenotype=dict(MAN, age=0.45, muscle=0.6, weight=0.6), hair='short04', eyebrows='eyebrow007', clothes=['male_worksuit01', 'shoes04'], skin='middleage_asian_male', race={'asian': 0.8, 'african': 0.05, 'caucasian': 0.15})]),
    dict(pose='reach', people=[dict(phenotype=dict(WOMAN, age=0.55, muscle=0.55), hair='bob02', eyebrows='eyebrow002', clothes=['male_worksuit01', 'shoes05'], skin='middleage_african_female', race={'asian': 0.05, 'african': 0.85, 'caucasian': 0.1})]),
    dict(pose='spread', people=[dict(phenotype=dict(MAN, age=0.85, muscle=0.3, weight=0.4), hair='short01', eyebrows='eyebrow010', clothes=['male_casualsuit06', 'shoes03'], skin='old_caucasian_male')]),
    dict(pose='curled', people=[dict(phenotype=dict(WOMAN, age=0.4, weight=0.35), hair='long01', eyebrows='eyebrow006', clothes=['female_sportsuit01', 'shoes01'], skin='middleage_asian_female', race={'asian': 0.8, 'african': 0.05, 'caucasian': 0.15})]),
    dict(pose='limp', people=[dict(phenotype=dict(MAN, age=0.4, muscle=0.65), hair='', eyebrows='eyebrow011', clothes=['male_worksuit01', 'shoes04'], skin='young_asian_male', helmet=True, race={'asian': 0.7, 'african': 0.1, 'caucasian': 0.2})]),
    dict(pose='embrace', people=[
        dict(phenotype=dict(MAN, age=0.35), hair='short03', eyebrows='eyebrow003', clothes=['male_casualsuit04', 'shoes02'], skin='young_caucasian_male'),
        dict(phenotype=dict(WOMAN, age=0.32), hair='bob01', eyebrows='eyebrow001', clothes=['female_casualsuit02', 'shoes01'], skin='young_caucasian_female'),
    ]),
]

# Each pose as turns of the rig's bones about the figure's own axes (x its left, y its back, z up;
# deg), parents before children: the relaxed crouch of a body in free fall (arms drifting up and
# forward, hips and knees bent), limp with the limbs spread, curled up against the cold (knees to
# the chest, arms round them), one arm out for a handhold, slack, and two holding on to each other.
def mirrored(turns):
    """The same turns on both sides: those about y and z mirrored for the right."""
    out = []
    for bone, axis, deg in turns:
        if bone.endswith('_'):
            out.append((bone + 'l', axis, deg))
            out.append((bone + 'r', axis, deg if axis == 'X' else -deg))
        else:
            out.append((bone, axis, deg))
    return out


# (A bone pointing up leans forward by a positive turn about x, one pointing down by a negative one.)
POSES = {
    'crouch': mirrored([('spine_02', 'X', 10), ('neck_01', 'X', 15), ('thigh_', 'X', -55), ('calf_', 'X', 75), ('upperarm_', 'X', -50), ('lowerarm_', 'X', -50)]),
    'spread': mirrored([('spine_03', 'X', -10), ('head', 'X', -20), ('upperarm_', 'Y', -55), ('lowerarm_', 'Y', -20), ('thigh_', 'Y', -18), ('thigh_', 'X', -10), ('calf_', 'X', 25)]),
    'curled': mirrored([('spine_01', 'X', 20), ('spine_02', 'X', 25), ('spine_03', 'X', 20), ('neck_01', 'X', 25), ('thigh_', 'X', -110), ('calf_', 'X', 140), ('upperarm_', 'X', -75), ('upperarm_', 'Y', 15), ('lowerarm_', 'Z', -65)]),
    'reach': mirrored([('spine_03', 'X', -8), ('thigh_', 'X', 12), ('calf_', 'X', 35)]) + [('upperarm_l', 'X', -150), ('lowerarm_l', 'X', -15), ('upperarm_r', 'X', 25), ('lowerarm_r', 'X', -30), ('head', 'X', -15)],
    'limp': mirrored([('neck_01', 'X', 25), ('upperarm_', 'Y', -15), ('upperarm_', 'X', -20), ('lowerarm_', 'X', -25), ('thigh_', 'X', -30), ('calf_', 'X', 45)]),
    'embrace': mirrored([('upperarm_', 'X', -70), ('upperarm_', 'Y', 25), ('lowerarm_', 'Z', -70), ('thigh_', 'X', -20), ('calf_', 'X', 35), ('neck_01', 'X', 15)]),
}
# where the second of a pair is: turned about to face the first, this far before it (m)
PAIR_APART = 0.36

# The crew who fought the leak from inside: when the hull began to leak they pulled on the ship's
# light emergency suits (a thin suit, a helmet, a small air pack, made for a decompressed deck, not for
# open vacuum for long) and tried to patch it, until the ship broke apart and blew them out with the
# air. Two of Quaternius's figures as he made them, packs and all, frozen over: his astronaut (white
# plates over orange and teal, a helmet with a dark visor) and his SWAT figure (grey, a dark helmet
# with breathing hoses); clinging with both hands to where the plating was, tumbling with the limbs
# spread, curled up, one arm reaching back for the hull, one still holding the cable of the patch it
# was laying. Both stand on the same rig in a T-pose: the arms along x (its left +x), the legs down,
# facing -y; each turn about the figure's own axes, parents first.
def both(turns):
    """The same turns on both sides of the astronaut's rig (bones named '.L' and '.R'): those about y and z mirrored for the right."""
    out = []
    for bone, axis, deg in turns:
        if bone.endswith('.'):
            out.append((bone + 'L', axis, deg))
            out.append((bone + 'R', axis, deg if axis == 'X' else -deg))
        else:
            out.append((bone, axis, deg))
    return out


# (An arm along x is lowered by a positive turn about y and swung forward by a negative one about z;
# a leg leans forward by a negative turn about x, its knee bends back by a positive one.)
SUIT_POSES = {
    'cling': both([('Chest', 'X', 10), ('Head', 'X', -10), ('UpperArm.', 'Y', 25), ('UpperArm.', 'Z', -70), ('LowerArm.', 'Z', -25), ('UpperLeg.', 'X', -25), ('LowerLeg.', 'X', 40)]),
    'tumble': both([('Abdomen', 'X', -12), ('Head', 'X', -20), ('UpperArm.', 'Y', -20), ('LowerArm.', 'Z', -20), ('UpperLeg.', 'Y', -22), ('LowerLeg.', 'X', 30)]),
    'curled': both([('Abdomen', 'X', 20), ('Torso', 'X', 20), ('Chest', 'X', 15), ('Neck', 'X', 20), ('UpperArm.', 'Y', 65), ('UpperArm.', 'Z', -45), ('LowerArm.', 'Z', -80), ('UpperLeg.', 'X', -95), ('LowerLeg.', 'X', 115)]),
    'reach': both([('Torso', 'X', -8), ('UpperLeg.', 'X', 12), ('LowerLeg.', 'X', 35)]) + [('UpperArm.L', 'Y', -45), ('UpperArm.L', 'Z', -60), ('LowerArm.L', 'Z', -10), ('UpperArm.R', 'Y', -70), ('LowerArm.R', 'Z', 30), ('Head', 'X', -15)],
    'cable': both([('Neck', 'X', 25), ('UpperArm.', 'Y', 55), ('UpperArm.', 'Z', -15), ('LowerArm.', 'Z', -30), ('UpperLeg.', 'X', -30), ('LowerLeg.', 'X', 45)]),
}
SUITS = [('astronaut', 'cling'), ('astronaut', 'tumble'), ('astronaut', 'cable'), ('swat', 'curled'), ('swat', 'reach'), ('swat', 'tumble')]
KINDS += [dict(model=model, suit=name) for model, name in SUITS]
# each suit's visor, its other materials in their own flat colors; bare skin (the SWAT figure's) as the vacuum left it
VISORS, SKIN = ('Grey', 'Visor'), (0.7, 0.72, 0.78)
# the patch's cable in a hand: its length (m), trailing from the hand, and how thick
CABLE_LENGTH, CABLE_RADIUS = 3.0, 0.012

AXES = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}


def pose(rig, turns):
    """Turns the rig's bones about the figure's axes through each bone's head, one after another."""
    for name, axis, deg in turns:
        bone = rig.pose.bones[name]
        pivot = bone.head.copy()
        bone.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(deg), 4, AXES[axis]) @ Matrix.Translation(-pivot) @ bone.matrix
        bpy.context.view_layer.update()


def painted(name, color, size, seed, crack=False):
    """A small worn texture of one color: grain and scuffs, a visor's crack across it."""
    rng = np.random.default_rng(seed)
    base = np.ones((size, size, 4), dtype=np.float32)
    base[:, :, :3] = color
    base[:, :, :3] *= (0.85 + 0.15 * rng.random((size, size, 1))).astype(np.float32)
    for _ in range(size // 4):
        y, x = rng.integers(0, size, 2)
        base[y:y + 2, x:x + rng.integers(3, size // 3), :3] *= 0.7
    if crack:
        y = size // 2
        for x in range(size):
            y = int(np.clip(y + rng.integers(-1, 2), 0, size - 1))
            base[y, x, :3] = 0.75
    image = bpy.data.images.new(name, size, size)
    image.pixels.foreach_set(base.ravel())
    # packed, so a copy of it keeps its pixels (a generated image's copy is generated afresh)
    image.pack()
    return image


def material(name, image):
    """A plain material showing `image`."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    return mat


def helmet(rig):
    """An old helmet over the head: a scuffed shell and its visor, cracked, as one mesh posed with the head."""
    head = rig.pose.bones['head']
    rest = head.bone.matrix_local
    center = rest.translation + Vector((0, -0.02, 0.1))
    mesh = bpy.data.meshes.new('helmet')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.15, calc_uvs=True)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('helmet', mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material('helmet', painted('helmet', (0.72, 0.7, 0.62), 128, 7)))
    mesh.materials.append(material('visor', painted('visor', (0.05, 0.07, 0.1), 64, 11, crack=True)))
    for face in mesh.polygons:
        n = face.normal
        face.material_index = 1 if n.y < -0.45 and -0.35 < n.z < 0.55 else 0
    # posed with the head: from where the head is at rest to where the pose put it
    obj.matrix_world = rig.matrix_world @ head.matrix @ rest.inverted() @ Matrix.Translation(center) @ Matrix.Diagonal((1, 1.08, 1.1, 1))
    return obj


def diffuse(mat):
    """The image coloring a material: the texture named diffuse, else the first."""
    images = [n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image] if mat and mat.use_nodes else []
    for node in images:
        if 'diffuse' in node.image.name.lower() or 'diffuse' in node.label.lower():
            return node.image
    return images[0].image if images else None


def bake(meshes, place):
    """Bakes each of `meshes` as it is seen (its pose, its place in the world) into its own mesh, then moved by `place`."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in meshes:
        baked = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
        baked.transform(obj.matrix_world)
        obj.modifiers.clear()
        obj.data = baked
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(place)


def person(spec, turns, place):
    """One body of a kind, posed, its meshes baked as they are seen and moved by `place`; returns them."""
    before = set(bpy.data.objects)
    body = human(spec)
    made = [o for o in bpy.data.objects if o not in before]
    # each material named by its part (the skin, else the asset's name), as the atlas sizes them
    for obj in made:
        for slot in getattr(obj, 'material_slots', []):
            if slot.material:
                slot.material = slot.material.copy()
                slot.material.name = 'skin' if obj is body else obj.name.split('.', 1)[-1]
    rig = next(o for o in made if o.type == 'ARMATURE')
    pose(rig, turns)
    meshes = [o for o in made if o.type == 'MESH' and 'eyelashes' not in o.name]
    if spec.get('helmet'):
        meshes.append(helmet(rig))
    bake(meshes, place)
    for obj in made:
        if obj.type != 'MESH' or obj not in meshes:
            bpy.data.objects.remove(obj)
    return meshes


def turn_rig(rig, turns):
    """Turns the rig's bones about the figure's axes (in the world) through each bone's head, one after another."""
    into = rig.matrix_world.to_3x3().normalized().inverted()
    for name, axis, deg in turns:
        bone = rig.pose.bones[name]
        pivot = bone.head.copy()
        about = (into @ AXES[axis]).normalized()
        bone.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(deg), 4, about) @ Matrix.Translation(-pivot) @ bone.matrix
        bpy.context.view_layer.update()


def srgb(linear):
    """A linear color as the sRGB a byte image stores."""
    return tuple(max(0.0, c) ** (1 / 2.2) for c in linear[:3])


def import_suit(model):
    """Imports the glTF of the suit `model` (SUIT_FILES) in its rest pose, no animation, its flat
    colors as small worn textures (the visor dark and cracked, bare skin grey; a suit written by this
    script keeps its own): returns its rig, its skinned meshes and everything the import made."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=SUIT_FILES[model])
    made = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in made if o.type == 'ARMATURE')
    rig.animation_data_clear()
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    meshes = [o for o in made if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    painted_as = {}
    for obj in meshes:
        for slot in obj.material_slots:
            old = slot.material
            if old.name.startswith('suit-'):
                continue
            if old.name not in painted_as:
                base = old.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value if old.use_nodes else (0.5, 0.5, 0.5)
                visor = old.name in VISORS
                color = (0.03, 0.04, 0.05) if visor else SKIN if old.name == 'Skin' else srgb(base)
                painted_as[old.name] = material(f'suit-{old.name}', painted(f'suit-{old.name}', color, 32, len(painted_as) + 21, crack=visor))
            slot.material = painted_as[old.name]
    return rig, meshes, made


def suited(model, name):
    """One of the crew in a suit: the figure `model` imported from its glTF (see import_suit), posed
    as SUIT_POSES[name] (a cable in its hand for 'cable'), its meshes baked as they are seen; returns
    them."""
    rig, meshes, made = import_suit(model)
    turn_rig(rig, SUIT_POSES[name])
    bake(meshes, Matrix.Identity(4))
    if name == 'cable':
        # the patch's cable, still in the right hand, trailing down and back
        hand = rig.matrix_world @ rig.pose.bones['Wrist.R'].head
        way = Vector((-0.2, 0.6, -0.75)).normalized()
        mesh = bpy.data.meshes.new('cable')
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=CABLE_RADIUS, radius2=CABLE_RADIUS, depth=CABLE_LENGTH, calc_uvs=True)
        bm.to_mesh(mesh)
        bm.free()
        mesh.transform(Matrix.Translation(hand + way * CABLE_LENGTH / 2) @ way.to_track_quat('Z', 'Y').to_matrix().to_4x4())
        line = bpy.data.objects.new('cable', mesh)
        bpy.context.scene.collection.objects.link(line)
        mesh.materials.append(material('suit-cable', painted('suit-cable', (0.78, 0.5, 0.16), 32, 31)))
        meshes.append(line)
    for obj in made:
        if obj not in meshes:
            bpy.data.objects.remove(obj)
    return meshes


def pack(parts):
    """Lays the textures `parts` ((key, image, side)) into an atlas on shelves, the largest first: each key's box (x, y, w, h) in px and the atlas's size."""
    boxes, x, y, shelf, width = {}, 0, 0, 0, max(side for _, _, side in parts) * 2
    for key, image, side in sorted(parts, key=lambda p: -p[2]):
        w = side
        h = max(1, round(side * image.size[1] / max(image.size)))
        if x + w > width:
            x, y, shelf = 0, y + shelf, 0
        boxes[key] = (x, y, w, h)
        x, shelf = x + w, max(shelf, h)
    return boxes, width, y + shelf


def dead(rgba, seed):
    """Skin as the vacuum and the cold left it: no living tone, a waxy grey-white pallor, the
    redder parts (lips, nose, ears, fingertips, where blood was nearest the skin) gone blue-grey and
    faintly violet, mottled darker in soft patches. The frost lies over it in the game's shader."""
    rgb = rgba[:, :, :3]
    lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    # how much redder than the rest a texel was: the lips, the flush of nose, ears and fingertips
    redness = rgb[:, :, 0] - 0.5 * (rgb[:, :, 1] + rgb[:, :, 2])
    covered = rgba[:, :, 3] > 0.5
    usual = float(np.median(redness[covered])) if covered.any() else 0.0
    red = np.clip((redness - usual) * 6.0 - 0.1, 0.0, 1.0)[:, :, None]
    # the texture's own detail kept in a narrow band of pale grey
    pale = (0.62 + 0.3 * (lum / max(float(lum.mean()), 1e-3) - 1.0).clip(-1, 1) * 0.5 + 0.12)[:, :, None]
    pallor = pale * np.array([0.9, 0.92, 0.96], dtype=np.float32)
    cyanosed = pale * np.array([0.62, 0.62, 0.8], dtype=np.float32)
    out = pallor * (1.0 - red * 0.85) + cyanosed * (red * 0.85)
    # soft mottled patches, a little darker and bluer
    rng = np.random.default_rng(1000 + seed)
    h, w = lum.shape
    coarse = rng.random((h // 40 + 2, w // 40 + 2)).astype(np.float32)
    ys = np.linspace(0, coarse.shape[0] - 1.001, h)
    xs = np.linspace(0, coarse.shape[1] - 1.001, w)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    patches = (coarse[y0][:, x0] * (1 - fy) * (1 - fx) + coarse[y0 + 1][:, x0] * fy * (1 - fx) + coarse[y0][:, x0 + 1] * (1 - fy) * fx + coarse[y0 + 1][:, x0 + 1] * fy * fx)
    blot = np.clip((patches - 0.55) * 3.0, 0.0, 1.0)[:, :, None]
    out = out * (1.0 - 0.18 * blot) * (1.0 - blot * 0.06) + blot * 0.06 * np.array([0.3, 0.32, 0.45], dtype=np.float32)
    result = rgba.copy()
    result[:, :, :3] = np.clip(out, 0.0, 1.0)
    if os.environ.get('DEAD_SKIN_PREVIEW'):
        image = bpy.data.images.new('dead-skin', w, h)
        image.pixels.foreach_set(result.ravel())
        image.filepath_raw = os.environ['DEAD_SKIN_PREVIEW']
        image.file_format = 'PNG'
        image.save()
    return result


def atlas(obj, cut):
    """Packs the textures of `obj`'s materials into one atlas, its texture coordinates moved into each one's box: the cut-out parts (`cut` true) or the opaque ones. Returns the atlas's image, or None."""
    parts = []
    for index, slot in enumerate(obj.material_slots):
        image = diffuse(slot.material)
        if image is None or any(k in slot.material.name for k in CUT_OUT) != cut:
            continue
        side = next((s for key, s in SIDES if key in slot.material.name), CLOTHES)
        parts.append((index, image, side))
    if not parts:
        return None
    boxes, width, height = pack(parts)
    pixels = np.zeros((height, width, 4), dtype=np.float32)
    for index, image, _ in parts:
        x, y, w, h = boxes[index]
        copy = image.copy()
        copy.scale(w, h)
        data = np.empty(w * h * 4, dtype=np.float32)
        copy.pixels.foreach_get(data)
        data = data.reshape(h, w, 4)
        if obj.material_slots[index].material.name == 'skin':
            data = dead(data, index)
        pixels[y:y + h, x:x + w] = data
        bpy.data.images.remove(copy)
    uv = obj.data.uv_layers.active.data
    for face in obj.data.polygons:
        if face.material_index not in boxes:
            continue
        x, y, w, h = boxes[face.material_index]
        for loop in face.loop_indices:
            u, v = uv[loop].uv
            u, v = min(max(u, 0.0), 1.0), min(max(v, 0.0), 1.0)
            # a half texel in, so mipmaps bleed less across the boxes
            uv[loop].uv = ((x + 0.5 + u * (w - 1)) / width, (y + 0.5 + v * (h - 1)) / height)
    image = bpy.data.images.new(f'{obj.name}-{"cut" if cut else "opaque"}', width, height, alpha=cut)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = f'{bpy.app.tempdir}{image.name}.{"png" if cut else "jpg"}'
    image.file_format = 'PNG' if cut else 'JPEG'
    bpy.context.scene.render.image_settings.quality = 80
    image.save()
    return image


def thin(obj, budget):
    """Thins `obj` out to about `budget` triangles."""
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    mod = obj.modifiers.new('thin', 'DECIMATE')
    mod.ratio = min(1.0, budget / tris)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='thin')


def preview(path):
    """Pictures of the body for review: from the front and from its left side."""
    scene = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 400, 400
    for view, at in (('front', (0, -3.6, 0.4)), ('side', (3.6, 0, 0.4))):
        cam.location = Vector(at)
        cam.rotation_euler = (-cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = f'{path}-{view}.png'
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)


for n, kind in enumerate(KINDS):
    if ONLY and n not in ONLY:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if kind.get('suit'):
        if kind['model'] not in SUIT_FILES:
            print('FROZEN', n, 'skipped: no glTF of', kind['model'], 'given')
            continue
        meshes = suited(kind['model'], kind['suit'])
    else:
        turns = POSES[kind['pose']]
        meshes = []
        for i, spec in enumerate(kind['people']):
            # the second of a pair faces the first, close before it
            place = Matrix.Identity(4) if i == 0 else Matrix.Translation((0, -PAIR_APART, 0)) @ Matrix.Rotation(math.pi, 4, 'Z')
            meshes += person(spec, turns, place)
    # every part one object, its materials kept apart by face
    for obj in bpy.context.scene.objects:
        obj.select_set(obj in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    # the middle of the body at the origin
    corners = [Vector(c) for c in body.bound_box]
    middle = sum(corners, Vector()) / 8
    body.data.transform(Matrix.Translation(-middle))
    opaque, cut = atlas(body, False), atlas(body, True)
    # two materials: the opaque atlas, and the cut-out one (faces of the other materials onto them)
    # (clearing the materials resets the faces' indices, so they are read before and set after)
    cut_slots = {i for i, s in enumerate(body.material_slots) if any(k in s.material.name for k in CUT_OUT)}
    indices = [1 if face.material_index in cut_slots and cut is not None else 0 for face in body.data.polygons]
    body.data.materials.clear()
    body.data.materials.append(material('opaque', opaque))
    # (an image is falsy in Blender's Python: compared with None)
    if cut is not None:
        cutout = material('cut', cut)
        cutout.blend_method = 'CLIP'
        nodes = cutout.node_tree.nodes
        cutout.node_tree.links.new(next(x for x in nodes if x.type == 'TEX_IMAGE').outputs['Alpha'], nodes['Principled BSDF'].inputs['Alpha'])
        body.data.materials.append(cutout)
    body.data.polygons.foreach_set('material_index', indices)
    share = SUIT_SHARE if kind.get('suit') else PAIR_SHARE if len(kind['people']) > 1 else 1
    far = body.copy()
    far.data = body.data.copy()
    bpy.context.scene.collection.objects.link(far)
    thin(body, NEAR * share)
    thin(far, FAR * share)
    body.name, far.name = 'near', 'far'
    far.hide_render = True
    preview(f'{PREVIEW}/frozen-{n}')
    far.hide_render = False
    path = f'{OUT}/frozen-{n}.glb'
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False, export_yup=True, export_apply=True, export_animations=False, export_skins=False, export_morph=False, export_image_format='AUTO', export_materials='EXPORT')
    print('FROZEN', n, kind.get('pose') or f"{kind['model']} {kind['suit']}", sum(len(p.vertices) - 2 for p in body.data.polygons), sum(len(p.vertices) - 2 for p in far.data.polygons), os.path.getsize(path))


# The suits themselves, rigged and in their rest pose, for whatever else shows a clone in one: the
# clones' pilots wear the same light suit and helmet (README, "The universe"). Each can be given back
# to this script in place of the pack's glTF.
for model, source in SUIT_FILES.items():
    if os.path.basename(source).startswith('suit-'):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig, meshes, made = import_suit(model)
    for obj in made:
        if obj is not rig and obj not in meshes:
            bpy.data.objects.remove(obj)
    path = f'{OUT}/suit-{model}.glb'
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_animations=False, export_skins=True, export_morph=False, export_image_format='AUTO', export_materials='EXPORT')
    print('SUIT', model, os.path.getsize(path))
