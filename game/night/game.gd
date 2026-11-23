class_name NightGame
extends Node

const Api = preload("res://night/api.gd")
const Wire = preload("res://night/state.gd")
const Factory = preload("res://night/world.gd")
const FrontDesk = preload("res://night/ui.gd")
const Sound = preload("res://night/sound.gd")
const FACTORY_BOUNDS := Rect2(0, 0, 480, 288)

var api := Api.new()
var world := Factory.new()
var ui := FrontDesk.new()
var audio := Sound.new()
var page := "title"
var _focused := true
var _closing := false
var _cursor := Vector2(-1, -1)
var _guest := ConfigFile.new()
var _guest_saved := false
var _guest_path := ""
var _settings := ConfigFile.new()
const OPTIONS_PATH := "user://night-options.cfg"

func _ready() -> void:
	add_child(api)
	add_child(audio)
	add_child(ui)
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.guest_requested.connect(_use_guest)
	ui.login_requested.connect(api.login)
	ui.start_requested.connect(_start)
	ui.roster_requested.connect(_roster)
	ui.leave_requested.connect(_roster)
	ui.logout_requested.connect(_logout)
	ui.mute_requested.connect(_mute)
	api.notice.connect(ui.set_notice)
	api.busy_changed.connect(ui.set_busy)
	api.identity_lost.connect(_title)
	api.shift_lost.connect(_roster)
	api.profile_loaded.connect(_on_profile)
	api.shift_started.connect(_enter)
	api.changed.connect(_on_view)
	get_window().focus_entered.connect(func(): _focused = true)
	get_window().focus_exited.connect(_blur)
	get_tree().auto_accept_quit = false
	get_window().close_requested.connect(_close)
	_install_movement()
	_guest_path = "user://night-guest-%s.cfg" % api.base_url.sha256_text().left(12)
	if FileAccess.file_exists(_guest_path):
		_guest_saved = _guest.load(_guest_path) == OK
	if FileAccess.file_exists(OPTIONS_PATH):
		_settings.load(OPTIONS_PATH)
	var muted := bool(_settings.get_value("audio", "muted", false))
	audio.set_muted(muted)
	ui.set_muted(muted)
	_title()

func _exit_tree() -> void:
	# The window dock detaches this reusable control on menu screens.
	if is_instance_valid(world) and world.get_parent() == null:
		world.free()

func _close() -> void:
	if _closing:
		return
	_closing = true
	_blur()
	api.stop_run()
	await audio.shutdown()
	if is_inside_tree():
		get_tree().quit()

func _install_movement() -> void:
	var keymap := {"night_left":[KEY_A,KEY_LEFT],"night_right":[KEY_D,KEY_RIGHT],
		"night_up":[KEY_W,KEY_UP],"night_down":[KEY_S,KEY_DOWN]}
	for command: String in keymap:
		if not InputMap.has_action(command):
			InputMap.add_action(command)
		for code: Key in keymap[command]:
			var binding := InputEventKey.new()
			binding.physical_keycode = code
			if not InputMap.action_has_event(command,binding):
				InputMap.action_add_event(command,binding)

func _use_guest() -> void:
	var username := str(_guest.get_value("guest","name",""))
	var secret := str(_guest.get_value("guest","secret",""))
	if username.is_empty() or secret.length() < 8:
		_guest_saved = false
		username = "夜班员·" + Api.uuid().replace("-", "").left(12)
		secret = Crypto.new().generate_random_bytes(30).hex_encode()
		_guest.set_value("guest","name",username)
		_guest.set_value("guest","secret",secret)
	# Persist before contacting the server so a newly issued guest always has a return key.
	if not _guest_saved:
		if _guest.save(_guest_path) != OK:
			ui.set_notice("本机工牌保存失败。可用昵称和口令登录。")
			return
		_guest_saved = true
	api.login(username, secret)

func _mute(value: bool) -> void:
	audio.set_muted(value)
	ui.set_muted(value)
	_settings.set_value("audio","muted",value)
	_settings.save(OPTIONS_PATH)

func _logout() -> void:
	api.logout()
	_title()

func _title() -> void:
	page = "title"
	audio.menu()
	ui.set_guest_name(str(_guest.get_value("guest","name","")))
	ui.show_title()

func _roster() -> void:
	api.stop_run()
	if api.nickname.is_empty():
		_title()
		return
	page = "roster"
	audio.menu()
	ui.show_roster(api.profile_data, api.nickname)
	api.refresh_profile()

func _on_profile() -> void:
	if page == "result" and not api.current.is_empty():
		ui.show_result(api.current, api.profile_data)
		return
	page = "roster"
	audio.menu()
	ui.show_roster(api.profile_data, api.nickname)

func _start(night: int) -> void:
	if page in ["roster","result"]:
		api.start(night)

func _enter(_view: Dictionary) -> void:
	page = "play"
	_focused = true
	_cursor = Vector2(-1,-1)
	ui.show_play(world)
	world.set_aim(Vector2(-1,-1))

func _on_view(view: Dictionary) -> void:
	world.set_view(view)
	audio.set_view(view)
	if Wire.terminal(view):
		_blur()
		page = "result"
		ui.show_result(view, api.profile_data)
		api.refresh_profile()
	else:
		ui.update_play(view)

func _blur() -> void:
	_focused = false
	api.controls.release_all()
	for key in ["night_left", "night_right", "night_up", "night_down"]:
		if InputMap.has_action(key):
			Input.action_release(key)

func _process(_delta: float) -> void:
	if page != "play" or not _focused or api.current.is_empty():
		return
	if ui.gameplay_blocked():
		api.controls.release_all()
		world.set_aim(Vector2(-1,-1))
		return
	api.controls.move = Input.get_vector("night_left","night_right","night_up","night_down")
	var at := world.screen_to_world(_cursor)
	if FACTORY_BOUNDS.has_point(at):
		var direction := _direction(at)
		if direction.length_squared() > 0.0:
			api.controls.aim = direction
		world.set_aim(at)
	else:
		world.set_aim(Vector2(-1,-1))

func _direction(at: Vector2) -> Vector2:
	var player: Dictionary = api.current.player
	return (at - Vector2(player.x,player.y)).normalized()

func _input(event: InputEvent) -> void:
	if page != "play" or api.current.is_empty() or ui.gameplay_blocked():
		return
	# Windows may deliver the click that reactivates this window before focus_entered.
	if event is InputEventMouseButton and event.pressed:
		_focused = true
	if not _focused:
		return
	if event is InputEventMouseMotion:
		_cursor = event.position
	elif event is InputEventMouseButton:
		_cursor = event.position
		if not event.pressed or api.current.phase != "serving":
			return
		var at := world.screen_to_world(_cursor)
		if not FACTORY_BOUNDS.has_point(at):
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			api.controls.press("throw", _direction(at))
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			api.controls.press("probe", _direction(at))
