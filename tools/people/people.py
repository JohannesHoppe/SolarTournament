"""The campaign's people (see tools/people/README.md): each built with MPFB, MakeHuman's character
generator in Blender, from MakeHuman's CC0 assets, saved as a .blend and rendered as a picture of
its bust for review. Run in Blender: Blender -b --python people.py -- <folder> [who ...], every
person without a name given."""
import bpy, bmesh, sys, math
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService, TargetService

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT, ONLY = ARGS[0], set(ARGS[1:])
PEOPLE = {
    'rask': dict(phenotype=dict(gender=1.0, age=0.72, muscle=0.3, weight=1.0, height=0.55, proportions=0.3), hair='', eyebrows='eyebrow010', clothes=['male_casualsuit03', 'shoes02'], skin='middleage_caucasian_male', targets={'head-fat-incr': 1.0, 'neck-double-incr': 1.0, 'l-cheek-volume-incr': 1.0, 'r-cheek-volume-incr': 1.0, 'stomach-pregnant-incr': 0.7, 'head-age-incr': 0.5}),
    'pim': dict(phenotype=dict(gender=0.0, age=0.34, muscle=0.5, weight=0.35, height=0.5, proportions=0.6), hair='short02', eyebrows='eyebrow006', clothes=['male_worksuit01', 'shoes05'], skin='young_caucasian_female'),
    'hedda': dict(phenotype=dict(gender=0.0, age=0.78, muscle=0.6, weight=0.45, height=0.6, proportions=0.5), hair='short01', eyebrows='eyebrow002', clothes=['male_casualsuit06', 'shoes03'], skin='old_caucasian_female', targets={'head-age-incr': 0.9, 'l-cheek-bones-incr': 0.6, 'r-cheek-bones-incr': 0.6}),
    'tally': dict(phenotype=dict(gender=0.0, age=0.62, muscle=0.4, weight=0.62, height=0.55, proportions=0.5), hair='bob02', eyebrows='eyebrow001', clothes=['female_elegantsuit01', 'shoes01'], skin='middleage_african_female', targets={'head-age-incr': 0.4}),
    'navy': dict(phenotype=dict(gender=1.0, age=0.5, muscle=0.6, weight=0.45, height=0.6, proportions=0.55), hair='short03', eyebrows='eyebrow007', clothes=['male_elegantsuit01', 'shoes02'], skin='middleage_asian_male'),
    'jack': dict(phenotype=dict(gender=1.0, age=0.74, muscle=0.45, weight=0.35, height=0.58, proportions=0.45), hair='short04', eyebrows='eyebrow005', clothes=['male_worksuit01', 'shoes04'], skin='old_african_male', targets={'head-age-incr': 0.7, 'l-cheek-volume-decr': 0.7, 'r-cheek-volume-decr': 0.7}),
    'crisp': dict(phenotype=dict(gender=1.0, age=0.42, muscle=0.5, weight=0.5, height=0.6, proportions=0.6), hair='short02', eyebrows='eyebrow003', clothes=['male_elegantsuit01', 'shoes01'], skin='young_caucasian_male2'),
    'spare': dict(phenotype=dict(gender=1.0, age=0.36, muscle=0.45, weight=0.28, height=0.55, proportions=0.5), hair='', eyebrows='eyebrow003', clothes=['male_worksuit01', 'shoes04'], skin='young_caucasian_male', targets={'l-cheek-volume-decr': 0.8, 'r-cheek-volume-decr': 0.8}),
    'quill': dict(phenotype=dict(gender=0.0, age=0.4, muscle=0.45, weight=0.42, height=0.58, proportions=0.7), hair='bob01', eyebrows='eyebrow001', clothes=['female_elegantsuit01', 'shoes01'], skin='young_caucasian_female'),
    'vey': dict(phenotype=dict(gender=1.0, age=0.9, muscle=0.35, weight=0.4, height=0.55, proportions=0.4), hair='short01', eyebrows='eyebrow010', clothes=['male_elegantsuit01', 'shoes02'], skin='old_caucasian_male', targets={'head-age-incr': 1.0, 'l-cheek-volume-decr': 0.5, 'r-cheek-volume-decr': 0.5}),
    'perihelion': dict(phenotype=dict(gender=1.0, age=0.45, muscle=0.7, weight=0.45, height=0.62, proportions=0.7), hair='short03', eyebrows='eyebrow007', clothes=['male_casualsuit04', 'shoes01'], skin='young_caucasian_male2', targets={'l-cheek-bones-incr': 0.5, 'r-cheek-bones-incr': 0.5}),
    'president': dict(phenotype=dict(gender=1.0, age=0.4, muscle=0.45, weight=0.66, height=0.66, proportions=0.6), hair='short02', eyebrows='eyebrow003', clothes=['male_elegantsuit01', 'shoes01'], skin='young_caucasian_male2', targets={'l-cheek-volume-incr': 0.5, 'r-cheek-volume-incr': 0.5, 'neck-double-incr': 0.3}),
    'kesh': dict(phenotype=dict(gender=0.0, age=0.72, muscle=0.75, weight=0.7, height=0.5, proportions=0.4), hair='short04', eyebrows='eyebrow004', clothes=['male_worksuit01', 'shoes04'], skin='middleage_asian_female', targets={'head-age-incr': 1.0, 'neck-double-incr': 0.3, 'measure-shoulder-dist-incr': 0.8, 'torso-scale-horiz-incr': 0.5, 'l-lowerarm-scale-horiz-incr': 0.6, 'r-lowerarm-scale-horiz-incr': 0.6, 'l-cheek-bones-incr': 0.4, 'r-cheek-bones-incr': 0.4}, shave=0.05, apron=True),
    'saw': dict(phenotype=dict(gender=1.0, age=0.4, muscle=0.55, weight=0.3, height=0.52, proportions=0.45), hair='short04', eyebrows='eyebrow011', clothes=['male_casualsuit05', 'fedora_cocked', 'shoes06'], skin='young_asian_male', targets={'l-cheek-volume-decr': 0.6, 'r-cheek-volume-decr': 0.6}),
}

