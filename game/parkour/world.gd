extends Control

const WORLD := Vector2(480, 288)
const CELL := 16.0
const FONT_NAMES := ["Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "sans-serif"]
const DRAGON := preload("res://assets/cast/dragon.png")
const FLOOR := preload("res://assets/factory/floor.png")

var page := "title"
var message := ""
var view: Dictionary = {}
var rooms: Dictionary = {}
var _from := Vector2.ZERO
var _to := Vector2.ZERO
var _snap_at := 0.0
var _moving := false
var _run_id := ""
var _last_event := 0
var _removed := {}
var _flash := {}
var _lightning := {}
var _font := SystemFont.new()
var _title_font := SystemFont.new()
var _blur: ColorRect
var _blur_material: ShaderMaterial
var _step_at := 0.0
var _micro_until := 0
var _next_micro := 0
var _micro_key := ""

func _ready() -> void:
	_font.font_names = PackedStringArray(FONT_NAMES)
	_font.font_weight = 600
	_title_font.font_names = PackedStringArray(FONT_NAMES)
	_title_font.font_weight = 800
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	_blur = ColorRect.new()
	_blur.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_blur.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_blur_material = ShaderMaterial.new()
	var shader := load("res://parkour/blur.gdshader")
	if shader:
		_blur_material.shader = shader
		_blur.material = _blur_material
	_blur.visible = false
	add_child(_blur)
	var audio := {
		"plate_step": "res://assets/audio/plate_step.wav",
		"latch": "res://assets/audio/latch.wav",
		"radio": "res://assets/audio/radio.wav",
		"press_strike": "res://assets/audio/press_strike.wav",
		"shutter": "res://assets/audio/shutter.wav",
		"route_toggle": "res://assets/audio/route_toggle.wav",
		"clockout": "res://assets/audio/clockout.wav",
		"glass_0": "res://assets/audio/glass_0.wav",
		"dawn": "res://assets/audio/dawn.wav",
		"pursuit": "res://assets/audio/pursuit.wav",
		"well_close": "res://assets/audio/well_close.wav",
	}
	for key: String in audio:
		var player := AudioStreamPlayer.new()
		player.name = key
		player.stream = load(audio[key])
		player.volume_db = -7.0
		add_child(player)
	queue_redraw()

func set_page(next: String) -> void:
	page = next
	queue_redraw()

func set_message(text: String) -> void:
	message = text
	queue_redraw()

func set_rooms(list: Array) -> void:
	rooms.clear()
	for room: Variant in list:
		if typeof(room) == TYPE_DICTIONARY:
			rooms["%d-%s" % [int(room.level), str(room.phase)]] = room
	queue_redraw()

func _room(level: int, phase: String) -> Dictionary:
	return rooms.get("%d-%s" % [level, phase], {})

func set_view(state: Dictionary) -> void:
	if state.is_empty():
		view = {}
		queue_redraw()
		return
	var next_run := str(state.get("runId", ""))
	if next_run != _run_id:
		_run_id = next_run
		_last_event = 0
		_removed.clear()
		_flash.clear()
		_snap_at = 0.0
	var old_level := int(view.get("level", 0))
	var next_player := Vector2(float(state.player.x), float(state.player.y))
	if old_level != int(state.get("level", 0)):
		_removed.clear()
	if _snap_at <= 0.0 or _to.distance_to(next_player) > 96.0:
		_from = next_player
	else:
		_from = _shown_player()
	_to = next_player
	_moving = _from.distance_to(_to) > 0.25
	_snap_at = Time.get_ticks_msec() / 1000.0
	view = state
	_consume_events()
	queue_redraw()

func _shown_player() -> Vector2:
	if view.is_empty():
		return _to
	var dead: Variant = view.get("dead")
	var reading: Variant = view.get("reading")
	if dead != null or reading != null:
		return _to
	var p := clampf((Time.get_ticks_msec() / 1000.0 - _snap_at) / 0.05, 0.0, 1.0)
	return _from.lerp(_to, p)

func _consume_events() -> void:
	for raw: Variant in view.get("events", []):
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var id := int(raw.get("id", 0))
		if id <= _last_event:
			continue
		_last_event = id
		var kind := str(raw.get("kind", ""))
		match kind:
			"checkpoint":
				_flash[_cell_key(int(raw.get("x", 0)), int(raw.get("y", 0)))] = Time.get_ticks_msec()
			"lightning":
				var key := _cell_key(int(raw.get("x", 0)), int(raw.get("y", 0)))
				_removed[key] = true
				_lightning[key] = Time.get_ticks_msec()
			"level":
				_removed.clear()
			"respawn":
				_removed.clear()
				_flash.clear()
				_lightning.clear()
			"teleport":
				if int(view.get("level", 1)) in [2, 3] and str(view.get("phase", "warm")) == "cold":
					_micro_until = Time.get_ticks_msec() + 200
		_play(kind)

func _play(kind: String) -> void:
	var sounds := {
		"checkpoint": "latch", "sign": "radio", "death": "press_strike",
		"teleport": "shutter", "arrive": "route_toggle", "level": "clockout",
		"lightning": "glass_0", "mushroom": "dawn", "ending": "pursuit",
		"respawn": "well_close", "glitch": "pursuit", "calm": "well_close",
	}
	var wanted := str(sounds.get(kind, ""))
	if wanted.is_empty():
		return
	var player := get_node_or_null(wanted)
	if player is AudioStreamPlayer:
		player.play()

func _process(_delta: float) -> void:
	if not view.is_empty():
		var now_ms := Time.get_ticks_msec()
		var level := int(view.get("level", 1))
		var phase := str(view.get("phase", "warm"))
		var key := "%d-%s" % [level, phase]
		if key != _micro_key:
			_micro_key = key
			if level in [2, 3] and phase == "cold":
				_next_micro = now_ms + int(randf_range(3000.0, 4000.0))
			else:
				_next_micro = 0
				_micro_until = 0
		if level in [2, 3] and phase == "cold" and now_ms >= _next_micro:
			_micro_until = now_ms + 200
			_next_micro = now_ms + int(randf_range(3000.0, 4000.0))
		var switching: Variant = view.get("switch")
		var show_blur := false
		var amount := 0.0
		var mask := 0.0
		if switching != null:
			var total := maxf(1.0, float(switching.get("total", 18)))
			var progress := 1.0 - float(switching.get("ticks", 0)) / total
			show_blur = true
			amount = sin(progress * PI)
		elif now_ms < _micro_until:
			show_blur = true
			amount = 0.9
			mask = 0.58
		if _blur:
			_blur.visible = show_blur
			if show_blur and _blur_material:
				_blur_material.set_shader_parameter("blur_amount", amount)
				_blur_material.set_shader_parameter("mask_amount", mask)
		if _moving and page == "play":
			var now := Time.get_ticks_msec() / 1000.0
			if now - _step_at > 0.30:
				_step_at = now
				_play_at("plate_step")
	if page == "play":
		queue_redraw()

func _play_at(name: String) -> void:
	var player := get_node_or_null(name)
	if player is AudioStreamPlayer:
		player.play()

func _scale() -> float:
	return maxf(0.001, minf(size.x / WORLD.x, size.y / WORLD.y))

func _origin() -> Vector2:
	return ((size - WORLD * _scale()) * 0.5).round()

func _apply(offset: Vector2) -> void:
	var s := _scale()
	draw_set_transform(_origin() + offset * s, 0.0, Vector2(s, s))

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#09080c"))
	_apply(Vector2.ZERO)
	draw_rect(Rect2(Vector2.ZERO, WORLD), Color("#09080c"))
	match page:
		"title":
			_draw_title()
		"connecting":
			_draw_center(message if not message.is_empty() else "正在连接…", 14, 140)
		"error":
			_draw_center(message, 13, 128)
			_draw_center("按 C 重试", 12, 170, Color("#ffbf7a"))
		_:
			if not view.is_empty():
				_draw_play()

func _draw_title() -> void:
	draw_texture_rect(FLOOR, Rect2(Vector2.ZERO, WORLD), false, Color(0.30, 0.27, 0.32))
	draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.02, 0.02, 0.03, 0.55))
	for i in range(16):
		var x := float((i * 37) % 480)
		var y := float((i * 61) % 288)
		draw_rect(Rect2(x, y, 24, 2), Color(0.75, 0.12, 0.16, 0.10))
	_draw_center("不连续的存在", 34, 118, Color("#f4ead6"))
	_draw_center("DISCONTINUOUS EXISTENCE", 9, 140, Color("#8d7f6a"))
	var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 380.0)
	_draw_center("按 C 开始", 15, 190, Color(0.95, 0.88, 0.72, pulse))
	_draw_center("方向键移动", 10, 224, Color("#9d927e"))

