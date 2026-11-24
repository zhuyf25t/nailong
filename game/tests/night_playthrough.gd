extends SceneTree

## Black-box campaign test. Decisions use the same rendered cues and geometry as a player.
## A graphical run accepts -- --capture-dir=<directory>. No test endpoints or game state writes.
## Use -- --tutorial-only for the first-night onboarding regression.

var app: Node
var capture_dir := ""
var tutorial_only := false
var focus_night := 0
var halted := false
var last_notice := ""
var campaign_clears: Array[int] = []
var captures_done: Dictionary = {}
var restore_sound := false
var account_name := ""
var account_password := ""
const Chapters = preload("res://tests/night_chapters.gd")
const Relay = preload("res://tests/night_relay.gd")
var relay_driver := Relay.new(self)

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
		elif args[i].begins_with("--relay-focus="):
			focus_night = clampi(args[i].trim_prefix("--relay-focus=").to_int(), 1, 8)
		elif args[i].begins_with("--capture-dir="):
			capture_dir = args[i].trim_prefix("--capture-dir=")
		elif args[i] == "--capture-dir" and i + 1 < args.size():
			capture_dir = args[i + 1]
	if not capture_dir.is_empty():
		root.unfocusable = true
		root.focus_exited.connect(_restore_capture_input)
	call_deferred("_run")

func _restore_capture_input() -> void:
	# Off-screen capture windows never take desktop focus. Another process can
	# still send WM_KILLFOCUS, just as when a player tabs away and clicks back.
	await process_frame
	if is_instance_valid(app) and _page() == "play":
		_click(app.world.world_to_screen(Vector2(240,228)), MOUSE_BUTTON_MIDDLE)

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
		var relay: Dictionary = state.get("story",{}).get("relay",{}) if state.get("story",{}).get("relay") is Dictionary else {}
		if not relay.is_empty():
			print("Last visible relay signals: ", relay.get("events",[]).slice(-5), "; bottles: ", relay.get("bottles",[]))
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
	# Windows can suppress automatic presentation of an off-screen window.
	# Render the current main scene without presenting it on the user's desktop.
	await process_frame
	RenderingServer.force_draw(false)
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
	if not capture_dir.is_empty() and is_instance_valid(app) and _page() == "play" and not app.get("_focused"):
		_click(app.world.world_to_screen(_position()), MOUSE_BUTTON_MIDDLE)
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
	if not await _until(func(): return _ready_button("RulesNextButton") or _ready_button("RulesContinueButton") or _page() == "play", 12, "show rules or start a previously learned shift"): return false
	if _page() != "play":
		if focus_night == 0 and not campaign_clears.is_empty(): return _fail("reader was forced through the rulebook again")
		var headline := _find("RulesPageTitle") as Label
		if headline == null or not headline.is_visible_in_tree() or headline.text.is_empty(): return _fail("missing rulebook heading")
		if not await _press("RulesNextButton") or not await _press("RulesPrevButton"): return false
		for leaf in range(3):
			if not await _press("RulesNextButton"): return false
		if _page() == "play" or not _state().is_empty(): return _fail("rules should precede the first active order")
		if not await _press("RulesContinueButton"): return false
	elif night == 1 and campaign_clears.is_empty() and focus_night == 0:
		return _fail("first-time player entered the shift without seeing the rules")
	return await _until(func():
		return _page() == "play" and _state().get("night", 0) == night and _phase() == "serving",
		12, "start night %d" % night)

func _manual_pause() -> bool:
	if not await _press("RulesButton"): return false
	if not await _until(func(): return _ready_button("RulesContinueButton") and _state().get("paused", false), 5, "authoritative rulebook pause"): return false
	var frozen_tick := int(_state().tick)
	var frozen_pressure := int(_state().pressure)
	var frozen_bottles := JSON.stringify(relay_driver.view().get("bottles", []))
	var initial_ack := int(_state().ack)
	if not await _press("RulesTab2"): return false
	await create_timer(1.2).timeout
	if not await _until(func(): return int(_state().ack) > initial_ack, 2, "fresh paused snapshot from the server"): return false
	if _state().tick != frozen_tick or _state().pressure != frozen_pressure or JSON.stringify(relay_driver.view().get("bottles",[])) != frozen_bottles: return _fail("the clock or conveyor advanced during rulebook review")
	if not await _press("RulesContinueButton"): return false
	if not await _until(func(): return not _state().get("paused", true) and int(_state().tick) > frozen_tick, 5, "closing the rulebook resumes the game"): return false
	print("Night rulebook verified: server clock and pressure frozen at ", frozen_tick, "/", frozen_pressure, ", then resumed")
	return true

