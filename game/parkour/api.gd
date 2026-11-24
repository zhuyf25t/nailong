class_name ParkourApi
extends Node

signal started(rooms: Array, view: Dictionary)
signal changed(view: Dictionary)
signal failed(message: String)
signal status(text: String)

const Intent = preload("res://parkour/input.gd")
const SAMPLE_MS := 50

var base_url := "http://127.0.0.1:8739"
var controls := Intent.new()
var current: Dictionary = {}
var rooms: Array = []

var _http := HTTPRequest.new()
var _token := ""
var _op := "idle"
var _path := ""
var _body := ""
var _sending := false
var _retry_at := 0
var _retries := 0
var _next := 0
var _seq := 0
var _start_id := ""
var _start_after_login := false
var _restart_wanted := false

func _ready() -> void:
	var configured := OS.get_environment("SODA_API_URL").strip_edges().trim_suffix("/")
	if not configured.is_empty():
		base_url = configured
	_http.use_threads = true
	_http.timeout = 3.0
	_http.max_redirects = 0
	_http.body_size_limit = 262144
	add_child(_http)
	_http.request_completed.connect(_complete)

static func uuid() -> String:
	var bytes := Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6] & 15) | 64
	bytes[8] = (bytes[8] & 63) | 128
	var hex := bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [hex.left(8), hex.substr(8,4), hex.substr(12,4), hex.substr(16,4), hex.substr(20)]

func card_path() -> String:
	return "user://parkour-card.cfg"

func _card() -> Dictionary:
	var cfg := ConfigFile.new()
	if FileAccess.file_exists(card_path()) and cfg.load(card_path()) == OK:
		var name := str(cfg.get_value("card", "name", ""))
		var secret := str(cfg.get_value("card", "secret", ""))
		if not name.is_empty() and secret.length() >= 8:
			return {"name": name, "secret": secret}
	var fresh := {
		"name": "不连续的存在·" + uuid().replace("-", "").left(8),
		"secret": Crypto.new().generate_random_bytes(30).hex_encode(),
	}
	cfg.set_value("card", "name", fresh.name)
	cfg.set_value("card", "secret", fresh.secret)
	cfg.save(card_path())
	return fresh

func connect_and_start() -> void:
	if _op != "idle":
		return
	_start_after_login = true
	if _token.is_empty():
		_login()
	else:
		_start()

func restart() -> void:
	if _op == "idle":
		_start()
	else:
		_restart_wanted = true

func kick() -> void:
	_next = 0

func stop_run() -> void:
	controls.clear()
	current = {}
	rooms = []
	_seq = 0
	_next = 0

func _login() -> void:
	var card := _card()
	_begin("login", "/v1/sessions", {"name": card.name, "password": card.secret})
	status.emit("正在领取本机工牌…")

func _start() -> void:
	if _op != "idle":
		return
	_restart_wanted = false
	_start_id = uuid()
	_begin("start", "/v1/parkour/start", {"requestId": _start_id})
	status.emit("正在进入不连续的存在…")

func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec()
	if _op != "idle":
		if not _sending and now >= _retry_at:
			_send()
		return
	if _restart_wanted:
		_start()
		return
	if current.is_empty():
		return
	if now < _next:
		return
	_next = now + SAMPLE_MS
	var sample := controls.sample(_seq)
	_begin("sample", "/v1/parkour/run/%s/input" % current.runId, sample)

func _begin(op: String, path: String, payload: Dictionary) -> void:
	_op = op
	_path = path
	_body = JSON.stringify(payload)
	_retries = 0
	_send()

func _send() -> void:
	var headers := PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if not _token.is_empty():
		headers.append("Authorization: Bearer " + _token)
	_sending = true
	var e := _http.request(base_url + _path, headers, HTTPClient.METHOD_POST, _body)
	if e != OK:
		_sending = false
		_network_failure()

func _finish() -> void:
	_op = "idle"
	_sending = false
	_body = ""

func _network_failure() -> void:
	if _retries < 3:
		_retries += 1
		_retry_at = Time.get_ticks_msec() + 250 * _retries
		return
	var previous := _op
	_finish()
	if previous == "sample":
		stop_run()
		failed.emit("连接中断。请确认本机服务仍在运行。")
	else:
		failed.emit("无法连接本机服务。请稍后再试。")

func _complete(result: int, status_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _op == "idle":
		return
	_sending = false
	if result != HTTPRequest.RESULT_SUCCESS or status_code >= 500:
		_network_failure()
		return
	var kind := _op
	var raw: Variant = JSON.parse_string(body.get_string_from_utf8())
	if kind == "sample" and status_code == 409 and typeof(raw) == TYPE_DICTIONARY and raw.get("code") == "input_queue_full":
		_retry_at = Time.get_ticks_msec() + SAMPLE_MS
		return
	_finish()
	if status_code < 200 or status_code >= 300:
		var message := "服务器拒绝了请求（%d）。" % status_code
		if typeof(raw) == TYPE_DICTIONARY and typeof(raw.get("message")) == TYPE_STRING:
			message = str(raw.message).left(160)
		if status_code == 401:
			_token = ""
		failed.emit(message)
		return
	match kind:
		"login":
			if typeof(raw) != TYPE_DICTIONARY or typeof(raw.get("token")) != TYPE_STRING:
				failed.emit("工牌响应不完整。")
				return
			_token = str(raw.token)
			if _start_after_login:
				_start()
		"start":
			if typeof(raw) != TYPE_DICTIONARY or typeof(raw.get("rooms")) != TYPE_ARRAY or typeof(raw.get("view")) != TYPE_DICTIONARY:
				failed.emit("开局数据不完整。")
				return
			rooms = raw.rooms
			current = raw.view
			_seq = int(current.get("ack", -1)) + 1
			_next = Time.get_ticks_msec()
			_start_id = ""
			started.emit(rooms, current)
		"sample":
			if typeof(raw) != TYPE_DICTIONARY or str(raw.get("runId", "")) != str(current.get("runId", "")):
				stop_run()
				failed.emit("对局数据不匹配。")
				return
			current = raw
			_seq = int(raw.get("ack", _seq - 1)) + 1
			changed.emit(current)