func _draw_center(text: String, font_size: int, y: float, color := Color("#f4ead6")) -> void:
	draw_string(_font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, WORLD.x, font_size, color)

func _draw_play() -> void:
	var phase := str(view.get("phase", "warm"))
	var layout := str(view.get("layout", phase))
	var ending := str(view.get("ending", "none"))
	var transition: Variant = view.get("transition")
	if transition != null:
		_draw_transition(transition)
		_apply(Vector2.ZERO)
		_draw_hud()
		return
	var offset := Vector2.ZERO
	if ending in ["rush", "lying", "collected"]:
		offset = Vector2(maxf(0.0, -float(view.player.x)), 0.0)
	_apply(offset)
	var room := _room(int(view.get("level", 1)), layout)
	if not room.is_empty():
		_draw_room(room, phase, true)
	if ending == "rush":
		for i in range(6):
			var y := 40.0 + i * 36.0
			draw_line(Vector2(0, y), Vector2(480, y - 10), Color(0.95, 0.95, 0.95, 0.10), 2.0)
	_apply(Vector2.ZERO)
	_draw_lightning()
	_draw_overlays()
	_draw_hud()

func _draw_transition(transition: Dictionary) -> void:
	var total := maxf(1.0, float(transition.get("total", 12)))
	var progress := 1.0 - float(transition.get("ticks", 0)) / total
	var direction := float(transition.get("direction", 1))
	var from_phase := str(transition.get("fromPhase", "warm"))
	var to_phase := str(transition.get("toPhase", "warm"))
	var old_room := _room(int(transition.get("fromLevel", 1)), from_phase)
	var new_room := _room(int(transition.get("toLevel", 1)), to_phase)
	_apply(Vector2(-direction * progress * WORLD.x, 0))
	if not old_room.is_empty():
		_draw_room(old_room, from_phase, false)
	_apply(Vector2(direction * (1.0 - progress) * WORLD.x, 0))
	if not new_room.is_empty():
		_draw_room(new_room, to_phase, progress >= 0.5)

