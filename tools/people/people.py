"""The campaign's people (see tools/people/README.md): each built with MPFB, MakeHuman's character
generator in Blender, from MakeHuman's CC0 assets, saved as a .blend and rendered as a picture of
its bust for review. Run in Blender: Blender -b --python people.py -- <folder>."""
import bpy, sys, math
from mathutils import Vector
from bl_ext.blender_org.mpfb.services import HumanService, TargetService

OUT = sys.argv[sys.argv.index('--') + 1]
PEOPLE = {
    'rask': dict(phenotype=dict(gender=1.0, age=0.72, muscle=0.3, weight=1.0, height=0.55, proportions=0.3), hair='', eyebrows='eyebrow010', clothes=['male_casualsuit03', 'shoes02'], skin='middleage_caucasian_male', targets={'head-fat-incr': 1.0, 'neck-double-incr': 1.0, 'l-cheek-volume-incr': 1.0, 'r-cheek-volume-incr': 1.0, 'stomach-pregnant-incr': 0.7, 'head-age-incr': 0.5}),
    'pim': dict(phenotype=dict(gender=0.0, age=0.34, muscle=0.5, weight=0.35, height=0.5, proportions=0.6), hair='short02', eyebrows='eyebrow006', clothes=['male_worksuit01', 'shoes05'], skin='young_caucasian_female'),
    'hedda': dict(phenotype=dict(gender=0.0, age=0.78, muscle=0.6, weight=0.45, height=0.6, proportions=0.5), hair='short01', eyebrows='eyebrow002', clothes=['male_casualsuit06', 'shoes03'], skin='old_caucasian_female', targets={'head-age-incr': 0.9, 'l-cheek-bones-incr': 0.6, 'r-cheek-bones-incr': 0.6}),
}

def asset(sub, name):
    return f'{name}/{name}.mhclo' if name else ''

for who, spec in PEOPLE.items():
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
