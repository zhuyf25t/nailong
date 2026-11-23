"""Build the night shift pressure bottle and render its transparent 96 x 144 prop.

From the project root: blender -b --factory-startup --python-exit-code 1 --python art/night_bottle/build.py
"""
import math
import os
import struct
import tempfile
import zlib
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parents[1] / "game/assets/night/props/pressure_bottle.png"
WIDTH, HEIGHT, SAMPLE = 96, 144, 3
INK = bytes.fromhex("251f30")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene


def srgb(channel):
    v = channel / 255
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def paint(name, rgb, metallic=0.0, rough=.46):
    color = tuple(srgb(c) for c in bytes.fromhex(rgb))
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    surface = mat.node_tree.nodes["Principled BSDF"]
    surface.inputs["Base Color"].default_value = (*color, 1)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = rough
    return mat


teal = paint("Kiln-fired bottle green", "367770", .07, .31)
mint = paint("Seafoam slip glaze", "7CB39A", .06)
cream = paint("Warm ivory porcelain", "F8E6B5")
ink = paint("Black aubergine enamel", "392D39", .03)
bronze = paint("Antique bronze recess", "85523B", .28)
brass = paint("Brushed honey brass", "D7A65F", .28)
gold = paint("Freshly worn brass", "F8D48C", .27)
red = paint("Cherry crown enamel", "D64F42", .03)
red_dark = paint("Crimped oxblood edge", "8B393A", .08)


def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    data.materials.append(mat)
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    return ob


def lathe(name, profile, mat, sides=40, crimp=0):
    verts = []
    for radius, z in profile:
        for i in range(sides):
            a = math.tau * i / sides
            r = radius + (crimp if i % 2 else 0)
            verts.append((r * math.cos(a), r * math.sin(a), z))
    faces = [(j * sides + i, j * sides + (i + 1) % sides,
              (j + 1) * sides + (i + 1) % sides, (j + 1) * sides + i)
             for j in range(len(profile) - 1) for i in range(sides)]
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))])
    return mesh(name, verts, faces, mat)


def rod(name, begin, end, radius, mat, sides=12):
    a, b = Vector(begin), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=(b-a).length,
                                        location=(a+b)/2)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    ob.data.materials.append(mat)
    return ob


# Long neck, pinched waist and crown retain the silhouette of a returnable soda bottle.
lathe("Refillable enamel flask", [
    (.48,.04),(.60,.10),(.64,.19),(.64,.36),(.61,.48),(.575,.77),(.58,1.02),
    (.63,1.28),(.66,1.69),(.65,1.92),(.60,2.07),(.48,2.23),(.35,2.35),
    (.255,2.49),(.24,2.67),(.24,2.94),(.29,3.00),(.30,3.07)
], teal)
lathe("Insulated base boot", [(.51,.04),(.62,.09),(.65,.16),(.646,.24),(.63,.255)], ink)
lathe("Base bumper bright bead", [(.641,.20),(.655,.215),(.651,.24),(.642,.25)], brass)
lathe("Shoulder seam", [(.621,2.018),(.634,2.035),(.62,2.07),(.603,2.08)], mint)
lathe("Neck seal collar", [(.247,2.64),(.262,2.65),(.261,2.70),(.244,2.71)], bronze)
lathe("Rolled crown underside", [(.27,2.96),(.32,2.975),(.34,3.014),(.326,3.04)], red_dark, 36, .037)
lathe("Corrugated red soda crown", [(.332,3.00),(.342,3.02),(.306,3.10),(.286,3.13)],
      red, 36, .037)
lathe("Cap top ivory seal", [(.147,3.131),(.145,3.14)], cream, 28)
lathe("Cap top red bullseye", [(.093,3.14),(.091,3.145)], red, 24)


def label_point(t, z, radius):
    # The graphic is printed on a curved piece of enamel, facing the orthographic camera.
    a = .11 + t
    return (radius * math.sin(a), -radius * math.cos(a), z)


def panel(name, left, right, bottom, top, radius, mat, segments=16):
    verts = [label_point(left+(right-left)*j/segments, z, radius)
             for z in (bottom,top) for j in range(segments+1)]
    return mesh(name, verts, [(i, i+1, i+segments+2, i+segments+1) for i in range(segments)], mat)


panel("Arc of label backing", -1.11,1.11,.40,.99,.626,bronze)
panel("Cream soda label", -1.045,1.045,.435,.957,.634,cream)
panel("Label lower red pinstripe", -1.0,1.0,.48,.52,.642,red_dark)
panel("Label upper red pinstripe", -1.0,1.0,.885,.921,.642,red_dark)
# Three hand-lettered block glyphs remain readable in the pixel projection.
letters = {"P":("111","101","111","100","100"), "O":("111","101","101","101","111")}
for col, ch in enumerate("POP"):
    for row, line in enumerate(letters[ch]):
        for bit, present in enumerate(line):
            if present == "1":
                x = -.73 + (col*4+bit)*.137
                z = .585 + (4-row)*.052
                panel(f"Sign enamel {col}-{row}-{bit}", x,x+.14,z,z+.054,.647,teal,2)

# A slim copper return line and threaded fittings give this prop a different outline from the bottles on the belt.
pipe_points = [(-.20,-.07,2.69),(-.43,-.07,2.69),(-.69,-.07,2.47),
               (-.73,-.07,2.30),(-.73,-.07,1.80),(-.59,-.07,1.76)]
for i, (a,b) in enumerate(zip(pipe_points,pipe_points[1:])):
    rod(f"Overpressure return {i}",a,b,.049,brass)
for z in (2.02,2.12):
    rod("Copper line coupling",(-.73,-.07,z-.026),(-.73,-.07,z+.026),.066,bronze)