func _draw_room(room: Dictionary, phase: String, with_player: bool) -> void:
	var cold := phase == "cold"
	var floor_tint := Color(0.44, 0.24, 0.27) if cold else Color(1.02, 0.92, 0.78)
	draw_texture_rect(FLOOR, Rect2(Vector2.ZERO, WORLD), false, floor_tint)
	if cold:
		draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.05, 0.01, 0.02, 0.52))
		for i in range(7):
			var y := float((i * 47) % 288)
			draw_rect(Rect2(0, y, 480, 1), Color(0.9, 0.12, 0.16, 0.07))
		_draw_run_marks()
	else:
		draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.16, 0.10, 0.07, 0.10))
	_draw_border(phase)
	for raw: Variant in room.get("walls", []):
		_draw_wall(_cell_rect(raw), cold)
	for raw: Variant in room.get("hazards", []):
		_noise_cell(_cell_rect(raw), cold, int(raw[0]) * 31 + int(raw[1]) * 17)
	_draw_creep(cold)
	_draw_dynamic_hazards(cold)
	_draw_exit(room, cold)
	_draw_checkpoints(room, cold)
	_draw_signs(room, cold)
	_draw_mushroom(room, cold)
	if with_player:
		_draw_player(cold)

func _draw_border(phase: String) -> void:
	var cold := phase == "cold"
	if cold:
		_noise_region(Rect2(0, 0, 480, CELL), true, 7)
		_noise_region(Rect2(0, 288 - CELL, 480, CELL), true, 11)
		_noise_region(Rect2(0, CELL, CELL, 288 - 2 * CELL), true, 13)
		_noise_region(Rect2(480 - CELL, CELL, CELL, 288 - 2 * CELL), true, 17)
	else:
		for col in range(30):
			_draw_wall(Rect2(col * CELL, 0, CELL, CELL), false)
			_draw_wall(Rect2(col * CELL, 288 - CELL, CELL, CELL), false)
		for row in range(1, 17):
			_draw_wall(Rect2(0, row * CELL, CELL, CELL), false)
			_draw_wall(Rect2(480 - CELL, row * CELL, CELL, CELL), false)

func _draw_wall(rect: Rect2, cold: bool) -> void:
	var base := Color("#332a2f") if cold else Color("#5b4636")
	var top := Color("#4b3a40") if cold else Color("#7a5f45")
	var edge := Color("#191317") if cold else Color("#3e2f25")
	draw_rect(rect, base)
	draw_rect(Rect2(rect.position, Vector2(rect.size.x, 2)), top)
	draw_rect(Rect2(rect.position + Vector2(0, rect.size.y - 2), Vector2(rect.size.x, 2)), edge)
	draw_rect(Rect2(rect.position + Vector2(2, 2), Vector2(rect.size.x - 4, 1)), Color(1, 1, 1, 0.06))

