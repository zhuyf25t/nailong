class_name NightApi
extends Node

signal profile_loaded
signal shift_started(view: Dictionary)
signal changed(view: Dictionary)
signal identity_lost
signal shift_lost
signal notice(message: String)
signal busy_changed(busy: bool)

const Wire = preload("res://night/state.gd")
const Intent = preload("res://night/input.gd")
enum Op { IDLE, LOGIN, PROFILE, START, SAMPLE }
const SAMPLE_MS := 50
var base_url := "http://127.0.0.1:8738"
var nickname := ""
var controls := Intent.new()
var current: Dictionary = {}
var profile_data: Dictionary = {}

var _http := HTTPRequest.new()
var _token := ""
var _op := Op.IDLE
var _path := ""
var _body := ""
var _sending := false
var _retry_at := 0
var _retries := 0
var _next_sample := 0
var _seq := 0
var _start_id := ""
var _start_night := 0
var _manual_pause := false

func _ready() -> void:
	var configured := OS.get_environment("SODA_API_URL").strip_edges().trim_suffix("/")
	if not configured.is_empty():
		base_url = configured
	_http.use_threads = true
	_http.timeout = 2.5
	_http.max_redirects = 0
	_http.body_size_limit = 98304
	add_child(_http)
	_http.request_completed.connect(_complete)

static func uuid() -> String:
	var bytes := Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6] & 15) | 64
	bytes[8] = (bytes[8] & 63) | 128
	var hex := bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [hex.left(8), hex.substr(8,4), hex.substr(12,4), hex.substr(16,4), hex.substr(20)]

func login(who: String, password: String) -> void:
	if _op != Op.IDLE:
		return
	var clean := who.strip_edges()
	if clean.is_empty() or clean.length() > 32 or password.length() < 8 or password.length() > 128:
		notice.emit("工牌名需 1–32 个字，口令需 8–128 个字符。")
		return
	_begin(Op.LOGIN, "/v1/sessions", {"name":clean, "password":password})

func refresh_profile() -> void:
	if _op == Op.IDLE and not _token.is_empty():
		_begin(Op.PROFILE, "/v1/night/profile")

func start(night: int) -> void:
	if _op != Op.IDLE or _token.is_empty():
		return
	if night < 1 or night > int(profile_data.get("unlocked", 0)):
		notice.emit("先完成前一夜，再来这里打卡。")
		return
	if night != _start_night or _start_id.is_empty():
		_start_night = night
		_start_id = uuid()
	_begin(Op.START, "/v1/night/start", {"night":night,"requestId":_start_id})

func stop_run() -> void:
	if _op == Op.SAMPLE:
		_cancel()
	controls.release_all()
	current = {}
	_manual_pause = false
	_start_id = ""
	_seq = 0

func set_manual_pause(value: bool) -> void:
	controls.release_all()
	_manual_pause = value
	_next_sample = 0

func logout() -> void:
	_cancel()
	stop_run()
	_token = ""
	nickname = ""
	profile_data = {}

func _cancel() -> void:
	_http.cancel_request()
	_sending = false
	_op = Op.IDLE
	_body = ""
	_retry_at = 0
	busy_changed.emit(false)

func _process(_delta: float) -> void:
	var now := Time.get_ticks_msec()
	if _op != Op.IDLE:
		if not _sending and now >= _retry_at:
			_send()
		return
	if current.is_empty() or Wire.terminal(current) or now < _next_sample:
		return
	var paused: bool = current.paused
	_next_sample = now + (1000 if paused and _manual_pause else SAMPLE_MS)
	var sample := controls.sample(_seq)
	if _manual_pause or paused:
		sample.mx = 0.0
		sample.my = 0.0
		sample.action = ("pause" if _manual_pause else "resume") if paused != _manual_pause else "none"
	_begin(Op.SAMPLE, "/v1/night/run/%s/input" % current.runId, sample)

func _begin(op: Op, path: String, payload: Dictionary = {}) -> void:
	_op = op
	_path = path
	_body = "" if payload.is_empty() else JSON.stringify(payload)
	_retries = 0
	if op != Op.SAMPLE:
		busy_changed.emit(true)
	_send()

func _send() -> void:
	var headers := PackedStringArray(["Content-Type: application/json","Accept: application/json"])
	if _op != Op.LOGIN:
		headers.append("Authorization: Bearer " + _token)
	var method := HTTPClient.METHOD_GET if _body.is_empty() else HTTPClient.METHOD_POST
	_sending = true
	var e := _http.request(base_url + _path, headers, method, _body)
	if e != OK:
		_sending = false
		_network_failure()

func _network_failure() -> void:
	if _retries < 3:
		_retries += 1
		_retry_at = Time.get_ticks_msec() + 250 * _retries
		if _retries == 1:
			notice.emit("交班台暂时失联，正在重连…")
		return
	var previous := _op
	_finish()
	if previous == Op.SAMPLE:
		stop_run()
		shift_lost.emit()
	notice.emit("无法连接交班服务器。请检查本机服务后再试。")

func _finish() -> void:
	var previous := _op
	_op = Op.IDLE
	_sending = false
	_body = ""
	if previous != Op.SAMPLE:
		busy_changed.emit(false)

func _complete(result: int, status: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if _op == Op.IDLE:
		return
	_sending = false
	if result != HTTPRequest.RESULT_SUCCESS or status >= 500:
		_network_failure()
		return
	var kind := _op
	var raw: Variant = JSON.parse_string(body.get_string_from_utf8())
	_finish()
	if status < 200 or status >= 300:
		_failure(kind, status, raw)
		return
	if _retries > 0:
		notice.emit("")
	match kind:
		Op.LOGIN:
			if typeof(raw) != TYPE_DICTIONARY or not Wire.valid_token(raw.get("token")) or typeof(raw.get("name")) != TYPE_STRING or raw.name.length() not in range(1,33):
				_failure(kind, 502, null)
				return
			_token = raw.token
			nickname = raw.name
			refresh_profile()
		Op.PROFILE:
			var decoded := Wire.profile(raw)
			if decoded.is_empty():
				_failure(kind, 502, null)
				return
			profile_data = decoded
			profile_loaded.emit()
		Op.START, Op.SAMPLE:
			var view := Wire.snapshot(raw)
			if view.is_empty() or (kind == Op.START and view.night != _start_night):
				_failure(kind, 502, null)
				return
			if kind == Op.SAMPLE and (current.is_empty() or view.runId != current.runId or view.tick < current.tick or view.ack < _seq):
				_failure(kind, 502, null)
				return
			if kind == Op.START or (not current.is_empty() and (view.order != current.order or view.phase != current.phase)):
				controls.release_all()
			current = view
			_seq = view.ack + 1
			if kind == Op.START:
				_start_id = ""
				_manual_pause = false
				_next_sample = Time.get_ticks_msec()
				shift_started.emit(view)
			changed.emit(view)

func _failure(kind: Op, status: int, body: Variant) -> void:
	var message := "交班台数据与游戏版本不匹配。" if status == 502 else "交班台退回请求（%d）。" % status
	if typeof(body) == TYPE_DICTIONARY and typeof(body.get("message")) == TYPE_STRING:
		message = str(body.message).left(160)
	if status == 401 and kind != Op.LOGIN:
		logout()
		identity_lost.emit()
	elif kind == Op.SAMPLE:
		stop_run()
		shift_lost.emit()
	elif kind == Op.START:
		_start_id = ""
	notice.emit(message)
