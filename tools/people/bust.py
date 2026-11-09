"""A person's bust for the game's hologram (see src/view/products.ts, bustParts): cut out of a figure
of people.py, thinned out to a budget of triangles and written as public/assets/people/<who>.bin.
Run in Blender: Blender -b <who>.blend --python bust.py -- <out.bin> <triangles>."""
import bpy, bmesh, struct, sys
args = sys.argv[sys.argv.index('--') + 1:]
OUT, BUDGET = args[0], int(args[1])
# what each part of the figure is, by the name's end: its glow and its share of white (see products.ts, part)
TONES = [('eyebrow', 1.15, 0.1), ('low-poly', 1.2, 0.2), ('eyelashes', None, None), ('suit', 0.85, 0.0), ('apron', 0.85, 0.0), ('short', 1.1, 0.1), ('bob', 1.1, 0.1), ('Human', 1.0, 0.0)]
depsgraph = bpy.context.evaluated_depsgraph_get()
body = bpy.data.objects['Human']
top = max((body.matrix_world @ v.co).z for v in body.evaluated_get(depsgraph).data.vertices)
# the bust: down to the chest; the arms, held out from the shoulders, cut away; the skin only where
# nothing covers it (head and neck), so the see-through hologram shows no body under the clothes
BOTTOM, NECK, HALF_WIDTH = top - 0.62, top - 0.3, 0.23
parts = []
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    tone = next(((glow, white) for key, glow, white in TONES if key in obj.name), None)
    if tone is None or tone[0] is None:
        continue
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    mesh.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    floor = NECK if obj is body else BOTTOM
    gone = [f for f in bm.faces if any(v.co.z < floor or abs(v.co.x) > HALF_WIDTH for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bm.to_mesh(mesh)
    bm.free()
    if len(mesh.polygons):
        parts.append((obj.name, tone, mesh))
total = sum(len(m.polygons) for _, _, m in parts)
ratio = min(1.0, BUDGET / total)
out = []
for name, tone, mesh in parts:
    holder = bpy.data.objects.new(name + '-bust', mesh)
    bpy.context.scene.collection.objects.link(holder)
    decimate = holder.modifiers.new('thin', 'DECIMATE')
    decimate.ratio = ratio
    thin = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bm = bmesh.new()
    bm.from_mesh(thin)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    tris = []
    for face in bm.faces:
        for v in face.verts:
            n = v.normal if face.smooth else face.normal
            # Blender: z up, the face towards -y; the game: y up, the face towards +z
            tris.append((v.co.x, v.co.z, -v.co.y, n.x, n.z, -n.y))
    bm.free()
    out.append((tone, tris))
xs = [t[0] for _, ts in out for t in ts]; ys = [t[1] for _, ts in out for t in ts]; zs = [t[2] for _, ts in out for t in ts]
center = ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2)
half = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) / 2
q = lambda value, middle: max(-32767, min(32767, round((value - middle) / half * 32767)))
with open(OUT, 'wb') as f:
    f.write(b'BUST')
    f.write(struct.pack('<H', len(out)))
    for (glow, white), tris in out:
        f.write(struct.pack('<ffI', glow, white, len(tris)))
        for x, y, z, nx, ny, nz in tris:
            f.write(struct.pack('<hhhbbb', q(x, center[0]), q(y, center[1]), q(z, center[2]), round(nx * 127), round(ny * 127), round(nz * 127)))
print('BUST', OUT, 'parts', len(out), 'triangles', sum(len(t) for _, t in out) // 3, 'of', total)