func _draw_run_marks() -> void:
	for i in range(8):
		var x := 28.0 + (i % 4) * 112.0
		var y := 58.0 if i < 4 else 238.0
		draw_string(_font, Vector2(x, y), "RUN", HORIZONTAL_ALIGNMENT_LEFT, -1, 16,
			Color(0.88, 0.10, 0.14, 0.24))

func _cell_rect(raw: Variant) -> Rect2:
	return Rect2(float(raw[0]) * CELL, float(raw[1]) * CELL, CELL, CELL)

func _cell_key(x: int, y: int) -> String:
	return "%d,%d" % [int(floor(x / CELL)), int(floor(y / CELL))]

func _hash(a: int, b: int, c: int) -> int:
	var h := (a * 374761393 + b * 668265263 + c * 2147483647) & 0x7fffffff
	h = (h ^ (h >> 13)) * 1274126177
	return h & 0x7fffffff

func _noise_cell(rect: Rect2, cold: bool, seed_value: int) -> void:
	var tick := int(Time.get_ticks_msec() / 80)
	draw_rect(rect, Color(0.02, 0.02, 0.03, 0.90))
	for j in range(4):
		for i in range(4):
			var h := _hash(seed_value, i + j * 4, tick)
			if h % 3 == 0:
				continue
			var shade := Color(0.92, 0.94, 0.96, 0.62) if not cold else Color(0.92, 0.10, 0.15, 0.65)
			if h % 5 == 0:
				shade = Color(0.02, 0.02, 0.03, 0.85)
			draw_rect(Rect2(rect.position + Vector2(i, j) * 4.0, Vector2(4, 4)), shade)

func _noise_region(rect: Rect2, cold: bool, seed_value: int) -> void:
	var tick := int(Time.get_ticks_msec() / 70)
	draw_rect(rect, Color(0.02, 0.02, 0.03, 0.86))
	var step := 4.0
	var columns := int(ceil(rect.size.x / step))
	for i in range(columns):
		var h := _hash(seed_value, i, tick)
		if h % 2 != 0:
			continue
		var y0 := rect.position.y + float(h % max(1, int(rect.size.y)))
		var height := 5.0 + float((h >> 7) % 16)
		var col := Color(0.92, 0.94, 0.96, 0.58) if not cold else Color(0.92, 0.10, 0.15, 0.62)
		if h % 7 == 0:
			col = Color(0.02, 0.02, 0.03, 0.9)
		draw_rect(Rect2(rect.position.x + i * step, y0, step - 1.0, min(height, rect.end.y - y0)), col)
		if rect.size.y > CELL:
			draw_rect(Rect2(rect.position.x + i * step,
				rect.position.y + float((h >> 11) % max(1, int(rect.size.y))), step - 1.0, 4.0), col)

func _draw_creep(cold: bool) -> void:
	var raw: Variant = view.get("creepX")
	if raw == null:
		return
	var boundary := float(raw)
	if boundary < 0.0 or boundary > WORLD.x:
		return
	_noise_region(Rect2(boundary, CELL, WORLD.x - boundary, WORLD.y - 2 * CELL), cold, 29)
	draw_rect(Rect2(boundary, CELL, 2, WORLD.y - 2 * CELL), Color(1, 1, 1, 0.22))

func _noise_box(rect: Rect2, cold: bool, seed_value: int) -> void:
	var tick := int(Time.get_ticks_msec() / 70)
	draw_rect(rect, Color(0.02, 0.02, 0.03, 0.92))
	var cols := maxi(1, int(ceil(rect.size.x / 4.0)))
	var rows := maxi(1, int(ceil(rect.size.y / 4.0)))
	for j in range(rows):
		for i in range(cols):
			var h := _hash(seed_value, i + j * cols, tick)
			if h % 3 != 0:
				continue
			var shade := Color(0.92, 0.94, 0.96, 0.62) if not cold else Color(0.92, 0.10, 0.15, 0.68)
			if h % 5 == 0:
				shade = Color(0.02, 0.02, 0.03, 0.9)
			draw_rect(Rect2(rect.position + Vector2(i, j) * 4.0, Vector2(4, 4)), shade)
	draw_rect(rect, Color(0.95, 0.95, 0.95, 0.10) if not cold else Color(1.0, 0.18, 0.20, 0.22), false, 1.0)

