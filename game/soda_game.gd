class_name SodaGame
extends Node

const ARENA_RECT := Rect2(24, 88, 960, 576)
enum Page { LOGIN, LOBBY, MATCH, RESULT, HISTORY }
enum ReturnTo { LOBBY, HISTORY, REMATCH }

var api := SodaApi.new()
var arena := SodaArena.new()
var ui := SodaUI.new()
var _audio := SodaAudio.new()
var page := Page.LOGIN
var _after_leave := ReturnTo.LOBBY
var _mode := "ffa"
var _skin := "dragon"
var _pressed_fire := false
var _focused := true
var _cursor_screen := Vector2(-1, -1)

func _ready() -> void:
	var configured := OS.get_environment("SODA_API_URL").strip_edges().trim_suffix("/")
	if not configured.is_empty():
		api.base_url = configured
	_install_keys()
	add_child(api)
	add_child(_audio)
	add_child(arena)
	arena.position = ARENA_RECT.position
	arena.size = ARENA_RECT.size
	arena.mouse_filter = Control.MOUSE_FILTER_IGNORE
	arena.hide()
	add_child(ui)
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.login_requested.connect(api.login)
	ui.create_requested.connect(_create)
	ui.join_requested.connect(_join)
	ui.leave_requested.connect(func(): _exit_room(ReturnTo.LOBBY))
	ui.history_requested.connect(func(): _exit_room(ReturnTo.HISTORY))
	ui.lobby_requested.connect(func(): _exit_room(ReturnTo.LOBBY))
	ui.logout_requested.connect(api.logout)
	ui.rematch_requested.connect(func(): _exit_room(ReturnTo.REMATCH))
	api.busy_changed.connect(ui.set_busy)
	api.notice.connect(ui.set_notice)
	api.signed_in.connect(func(_nickname: String): _lobby())
	api.session_expired.connect(_login_page)
	api.room_opened.connect(_open_room)
	api.room_left.connect(_room_left)
	api.snapshot.connect(_snapshot)
	api.history_loaded.connect(_history)
	get_window().focus_entered.connect(func(): _focused = true)
	get_window().focus_exited.connect(_blur)
	_login_page()

func _install_keys() -> void:
	var keyboard := {"soda_left": [KEY_A, KEY_LEFT], "soda_right": [KEY_D, KEY_RIGHT],
		"soda_up": [KEY_W, KEY_UP], "soda_down": [KEY_S, KEY_DOWN]}
	for action: String in keyboard:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for code: Key in keyboard[action]:
			var key := InputEventKey.new()
			key.physical_keycode = code
			if not InputMap.action_has_event(action, key):
				InputMap.action_add_event(action, key)

func _login_page() -> void:
	page = Page.LOGIN
	arena.hide()
	ui.show_login()

func _lobby() -> void:
	page = Page.LOBBY
	arena.hide()
	ui.show_lobby(api.nickname)

func _create(mode: String, skin: String) -> void:
	if page != Page.LOBBY and page != Page.RESULT:
		return
	_mode = mode
	_skin = skin
	api.create_room(mode, skin)

func _join(code: String, skin: String) -> void:
	if page == Page.LOBBY:
		_skin = skin
		api.join_room(code, skin)

func _exit_room(destination: ReturnTo) -> void:
	_after_leave = destination
	if not api.room_code.is_empty():
		api.leave()
	else:
		_room_left()

func _room_left() -> void:
	_pressed_fire = false
	_audio.reset()
	arena.reset_match()
	if api.nickname.is_empty():
		_login_page()
		return
	_lobby()
	var destination := _after_leave
	_after_leave = ReturnTo.LOBBY
	if destination == ReturnTo.HISTORY:
		api.fetch_history()
	elif destination == ReturnTo.REMATCH:
		api.create_room(_mode, _skin)

func _open_room(state: SodaState) -> void:
	page = Page.MATCH
	_mode = SodaState.MODES[state.mode]
	_skin = SodaState.SKINS[state.fighters[state.you].skin]
	_after_leave = ReturnTo.LOBBY
	_pressed_fire = false
	_focused = true
	_cursor_screen = get_viewport().get_mouse_position()
	_audio.reset()
	arena.reset_match()
	arena.show()
	ui.show_match(state.code, _mode, state.you)

func _snapshot(state: SodaState) -> void:
	arena.apply_snapshot(state, state.you)
	_audio.update(state)
	if state.result != null:
		page = Page.RESULT
		_pressed_fire = false
		ui.show_result(state, state.you)
	else:
		ui.display_snapshot(state, state.you)

func _history(items: Array[SodaState.History]) -> void:
	page = Page.HISTORY
	arena.hide()
	ui.show_history(items)

func _blur() -> void:
	_focused = false
	_pressed_fire = false
	api.controls.move = Vector2.ZERO
	api.controls.firing = false
	api.controls.fire_pressed = false
	api.controls.reload_pressed = false
	api.controls.dash_pressed = false
	api.controls.shield_pressed = false

func _process(_delta: float) -> void:
	if page != Page.MATCH or api.current == null:
		return
	if not _focused:
		return
	api.controls.move = Input.get_vector("soda_left", "soda_right", "soda_up", "soda_down")
	var world_cursor := (_cursor_screen - ARENA_RECT.position) * Vector2(480, 288) / ARENA_RECT.size
	var direction := world_cursor - arena.local_position()
	if direction.length_squared() > 0.01:
		api.controls.aim = direction.normalized()
	api.controls.firing = _pressed_fire and ARENA_RECT.has_point(_cursor_screen)

func _input(event: InputEvent) -> void:
	if page != Page.MATCH or not _focused:
		return
	if event is InputEventMouseMotion:
		_cursor_screen = event.position
	elif event is InputEventMouseButton:
		_cursor_screen = event.position
		if event.button_index == MOUSE_BUTTON_LEFT:
			_pressed_fire = event.pressed and ARENA_RECT.has_point(event.position)
			if _pressed_fire:
				api.controls.fire_pressed = true
		elif event.button_index == MOUSE_BUTTON_RIGHT and event.pressed and ARENA_RECT.has_point(event.position):
			api.controls.dash_pressed = true
	elif event is InputEventKey and event.pressed and not event.echo:
		var key: Key = event.physical_keycode if event.physical_keycode != 0 else event.keycode
		match key:
			KEY_1: api.controls.weapon = SodaState.Weapon.FOAM
			KEY_2: api.controls.weapon = SodaState.Weapon.STAR
			KEY_3: api.controls.weapon = SodaState.Weapon.PEARL
			KEY_Q: api.controls.shield_pressed = true
			KEY_R: api.controls.reload_pressed = true
