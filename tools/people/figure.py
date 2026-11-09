"""A person in the flesh for the campaign's scenes (see src/campaign/scenes.ts): a figure of people.py
posed (POSES), the pose baked into its meshes, thinned out to a budget of triangles, each material
made one plain texture (its diffuse map, at most TEXTURE pixels) and written as a binary glTF,
public/assets/people/<who>.glb, y up and facing +z as the game reads it.
Run in Blender: Blender -b <who>.blend --python figure.py -- <who> <out.glb> <triangles>."""
import bpy, math, sys
import numpy as np
from mathutils import Matrix

args = sys.argv[sys.argv.index('--') + 1:]
WHO, OUT, BUDGET = args[0], args[1], int(args[2])
# the largest side of a texture (px): sharp enough a few meters off, light enough for a phone
TEXTURE = 1024
# how each person stands: the upper arms turned down from the rig's A-pose about the axis from
# front to back (deg; Pim's and Hedda's hang at their sides), or turned in about their own
# axis (Rask's hands folded on his belly, Kesh's arms folded)
POSES = {'rask': ('in', -50), 'pim': ('down', 35), 'hedda': ('down', 35), 'quill': ('down', 35), 'spare': ('down', 35), 'president': ('down', 30), 'crisp': ('down', 30), 'kesh': ('in', -50)}
# a person's own colors laid over a texture, by the part's object name (an exact name, else a
# part of it): 'times' multiplies each channel, 'dye' gives the texture that color on average,
# keeping its light and dark (each pixel the color times its brightness over the mean); clamped
# to white. The President's sprayed-on tan and his hair dyed gold, where MakeHuman's skins and
# hair have no such color; Bellamy Crisp's suit in his cola's red; Kesh's apron (see people.py) in
# worn leather
TINTS = {'president': {'Human': ('times', (1.25, 0.8, 0.5)), 'short02': ('dye', (0.85, 0.66, 0.3))}, 'crisp': {'elegantsuit': ('dye', (0.62, 0.05, 0.06))}, 'kesh': {'apron': ('dye', (0.3, 0.19, 0.11))}}
# each texture's largest side by the part it colors, the first match of its object's name (px):
# the skin TEXTURE, seen most closely, the clothes half of it, the small parts a quarter; what is
# cut out by its alpha (hair, eyebrows) stays PNG
SIZES = [('low-poly', 256), ('shoes', 256), ('eyebrow', 256), ('Human.', 512), ('Human', TEXTURE)]
CUT_OUT = ('eyebrow', 'short0', 'bob0', 'long0', 'ponytail', 'braid', 'afro')

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
how, angle = POSES[WHO]
for side in ('l', 'r'):
    bone = rig.pose.bones[f'upperarm_{side}']
    sign = 1 if bone.head.x > 0 else -1
    if how == 'down':
        pivot = bone.head.copy()
        bone.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(angle) * sign, 4, 'Y') @ Matrix.Translation(-pivot) @ bone.matrix
    else:
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler.z = math.radians(angle) * sign
bpy.context.view_layer.update()

meshes = [o for o in bpy.data.objects if o.type == 'MESH' and 'eyelashes' not in o.name]
for obj in [o for o in bpy.data.objects if o.type == 'MESH' and o not in meshes]:
    bpy.data.objects.remove(obj)
# bake the pose and the masks: the meshes as they are seen now, without their modifiers
depsgraph = bpy.context.evaluated_depsgraph_get()
for obj in meshes:
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    obj.shape_key_clear() if obj.data.shape_keys else None
    obj.data = baked
    obj.parent = None
bpy.data.objects.remove(rig)
total = sum(len(o.data.polygons) for o in meshes)
ratio = min(1.0, BUDGET / total)
for obj in meshes:
    thin = obj.modifiers.new('thin', 'DECIMATE')
    thin.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='thin')


def diffuse(material):
    """The image of a material that colors it: the texture feeding its base color, else the first image."""
    images = [n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image] if material.use_nodes else []
    for node in images:
        if 'diffuse' in node.image.name.lower() or 'diffuse' in node.label.lower():
            return node.image
    return images[0].image if images else None


for obj in meshes:
    for slot in obj.material_slots:
        old = slot.material
        if not old:
            continue
        image = diffuse(old)
        plain = bpy.data.materials.new(f'{obj.name}-plain')
        plain.use_nodes = True
        bsdf = plain.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = 0.85
        if image:
            # hair and eyebrows are cut out by their alpha and stay PNG; the rest goes as JPEG
            cut = any(key in obj.name for key in CUT_OUT)
            side = next((size for key, size in SIZES if key in obj.name), TEXTURE // 2)
            if max(image.size) > side:
                scale = side / max(image.size)
                image.scale(max(1, int(image.size[0] * scale)), max(1, int(image.size[1] * scale)))
            tints = TINTS.get(WHO, {})
            tint = tints.get(obj.name) or next((value for key, value in tints.items() if key != 'Human' and key in obj.name), None)
            if tint:
                pixels = np.empty(len(image.pixels), dtype=np.float32)
                image.pixels.foreach_get(pixels)
                rgba = pixels.reshape(-1, 4)
                how, color = tint
                color = np.array(color, dtype=np.float32)
                if how == 'dye':
                    light = rgba[:, :3].mean(axis=1)
                    seen = rgba[:, 3] > 0.5
                    rgba[:, :3] = color * (light / max(1e-4, float(light[seen].mean() if seen.any() else light.mean())))[:, None]
                else:
                    rgba[:, :3] *= color
                rgba[:, :3] = np.minimum(1.0, rgba[:, :3])
                image.pixels.foreach_set(pixels)
                image.update()
            if not cut:
                image.filepath_raw = f'{bpy.app.tempdir}{image.name}.jpg'
                image.file_format = 'JPEG'
                bpy.context.scene.render.image_settings.quality = 80
                image.save()
            node = plain.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = image
            plain.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
            if cut:
                plain.node_tree.links.new(node.outputs['Alpha'], bsdf.inputs['Alpha'])
        slot.material = plain

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_yup=True, export_apply=True, export_animations=False, export_skins=False, export_morph=False, export_image_format='AUTO', export_materials='EXPORT')
print('FIGURE', WHO, OUT, sum(len(o.data.polygons) for o in meshes), 'faces of', total)