func _draw_dynamic_hazards(cold: bool) -> void:
	for raw: Variant in view.get("bars", []):
		if typeof(raw) == TYPE_DICTIONARY:
			_noise_box(Rect2(float(raw.get("x", 0)), float(raw.get("y", 0)),
				float(raw.get("w", 16)), float(raw.get("h", 16))), true,
				int(raw.get("x", 0)) + int(raw.get("y", 0)))
	for kind in ["glitch", "scary"]:
		var raw: Variant = view.get(kind)
		if typeof(raw) == TYPE_DICTIONARY:
			_noise_box(Rect2(float(raw.get("x", 0)), float(raw.get("y", 0)),
				float(raw.get("w", 16)), float(raw.get("h", 16))), true,
				int(raw.get("x", 0)) * 3 + int(raw.get("y", 0)))
	var teleport: Variant = view.get("teleport")
	if typeof(teleport) == TYPE_DICTIONARY:
		var at := Vector2(float(teleport.get("x", 0)), float(teleport.get("y", 0)))
		var rod := Color(0.80, 0.80, 0.80) if not cold else Color(0.95, 0.20, 0.22)
		var remaining := float(teleport.get("ticks", 0))
		var progress := clampf(1.0 - remaining / 3.0, 0.0, 1.0)
		var fall := pow(1.0 - progress, 2.0)
		var fall_y := at.y - 260.0 * fall
		draw_circle(at, 9.0, Color(rod.r, rod.g, rod.b, 0.20))
		draw_circle(at, 3.0, Color(rod.r, rod.g, rod.b, 0.55))
		draw_line(Vector2(at.x, fall_y - 38.0), Vector2(at.x, fall_y),
			Color(rod.r, rod.g, rod.b, 0.35), 2.0)
		draw_rect(Rect2(at.x - 1.5, fall_y - 15.0, 3.0, 18.0), rod)
		if progress > 0.86:
			draw_circle(at, 14.0, Color(1, 1, 1, 0.18))

func _draw_lightning() -> void:
	var now := Time.get_ticks_msec()
	for key in _lightning.keys():
		if now - int(_lightning[key]) > 520:
			continue
		var parts := str(key).split(",")
		if parts.size() != 2:
			continue
		var center := Vector2((int(parts[0]) + 0.5) * CELL, (int(parts[1]) + 0.5) * CELL)
		var points := PackedVector2Array([center + Vector2(0, -44)])
		for i in range(1, 5):
			points.append(center + Vector2(sin(i * 2.3 + now * 0.02) * 7.0, -44.0 + i * 11.0))
		points.append(center)
		draw_polyline(points, Color(1, 1, 1, 0.92), 2.0)
		draw_polyline(points, Color(1.0, 0.30, 0.32, 0.55), 1.0)
		draw_circle(center, 12.0, Color(1.0, 0.35, 0.30, 0.16))

func _draw_exit(room: Dictionary, cold: bool) -> void:
	var raw: Variant = room.get("exit")
	if raw == null:
		return
	var rect := _cell_rect(raw)
	var tint := Color(0.55, 0.08, 0.10) if cold else Color(0.95, 0.72, 0.30)
	draw_rect(Rect2(rect.position.x + 4, rect.position.y, 8, rect.size.y), Color(0.02, 0.02, 0.03, 0.85))
	draw_rect(Rect2(rect.position.x + 5, rect.position.y + 1, 2, rect.size.y - 2), Color(tint, 0.55))
	draw_rect(Rect2(rect.position.x + 10, rect.position.y + 1, 1, rect.size.y - 2), Color(tint, 0.35))

func _draw_checkpoints(room: Dictionary, cold: bool) -> void:
	var now := Time.get_ticks_msec()
	var drawn := {}
	for raw: Variant in room.get("checkpoints", []):
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var cell: Variant = raw.get("cell")
		var key := "%d,%d" % [int(cell[0]), int(cell[1])]
		drawn[key] = true
		if _removed.has(key):
			continue
		var center := Vector2(float(cell[0]) * CELL + CELL / 2, float(cell[1]) * CELL + CELL / 2)
		var removed := bool(raw.get("removed", false))
		var alpha := 0.16 if removed else 0.55
		var flash: Variant = _flash.get(key)
		if flash != null and now - int(flash) < 450:
			alpha = 0.95
		draw_circle(center, 10.0, Color(0.15, 1.0, 0.42, alpha * 0.25))
		draw_circle(center, 6.0, Color(0.20, 1.0, 0.48, alpha))
		draw_rect(Rect2(center - Vector2(2, 2), Vector2(4, 4)), Color(0.85, 1.0, 0.88, alpha))
		if not removed and _near_checkpoint(center):
			draw_string(_font, center + Vector2(-8, -12), "SAVE", HORIZONTAL_ALIGNMENT_LEFT, -1, 7,
				Color(0.6, 1.0, 0.72, 0.65))
	var dynamic: Variant = view.get("checkpoint")
	if typeof(dynamic) == TYPE_DICTIONARY:
		var center := Vector2(float(dynamic.get("x", 0)), float(dynamic.get("y", 0)))
		var key := "%d,%d" % [int(floor(center.x / CELL)), int(floor(center.y / CELL))]
		if not drawn.has(key) and not _removed.has(key):
			var flash: Variant = _flash.get(key)
			var alpha := 0.95 if flash != null and now - int(flash) < 450 else 0.55
			draw_circle(center, 10.0, Color(0.15, 1.0, 0.42, alpha * 0.25))
			draw_circle(center, 6.0, Color(0.20, 1.0, 0.48, alpha))
			draw_rect(Rect2(center - Vector2(2, 2), Vector2(4, 4)), Color(0.85, 1.0, 0.88, alpha))

