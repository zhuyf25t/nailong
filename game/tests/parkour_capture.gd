extends SceneTree

var scene: Node
var capture_dir := ""

func _initialize() -> void:
	call_deferred("_run")

func _save(name: String) -> void:
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if image == null:
		push_error("no viewport image")
		return
	var path := capture_dir.path_join(name + ".png")
	var error := image.save_png(path)
	if error != OK:
		push_error("could not save " + path)

func _run() -> void:
	capture_dir = OS.get_environment("PARKOUR_CAPTURE_DIR")
	if capture_dir.is_empty():
		capture_dir = OS.get_user_data_dir()
	DirAccess.make_dir_recursive_absolute(capture_dir)
	var packed: PackedScene = load("res://main.tscn")
	scene = packed.instantiate()
	root.add_child(scene)
	await process_frame
	await create_timer(0.8).timeout
	await _save("01-title")
	scene.api.connect_and_start()
	var deadline := Time.get_ticks_msec() + 20000
	while scene.page != "play" and Time.get_ticks_msec() < deadline:
		await process_frame
	if scene.page != "play":
		push_error("capture did not reach play")
		quit(1)
		return
	await create_timer(0.8).timeout
	await _save("02-level1")
	Input.action_press("ui_right")
	await create_timer(1.2).timeout
	Input.action_release("ui_right")
	await create_timer(0.4).timeout
	scene.api.controls.press_read()
	scene.api.kick()
	await create_timer(0.5).timeout
	await _save("03-reading")
	scene.api.controls.press_read()
	scene.api.kick()
	await create_timer(0.4).timeout
	Input.action_press("ui_up")
	await create_timer(0.2).timeout
	Input.action_release("ui_up")
	Input.action_press("ui_right")
	var transition_at := -1.0
	var until := Time.get_ticks_msec() + 7000
	while Time.get_ticks_msec() < until:
		await process_frame
		if scene.api.current.get("transition") != null:
			transition_at = Time.get_ticks_msec()
			break
	Input.action_release("ui_right")
	if transition_at >= 0.0:
		await _save("04-transition")
	print("PARKOUR CAPTURE DONE " + capture_dir)
	quit(0)
