"""Build and render the Soda Scramble trophy with Blender 4.5 in background mode.

blender --background --factory-startup --python art/trophy/build.py
"""
import math
import struct
import tempfile
import zlib
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
TARGET = HERE.parents[1] / "game" / "assets" / "trophy" / "winner.png"
SIZE = 64
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def paint(name, color, metallic=0):
    channels = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4))
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*channels, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*channels, 1)
    shader.inputs["Roughness"].default_value = .36
    shader.inputs["Metallic"].default_value = metallic
    return material


gold = paint("Lemon brass", "E9A532", .25)
gilt = paint("Light syrup gold", "FFDA65", .18)
caramel = paint("Caramel edges", "B95B29", .08)
plum = paint("Plum enamel", "443047")
berry = paint("Strawberry enamel", "F2787F")
mint = paint("Mint enamel", "62BDAD")
cream = paint("Vanilla frosting", "FFF2C3")


def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    data.materials.append(material)
    return obj


def turned(name, profile, material, sides=24, teeth=0):
    """Revolve a closed radius/height profile, optionally pressing ridges into it."""
    vertices, faces = [], []
    for radius, height in profile:
        for step in range(sides):
            angle = math.tau * step / sides
            r = radius + (teeth if step % 2 else 0)
            vertices.append((r * math.cos(angle), r * math.sin(angle), height))
    for row in range(len(profile) - 1):
        for col in range(sides):
            a = row * sides + col
            b = row * sides + (col + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(range(len(vertices) - sides, len(vertices))))
    return mesh(name, vertices, faces, material)


def pipe(name, start, end, radius, material):
    delta = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=radius, depth=delta.length,
                                        location=(Vector(start) + Vector(end)) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(material)


def bead(name, center, radius, material, flatten=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale.z = flatten
    obj.data.materials.append(material)


def handle(sign):
    path = [(.75, 1.86), (.99, 1.95), (1.22, 1.92), (1.31, 1.79),
            (1.30, 1.56), (1.12, 1.32), (.77, 1.23), (.63, 1.36)]
    points = [(sign * x, .02, z) for x, z in path]
    label = "Left ear" if sign < 0 else "Right ear"
    for i, (a, b) in enumerate(zip(points, points[1:])):
        pipe(f"{label} segment {i}", a, b, .092, gold)
    for i, point in enumerate(points):
        bead(f"{label} joint {i}", point, .093, gold)


turned("Crimped bottle-cap foot", [(.49, .04), (.53, .09), (.51, .21), (.43, .25)], plum, 40, .045)
turned("Base gilding", [(.52, .12), (.53, .14), (.52, .18)], gilt, 40, .03)
turned("Mint collar", [(.43, .22), (.43, .29), (.33, .32)], mint)
turned("Stem", [(.34, .30), (.31, .36), (.13, .44), (.14, .67), (.24, .76)], gold)
turned("Cup lower lip", [(.18, .68), (.33, .78), (.36, .82)], caramel)
turned("Fluted sugar bowl", [(.20, .74), (.38, .82), (.55, 1.00), (.68, 1.24),
                             (.80, 1.65), (.83, 1.89), (.78, 1.94),
                             (.71, 1.84), (.66, 1.56), (.30, 1.12)], gold, 20)
turned("Bottle-cap crown", [(.79, 1.83), (.83, 1.86), (.84, 1.95), (.77, 2.00)],
       gilt, 40, .025)
turned("Soda at the rim", [(.72, 1.98), (.71, 2.015)], mint)
for side in (-1, 1):
    handle(side)

# The sugar star faces the camera and stands proud of the curved cup.
star = []
for i in range(8):
    a = math.pi / 2 + math.tau * i / 8
    r = .275 if i % 2 == 0 else .101
    z = 1.46 + math.sin(a) * r
    star.append((math.cos(a) * r, -.84 - (z - 1.46) * .30, z))
mesh("Vanilla sugar star", star, [tuple(range(8))], cream)
for i, (x, y, z, r, material) in enumerate([
        (-.32, -.08, 2.06, .26, berry), (.10, .04, 2.13, .23, cream),
        (.40, -.19, 2.02, .16, mint)]):
    bead(f"Fizz pearl {i + 1}", (x, y, z), r, material)
    bead(f"Pearl highlight {i + 1}", (x - r * .33, y - r * .73, z + r * .53),
         r * .22, cream)

straw = [Vector((.32, .16, 1.99)), Vector((.47, .16, 2.46)), Vector((.80, .16, 2.70))]
for leg, (a, b) in enumerate(zip(straw, straw[1:])):
    for i in range(4):
        pipe(f"Candy straw {leg}-{i}", a.lerp(b, i / 4), a.lerp(b, (i + 1) / 4),
             .093, berry if i % 2 == 0 else cream)
bead("Straw elbow", straw[1], .092, cream)

camera_pos = Vector((1.6, -8, 3.6))
look_at = Vector((0, 0, 1.32))
bpy.ops.object.camera_add(location=camera_pos)
scene.camera = bpy.context.object
scene.camera.name = "Badge portrait camera"
scene.camera.rotation_euler = (look_at - camera_pos).to_track_quat("-Z", "Y").to_euler()
scene.camera.data.type = "ORTHO"
scene.camera.data.ortho_scale = 3.08

scene.world = bpy.data.worlds.new("Candy workshop skylight")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.5, .56, .69, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .24
for name, position, energy, width in [
        ("Softbox", (-3.5, -4.2, 6), 220, 3.5),
        ("Warm return", (3, -2, 3), 58, 2.2), ("Cap rim", (1.6, 2, 4), 120, 2.4)]:
    bpy.ops.object.light_add(type="AREA", location=position)
    lamp = bpy.context.object
    lamp.name = name
    lamp.data.energy, lamp.data.shape, lamp.data.size = energy, "DISK", width
    lamp.rotation_euler = (look_at - lamp.location).to_track_quat("-Z", "Y").to_euler()

scene.render.engine = "CYCLES"
scene.cycles.samples = 20
scene.cycles.seed = 7
scene.render.resolution_x = scene.render.resolution_y = SIZE * 3
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
scene.render.filepath = "//cup-render.png"
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "soda_cup.blend"), compress=True)

