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


func _run() -> void:
	base_url = OS.get_environment("SODA_API_URL")
	var scene: PackedScene = load("res://main.tscn")
	if scene == null:
		_fail("missing main scene")
		return
	if load("res://assets/night/title.png") == null:
		_fail("title art not packaged")
		return
	root.add_child(scene.instantiate())
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
	print("Distribution check PASS: packed main scene, authentication, three real deliveries, saved unlock.")
	quit(0)
