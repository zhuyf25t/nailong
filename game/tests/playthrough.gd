extends SceneTree

# Real UI journey. The driver's only game actions are normal keyboard and mouse inputs.
# Supply -- --capture-dir=<absolute path> with a graphical display to save genuine frames.
var game: SodaGame
var captures := ""
var arena_grid := AStarGrid2D.new()
var history_has_match := false
var last_error := ""
var _ended := false

func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture-dir="):
			captures = arg.trim_prefix("--capture-dir=")
	call_deferred("_run")

func _fail(reason: String) -> void:
	if _ended:
		return
	_ended = true
	push_error("Soda playthrough failed: %s · %s" % [reason, last_error])
	quit(1)

func _wait_until(predicate: Callable, timeout: float, description: String) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while not predicate.call() and Time.get_ticks_msec() < deadline:
		await process_frame
	if not predicate.call():
		_fail(description)
		return false
	return true

func _capture(label: String) -> void:
	if captures.is_empty():
		return
	await RenderingServer.frame_post_draw
	var frame := root.get_texture().get_image()
	if frame == null or frame.save_png(captures.path_join(label + ".png")) != OK:
		_fail("截图 " + label)

func _mouse(pos: Vector2, index: MouseButton, down: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.position = pos
	ev.global_position = pos
	ev.button_index = index
	ev.pressed = down
	root.push_input(ev, true)

func _aim(pos: Vector2) -> void:
	var ev := InputEventMouseMotion.new()
	ev.position = pos
	ev.global_position = pos
	root.push_input(ev, true)

func _key(code: Key) -> void:
	for down: bool in [true, false]:
		var ev := InputEventKey.new()
		ev.keycode = code
		ev.physical_keycode = code
		ev.pressed = down
		root.push_input(ev, true)

func _button(node_name: String) -> bool:
	var button := game.ui.find_child(node_name, true, false) as Button
	if button == null or button.disabled or not button.is_visible_in_tree():
		_fail("按钮 " + node_name)
		return false
	var pos := button.get_global_rect().get_center()
	_mouse(pos, MOUSE_BUTTON_LEFT, true)
	_mouse(pos, MOUSE_BUTTON_LEFT, false)
	return true

func _fighter() -> SodaState.Fighter:
	return game.api.current.fighters[game.api.current.you]

func _move(direction: Vector2i) -> void:
	for action: String in ["soda_left", "soda_right", "soda_up", "soda_down"]:
		Input.action_release(action)
	if direction.x != 0:
		Input.action_press("soda_right" if direction.x > 0 else "soda_left")
	if direction.y != 0:
		Input.action_press("soda_down" if direction.y > 0 else "soda_up")

func _build_grid() -> void:
	var definition: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/arena.json"))
	var rows: Array = definition.rows
	arena_grid.region = Rect2i(0, 0, rows[0].length(), rows.size())
	arena_grid.cell_size = Vector2(16, 16)
	arena_grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_NEVER
	arena_grid.update()
	for y in rows.size():
		for x in rows[y].length():
			arena_grid.set_point_solid(Vector2i(x,y), rows[y][x] == "#")

func _drive(game_state: SodaState) -> void:
	var pilot := game_state.fighters[game_state.you]
	if pilot.hp == 0:
		_move(Vector2i.ZERO)
		return
	var target_flag := game_state.flags[opposite_team(pilot.team)]
	var home := game_state.flags[pilot.team]
	var goal: Vector2 = home.pos if pilot.carrying >= 0 else target_flag.pos
	var tile := Vector2i((pilot.pos / 16.0).floor())
	var path := arena_grid.get_id_path(tile, Vector2i((goal / 16.0).floor()))
	if path.size() > 1:
		var next: Vector2i = path[1] - tile
		var center := Vector2(tile * 16 + Vector2i(8,8))
		if next.x != 0 and absf(center.y - pilot.pos.y) > 3.9:
			next = Vector2i(0, signi(roundi(center.y - pilot.pos.y)))
		elif next.y != 0 and absf(center.x - pilot.pos.x) > 3.9:
			next = Vector2i(signi(roundi(center.x - pilot.pos.x)), 0)
		_move(next)
	else:
		var d := goal - pilot.pos
		_move(Vector2i(signi(roundi(d.x)), signi(roundi(d.y))) if d.length() > 3.0 else Vector2i.ZERO)
	var closest: SodaState.Fighter
	for candidate in game_state.fighters:
		if candidate.team != pilot.team and candidate.hp > 0 and (closest == null or candidate.pos.distance_squared_to(pilot.pos) < closest.pos.distance_squared_to(pilot.pos)):
			closest = candidate
	if closest != null:
		var screen := SodaGame.ARENA_RECT.position + closest.pos * 2.0
		_aim(screen)
		if not game._pressed_fire:
			_mouse(screen, MOUSE_BUTTON_LEFT, true)
		if pilot.shield_cd == 0 and closest.pos.distance_to(pilot.pos) < 115:
			_key(KEY_Q)

func opposite_team(team: SodaState.Team) -> int:
	return 1 - int(team)

func _run() -> void:
	if not captures.is_empty() and (DisplayServer.get_name() == "headless" or DirAccess.make_dir_recursive_absolute(captures) != OK):
		_fail("图像采集需要有效窗口与可写目录")
		return
	_build_grid()
	game = load("res://main.tscn").instantiate() as SodaGame
	root.add_child(game)
	game.api.notice.connect(func(msg: String): last_error = msg)
	await process_frame
	await _capture("01-login")
	var secret := Crypto.new().generate_random_bytes(12).hex_encode()
	game.ui.username_input.text = "泡芙·" + secret.left(7)
	game.ui.password_input.text = secret
	if not _button("Login"): return
	if not await _wait_until(func(): return game.page == SodaGame.Page.LOBBY, 10.0, "登录大厅"): return
	if not _button("Skin_dragon") or not _button("ModeCTF"): return
	await _capture("02-lobby")
	if not _button("CreateRoom"): return
	if not await _wait_until(func(): return game.page == SodaGame.Page.MATCH and game.api.current != null, 12.0, "创建夺旗房"): return
	var match_id := game.api.current.match_id
	var initial := _fighter().pos
	_move(Vector2i(1,0))
	if not await _wait_until(func(): return _fighter().pos.distance_to(initial) > 7.0, 3.5, "WASD 移动"): return
	var combat_center := SodaGame.ARENA_RECT.get_center()
	_mouse(combat_center, MOUSE_BUTTON_RIGHT, true)
	_mouse(combat_center, MOUSE_BUTTON_RIGHT, false)
	_key(KEY_Q)
	_key(KEY_2)
	_mouse(combat_center, MOUSE_BUTTON_LEFT, true)
	if not await _wait_until(func(): return _fighter().weapon == SodaState.Weapon.STAR and _fighter().ammo[1] < 4 and _fighter().shield_cd > 0 and _fighter().dash_cd > 0, 4.0, "短跳、糖壳、切槽、发射"): return
	await _capture("03-battle")
	_mouse(combat_center, MOUSE_BUTTON_LEFT, false)
	_key(KEY_R)
	if not await _wait_until(func(): return _fighter().reload_ticks > 0, 3.0, "按 R 装填"): return
	_key(KEY_1)
	var saw_flag := false
	var next_steer := -1
	var deadline := Time.get_ticks_msec() + 145000
	while game.page == SodaGame.Page.MATCH and Time.get_ticks_msec() < deadline:
		var state := game.api.current
		if state != null and state.tick >= next_steer:
			next_steer = state.tick + 2
			_drive(state)
			if not saw_flag and state.flags.any(func(flag: SodaState.Flag): return flag.carrier >= 0):
				saw_flag = true
				await _capture("04-flag")
		await process_frame
	_move(Vector2i.ZERO)
	_mouse(combat_center, MOUSE_BUTTON_LEFT, false)
	if not await _wait_until(func(): return game.page == SodaGame.Page.RESULT, 1.0, "权威结算"): return
	await _capture("05-result")
	game.api.history_loaded.connect(func(rows: Array[SodaState.History]):
		history_has_match = rows.any(func(row: SodaState.History): return row.match_id == match_id and row.mode == SodaState.Mode.CTF))
	if not _button("History"): return
	if not await _wait_until(func(): return game.page == SodaGame.Page.HISTORY and history_has_match, 10.0, "读取本局战绩"): return
	await _capture("06-history")
	game.queue_free()
	await process_frame
	await process_frame
	print("Soda playthrough PASS · login, select, CTF, motion, shot, reload, shield, jump, result, history; flag observed: ", saw_flag)
	_ended = true
	quit(0)