# Convert the actual rendered scene to the fixed arcade palette and add a one-pixel ink rim.
palette = [bytes.fromhex(color) for color in (
    "30253D", "56374B", "8E4D41", "BD653D", "DA893E", "F3AF45", "FFD362", "FFE887",
    "FFF5BD", "FFFAE3", "307876", "49978D", "6BBCAE", "9CDEBF", "BB5168", "E87887",
    "FFABB1", "574654")]


def encode_channel(v):
    return round(255 * min(1, max(0, 12.92 * v if v <= .0031308 else 1.055 * v ** (1 / 2.4) - .055)))


with tempfile.TemporaryDirectory(prefix="render-", dir=HERE) as temporary:
    raster = Path(temporary) / "raw.png"
    scene.render.filepath = str(raster)
    bpy.ops.render.render(write_still=True)
    rendered = bpy.data.images.load(str(raster))
    source = list(rendered.pixels)
    stride = SIZE * 3
    pixels = {}
    for y in range(SIZE):
        for x in range(SIZE):
            samples = [4 * ((stride - 1 - (3 * y + sy)) * stride + 3 * x + sx)
                       for sy in range(3) for sx in range(3)]
            opaque = [i for i in samples if source[i + 3] > .55]
            if len(opaque) < 5:
                continue
            rgb = [encode_channel(sum(source[i + c] for i in opaque) / len(opaque)) for c in range(3)]
            pixels[x, y] = min(palette, key=lambda p: sum((v - t) ** 2 for v, t in zip(rgb, p)))
    bpy.data.images.remove(rendered)


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


scanlines = bytearray()
for y in range(SIZE):
    scanlines.append(0)
    for x in range(SIZE):
        color = pixels.get((x, y))
        if color is None and any((x + dx, y + dy) in pixels for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            color = palette[0]
        scanlines.extend(color + b"\xff" if color else b"\0\0\0\0")
TARGET.parent.mkdir(exist_ok=True, parents=True)
TARGET.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)) +
                   chunk(b"IDAT", zlib.compress(bytes(scanlines), 9)) + chunk(b"IEND", b""))
print("Champion trophy sprite written to", TARGET)
