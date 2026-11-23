extends SceneTree

## Black-box campaign test. Decisions use the same rendered cues and geometry as a player.
## A graphical run accepts -- --capture-dir=<directory>. No test endpoints or game state writes.
## Use -- --tutorial-only for the first-night onboarding regression.

var app: Node
var capture_dir := ""
var tutorial_only := false
var halted := false
var last_notice := ""
var campaign_clears: Array[int] = []
var captures_done: Dictionary = {}
var has_bank := false
var failure_branches := 0
var restore_sound := false
var account_name := ""
var account_password := ""
const Chapters = preload("res://tests/night_chapters.gd")

const INPUTS := ["night_left", "night_right", "night_up", "night_down"]
const WINDOWS := [104.0, 240.0, 376.0]

func _initialize() -> void:
	# The production scene reads/writes its preferences on startup. Keep every
	# test login, rules acknowledgement and mute toggle outside the player's user://.
	# With an externally isolated app-data directory, preserve the renderer's
	# startup path so that GPU shader caches keep their original location.
	var isolated := OS.get_environment("NIGHT_QA_HOME").replace("\\","/").simplify_path()
	var user_path := OS.get_user_data_dir().replace("\\","/").simplify_path()
	if isolated.is_empty() or not isolated.is_absolute_path() or not user_path.begins_with(isolated + "/"):
		ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
		ProjectSettings.set_setting("application/config/custom_user_dir_name", "OnlyThreeOnShift-QA")
	if DirAccess.make_dir_recursive_absolute(OS.get_user_data_dir()) != OK:
		call_deferred("_fail", "could not create the isolated QA preferences directory")
		return
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--tutorial-only":
			tutorial_only = true
		elif args[i].begins_with("--capture-dir="):
			capture_dir = args[i].trim_prefix("--capture-dir=")
		elif args[i] == "--capture-dir" and i + 1 < args.size():
			capture_dir = args[i + 1]
	if not capture_dir.is_empty():
		root.unfocusable = true
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

func _story() -> Dictionary:
	return _state().get("story", {})

func _point(marker: Dictionary) -> Vector2:
	return Vector2(float(marker.x), float(marker.y))

func _marker(kind: String) -> Dictionary:
	for item: Dictionary in _story().get("marks", []):
		if item.get("kind") == kind:
			return item
	return {}

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
		push_error("Night shift playthrough FAIL: %s (night=%s order=%s phase=%s event=%s tick=%s pos=%s focus=%s notice=%s story=%s)" %
			[description, state.get("night"), state.get("order"), state.get("phase"),
			state.get("event"), state.get("tick"), state.get("player"), focus, last_notice,
			[state.get("story", {}).get("step"),state.get("story", {}).get("cue")]])
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

func _has_caption() -> bool:
	var subtitle := _find("SubtitleText") as Label
	var speaker := _find("SubtitleSpeaker") as Label
	return subtitle != null and subtitle.is_visible_in_tree() and not subtitle.text.strip_edges().is_empty() and speaker != null and not speaker.text.strip_edges().is_empty()

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

func _walk(target: Vector2, radius := 7.0, label := "reach station") -> bool:
	return await _move_to(target, func(): return _position().distance_to(target) <= radius, label, 11)

func _login() -> bool:
	if not await _press("AccountButton"): return false
	if not await _until(func(): return _find("NicknameEdit") != null and _find("NicknameEdit").is_visible_in_tree(), 5, "account form"): return false
	(_find("NicknameEdit") as LineEdit).text = account_name
	(_find("PasswordEdit") as LineEdit).text = account_password
	if not await _press("LoginButton"): return false
	return await _until(func(): return _page() == "roster" and not _profile().is_empty(), 12, "profile received")

func _review_from_menu(source: String) -> bool:
	if not await _press("RulesButton") or not await _press("RulesTab4"): return false
	var page_number := _find("RulesPageNumber") as Label
	if page_number == null or not page_number.is_visible_in_tree() or not page_number.text.contains("4"): return _fail("cannot review the last rules page from " + source)
	if not await _press("RulesContinueButton"): return false
	if _page() != source or not _state().is_empty(): return _fail("reviewing rules started a shift from " + source)
	return true

func _enter_night(night: int) -> bool:
	if not await _press("Night%d" % night) or not await _press("StartButton"): return false
	if not await _until(func(): return _ready_button("RulesContinueButton") or _page() == "play", 12, "show rules or start a previously learned shift"): return false
	if _ready_button("RulesContinueButton"):
		if not campaign_clears.is_empty(): return _fail("reader was forced through the rulebook again")
		var headline := _find("RulesPageTitle") as Label
		if headline == null or not headline.is_visible_in_tree() or headline.text.is_empty(): return _fail("missing rulebook heading")
		if not await _press("RulesNextButton") or not await _press("RulesPrevButton"): return false
		if _page() == "play" or not _state().is_empty(): return _fail("rules should precede the first active order")
		if not await _press("RulesContinueButton"): return false
	elif night == 1 and campaign_clears.is_empty():
		return _fail("first-time player entered the shift without seeing the rules")
	return await _until(func():
		return _page() == "play" and _state().get("night", 0) == night and _phase() == "serving",
		12, "start night %d" % night)

