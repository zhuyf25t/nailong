extends SceneTree

const Wire = preload("res://night/state.gd")

# Exercise the packaged project and a real three-delivery shift against its
# bundled JVM/PostgreSQL. This account exists only in the verification profile.
var http := HTTPRequest.new()
var token := ""
var base_url := ""
var failed := false


func _initialize() -> void:
	call_deferred("_run")


func _request(path: String, payload: Variant = null) -> Dictionary:
	if failed:
		return {}
	var headers := PackedStringArray(["Content-Type: application/json"])
	if not token.is_empty():
		headers.append("Authorization: Bearer " + token)
	var method := HTTPClient.METHOD_GET if payload == null else HTTPClient.METHOD_POST
	var body := "" if payload == null else JSON.stringify(payload)
	if http.request(base_url + path, headers, method, body) != OK:
		_fail("could not start request")
		return {}
	var result: Array = await http.request_completed
	var data: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	if result[0] != HTTPRequest.RESULT_SUCCESS or int(result[1]) < 200 or int(result[1]) >= 300 or typeof(data) != TYPE_DICTIONARY:
		_fail("request failed: %s HTTP %s" % [path, result[1]])
		return {}
	return data


func _fail(reason: String) -> void:
	failed = true
	push_error("Distribution check failed: " + reason)
	quit(1)


func _uuid() -> String:
	var data := Crypto.new().generate_random_bytes(16)
	data[6] = (data[6] & 15) | 64
	data[8] = (data[8] & 63) | 128
	var s := data.hex_encode()
	return "%s-%s-%s-%s-%s" % [s.substr(0, 8), s.substr(8, 4), s.substr(12, 4), s.substr(16, 4), s.substr(20)]


func _wait_until(predicate: Callable) -> bool:
	var until := Time.get_ticks_msec() + 10000
	while not predicate.call():
		if Time.get_ticks_msec() >= until:
			return false
		await create_timer(0.035).timeout
	return true


func _activate(client: Node, name_of_button: String) -> bool:
	var button := client.find_child(name_of_button, true, false) as BaseButton
	if button == null or not button.is_visible_in_tree() or button.disabled:
		return false
	button.pressed.emit()
	return true


func _check_rules_and_training(client: Node, account: String, password: String) -> bool:
	var api: Node = client.get("api")
	api.call("login", account, password)
	if not await _wait_until(func(): return client.get("page") == "roster"):
		return false
	if not _activate(client, "Night1"):
		return false
	await process_frame
	if not _activate(client, "StartButton"):
		return false
	if not await _wait_until(func(): return client.find_child("RulesManual", true, false) != null):
		return false
	var heading := client.find_child("RulesPageTitle", true, false) as Label
	var accept := client.find_child("RulesContinueButton", true, false) as Button
	var no_shift: Dictionary = api.get("current")
	if not no_shift.is_empty() or heading == null or "第一夜" not in heading.text or accept == null or "开始试工" not in accept.text:
		return false
	for tab in [2,3,4,1]:
		if not _activate(client, "RulesTab%d" % tab):
			return false
		await process_frame
	if not _activate(client, "RulesContinueButton"):
		return false
	if not await _wait_until(func(): return not (api.get("current") as Dictionary).is_empty() and client.get("page") == "play"):
		return false
	var ui: Control = client.get("ui")
	var instruction := ui.find_child("TaskValue", true, false) as Label
	var objective := ui.find_child("PhaseValue", true, false) as Label
	var counter := ui.find_child("OrderValue", true, false) as Label
	var inspection := ui.find_child("InspectionRecord", true, false) as CanvasItem
	var pressure := ui.find_child("PressureGauge", true, false) as CanvasItem
	var lever_note := ui.find_child("IdleLeverNote", true, false) as Label
	var valid := instruction != null and instruction.is_visible_in_tree() and "2 号窗" in instruction.text \
		and "左键" in instruction.text and objective != null and objective.text == "送第 1 瓶" \
		and counter != null and counter.text == "0 / 3" and inspection != null \
		and not inspection.is_visible_in_tree() and pressure != null and not pressure.is_visible_in_tree() \
		and lever_note != null and lever_note.is_visible_in_tree() and "平时不用" in lever_note.text
	if not valid or not _activate(client, "RulesButton"):
		return false
	if not await _wait_until(func(): return (api.get("current") as Dictionary).get("paused", false)):
		return false
	var paused: Dictionary = api.get("current")
	var run_path := "/v1/night/run/%s" % paused.runId
	await create_timer(0.35).timeout
	var server_copy := await _request(run_path)
	if failed or not server_copy.get("paused", false) or int(server_copy.get("tick",-1)) != int(paused.tick):
		return false
	if not _activate(client, "RulesContinueButton"):
		return false
	if not await _wait_until(func(): return not (api.get("current") as Dictionary).get("paused", true)):
		return false
	api.call("logout")
	return true


