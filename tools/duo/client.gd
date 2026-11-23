extends SceneTree

# A local file only exchanges the room code and test checkpoints. All gameplay
# state is learned through the normal SodaGame UI and its live network client.
var game: SodaGame
var run_dir: String
var role: String
var nickname: String
var failed := false

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2 or not args[0] in ["host", "guest"]:
		push_error("Expected host|guest and a test directory")
		quit(1)
		return
	role = args[0]
	run_dir = args[1]
	var syllables := ["杏", "棠", "云", "青", "棉", "晴", "霜", "禾",
			"芽", "铃", "绒", "叶", "柚", "梅", "雪", "栀"]
	var suffix := ""
	for digit in run_dir.get_file().left(6):
		suffix += syllables[digit.hex_to_int()]
	nickname = ("小奶龙·" if role == "host" else "小奶蛙·") + suffix
	call_deferred("_run")

func fail_test(message: String) -> void:
	failed = true
	push_error(role + " dual-client check: " + message)
	quit(1)

func until(predicate: Callable, description: String, seconds := 18.0) -> bool:
	var end := Time.get_ticks_msec() + int(seconds * 1000)
	while not predicate.call() and Time.get_ticks_msec() < end:
		await process_frame
	if not predicate.call():
		fail_test(description)
		return false
	return true

func write_note(key: String, data: Dictionary) -> void:
	var target := run_dir.path_join(key + ".json")
	var pending := target + ".part"
	var file := FileAccess.open(pending, FileAccess.WRITE)
	if not file:
		fail_test("Cannot publish checkpoint " + key)
		return
	file.store_string(JSON.stringify(data))
	file.close()
	if DirAccess.rename_absolute(pending, target) != OK:
		fail_test("Cannot commit checkpoint " + key)

func read_note(key: String) -> Dictionary:
	var path := run_dir.path_join(key + ".json")
	if not FileAccess.file_exists(path):
		return {}
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return value if value is Dictionary else {}

func click(node_name: String) -> bool:
	var node := game.ui.find_child(node_name, true, false) as Button
	if not is_instance_valid(node) or not node.is_visible_in_tree() or node.disabled:
		fail_test("Button missing or unavailable: " + node_name)
		return false
	var point := node.get_global_rect().get_center()
	for down: bool in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		event.position = point
		event.global_position = point
		root.push_input(event, true)
	return true

func key_press(code: Key, down: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = down
	Input.parse_input_event(event)

func capture(shot: String) -> void:
	if DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	var error := root.get_texture().get_image().save_png(run_dir.path_join(shot + ".png"))
	if error != OK:
		fail_test("Failed to save " + shot)

func _run() -> void:
	game = load("res://main.tscn").instantiate() as SodaGame
	root.add_child(game)
	await process_frame
	await process_frame
	game.ui.username_input.text = nickname
	game.ui.password_input.text = Crypto.new().generate_random_bytes(18).hex_encode()
	if not click("Login"):
		return
	if not await until(func(): return game.page == SodaGame.Page.LOBBY, "login via UI"):
		return
	if role == "host":
		await host_run()
	else:
		await guest_run()
	if not failed:
		quit(0)

func host_run() -> void:
	if not click("Skin_dragon") or not click("ModeCTF") or not click("CreateRoom"):
		return
	if not await until(func(): return game.page == SodaGame.Page.MATCH and game.api.current != null, "create room"):
		return
	var start := game.api.current
	write_note("room", {"code": start.code, "match": start.match_id, "host": start.you, "name": nickname})
	if not await until(func(): return not read_note("joined").is_empty(), "second client joined", 25):
		return
	var guest := read_note("joined")
	var other := int(guest.slot)
	if not await until(func():
			var fighter := game.api.current.fighters[other]
			return fighter.human and fighter.name == guest.name, "host received guest roster"):
		return
	if not await until(func(): return game.api.current.fighters[start.you].invuln_ticks == 0,
			"spawn protection expired", 4):
		return
	if DisplayServer.get_name() != "headless":
		root.grab_focus()
		await create_timer(0.18).timeout
	key_press(KEY_Q, true)
	await process_frame
	key_press(KEY_Q, false)
	key_press(KEY_D, true)
	await create_timer(0.95).timeout
	key_press(KEY_D, false)
	if not await until(func(): return not read_note("observed").is_empty(), "guest saw host movement and shield", 8):
		return
	await capture("host-in-room")
	if not click("LeaveRoom"):
		return
	if not await until(func(): return game.page == SodaGame.Page.LOBBY, "host returned to lobby"):
		return
	write_note("host-pass", {"code": start.code, "seat": start.you, "guestSeat": other, "returnedToLobby": true})

func guest_run() -> void:
	if not await until(func(): return not read_note("room").is_empty(), "host's room code", 25):
		return
	var room := read_note("room")
	if not click("Skin_frog"):
		return
	game.ui.code_input.text = str(room.code)
	if not click("JoinRoom"):
		return
	if not await until(func(): return game.page == SodaGame.Page.MATCH and game.api.current != null, "join room"):
		return
	var state := game.api.current
	var host := int(room.host)
	if state.code != room.code or state.match_id != room.match or state.you == host:
		fail_test("Both clients must see the same match and different seats")
		return
	if not state.fighters[host].human or state.fighters[host].name != room.name:
		fail_test("Host absent on guest roster")
		return
	var origin := state.fighters[host].pos
	var seen := {"delta": 0.0, "shieldTicks": 0}
	write_note("joined", {"slot": state.you, "name": nickname})
	if not await until(func():
			var remote := game.api.current.fighters[host]
			seen.delta = maxf(float(seen.delta), origin.distance_to(remote.pos))
			seen.shieldTicks = maxi(int(seen.shieldTicks), remote.shield_ticks)
			return seen.delta >= 13.0 and seen.shieldTicks > 0, "remote movement and shield", 8):
		return
	await capture("guest-sees-host")
	write_note("observed", seen)
	if not await until(func(): return not game.api.current.fighters[host].human, "departed host became AI"):
		return
	write_note("guest-pass", {"code": state.code, "seat": state.you, "hostSeat": host,
			"hostMotionPx": seen.delta, "hostShieldTicks": seen.shieldTicks, "hostBecameAI": true})
	if not click("LeaveRoom"):
		return
	await until(func(): return game.page == SodaGame.Page.LOBBY, "guest returned to lobby")
