extends "res://tests/night_playthrough.gd"

const RelayAudio = preload("res://night/relay_sound.gd")
var _saw_catch_prompt := false
var _saw_release_prompt := false

# Use the same physical inputs, route and win checks as the full campaign.
# Stable credentials let the second process verify the unlock persisted on disk.
func _initialize() -> void:
	ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
	ProjectSettings.set_setting("application/config/custom_user_dir_name", "OnlyThreeOnShift-PackVerification")
	var test_dir := ProjectSettings.globalize_path("user://").trim_suffix("/")
	if test_dir.get_file() != "OnlyThreeOnShift-PackVerification" or DirAccess.make_dir_recursive_absolute(test_dir) != OK:
		call_deferred("_fail", "could not isolate the verification preferences")
		return
	var options := test_dir.path_join("night-options.cfg")
	if FileAccess.file_exists(options) and DirAccess.remove_absolute(options) != OK:
		call_deferred("_fail", "could not reset the test-only rules flag")
		return
	call_deferred("_run")


func _check_pack() -> bool:
	if str(ProjectSettings.get_setting("application/config/version", "")) != "4.0":
		return _fail("the packaged game does not advertise the v4 return-line release")
	var inventory: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://night-package-files.json"))
	if not inventory is Array or inventory.is_empty():
		return _fail("missing exported file inventory")
	for item: Variant in inventory:
		var path := str(item)
		if ResourceLoader.exists(path):
			if ResourceLoader.load(path) != null:
				continue
		elif path.get_extension().to_lower() in ["json", "csv", "txt", "srt"] and FileAccess.file_exists(path):
			continue
		return _fail("could not open packaged game resource: " + path)
	for clip: String in RelayAudio.CLIPS:
		if not ResourceLoader.exists("res://assets/night/audio/%s.wav" % clip, "AudioStreamWAV"):
			return _fail("missing sound used by the return line: " + clip)
	print("Opened ", inventory.size(), " packaged client assets, scenes and scripts.")
	return true


func _check_relay_manual() -> bool:
	if not await _press("RulesButton"):
		return false
	if not await _until(func(): return _ready_button("RulesContinueButton") and _state().get("paused", false), 8, "open the manual and pause the return line"):
		return false
	var paused_tick := int(_state().tick)
	var paused_ack := int(_state().ack)
	var frozen: Dictionary = _story().relay.duplicate(true)
	for page in [2, 3, 4, 1]:
		if not await _press("RulesTab%d" % page):
			return false
		var number := _find("RulesPageNumber") as Label
		if number == null or str(page) not in number.text:
			return _fail("the displayed rules page did not change")
	if not await _until(func(): return int(_state().ack) > paused_ack, 4, "fresh server snapshot while reading"):
		return false
	if int(_state().tick) != paused_tick or frozen != _story().relay:
		return _fail("the conveyor moved while the manual was open")
	if not await _press("RulesContinueButton"):
		return false
	return await _until(func(): return not _state().get("paused", true) and int(_state().tick) > paused_tick, 5, "resume the return line")


func _observe_ticket() -> void:
	var key := _find("RelayKey") as Label
	if key != null and key.is_visible_in_tree():
		_saw_catch_prompt = _saw_catch_prompt or key.text == "现在按住左键"
		_saw_release_prompt = _saw_release_prompt or key.text == "瞄准后松开左键"


func _run() -> void:
	if not _check_pack():
		return
	var scene := load("res://main.tscn") as PackedScene
	if scene == null:
		_fail("missing main scene")
		return
	app = scene.instantiate()
	root.add_child(app)
	await process_frame
	app.get("api").connect("notice", func(msg: String): last_notice = msg)
	account_name = OS.get_environment("NIGHT_VERIFY_ACCOUNT")
	account_password = OS.get_environment("NIGHT_VERIFY_PASSWORD")
	if account_name.is_empty() or account_password.is_empty():
		_fail("test credentials were not provided by the launcher")
		return
	if not await _login():
		return
	var cleared: Array = _profile().get("cleared", [])
	if OS.get_environment("NIGHT_VERIFY_EXISTING") == "1" and 1 not in cleared:
		_fail("completed return-line shift was lost after relaunch")
		return
	if not await _enter_night(1):
		return
	if not _story().get("relay") is Dictionary or (_story().relay as Dictionary).is_empty():
		_fail("this is not the return-line campaign")
		return
	var first_step := _find("RelayStep") as Label
	if first_step == null or not first_step.is_visible_in_tree() or first_step.text != "走到接瓶圈":
		_fail("first-shift ticket does not show where to intercept the bottle")
		return
	if not await _until(_has_caption, 4, "visible opening Chinese caption and speaker"):
		return
	if not await _check_relay_manual():
		return
	process_frame.connect(_observe_ticket)
	if not await _training_orders():
		return
	process_frame.disconnect(_observe_ticket)
	if not _saw_catch_prompt or not _saw_release_prompt:
		_fail("the new courier did not see both catch and release instructions")
		return
	if not await _win(1):
		return
	await _finish("Distribution check PASS: relay-v4, resources, four rules pages, Chinese captions, frozen conveyor, physical catch and release, return catch, saved unlock.")