func _manual_pause() -> bool:
	if not await _press("RulesButton"): return false
	if not await _until(func(): return _ready_button("RulesContinueButton") and _state().get("paused", false), 5, "authoritative rulebook pause"): return false
	var frozen_tick := int(_state().tick)
	var frozen_pressure := int(_state().pressure)
	var initial_ack := int(_state().ack)
	if frozen_pressure <= 0: return _fail("night two should have a timed bottle")
	if not await _press("RulesTab2"): return false
	await create_timer(1.2).timeout
	if not await _until(func(): return int(_state().ack) > initial_ack, 2, "fresh paused snapshot from the server"): return false
	if _state().tick != frozen_tick or _state().pressure != frozen_pressure: return _fail("clock or bottle pressure advanced during rulebook review")
	if not await _press("RulesContinueButton"): return false
	if not await _until(func(): return not _state().get("paused", true) and int(_state().tick) > frozen_tick and int(_state().pressure) < frozen_pressure, 5, "closing the rulebook resumes the game"): return false
	print("Night rulebook verified: server clock and pressure frozen at ", frozen_tick, "/", frozen_pressure, ", then resumed")
	return true

func _replay_first_night() -> bool:
	if not await _enter_night(1): return false
	if not await _press("LeaveButton") or not await _press("ConfirmLeaveButton"): return false
	return await _until(func(): return _page() == "roster" and _state().is_empty(), 8, "replay returns to the roster")

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

func _matching_slots() -> Array[int]:
	var matches: Array[int] = []
	for win: Dictionary in _state().windows:
		if win.look == _state().probe: matches.append(int(win.slot))
	return matches

func _receipt_window(night: int) -> int:
	if night != 5:
		if not await _probe(_opposite_previous()): return -1
		var matches := _matching_slots()
		return matches[0] if matches.size() == 1 else -1
	if not await _probe("left"): return -1
	var left := _matching_slots()
	if int(_state().order) == 1: await _capture("07a-left-probe")
	if not await _probe("right"): return -1
	var right := _matching_slots()
	var agreed := -1
	if left.size() != 2 or right.size() != 2: return -1
	for slot in left:
		if slot in right:
			if agreed != -1: return -1
			agreed = slot
	return agreed

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

func _training_orders() -> bool:
	var side := Vector2(428, 151)
	if not await _move_to(side, func(): return _position().distance_to(side) < 8, "walk to the side of the counter"): return false
	var settled_tick := int(_state().tick) + 5
	if not await _until(func(): return int(_state().tick) >= settled_tick, 2, "release movement before aiming"): return false
	# Both points are on a recipient's upper body. From this angle the raw ray to
	# the middle figure misses its catch zone by over 40 pixels.
	var closed_body := Vector2(384, 46)
	var expected := (closed_body - _position()).normalized()
	_click_world(closed_body, MOUSE_BUTTON_LEFT)
	if not await _until(func(): return _state().get("bottle") is Dictionary, 3, "projectile fired at closed window"): return false
	var bottle: Dictionary = _state().bottle
	var actual := Vector2(bottle.vx, bottle.vy).normalized()
	if actual.distance_to(expected) > 0.02: return _fail("closed window attracted the throw")
	if not await _until(func(): return _state().event == "miss", 4, "closed window should miss"): return false
	if int(_state().delivered) != 0: return _fail("closed window signed a receipt")
	for order in range(1, 4):
		if _phase() != "serving" or int(_state().order) != order or _state().probe != "none":
			return _fail("first-night delivery must work without a cap probe")
		if order == 1: await _capture("03-first-order")
		_click_world(Vector2(249, 46), MOUSE_BUTTON_LEFT)
		if not await _until(func(): return int(_state().delivered) == order, 5, "body click should deliver from an oblique angle"): return false
	if _phase() != "clockout": return _fail("three bottles should open the south exit")
	print("Night tutorial verified: 0 probes, closed shutter raw trajectory, 3 body clicks from ", _position())
	return true

func _service_order(night: int, order: int) -> bool:
	var start := _state()
	if int(start.get("order", 0)) != order or start.get("phase") != "serving": return _fail("unexpected ticket")
	if _story().get("step") == "supply":
		if not await _collect_supply(order == 1): return false
	var slot := await _receipt_window(night)
	if slot < 0: return _fail("observable hand gestures should distinguish one recipient")
	if night == 5 and order == 1: await _capture("07-two-probes")
	var bank := bool(_state().bank)
	if night == 4 and order == 2:
		# The shutter rejects a direct delivery without stealing the bottle or advancing the ticket.
		_throw(slot, false)
		if not await _until(func(): return _state().get("event") == "blocked" and _state().get("bottle") == null, 5, "shutter blocks a direct throw"): return false
		if int(_state().delivered) != order - 1: return _fail("blocked toss advanced the ticket")
		if not await _walk(Vector2(240,174), 7, "reach bank rail platform"): return false
		bank = true
	if night == 4 and order == 3:
		if not await _walk(Vector2(432,148), 7, "reach side platform for direct delivery"): return false
		bank = false
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

