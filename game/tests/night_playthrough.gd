extends SceneTree

## Black-box campaign test. Decisions use the same rendered cues and geometry as a player.
## A graphical run accepts -- --capture-dir=<directory>. No test endpoints or game state writes.

var app: Node
var capture_dir := ""
var halted := false
var last_notice := ""
var campaign_clears: Array[int] = []
var captures_done: Dictionary = {}
var has_bank := false
var saw_dim := false
var saw_belt := false
var failure_branches := 0
var restore_sound := false
var account_name := ""
var account_password := ""

const INPUTS := ["night_left", "night_right", "night_up", "night_down"]
const WINDOWS := [104.0, 240.0, 376.0]

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i].begins_with("--capture-dir="):
			capture_dir = args[i].trim_prefix("--capture-dir=")
		elif args[i] == "--capture-dir" and i + 1 < args.size():
			capture_dir = args[i + 1]
	call_deferred("_run")

func _state() -> Dictionary:
	return app.get("api").get("current")

func _profile() -> Dictionary:
	return app.get("api").get("profile_data")

func _page() -> String:
	return str(app.get("page"))

func _phase() -> String:
	return str(_state().get("phase", ""))

func _position() -> Vector2:
	var pilot: Dictionary = _state().get("player", {})
	return Vector2(float(pilot.get("x", 0)), float(pilot.get("y", 0)))

func _fail(description: String) -> bool:
	if not halted:
		halted = true
		_release_keys()
		if restore_sound and is_instance_valid(app) and _ready_button("MuteButton"):
			var mute := _find("MuteButton") as Button
			if mute.text.contains("关"):
				_click(mute.get_global_rect().get_center(), MOUSE_BUTTON_LEFT)
		var state := _state() if is_instance_valid(app) and app.get("api") != null else {}
		var focus := root.has_focus()
		push_error("Night shift playthrough FAIL: %s (night=%s order=%s phase=%s event=%s tick=%s pos=%s focus=%s notice=%s)" %
			[description, state.get("night"), state.get("order"), state.get("phase"),
			state.get("event"), state.get("tick"), state.get("player"), focus, last_notice])
		quit(1)
	return false

func _until(test: Callable, seconds: float, label: String) -> bool:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000)
	while not test.call():
		if Time.get_ticks_msec() > deadline:
			return _fail(label)
		await process_frame
	return true

func _capture(label: String) -> void:
	if capture_dir.is_empty() or captures_done.has(label): return
	captures_done[label] = true
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if image == null or image.save_png(capture_dir.path_join(label + ".png")) != OK:
		_fail("capture " + label)

func _find(node_name: String) -> Node:
	return app.find_child(node_name, true, false)

func _ready_button(node_name: String) -> bool:
	var button := _find(node_name) as BaseButton
	return button != null and button.is_visible_in_tree() and not button.disabled

func _click(point: Vector2, index: MouseButton) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	root.push_input(motion, true)
	for down: bool in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.position = point
		ev.global_position = point
		ev.pressed = down
		ev.button_index = index
		root.push_input(ev, true)

func _press(node_name: String) -> bool:
	if not await _until(func(): return _ready_button(node_name), 12, "button " + node_name): return false
	var button := _find(node_name) as BaseButton
	_click(button.get_global_rect().get_center(), MOUSE_BUTTON_LEFT)
	await process_frame
	return true

func _click_world(point: Vector2, index: MouseButton) -> void:
	var screen: Vector2 = app.get("world").call("world_to_screen", point)
	_click(screen, index)

func _release_keys() -> void:
	for action: String in INPUTS:
		if InputMap.has_action(action):
			Input.action_release(action)

func _direction(direction: Vector2) -> void:
	_release_keys()
	if absf(direction.x) > 3.5:
		Input.action_press("night_right" if direction.x > 0 else "night_left")
	if absf(direction.y) > 3.5:
		Input.action_press("night_down" if direction.y > 0 else "night_up")

func _move_to(target: Vector2, done: Callable, label: String, timeout := 7.0) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000)
	while not done.call():
		if Time.get_ticks_msec() >= deadline or _phase() == "lost":
			return _fail(label)
		_direction(target - _position())
		await process_frame
	_release_keys()
	return true