func _near_checkpoint(center: Vector2) -> bool:
	return _shown_player().distance_to(center) < 22.0

func _draw_signs(room: Dictionary, cold: bool) -> void:
	var fronts := _front_cells()
	for raw: Variant in room.get("signs", []):
		if typeof(raw) != TYPE_DICTIONARY:
			continue
		var cell: Variant = raw.get("cell")
		var key := "%d,%d" % [int(cell[0]), int(cell[1])]
		if _removed.has(key):
			continue
		var center := Vector2(float(cell[0]) * CELL + CELL / 2, float(cell[1]) * CELL + CELL / 2)
		var removed := bool(raw.get("removed", false))
		var final_sign := bool(raw.get("final", false))
		var alpha := 0.30 if removed else 1.0
		var wood := Color(0.42, 0.29, 0.18, alpha) if not cold else Color(0.34, 0.18, 0.18, alpha)
		var edge := Color(0.20, 0.13, 0.08, alpha) if not cold else Color(0.12, 0.06, 0.07, alpha)
		if final_sign:
			wood = Color(0.55, 0.22, 0.20, alpha)
		draw_rect(Rect2(center.x - 1, center.y - 4, 2, 7), edge)
		draw_rect(Rect2(center.x - 7, center.y - 13, 14, 10), wood)
		draw_rect(Rect2(center.x - 6, center.y - 12, 12, 8), wood.lightened(0.14))
		for i in range(3):
			draw_rect(Rect2(center.x - 4, center.y - 10 + i * 3, 8, 1), Color(0.75, 0.63, 0.44, alpha * 0.55))
		if fronts.has(Vector2i(int(cell[0]), int(cell[1]))) and not removed:
			var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 260.0)
			draw_string(_font, center + Vector2(-4, -19), "C", HORIZONTAL_ALIGNMENT_LEFT, -1, 10,
				Color(1.0, 0.90, 0.62, pulse))

func _draw_mushroom(room: Dictionary, cold: bool) -> void:
	var raw: Variant = room.get("mushroom")
	if raw == null or bool(view.get("collected", false)):
		return
	var center := Vector2(float(raw[0]) * CELL + CELL / 2, float(raw[1]) * CELL + CELL / 2)
	draw_rect(Rect2(center.x - 2, center.y - 2, 4, 9), Color(0.92, 0.82, 0.66))
	draw_rect(Rect2(center.x - 7, center.y - 8, 14, 7), Color(0.78, 0.14, 0.16))
	draw_rect(Rect2(center.x - 5, center.y - 10, 10, 3), Color(0.86, 0.20, 0.20))
	draw_circle(Vector2(center.x - 3, center.y - 7), 1.2, Color(0.96, 0.92, 0.82))
	draw_circle(Vector2(center.x + 3, center.y - 5), 1.0, Color(0.96, 0.92, 0.82))
	var front := _front_cell()
	if front == Vector2i(int(raw[0]), int(raw[1])):
		var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 260.0)
		draw_string(_font, center + Vector2(-4, -16), "C", HORIZONTAL_ALIGNMENT_LEFT, -1, 10,
			Color(1.0, 0.92, 0.64, pulse))

func _front_cells() -> Array:
	var pos := _shown_player()
	var origin := Vector2i(int(floor(pos.x / CELL)), int(floor(pos.y / CELL)))
	var facing: Variant = view.get("facing", {"x": 1, "y": 0})
	var fx := int(sign(float(facing.get("x", 1))))
	var fy := int(sign(float(facing.get("y", 0))))
	if fx == 0 and fy == 0:
		fx = 1 if str(view.get("phase", "warm")) == "warm" else -1
	var dirs := [Vector2i(0, -1), Vector2i(1, -1), Vector2i(1, 0), Vector2i(1, 1),
		Vector2i(0, 1), Vector2i(-1, 1), Vector2i(-1, 0), Vector2i(-1, -1)]
	var index := dirs.find(Vector2i(fx, fy))
	if index < 0:
		index = 2 if fx >= 0 else 6
	return [origin + dirs[index], origin + dirs[(index + 1) % 8], origin + dirs[(index + 7) % 8]]