def asset(sub, name):
    return f'{name}/{name}.mhclo' if name else ''

# Kesh's apron: the coverall's front from the chest to above the knees, lifted off it by APRON_LIFT
# (m) as a part of its own in a copy of the coverall's texture (figure.py dyes it as leather)
APRON_LIFT = 0.015
APRON_TOP, APRON_BOTTOM, APRON_HALF = 0.36, 1.08, 0.19


def shave(hair, side):
    """The sides of a head shaved: the hair farther than `side` (m) from the head's middle cut away, a strip left on top."""
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    gone = [f for f in bm.faces if all(abs((hair.matrix_world @ v.co).x) > side for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(hair.data)
    bm.free()


def apron(suit, body):
    """A work apron over the coverall `suit`: its faces looking forward between the chest and the knees, lifted off it, a part of its own."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    top = max((body.matrix_world @ v.co).z for v in body.evaluated_get(depsgraph).data.vertices)
    mesh = bpy.data.meshes.new_from_object(suit.evaluated_get(depsgraph))
    mesh.transform(suit.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    keep = lambda f: f.normal.y < -0.35 and top - APRON_BOTTOM < f.calc_center_median().z < top - APRON_TOP and abs(f.calc_center_median().x) < APRON_HALF
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * APRON_LIFT
    bm.to_mesh(mesh)
    bm.free()
    material = suit.material_slots[0].material.copy()
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            node.image = node.image.copy()
    mesh.materials.clear()
    mesh.materials.append(material)
    obj = bpy.data.objects.new('apron', mesh)
    bpy.context.scene.collection.objects.link(obj)


for who, spec in PEOPLE.items():
    if ONLY and who not in ONLY:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    info = HumanService._create_default_human_info_dict()
    pheno = TargetService.get_default_macro_info_dict()
    pheno.update(spec['phenotype'])
    pheno['race'] = {'asian': 0.05, 'african': 0.05, 'caucasian': 0.9}
    info['phenotype'] = pheno
    info['eyes'] = 'low-poly/low-poly.mhclo'
    info['eyebrows'] = asset('eyebrows', spec['eyebrows'])
    info['eyelashes'] = 'eyelashes01/eyelashes01.mhclo'
    info['hair'] = asset('hair', spec['hair'])
    info['clothes'] = [asset('clothes', c) for c in spec['clothes']]
    info['skin_mhmat'] = f"{spec['skin']}/{spec['skin']}.mhmat"
    info['skin_material_type'] = 'MAKESKIN'
    info['alternative_materials'] = {}
    # a rig, so the clothes are rigged as they are put on (figure.py poses the figure on it)
    info['rig'] = 'game_engine'
    info['targets'] = [{'target': name, 'value': value} for name, value in spec.get('targets', {}).items()]
    settings = HumanService.get_default_deserialization_settings()
    settings['subdiv_levels'] = 0
    base = HumanService.deserialize_from_dict(info, settings)
    print('PARTS', who, [o.name for o in bpy.data.objects if o.type == 'MESH'])
    if 'shave' in spec:
        shave(next(o for o in bpy.data.objects if o.type == 'MESH' and spec['hair'] in o.name), spec['shave'])
    if spec.get('apron'):
        apron(next(o for o in bpy.data.objects if o.type == 'MESH' and 'worksuit' in o.name), base)
    # bake the shape keys of the body, so its bounds are the figure's
    depsgraph = bpy.context.evaluated_depsgraph_get()
    top = max((base.matrix_world @ v.co).z for v in base.evaluated_get(depsgraph).data.vertices)
    # a camera on the bust, a little from the side, as a hologram on the comm shows it
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 85
    cam = bpy.data.objects.new('cam', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    target = Vector((0, 0, top - 0.3))
    cam.location = target + Vector((-0.6, -2.4, 0.15))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-30))
    bpy.context.scene.collection.objects.link(sun)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 600, 800
    scene.render.filepath = f'{OUT}/{who}.png'
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/{who}.blend')
    print('BUILT', who, round(top, 3), len(base.data.vertices))