func _run() -> void:
	# The first-time rules flag belongs to the actual player. Exercise it in
	# a disposable Godot profile even if the user has the real game open.
	ProjectSettings.set_setting("application/config/use_custom_user_dir", true)
	ProjectSettings.set_setting("application/config/custom_user_dir_name", "OnlyThreeOnShift-PackVerification")
	var test_dir := ProjectSettings.globalize_path("user://").trim_suffix("/")
	if test_dir.get_file() != "OnlyThreeOnShift-PackVerification" or DirAccess.make_dir_recursive_absolute(test_dir) != OK:
		_fail("could not isolate the first-time UI profile")
		return
	var options := test_dir.path_join("night-options.cfg")
	if FileAccess.file_exists(options) and DirAccess.remove_absolute(options) != OK:
		_fail("could not reset the test-only rules flag")
		return
	base_url = OS.get_environment("SODA_API_URL")
	var scene: PackedScene = load("res://main.tscn")
	if scene == null:
		_fail("missing main scene")
		return
	if load("res://assets/night/title.png") == null:
		_fail("title art not packaged")
		return
	var client := scene.instantiate()
	root.add_child(client)
	root.add_child(http)
	http.timeout = 5.0
	var account := OS.get_environment("NIGHT_VERIFY_ACCOUNT")
	var password := OS.get_environment("NIGHT_VERIFY_PASSWORD")
	if account.is_empty() or password.is_empty():
		_fail("test credentials were not provided by the launcher")
		return
	var login: Dictionary = await _request("/v1/sessions", {"name":account,"password":password})
	if failed:
		return
	token = str(login.get("token", ""))
	if not await _check_rules_and_training(client, account, password):
		_fail("failed first-time rules, four pages, first-shift targets or live pause/resume")
		return
	var profile := Wire.profile(await _request("/v1/night/profile"))
	if failed:
		return
	if OS.get_environment("NIGHT_VERIFY_EXISTING") == "1" and 1 not in profile.get("cleared", []):
		_fail("completed shift was lost between launches")
		return
	var view: Dictionary = await _request("/v1/night/start", {"night":1,"requestId":_uuid()})
	if failed:
		return
	var endpoint := "/v1/night/run/%s/input" % view.get("runId", "")
	var fired_order := 0
	var seq := 0
	var deadline := Time.get_ticks_msec() + 30000
	while Time.get_ticks_msec() < deadline and not failed:
		var phase := str(view.get("phase", ""))
		if phase == "won":
			break
		if phase not in ["serving","clockout"]:
			_fail("unexpected phase: " + phase)
			return
		var action := "none"
		var dy := 0
		if phase == "serving" and int(view.get("order", 0)) > fired_order:
			fired_order = int(view.order)
			action = "throw"
		elif phase == "clockout":
			dy = 1
		view = await _request(endpoint, {"seq":seq,"mx":0,"my":dy,"ax":0,"ay":-1,"action":action})
		seq += 1
		await create_timer(0.07).timeout
	if failed:
		return
	if view.get("phase", "") != "won":
		_fail("the deliveries did not finish")
		return
	profile = Wire.profile(await _request("/v1/night/profile"))
	if failed:
		return
	if 1 not in profile.get("cleared", []) or int(profile.get("unlocked", 0)) < 2:
		_fail("the result was not saved: %s" % str(profile))
		return
	print("Distribution check PASS: mandatory rules, four pages, server pause/resume, first-shift instructions, three real deliveries, saved unlock.")
	quit(0)