func _front_cell() -> Vector2i:
	return _front_cells()[0]

func _draw_player(cold: bool) -> void:
	var pos := _shown_player()
	var dead: Variant = view.get("dead")
	var ending := str(view.get("ending", "none"))
	if ending == "lying":
		draw_rect(Rect2(pos.x - 20, pos.y - 2, 40, 4), Color(0, 0, 0, 0.35))
		draw_texture_rect_region(DRAGON, Rect2(pos.x - 20, pos.y - 12, 40, 18),
			Rect2(0, 0, 32, 40), Color(1, 1, 1, 0.92))
		return
	if ending == "collected":
		draw_rect(Rect2(pos.x - 8, pos.y - 2, 16, 3), Color(0, 0, 0, 0.32))
		draw_texture_rect_region(DRAGON, Rect2(pos.x - 16, pos.y - 29, 32, 40),
			Rect2(32, 0, 32, 40), Color.WHITE)
		return
	draw_rect(Rect2(pos.x - 8, pos.y - 2, 16, 3), Color(0, 0, 0, 0.32))
	if dead != null and str(dead.get("kind", "warm")) == "warm":
		return
	var row := _dragon_row()
	var frame := _dragon_frame()
	var tint := Color(1.0, 0.86, 0.86) if cold else Color.WHITE
	draw_texture_rect_region(DRAGON, Rect2(pos.x - 16, pos.y - 29, 32, 40),
		Rect2(frame * 32, row * 40, 32, 40), tint)
	if dead != null:
		_draw_cut(pos)

func _dragon_row() -> int:
	var facing: Variant = view.get("facing", {"x": 1, "y": 0})
	var fx := float(facing.get("x", 1))
	var fy := float(facing.get("y", 0))
	if absf(fy) >= absf(fx):
		return 0 if fy >= 0 else 2
	return 1 if fx > 0 else 3

func _dragon_frame() -> int:
	if not _moving:
		return 0
	return int(floor(Time.get_ticks_msec() / 130.0)) % 3

func _draw_cut(pos: Vector2) -> void:
	var angle := sin(pos.x * 0.37 + pos.y * 0.11) * PI
	var direction := Vector2(cos(angle), sin(angle))
	var normal := Vector2(-direction.y, direction.x)
	var side := 1.0 if int(view.get("tick", 0)) % 2 == 0 else -1.0
	var far := 600.0
	var a := pos + normal * side * 0.0
	var b := pos + direction * far + normal * side * far
	var c := pos - direction * far + normal * side * far
	draw_colored_polygon(PackedVector2Array([a, b, c]), Color(0.02, 0.02, 0.03, 0.97))

func _draw_overlays() -> void:
	var reading: Variant = view.get("reading")
	if reading != null:
		_draw_reading(reading)
	var dead: Variant = view.get("dead")
	if dead != null:
		_draw_death(dead)
	var ending := str(view.get("ending", "none"))
	if ending == "collected":
		draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.01, 0.01, 0.02, 0.72))
		_draw_center("蘑菇采到了", 28, 122, Color("#f6e6c8"))
		var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 380.0)
		_draw_center("按 C 重新开始", 12, 178, Color(0.9, 0.82, 0.68, pulse))

