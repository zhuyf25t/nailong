"""Fixed Blender operations used by studio.cjs; coordinates are Z-up."""
import json
import math
import sys
from pathlib import Path

import bpy


def set_transform(obj, data):
    obj.location = data["position"]
    obj.rotation_euler = [math.radians(angle) for angle in data["rotation_degrees"]]
    obj.scale = data["scale"]


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def make_parts(parts):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials = {}
    for part in parts:
        shape = part["primitive"]
        if shape == "cube":
            bpy.ops.mesh.primitive_cube_add(size=1)
        elif shape == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.5, depth=1)
        elif shape == "cone":
            bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.5, depth=1)
        else:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5)
        obj = bpy.context.object
        obj.name = part["name"]
        set_transform(obj, part)
        color = part["color"].upper()
        if color not in materials:
            mat = bpy.data.materials.new("Mat_" + color[1:])
            rgba = [srgb_to_linear(int(color[i:i + 2], 16) / 255) for i in (1, 3, 5)] + [1]
            mat.diffuse_color = rgba
            mat.use_nodes = True
            mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = rgba
            materials[color] = mat
        obj.data.materials.append(materials[color])


def describe():
    objects = list(bpy.context.scene.objects)
    return {
        "object_count": len(objects),
        "objects": [{"name": obj.name, "type": obj.type} for obj in objects[:128]],
        "mesh_faces": sum(len(obj.data.polygons) for obj in objects if obj.type == "MESH"),
        "materials": [mat.name for mat in bpy.data.materials][:128],
    }


def main():
    request = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
    action = request["action"]
    if action == "compose":
        make_parts(request["parts"])
    else:
        bpy.ops.wm.open_mainfile(filepath=request["source"], use_scripts=False)
    if action == "transform":
        obj = bpy.context.scene.objects.get(request["object"])
        if obj is None:
            raise ValueError("Unknown object: " + request["object"])
        set_transform(obj, request)
    if action == "export":
        bpy.ops.export_scene.gltf(filepath=request["out"], export_format="GLB")
    elif action in ("transform", "compose"):
        bpy.ops.wm.save_as_mainfile(filepath=request["out"], compress=True)
    print("HW3_STUDIO_RESULT " + json.dumps(describe()))


main()
