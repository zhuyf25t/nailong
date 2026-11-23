class_name SodaApi
extends Node

signal signed_in(nickname: String)
signal room_opened(state: SodaState)
signal snapshot(state: SodaState)
signal room_left
signal history_loaded(items: Array[SodaState.History])
signal session_expired
signal notice(message: String)
signal busy_changed(busy: bool)

enum Op { IDLE, LOGIN, CREATE, JOIN, INPUT, LEAVE, HISTORY }

const SAMPLE_INTERVAL := 0.05
var base_url := "http://127.0.0.1:8737"
var controls := SodaInput.new()
var room_code := ""
var nickname := ""
var current: SodaState
var _token := ""
var _http := HTTPRequest.new()
var _op := Op.IDLE
var _path := ""
var _body := ""
var _method := HTTPClient.METHOD_GET
var _outstanding := false
var _sequence := 0
var _sample_at := 0.0
var _retry_in := 0.0
var _retries := 0
var _leaving := false
var _reconnecting := false
var _room_retry_key := ""
var _room_request_id := ""

func _ready() -> void:
	_http.use_threads = true
	_http.timeout = 2.5
	_http.max_redirects = 0
	_http.body_size_limit = 524288
	add_child(_http)
	_http.request_completed.connect(_completed)

static func uuid() -> String:
	var raw := Crypto.new().generate_random_bytes(16)
	raw[6] = (raw[6] & 15) | 64
	raw[8] = (raw[8] & 63) | 128
	var hex := raw.hex_encode()
	return "%s-%s-%s-%s-%s" % [hex.left(8), hex.substr(8, 4), hex.substr(12, 4), hex.substr(16, 4), hex.substr(20)]

