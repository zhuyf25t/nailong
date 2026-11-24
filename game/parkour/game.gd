extends Node

const Api = preload("res://parkour/api.gd")
const WorldView = preload("res://parkour/world.gd")

var api := Api.new()
var world := WorldView.new()
var page := "title"

func _ready() -> void:
	add_child(api)
	add_child(world)
	world.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	world.mouse_filter = Control.MOUSE_FILTER_IGNORE
	api.started.connect(_on_started)
	api.changed.connect(_on_changed)
	api.failed.connect(_on_failed)
	api.status.connect(_on_status)
	get_tree().auto_accept_quit = false
	get_window().close_requested.connect(_close)
	_show("title")

func _show(next: String) -> void:
	page = next
	world.set_page(next)

func _process(_delta: float) -> void:
	if page == "play" and not api.current.is_empty():
		api.controls.move = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")

func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if event.physical_keycode == KEY_C:
		if page == "title" or page == "error":
			_begin()
			get_viewport().set_input_as_handled()
		elif page == "play":
			if str(api.current.get("ending", "none")) == "collected":
				_show("connecting")
				api.restart()
			else:
				api.controls.press_read()
				api.kick()
			get_viewport().set_input_as_handled()
	elif event.physical_keycode == KEY_X and page == "play":
		api.controls.press_teleport()
		api.kick()
		get_viewport().set_input_as_handled()

func _begin() -> void:
	_show("connecting")
	api.connect_and_start()

func _on_started(rooms: Array, view: Dictionary) -> void:
	world.set_rooms(rooms)
	world.set_view(view)
	_show("play")

func _on_changed(view: Dictionary) -> void:
	world.set_view(view)

func _on_failed(message: String) -> void:
	world.set_message(message)
	_show("error")

func _on_status(text: String) -> void:
	world.set_message(text)

func _close() -> void:
	api.stop_run()
	get_tree().quit()