func _login() -> bool:
	if not await _press("AccountButton"): return false
	if not await _until(func(): return _find("NicknameEdit") != null and _find("NicknameEdit").is_visible_in_tree(), 5, "account form"): return false
	(_find("NicknameEdit") as LineEdit).text = account_name
	(_find("PasswordEdit") as LineEdit).text = account_password
	if not await _press("LoginButton"): return false
	return await _until(func(): return _page() == "roster" and not _profile().is_empty(), 12, "profile received")

func _enter_night(night: int) -> bool:
	if not await _press("Night%d" % night) or not await _press("StartButton"): return false
	return await _until(func():
		return _page() == "play" and _state().get("night", 0) == night and _phase() == "serving",
		12, "start night %d" % night)

func _probe(side: String) -> bool:
	var pilot := _position()
	var aim_x := 440.0 if side == "right" else 40.0
	if absf(aim_x - pilot.x) < 1.0: return _fail("ambiguous probe direction")
	_click_world(Vector2(aim_x, pilot.y - 15), MOUSE_BUTTON_RIGHT)
	return await _until(func():
		var state := _state()
		if state.get("probe") != side or int(state.get("probeTicks", 0)) <= 0: return false
		for window: Dictionary in state.get("windows", []):
			if window.get("look") not in ["left", "right"]: return false
		return true, 4, "visible window reactions " + side)

func _identify(real: bool) -> int:
	var state := _state()
	for win: Dictionary in state.windows:
		if (str(win.look) == str(state.probe)) == real:
			return int(win.slot)
	return -1

func _opposite_previous() -> String:
	return "right" if _state().get("memory") == "left" else "left"

func _throw(slot: int, bank: bool) -> void:
	var pilot := _position()
	var target := Vector2(WINDOWS[slot], 78)
	if bank:
		var side_wall := 12.0 if slot <= 1 else 468.0
		target.x = 2 * side_wall - target.x
	var ray := (target - pilot).normalized()
	_click_world(pilot + ray * 74.0, MOUSE_BUTTON_LEFT)

func _service_order(night: int, order: int) -> bool:
	var start := _state()
	if int(start.get("order", 0)) != order or start.get("phase") != "serving": return _fail("unexpected ticket")
	if not await _probe(_opposite_previous()): return false
	var slot := _identify(true)
	var matching := 0
	for win: Dictionary in _state().windows:
		if win.look == _state().probe: matching += 1
	if slot < 0 or matching != 1: return _fail("probe should distinguish exactly one recipient")
	if night == 1 and order == 1: await _capture("03-first-order")
	if night == 3 and order == 1: await _capture("04-echo")
	if night == 5 and order == 1: await _capture("07-three-windows")
	var bank := bool(_state().bank)
	if night == 4 and order == 2:
		# The shutter rejects a direct delivery without stealing the bottle or advancing the ticket.
		_throw(slot, false)
		if not await _until(func(): return _state().get("event") == "blocked" and _state().get("bottle") == null, 5, "shutter blocks a direct throw"): return false
		if int(_state().delivered) != order - 1: return _fail("blocked toss advanced the ticket")
	_throw(slot, bank)
	var deadline := Time.get_ticks_msec() + 7000
	var bounced := false
	while int(_state().get("delivered", 0)) < order:
		var state := _state()
		if state.get("phase") != "serving" or Time.get_ticks_msec() > deadline:
			return _fail("deliver bottle to window %d (bank %s)" % [slot, bank])
		var bottle: Variant = state.get("bottle")
		if bottle is Dictionary and bottle.get("bounced") == true:
			bounced = true
			if bank: await _capture("06-sidewall")
		if state.get("event") == "bounce": bounced = true
		await process_frame
	if bank and not bounced: return _fail("bank path should visibly bounce")
	has_bank = has_bank or bounced
	return true

func _darkness() -> bool:
	if not await _until(func(): return _state().get("dim") == true, 13, "dark window"): return false
	saw_dim = true
	if not await _probe(_opposite_previous()): return false
	await _capture("08-blackout")
	return true

func _conveyor() -> bool:
	if not await _move_to(Vector2(240, 184), func(): return absf(_position().y - 184) < 7, "enter conveyor"): return false
	var before := _position()
	if not await _until(func(): return absf(_position().x - before.x) >= 6, 4, "visible conveyor drift"): return false
	saw_belt = true
	if not await _move_to(Vector2(_position().x, 220), func(): return _position().y > 208, "leave conveyor"): return false
	return true