static func _valid_token(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != 43:
		return false
	for ch: String in str(value):
		if not ch in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_":
			return false
	return true

func _request_id(key: String) -> String:
	if _room_retry_key != key:
		_room_retry_key = key
		_room_request_id = uuid()
	return _room_request_id

func login(player: String, password: String) -> void:
	if _op != Op.IDLE:
		return
	var user := player.strip_edges()
	if user.is_empty() or user.length() > 32 or password.length() < 8 or password.length() > 128:
		notice.emit("昵称需 1–32 个字，口令需 8–128 个字。")
		return
	_begin(Op.LOGIN, "/v1/sessions", {"name": user, "password": password})

func create_room(mode: String, skin: String) -> void:
	if _op != Op.IDLE or _token.is_empty() or not room_code.is_empty():
		return
	if not mode in SodaState.MODES or not skin in SodaState.SKINS:
		notice.emit("请选择有效的模式和角色。")
		return
	_begin(Op.CREATE, "/v1/rooms", {"requestId": _request_id("create:" + mode + ":" + skin), "mode": mode, "skin": skin})

func join_room(code: String, skin: String) -> void:
	if _op != Op.IDLE or _token.is_empty() or not room_code.is_empty():
		return
	var normalized := code.strip_edges().to_upper()
	if not SodaState.valid_code(normalized) or not skin in SodaState.SKINS:
		notice.emit("请输入 6 位房间码，再选一位选手。")
		return
	_begin(Op.JOIN, "/v1/rooms/" + normalized + "/join", {"requestId": _request_id("join:" + normalized + ":" + skin), "skin": skin})

func fetch_history() -> void:
	if _op == Op.IDLE and not _token.is_empty():
		_begin(Op.HISTORY, "/v1/history", {}, HTTPClient.METHOD_GET)

func leave() -> void:
	if room_code.is_empty() or _leaving:
		return
	_leaving = true
	busy_changed.emit(true)
	if _op == Op.INPUT and not _outstanding:
		_clear_request()
	_pump()

func logout() -> void:
	if not room_code.is_empty() or _outstanding:
		return
	_token = ""
	nickname = ""
	_room_retry_key = ""
	_clear_request()
	session_expired.emit()

func _begin(kind: Op, path: String, data: Dictionary, method := HTTPClient.METHOD_POST) -> void:
	_op = kind
	_path = path
	_body = JSON.stringify(data) if method == HTTPClient.METHOD_POST else ""
	_method = method
	_retries = 0
	_retry_in = 0
	if kind != Op.INPUT:
		busy_changed.emit(true)
	_dispatch()

func _dispatch() -> void:
	var headers := PackedStringArray(["Accept: application/json", "Content-Type: application/json"])
	if not _token.is_empty():
		headers.append("Authorization: Bearer " + _token)
	_outstanding = true
	if _http.request(base_url + _path, headers, _method, _body) != OK:
		_completed(HTTPRequest.RESULT_CANT_CONNECT, 0, PackedStringArray(), PackedByteArray())

func _process(delta: float) -> void:
	_sample_at -= delta
	_retry_in -= delta
	_pump()

func _pump() -> void:
	if _outstanding:
		return
	if _op != Op.IDLE:
		if _retry_in <= 0:
			_dispatch()
	elif _leaving and not room_code.is_empty():
		_begin(Op.LEAVE, "/v1/rooms/" + room_code + "/leave", {})
	elif not room_code.is_empty() and current != null and current.result == null and _sample_at <= 0:
		_sample_at = SAMPLE_INTERVAL
		_begin(Op.INPUT, "/v1/rooms/" + room_code + "/input", {"seq": _sequence, "input": controls.sample()})

func _clear_request() -> void:
	_op = Op.IDLE
	_path = ""
	_body = ""
	_retries = 0
	_outstanding = false
	_retry_in = 0

func _clear_room() -> void:
	room_code = ""
	current = null
	_leaving = false
	_reconnecting = false
	_sequence = 0
	controls = SodaInput.new()

func _completed(result: int, status: int, _headers: PackedStringArray, raw: PackedByteArray) -> void:
	_outstanding = false
	var kind := _op
	if kind == Op.IDLE:
		return
	if result != HTTPRequest.RESULT_SUCCESS or status >= 500 or status == 429:
		if kind == Op.INPUT and _leaving:
			_clear_request()
			_pump()
			return
		if kind != Op.LOGIN and (kind == Op.INPUT or _retries < 3):
			_retries += 1
			_retry_in = minf(1.5, 0.16 * pow(2.0, mini(_retries, 4)))
			if not _reconnecting:
				notice.emit("连接暂时中断，正在重试…")
			_reconnecting = true
			return
		_clear_request()
		busy_changed.emit(false)
		if kind == Op.LEAVE:
			_clear_room()
			room_left.emit()
		notice.emit("未连接到竞技场服务，请检查本机服务后重试。")
		return
	var data: Variant = JSON.parse_string(raw.get_string_from_utf8())
	_reconnecting = false
	_clear_request()
	if kind != Op.INPUT:
		busy_changed.emit(false)
	if status < 200 or status >= 300:
		_failed(kind, status, data)
		return
	match kind:
		Op.LOGIN:
			if typeof(data) != TYPE_DICTIONARY or not _valid_token(data.get("token")) or typeof(data.get("name")) != TYPE_STRING or data.name.is_empty() or data.name.length() > 32:
				_bad_wire()
				return
			_token = data.token
			nickname = data.name
			signed_in.emit(nickname)
		Op.CREATE, Op.JOIN, Op.INPUT:
			var state := SodaState.decode(data)
			if state == null or (kind == Op.INPUT and (state.code != room_code or state.match_id != current.match_id or state.you != current.you or state.ack < _sequence)):
				_bad_wire()
				return
			room_code = state.code
			current = state
			_sequence = state.ack + 1
			if kind != Op.INPUT:
				_room_retry_key = ""
				controls = SodaInput.new()
				room_opened.emit(state)
			snapshot.emit(state)
		Op.LEAVE:
			if typeof(data) != TYPE_DICTIONARY or typeof(data.get("left")) != TYPE_BOOL or not data.left:
				_bad_wire()
				return
			_clear_room()
			room_left.emit()
		Op.HISTORY:
			if typeof(data) != TYPE_DICTIONARY or typeof(data.get("matches")) != TYPE_ARRAY or data.matches.size() > 20:
				_bad_wire()
				return
			var rows: Array[SodaState.History] = []
			for value: Variant in data.matches:
				var entry := SodaState.decode_history(value)
				if entry == null:
					_bad_wire()
					return
				rows.append(entry)
			history_loaded.emit(rows)

func _bad_wire() -> void:
	if not room_code.is_empty():
		_clear_room()
		room_left.emit()
	notice.emit("竞技场数据不兼容，请检查本机服务与游戏版本。")

func _failed(kind: Op, status: int, body: Variant) -> void:
	var reason := "请求失败（%d）" % status
	if typeof(body) == TYPE_DICTIONARY and typeof(body.get("message")) == TYPE_STRING:
		reason = str(body.message).left(150)
	if status == 401 and kind != Op.LOGIN:
		_clear_room()
		_token = ""
		nickname = ""
		session_expired.emit()
	if kind == Op.INPUT or kind == Op.LEAVE:
		_clear_room()
		room_left.emit()
	if kind == Op.JOIN or kind == Op.CREATE:
		_room_retry_key = ""
	notice.emit(reason)