func _collect_supply(check_fall: bool) -> bool:
	var pickup := _marker("supply")
	if pickup.is_empty(): return _fail("bottle station is not marked")
	if check_fall:
		var row: Array = _story().get("tiles", [])
		if row.is_empty(): return _fail("missing unsafe tiles")
		var tile: Dictionary = row[0]
		for other: Dictionary in row:
			if _position().distance_to(_point(other)) < _position().distance_to(_point(tile)): tile = other
		var count := int(_state().delivered)
		if not await _walk(_point(tile), 4, "stand on a cracked test tile"): return false
		await _capture("04-cracked-tile")
		if not await _until(func(): return _story().get("cue") == "tile_fall", 3, "unsafe tile gives way"): return false
		if _phase() != "serving" or int(_state().delivered) != count or _position().distance_to(Vector2(240,220)) > 9:
			return _fail("fall should return the player without losing completed orders")
		await _capture("04b-open-tile")
		await create_timer(2.6).timeout
	return await _move_to(_point(pickup), func(): return _story().get("step") == "delivery", "cross the cracked floor and obtain soda", 8)

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
	if night < 6:
		if _phase() != "clockout" or int(_state().delivered) != 3: return _fail("clockout after three receipts")
		if not await _move_to(Vector2(240,260), func(): return _phase() == "won", "win at south exit"): return false
	if not await _until(func(): return _phase() == "won", 6, "complete this night"): return false
	if not await _until(func(): return _ready_button("RosterButton"), 9, "result UI"): return false
	if night == 8: await _capture("15-ending")
	campaign_clears.append(night)
	print("Night shift verified ", night, "/8, signed bottles ", _state().delivered)
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
	if not await _review_from_menu("title"): return
	account_password = Crypto.new().generate_random_bytes(15).hex_encode()
	account_name = "试映员" + account_password.left(9)
	if not await _login(): return
	if _profile().get("unlocked") != 1 or not _profile().get("cleared", []).is_empty(): _fail("fresh profile"); return
	await _capture("02-roster")
	if not await _review_from_menu("roster"): return
	if tutorial_only:
		if not await _enter_night(1) or not await _training_orders() or not await _win(1): return
		if not await _press("LogoutButton") or not await _login() or not await _replay_first_night(): return
		await _finish("Night tutorial playthrough PASS · 3 receipts without probing, south exit, night 2 unlocked, remembered rulebook")
		return
	var mute := _find("MuteButton") as Button
	restore_sound = mute.text.contains("开")
	if restore_sound and not await _press("MuteButton"): return
	if not (_find("MuteButton") as Button).text.contains("关"): _fail("silent mode indicator"); return
	var chapters := Chapters.new(self)
	for night in range(1, 9):
		if not await _enter_night(night): return
		if night == 1:
			if not await _training_orders() or not await _win(1): return
			continue
		if night == 2:
			if not await _manual_pause(): return
			if not await _probe(str(_state().memory)): return
			for win: Dictionary in _state().windows:
				if win.look != _state().memory: _fail("echo matches old gesture"); return
			if not await _wrong_delivery(true) or not await _wrong_delivery(false): return
		var orders := 3 if night <= 5 else (2 if night == 6 else 0)
		for order in range(1, orders + 1):
			if not await _service_order(night, order): return
		if night == 6 and not await chapters.maintenance(): return
		if night == 7 and not await chapters.signatures(): return
		if night == 8 and not await chapters.clockhall(): return
		if not await _win(night): return
	if not await _press("LogoutButton") or not await _login(): return
	if not await _until(func(): return _profile().get("cleared", []).size() == 8 and _profile().get("bestClean") == 3, 9, "durable campaign on fresh login"): return
	if not has_bank or failure_branches != 2: _fail("missing campaign coverage"); return
	await _capture("16-stamped-roster")
	if not await _replay_first_night(): return
	if restore_sound and not await _press("MuteButton"): return
	await _finish("Night shift playthrough PASS · eight nights, two-probe deduction, cracked tiles, delayed double, recorded gates, three rounds of shutter defense, re-login")

func _finish(message: String) -> void:
	_release_keys()
	var audio: Node = app.get("audio")
	if audio.has_method("shutdown"):
		await audio.call("shutdown")
	app.queue_free()
	await process_frame
	await process_frame
	print(message)
	quit(0)