func _wrong_delivery(escape: bool) -> bool:
	if not await _probe(_opposite_previous()): return false
	var fake := _identify(false)
	if fake < 0: return _fail("impostor for recovery route")
	_throw(fake, false)
	if not await _until(func(): return _phase() == "escaping", 6, "mistake releases intruder"): return false
	await _capture("05-intruder")
	if escape:
		var lever := Vector2(46 if _state().lever == "left" else 434, 220)
		if not await _move_to(lever, func(): return _state().get("latched") == true, "pull emergency lever"): return false
		if not await _move_to(Vector2(240, 260), func(): return _phase() == "escaped", "reach south exit"): return false
	else:
		if not await _until(func(): return _phase() == "lost", 17, "remaining in place loses the chase"): return false
	failure_branches += 1
	var prior_id: String = _state().runId
	if not await _press("RetryButton"): return false
	return await _until(func():
		return _phase() == "serving" and int(_state().order) == 1 and _state().runId != prior_id,
		12, "retry creates a fresh first order")

func _win(night: int) -> bool:
	if _phase() != "clockout" or int(_state().delivered) != 3: return _fail("clockout after three receipts")
	if not await _move_to(Vector2(240,260), func(): return _phase() == "won", "win at south exit"): return false
	if not await _until(func(): return _ready_button("RosterButton"), 9, "result UI"): return false
	if night == 8: await _capture("09-last-shift")
	campaign_clears.append(night)
	print("Night shift verified ", night, "/8, delivered 3, exit stamped")
	if not await _press("RosterButton"): return false
	return await _until(func():
		return _page() == "roster" and _profile().get("cleared", []).has(night) and int(_profile().get("unlocked", 0)) >= mini(8, night+1),
		10, "persisted unlock for night %d" % night)

func _run() -> void:
	if not capture_dir.is_empty() and (DisplayServer.get_name() == "headless" or DirAccess.make_dir_recursive_absolute(capture_dir) != OK):
		_fail("screenshots require a graphical display and a writable folder")
		return
	app = load("res://main.tscn").instantiate()
	root.add_child(app)
	await process_frame
	var api: Node = app.get("api")
	if api == null: _fail("night client is not installed"); return
	if api.has_signal("notice"): api.connect("notice", func(msg: String): last_notice = msg)
	if not await _until(func(): return _ready_button("AccountButton"), 5, "title"): return
	await _capture("01-title")
	account_password = Crypto.new().generate_random_bytes(15).hex_encode()
	account_name = "试映员" + account_password.left(9)
	if not await _login(): return
	if _profile().get("unlocked") != 1 or not _profile().get("cleared", []).is_empty(): _fail("fresh profile"); return
	await _capture("02-roster")
	var mute := _find("MuteButton") as Button
	restore_sound = mute.text.contains("开")
	if restore_sound and not await _press("MuteButton"): return
	if not (_find("MuteButton") as Button).text.contains("关"): _fail("silent mode indicator"); return
	for night in range(1, 9):
		if not await _enter_night(night): return
		if night == 1:
			var origin := _position()
			if not await _move_to(origin + Vector2(24, 0), func(): return _position().x > origin.x + 16, "walk with keyboard"): return
			_click_world(_position() + Vector2(0, 36), MOUSE_BUTTON_LEFT)
			if not await _until(func(): return _state().get("event") == "miss", 4, "miss can be tried again"): return
		if night == 2:
			if not await _probe(str(_state().memory)): return
			for win: Dictionary in _state().windows:
				if win.look != _state().memory: _fail("echo matches old gesture"); return
			if not await _wrong_delivery(true) or not await _wrong_delivery(false): return
		if night == 6 and not await _darkness(): return
		if night == 7 and not await _conveyor(): return
		for order in range(1, 4):
			if not await _service_order(night, order): return
		if not await _win(night): return
	if not await _press("LogoutButton") or not await _login(): return
	if not await _until(func(): return _profile().get("cleared", []).size() == 8 and _profile().get("bestClean") == 3, 9, "durable campaign record on fresh login"): return
	if not has_bank or not saw_dim or not saw_belt or failure_branches != 2: _fail("missing campaign coverage"); return
	await _capture("10-stamped-roster")
	if restore_sound and not await _press("MuteButton"): return
	_release_keys()
	var audio: Node = app.get("audio")
	if audio.has_method("shutdown"):
		await audio.call("shutdown")
	app.queue_free()
	await process_frame
	await process_frame
	print("Night shift playthrough PASS · 8 nights, 24 deliveries, bounced bottle, blackout, conveyor, escape, capture, retry, re-login")
	quit(0)
