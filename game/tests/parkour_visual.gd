extends SceneTree

var scene: Node
var capture_dir := ""

func _initialize() -> void:
	call_deferred("_run")

func _save(name: String) -> void:
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if image != null:
		image.save_png(capture_dir.path_join(name + ".png"))

func _base(level: int, phase: String, x: float, y: float) -> Dictionary:
	return {
		"runId": "visual-%d-%s" % [level, phase], "ack": -1, "tick": 100,
		"level": level, "phase": phase, "layout": phase,
		"player": {"x": x, "y": y}, "facing": {"x": -1 if phase == "cold" else 1, "y": 0},
		"checkpoint": null, "reading": null, "dead": null, "teleport": null,
		"transition": null, "switch": null, "creepX": 400.0 if phase == "cold" else null,
		"bars": [], "glitch": null, "scary": null, "ending": "none",
		"collected": phase == "cold", "events": [],
	}

func _run() -> void:
	capture_dir = OS.get_environment("PARKOUR_CAPTURE_DIR")
	if capture_dir.is_empty():
		capture_dir = OS.get_user_data_dir()
	DirAccess.make_dir_recursive_absolute(capture_dir)
	scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.api.connect_and_start()
	var deadline := Time.get_ticks_msec() + 20000
	while scene.page != "play" and Time.get_ticks_msec() < deadline:
		await process_frame
	if scene.page != "play":
		quit(1)
		return
	scene.api.set_process(false)
	await create_timer(0.3).timeout
	scene.api.current = {}
	scene.world.set_page("play")

	var cold := _base(3, "cold", 440, 152)
	cold.events = [{"id": 1, "kind": "lightning", "x": 392, "y": 136}]
	scene.world.set_view(cold)
	await create_timer(0.4).timeout
	await _save("05-cold")

	var death := cold.duplicate(true)
	death.tick = 160
	death.dead = {"kind": "cold", "ticks": 4, "prompt": false}
	scene.world.set_view(death)
	await create_timer(0.1).timeout
	await _save("06a-death-beam")

	death.dead = {"kind": "cold", "ticks": 25, "prompt": true}
	scene.world.set_view(death)
	await create_timer(0.3).timeout
	await _save("06-death-cold")

	var warm := _base(1, "warm", 72, 152)
	warm.tick = 220
	warm.dead = {"kind": "warm", "ticks": 30, "prompt": true}
	scene.world.set_view(warm)
	await create_timer(0.3).timeout
	await _save("07-death-warm")

	var rod := _base(6, "warm", 184, 152)
	rod.teleport = {"target": [15, 9], "x": 248, "y": 152, "ticks": 2}
	scene.world.set_view(rod)
	await create_timer(0.1).timeout
	await _save("08-teleport")

	var scary := _base(5, "cold", 440, 152)
	scary.layout = "cold"
	scary.creepX = null
	scary.scary = {"x": 320, "y": 0, "w": 16, "h": 288}
	scene.world.set_view(scary)
	await create_timer(0.2).timeout
	await _save("11-scary-line")

	var barriers := _base(6, "warm", 184, 152)
	scene.world.set_view(barriers)
	await create_timer(0.2).timeout
	await _save("12-level6-barriers")

	var maze := _base(2, "cold", 440, 152)
	scene.world.set_view(maze)
	await create_timer(0.2).timeout
	await _save("13-level2-cold")

	scene.world.set_view(maze)
	await create_timer(0.1).timeout
	scene.world._micro_until = Time.get_ticks_msec() + 300
	await create_timer(0.1).timeout
	await _save("14-micro-blur")

	var glitch := _base(5, "cold", 200, 152)
	glitch.layout = "warm"
	glitch.creepX = null
	glitch.glitch = {"x": 300, "y": 0, "w": 32, "h": 288}
	scene.world.set_view(glitch)
	await create_timer(0.2).timeout
	await _save("15-glitch-warm-sign")

	var blur := _base(5, "cold", 440, 152)
	blur.switch = {"from": "warm", "to": "cold", "ticks": 9, "total": 18}
	scene.world.set_view(blur)
	await create_timer(0.25).timeout
	await _save("09-blur")

	var ending := _base(1, "cold", -120, 152)
	ending.ending = "collected"
	scene.world.set_view(ending)
	await create_timer(0.3).timeout
	await _save("10-ending")
	print("PARKOUR VISUAL DONE")
	quit(0)