# The gauge is built outward along its mounting axle. Every tick and the needle is editable geometry.
normal = Vector((.12,-1,.14)).normalized()
right = Vector((1,.12,0)).normalized()
up = normal.cross(right).normalized()
mount = Vector((.12,-.56,1.60))


def dial(x, y, depth):
    return mount+right*x+up*y+normal*depth


for n, start, stop, radius, mat in [
    ("Hex service mount",-.015,.082,.305,bronze),
    ("Gauge dark iron case",.06,.128,.438,ink),
    ("Gauge raised brass bezel",.125,.182,.445,brass),
    ("Machined bezel highlight",.18,.196,.409,gold),
    ("Gauge inner gasket",.195,.205,.367,ink),
    ("Ivory dial face",.205,.21,.333,cream)]:
    rod(n,dial(0,0,start),dial(0,0,stop),radius,mat,36 if "Hex" not in n else 6)
for mark in range(9):
    a = math.radians(211-mark*30)
    ca, sa = math.cos(a), math.sin(a)
    length = .066 if mark % 2 == 0 else .038
    rod(f"Dial index {mark}",dial(ca*(.291-length),sa*(.291-length),.218),
        dial(ca*.299,sa*.299,.218),.015,red_dark if mark>=6 else ink,8)


def triangle(name, points, dist, mat):
    return mesh(name,[dial(x,y,dist) for x,y in points],[(0,1,2)],mat)


triangle("Black needle edge",[(-.045,-.055),(.221,.17),(.023,-.061)],.228,ink)
triangle("Vermilion pressure needle",[(-.024,-.038),(.206,.163),(.028,-.020)],.231,red)
rod("Needle axle",dial(0,0,.229),dial(0,0,.245),.046,ink,16)
rod("Needle axle glint",dial(-.009,.009,.245),dial(-.009,.009,.25),.021,gold,12)
for x in (-.11,.11):
    rod("Dial screw",dial(x,-.195,.217),dial(x,-.195,.224),.018,bronze,10)

target = Vector((-.015,0,1.60))
bpy.ops.object.camera_add(location=(1.30,-9,3.75))
scene.camera = bpy.context.object
scene.camera.name = "Order ticket orthographic portrait"
scene.camera.rotation_euler = (target-scene.camera.location).to_track_quat("-Z","Y").to_euler()
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = 3.49
scene.world = bpy.data.worlds.new("Porcelain booth")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes["Background"]
background.inputs["Color"].default_value = (.62,.73,.69,1)
background.inputs["Strength"].default_value = .38
for name, pos, watts, size, tint in [
    ("High milkglass lamp",(-3.4,-4.4,6),320,3.5,(1,.90,.77)),
    ("Counter bounce",(3.2,-2.8,2.5),80,2.6,(1,.88,.79)),
    ("Cold shoulder light",(1.5,1.7,4.5),135,2.7,(.65,.89,1))]:
    bpy.ops.object.light_add(type="AREA",location=pos)
    light = bpy.context.object
    light.name = name
    light.data.energy,light.data.size,light.data.color = watts,size,tint
    light.rotation_euler = (target-light.location).to_track_quat("-Z","Y").to_euler()

scene.render.engine = "CYCLES"
scene.cycles.samples, scene.cycles.seed = 32, 9
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = WIDTH*SAMPLE, HEIGHT*SAMPLE
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
scene.render.filepath = "//bottle-render.png"
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"night_bottle.blend"),compress=True)

palette = [bytes.fromhex(s) for s in (
    "251F30","3A3340","59414A","74483C","975F42","B57A50","D19B67","F3C98B",
    "F2DCA6","FFF1C7","FFF6D7","26464A","305957","42746A","568D7D","78A793",
    "9EBFA1","BB403C","8B3A3B","D75744","E87754","EFA576")]


file_handle, temporary_path = tempfile.mkstemp(prefix="bottle-render-",suffix=".png",dir=HERE)
os.close(file_handle)
raw = Path(temporary_path)
try:
    scene.render.filepath = str(raw)
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(str(raw))
    # Blender returns the file-encoded samples for this eight-bit PNG.
    color_samples = tuple(image.pixels)
    bpy.data.images.remove(image)
finally:
    raw.unlink(missing_ok=True)

pixels = {}
for y in range(HEIGHT):
    for x in range(WIDTH):
        covered = []
        for sy in range(SAMPLE):
            for sx in range(SAMPLE):
                offset = 4*((HEIGHT*SAMPLE-1-y*SAMPLE-sy)*WIDTH*SAMPLE+x*SAMPLE+sx)
                if color_samples[offset+3] > .5:
                    covered.append(offset)
        if len(covered) >= 5:
            rgb = [round(255*sum(color_samples[i+c] for i in covered)/len(covered)) for c in range(3)]
            pixels[x,y] = min(palette,key=lambda p: sum((a-b)**2 for a,b in zip(p,rgb)))


def chunk(kind, data):
    return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data))


rows = bytearray()
for y in range(HEIGHT):
    rows.append(0)
    for x in range(WIDTH):
        color = pixels.get((x,y))
        if color is None and any((x+dx,y+dy) in pixels for dx,dy in ((-1,0),(1,0),(0,-1),(0,1))):
            color = INK
        rows.extend(color+b"\xff" if color else b"\0\0\0\0")
OUTPUT.parent.mkdir(exist_ok=True,parents=True)
OUTPUT.write_bytes(b"\x89PNG\r\n\x1a\n"
                   +chunk(b"IHDR",struct.pack(">IIBBBBB",WIDTH,HEIGHT,8,6,0,0,0))
                   +chunk(b"IDAT",zlib.compress(bytes(rows),9))+chunk(b"IEND",b""))
print("Night pressure bottle sprite:",OUTPUT)
