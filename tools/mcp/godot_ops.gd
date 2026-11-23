extends SceneTree


func fail(message: String) -> void:
    push_error(message)
    quit(1)


func vector3(values: Array) -> Vector3:
    return Vector3(values[0], values[1], values[2])


func _initialize() -> void:
    var argv := OS.get_cmdline_user_args()
    if argv.size() != 1:
        fail("Expected one request file.")
        return
    var request: Variant = JSON.parse_string(FileAccess.get_file_as_string(argv[0]))
    if not request is Dictionary:
        fail("Invalid scene request.")
        return
    var root_node := Node3D.new()
    root_node.name = request.name
    for item: Dictionary in request.instances:
        var model := ResourceLoader.load(item.model) as PackedScene
        if model == null:
            root_node.free()
            fail("Import the project first. Could not load " + str(item.model))
            return
        var child := model.instantiate() as Node3D
        if child == null:
            root_node.free()
            fail("Model must have a Node3D root.")
            return
        child.name = item.name
        root_node.add_child(child)
        child.owner = root_node
        child.position = vector3(item.position)
        child.rotation_degrees = vector3(item.rotation_degrees)
        child.scale = vector3(item.scale)
    var scene := PackedScene.new()
    var err := scene.pack(root_node)
    if err == OK:
        err = ResourceSaver.save(scene, request.out)
    var count := root_node.get_child_count()
    root_node.free()
    if err != OK:
        fail("Could not save PackedScene: " + error_string(err))
        return
    print("HW3_STUDIO_RESULT " + JSON.stringify({"instance_count": count}))
    quit(0)