func _draw_reading(reading: Dictionary) -> void:
	var layout := str(view.get("layout", view.get("phase", "warm")))
	var room := _room(int(view.get("level", 1)), layout)
	var cell: Variant = reading.get("cell")
	var pages: Array = []
	for raw: Variant in room.get("signs", []):
		var raw_cell: Variant = raw.get("cell", [0, 0])
		if int(raw_cell[0]) == int(cell[0]) and int(raw_cell[1]) == int(cell[1]):
			pages = raw.get("pages", [])
			break
	var page_index := clampi(int(reading.get("page", 0)), 0, max(0, pages.size() - 1))
	var text := str(pages[page_index]) if pages.size() > 0 else ""
	var cold := str(view.get("phase", "warm")) == "cold"
	var panel := Rect2(88, 48, 304, 192)
	draw_rect(panel, Color(0.10, 0.07, 0.05, 0.96) if not cold else Color(0.10, 0.04, 0.05, 0.97))
	draw_rect(panel, Color(0.55, 0.40, 0.24) if not cold else Color(0.48, 0.16, 0.18), false, 2.0)
	draw_rect(Rect2(panel.position + Vector2(4, 4), panel.size - Vector2(8, 8)),
		Color(0.72, 0.56, 0.34, 0.35) if not cold else Color(0.72, 0.20, 0.24, 0.35), false, 1.0)
	draw_string(_font, Vector2(panel.position.x + 14, panel.position.y + 22), "告示牌",
		HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.82, 0.68, 0.46))
	var shake := Vector2.ZERO
	if bool(reading.get("final", false)):
		shake = Vector2(sin(Time.get_ticks_msec() / 23.0) * 2.4, cos(Time.get_ticks_msec() / 19.0) * 1.6)
	draw_multiline_string(_font, Vector2(panel.position.x + 16, panel.position.y + 52) + shake,
		text, HORIZONTAL_ALIGNMENT_LEFT, panel.size.x - 32, 15, -1,
		Color(0.96, 0.90, 0.76) if not cold else Color(1.0, 0.82, 0.80))
	var ticks := clampi(int(reading.get("ticksLeft", 0)), 0, 1200)
	var ratio := float(ticks) / 1200.0
	draw_rect(Rect2(panel.position.x + 16, panel.end.y - 28, panel.size.x - 32, 4), Color(0.20, 0.16, 0.12))
	var color := Color(0.45, 0.92, 0.55) if ratio > 0.35 else Color(0.94, 0.36, 0.28)
	draw_rect(Rect2(panel.position.x + 16, panel.end.y - 28, (panel.size.x - 32) * ratio, 4), color)
	draw_string(_font, Vector2(panel.position.x + 16, panel.end.y - 10), "按 C 继续",
		HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(0.70, 0.64, 0.52))

func _draw_death(dead: Dictionary) -> void:
	var kind := str(dead.get("kind", "warm"))
	var age := float(dead.get("ticks", 0)) / 20.0
	var pos := _to
	var angle := sin(pos.x * 0.37 + pos.y * 0.11) * PI
	var direction := Vector2(cos(angle), sin(angle))
	if kind == "warm":
		if age < 0.34:
			var fade := 1.0 - age / 0.34
			draw_rect(Rect2(Vector2.ZERO, WORLD), Color(1.0, 0.88, 0.40, 0.34 * fade))
			var width := 64.0 * fade + 4.0
			draw_line(pos - Vector2(300, 0), pos + Vector2(300, 0),
				Color(1.0, 0.96, 0.72, 0.95), width)
			draw_line(pos - Vector2(300, 0), pos + Vector2(300, 0),
				Color(1.0, 0.82, 0.30, 0.45), width * 0.4)
		if age < 1.0:
			for i in range(26):
				var particle_angle := float(i) * 0.2417 + age * 2.0
				var distance := 8.0 + age * 64.0 + float(i % 5) * 6.0
				var point := pos + Vector2(cos(particle_angle), sin(particle_angle)) * distance
				var alpha := clampf(1.0 - age, 0.0, 1.0)
				draw_rect(Rect2(point, Vector2(2, 2)), Color(1.0, 0.86, 0.20, alpha))
		else:
			draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.02, 0.02, 0.02, 0.45))
			_draw_center("DIE", 46, 132, Color(0.96, 0.90, 0.74))
	else:
		draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.08, 0.0, 0.01, 0.30))
		if age < 0.22:
			draw_rect(Rect2(Vector2.ZERO, WORLD), Color(1.0, 1.0, 1.0, 0.42 * (1.0 - age / 0.22)))
		var reveal := clampf(age / 0.7, 0.0, 1.0)
		var width := lerpf(72.0, 1.5, reveal)
		draw_line(pos - direction * 320.0, pos + direction * 320.0,
			Color(1.0, 1.0, 1.0, 0.95), width)
		draw_line(pos - direction * 320.0, pos + direction * 320.0,
			Color(0.82, 0.90, 1.0, 0.42), maxf(1.0, width * 0.32))
		if age >= 0.8:
			_draw_center("DIE", 46, 132, Color(0.98, 0.84, 0.82))
	if bool(dead.get("prompt", false)):
		var pulse := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 360.0)
		_draw_center("按 C 键回档", 12, 178, Color(0.88, 0.84, 0.72, pulse))

func _draw_hud() -> void:
	if view.is_empty():
		return
	draw_string(_font, Vector2(8, 13), "%d / 7" % int(view.get("level", 1)),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(0.82, 0.76, 0.64, 0.6))
	if int(view.get("level", 1)) == 1 and str(view.get("phase", "warm")) == "warm":
		draw_string(_font, Vector2(72, 186), "按 C 阅读告示牌", HORIZONTAL_ALIGNMENT_LEFT, -1, 9,
			Color(0.30, 0.22, 0.16, 0.65))