func _replay_first_night() -> bool:
	if not await _enter_night(1): return false
	if not await _press("LeaveButton") or not await _press("ConfirmLeaveButton"): return false
	return await _until(func(): return _page() == "roster" and _state().is_empty(), 8, "replay returns to the roster")

func _training_orders() -> bool:
	return await relay_driver.factory_night(1)

func _win(night: int) -> bool:
	if night < 6:
		if _story().get("step") != "clockout_walk" or int(_state().delivered) != 3: return _fail("clockout after three receipts")
		if night == 1:
			if not await _move_to(Vector2(240,260), func(): return _story().get("step") == "fourth_bottle", "punch out and hear the fourth bottle"): return false
			if not await _until(func(): return not _story().get("fourthSounds",[]).is_empty() and int(_story().get("stageTick",0)) >= 13, 4, "the fourth bottle plays this courier's actual recorded sounds"): return false
			await _capture("03-fourth-bottle")
		else:
			if not await _move_to(Vector2(240,260), func(): return _phase() == "won", "win at south exit"): return false
	if not await _until(func(): return _phase() == "won", 30 if night == 1 else 6, "complete this night"): return false
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
	api.changed.connect(relay_driver.observe)
	if api.has_signal("notice"): api.connect("notice", func(msg: String): last_notice = msg)
	if not await _until(func(): return _ready_button("AccountButton"), 5, "title"): return
	await _capture("01-title")
	if not await _review_from_menu("title"): return
	_prepare_badge()
	if not await _login(): return
	if focus_night > 0:
		for completed: int in _profile().get("cleared", []): campaign_clears.append(completed)
	elif _profile().get("unlocked") != 1 or not _profile().get("cleared", []).is_empty(): _fail("fresh profile"); return
	await _capture("02-roster")
	if not await _review_from_menu("roster"): return
	if tutorial_only:
		if not await _enter_night(1) or not await _training_orders() or not await _win(1): return
		if not await _press("LogoutButton") or not await _login() or not await _replay_first_night(): return
		await _finish("Night tutorial playthrough PASS · three physical catches and releases, rebound, fourth bottle and remembered rulebook")
		return
	var mute := _find("MuteButton") as Button
	restore_sound = mute.text.contains("开")
	if restore_sound and not await _press("MuteButton"): return
	if not (_find("MuteButton") as Button).text.contains("关"): _fail("silent mode indicator"); return
	var chapters := Chapters.new(self)
	var first := mini(focus_night, int(_profile().unlocked)) if focus_night > 0 else 1
	var last := focus_night if focus_night > 0 else 8
	for night in range(first, last+1):
		if not await _enter_night(night): return
		if night == 1:
			if not await _training_orders() or not await _win(1): return
			continue
		if night == 2:
			if not await _manual_pause(): return
		if night <= 6 and not await relay_driver.factory_night(night,2 if night == 6 else 3): return
		if night == 6 and not await chapters.maintenance(): return
		if night == 7 and not await chapters.signatures(): return
		if night == 8 and not await chapters.clockhall(): return
		if not await _win(night): return
	if not await _press("LogoutButton") or not await _login(): return
	if focus_night > 0:
		if not _profile().get("cleared",[]).has(focus_night): _fail("focused relay shift did not persist"); return
		if restore_sound and not await _press("MuteButton"): return
		await _finish("Night relay focus PASS · signed night %d and re-read the roster" % focus_night)
		return
	if not await _until(func(): return _profile().get("cleared", []).size() == 8 and _profile().get("bestClean") == 3, 9, "durable campaign on fresh login"): return
	await _capture("16-stamped-roster")
	if not await _replay_first_night(): return
	if restore_sound and not await _press("MuteButton"): return
	await _finish("Night shift playthrough PASS · relay catches and releases, direct/short/lower belts, double bottles, three chapter workstations, eight nights and re-login")

func _prepare_badge() -> void:
	account_password = Crypto.new().generate_random_bytes(15).hex_encode()
	account_name = "试映员" + account_password.left(9)
	if focus_night == 0: return
	# This deliberately named local test badge can revisit a chapter only after
	# playing and signing every preceding shift at this particular QA server.
	var badge := ConfigFile.new()
	var path := "user://relay-qa-%s.cfg" % str(app.api.base_url).sha256_text().left(12)
	if badge.load(path) == OK:
		account_name = str(badge.get_value("qa","name"))
		account_password = str(badge.get_value("qa","secret"))
	else:
		badge.set_value("qa","name",account_name)
		badge.set_value("qa","secret",account_password)
		badge.save(path)

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
