extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _fail(message: String) -> void:
	push_error(message)
	print("PARKOUR SMOKE FAIL: " + message)
	quit(1)

func _run() -> void:
	var packed: PackedScene = load("res://main.tscn")
	if packed == null:
		_fail("main scene did not load")
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	await process_frame
	scene.api.connect_and_start()
	var deadline := Time.get_ticks_msec() + 20000
	while scene.page != "play" and Time.get_ticks_msec() < deadline:
		await process_frame
	if scene.page != "play":
		_fail("did not reach play page")
		return
	var start_x := float(scene.api.current.player.x)
	Input.action_press("ui_right")
	await create_timer(1.2).timeout
	Input.action_release("ui_right")
	await create_timer(0.25).timeout
	var end_x := float(scene.api.current.player.x)
	if end_x <= start_x + 2.0:
		_fail("player did not move right: %.1f -> %.1f" % [start_x, end_x])
		return
	scene.api.controls.press_read()
	scene.api.kick()
	await create_timer(0.35).timeout
	if typeof(scene.api.current.get("reading")) != TYPE_DICTIONARY:
		_fail("sign reading did not start")
		return
	scene.api.controls.press_read()
	scene.api.kick()
	await create_timer(0.35).timeout
	if typeof(scene.api.current.get("reading")) == TYPE_DICTIONARY:
		_fail("sign reading did not finish")
		return
	Input.action_press("ui_up")
	await create_timer(0.2).timeout
	Input.action_release("ui_up")
	Input.action_press("ui_right")
	await create_timer(4.6).timeout
	Input.action_release("ui_right")
	Input.action_press("ui_down")
	await create_timer(0.2).timeout
	Input.action_release("ui_down")
	await create_timer(0.6).timeout
	if int(scene.api.current.get("level", 1)) < 2:
		_fail("did not slide into level two at x=%.1f y=%.1f" % [
			float(scene.api.current.player.x), float(scene.api.current.player.y)])
		return
	print("PARKOUR SMOKE PASS")
	quit(0)
