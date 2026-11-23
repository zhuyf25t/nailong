class_name NightWorldView
extends "res://night/world_ink.gd"

const STEP_SEC := 0.05
const PLAYER_START := Vector2(240, 220)
const LEFT_RAIL := 12.0
const RIGHT_RAIL := 468.0
const RECEIVE_Y := 78.0

var view: Dictionary = {}
var _from := PLAYER_START
var _target := PLAYER_START
var _facing := 0
var _moving := false
var _last_tick := -1
var _run_id := ""
var _last_event := -1
var _clock := 0.0
var _redraw_at := 0.0
var _snapshot_at := 0.0
var _step_seconds := STEP_SEC
var _aim := Vector2(-1, -1)
var _last_bottle := Vector2(240, RECEIVE_Y)
var _bottle_from := Vector2.ZERO
var _bottle_to := Vector2.ZERO
var _bottle_continuous := false
var _cap_from := PLAYER_START
var _cap_to := PLAYER_START
var _cap_at := -10.0
var _spark_pos := Vector2.ZERO
var _spark_color := SEA
var _spark_at := -10.0
var _intrusion_at := -100.0
var _counter_x := 240.0
var _chase_from := Vector2.ZERO
var _chase_to := Vector2.ZERO
var _chase_visible := false
var _flash_at := -10.0
var _echo_at := -100.0
var _echo_mark := -1
var _echo_side := -1
var _echo_in_clock := false

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	clip_contents = true
	load_world_art()

func _zoom() -> float:
	return maxf(0.001, minf(size.x / WORLD.x, size.y / WORLD.y))

func _origin() -> Vector2:
	return ((size - WORLD * _zoom()) * 0.5).round()

func world_to_screen(point: Vector2) -> Vector2:
	return get_global_transform() * (_origin() + point * _zoom())

func screen_to_world(global_point: Vector2) -> Vector2:
	return (get_global_transform().affine_inverse() * global_point - _origin()) / _zoom()

func set_aim(world_point: Vector2) -> void:
	_aim = world_point

func _point(value: Dictionary) -> Vector2:
	return Vector2(float(value["x"]), float(value["y"]))

func _blend() -> float:
	return clampf((_clock - _snapshot_at) / _step_seconds, 0.0, 1.0)

func _shown_player() -> Vector2:
	return _from.lerp(_target, _blend())

func set_view(state: Dictionary) -> void:
	if state.is_empty():
		view = {}
		queue_redraw()
		return
	var next_id := str(state["runId"])
	var next_tick := int(state["tick"])
	var fresh := _run_id != next_id or _last_tick < 0
	if not fresh and next_tick < _last_tick:
		return
	if not fresh and next_tick == _last_tick and int(state["eventId"]) == _last_event:
		return
	var next_pos := _point(state["player"])
	var elapsed_steps := next_tick - _last_tick
	_from = next_pos if fresh else _shown_player()
	var travel := next_pos - _target
	_moving = not fresh and travel.length_squared() > 0.2
	if _moving:
		if absf(travel.x) > absf(travel.y):
			_facing = 1 if travel.x > 0 else 3
		else:
			_facing = 0 if travel.y > 0 else 2
	elif fresh:
		_facing = 0
	_target = next_pos
	var bottle: Variant = state["bottle"]
	var last_bottle: Variant = view.get("bottle", null)
	_bottle_continuous = bottle is Dictionary and last_bottle is Dictionary and not fresh
	if bottle is Dictionary:
		var new_point := _point(bottle)
		if _bottle_continuous:
			_bottle_from = _bottle_from.lerp(_bottle_to, _blend())
			if bool(bottle["bounced"]) != bool(last_bottle["bounced"]):
				_bottle_from.x = LEFT_RAIL if new_point.x < WORLD.x * 0.5 else RIGHT_RAIL
		else:
			_bottle_from = new_point
		_bottle_to = new_point
		_last_bottle = new_point
	var chaser: Variant = state.get("chase")
	if chaser is Dictionary:
		var danger := _point(chaser)
		_chase_from = _chase_from.lerp(_chase_to, _blend()) if _chase_visible and not fresh else danger
		_chase_to = danger
		_chase_visible = true
	elif fresh or str(state["phase"]) != "lost":
		_chase_visible = false
	var previous_phase := str(view.get("phase", ""))
	var previous_event := str(view.get("event", ""))
	var previous_order := int(view.get("order", 0))
	_snapshot_at = _clock
	_step_seconds = clampf(elapsed_steps * STEP_SEC, STEP_SEC, 0.14)
	_last_tick = next_tick
	view = state
	if fresh:
		_run_id = next_id
		_last_event = -1
		_cap_at = -10.0
		_spark_at = -10.0
		_intrusion_at = -100.0
		_flash_at = -10.0
		_echo_at = -100.0
		_echo_mark = -1
	if int(view["eventId"]) != _last_event:
		_last_event = int(view["eventId"])
		_on_event(str(view["event"]))
	if str(view["phase"]) == "escaping" and previous_phase != "escaping" and str(view["event"]) != "intruder":
		_on_event("intruder")
	if int(view["order"]) != previous_order and previous_event == "probe":
		_cap_at = -10.0
	_update_echo()
	queue_redraw()

func _on_event(kind: String) -> void:
	match kind:
		"probe":
			var left: bool = view["probe"] == "left"
			_cap_from = _target
			_cap_to = Vector2(51 if left else 429, RECEIVE_Y + 3)
			_cap_at = _clock
			if not _moving:
				_facing = 3 if left else 1
		"throw":
			if not _moving and view["bottle"] is Dictionary:
				var shot: Dictionary = view["bottle"]
				var direction := Vector2(float(shot["vx"]), float(shot["vy"]))
				if absf(direction.y) * 1.25 < absf(direction.x):
					_facing = 1 if direction.x > 0.0 else 3
				else:
					_facing = 0 if direction.y > 0.0 else 2
		"bounce":
			_spark_pos = Vector2(LEFT_RAIL if _last_bottle.x < 240 else RIGHT_RAIL, _last_bottle.y)
			_spark_color = WARM
			_spark_at = _clock
		"miss", "blocked", "deliver", "clockout":
			_spark_pos = Vector2(_last_bottle.x, RECEIVE_Y + 2)
			_spark_color = ALERT if kind in ["miss", "blocked"] else SEA
			_spark_at = _clock
		"intruder":
			_intrusion_at = _clock
			_counter_x = _chase_to.x if _chase_visible else float(SLOTS[clampi(roundi((_last_bottle.x - 104) / 136.0), 0, 2)])
			_flash_at = _clock
		"lever", "won", "escape":
			_spark_pos = _target
			_spark_color = SEA
			_spark_at = _clock

func _process(delta: float) -> void:
	if not is_visible_in_tree() or view.is_empty():
		return
	_clock += minf(delta, 0.2)
	if _clock >= _redraw_at:
		_redraw_at = _clock + 1.0 / 30.0
		queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), INK)
	var zoom := _zoom()
	draw_set_transform(_origin(), 0, Vector2(zoom, zoom))
	var phase := str(view.get("phase", "serving"))
	var escaping := phase in ["escaping", "lost", "escaped"]
	var dark := bool(view.get("dim", false)) or phase == "lost"
	base_room(dark, escaping)
	if view.is_empty():
		for center: int in SLOTS:
			shutter(center, dark)
		return
	_draw_windows(phase, dark)
	if phase == "serving":
		_draw_echo()
	conveyor(int(view["belt"]), _clock)
	_draw_rail_lights()
	hardware(str(view["lever"]), bool(view["latched"]), phase == "escaping", phase in ["clockout", "won"], _clock)
	var p := _shown_player()
	var active_aim := phase == "serving" and Rect2(Vector2.ZERO, WORLD).has_point(_aim)
	if active_aim:
		_draw_aim(p)
	var frame := (1 + (floori(_clock * 9.0) % 2)) if _moving else 0
	player_sprite(p, _facing, frame, phase == "serving" and view["bottle"] == null)
	if escaping:
		_draw_intrusion(p, phase)
	_draw_flying_bottle()
	_draw_probe()
	impact(_spark_pos, (_clock - _spark_at) / 0.32, _spark_color)
	_draw_pressure(p, phase)
	if active_aim and (_aim - p).length_squared() > 24:
		var cross := _aim.round()
		for delta: Vector2 in [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]:
			line_px(cross + delta * 3, cross + delta * 5, INK, 3)
			line_px(cross + delta * 3, cross + delta * 5, WARM)
	if phase == "escaping":
		latch_closeup(_clock - _intrusion_at, str(view["lever"]))

func _update_echo() -> void:
	var order := int(view["order"])
	var night := int(view["night"])
	if night < 2 or order < 2 or str(view["phase"]) != "serving" or _echo_mark == order:
		return
	_echo_mark = order
	# One small unsignalled reprise; decisions always belong to the open windows.
	var selected := (night == 2 and order == 2) or ((night + order + absi(_run_id.hash()) % 3) % 4 == 0)
	if not selected:
		return
	_echo_at = _clock + 0.75
	_echo_side = -1 if str(view["memory"]) == "left" else 1
	_echo_in_clock = view["windows"].size() == 3

func _draw_echo() -> void:
	var age := _clock - _echo_at
	if age < 0.0 or age > 1.65 or not hand_art:
		return
	var motion := smoothstep(0.0, 0.48, age) * (1.0 - smoothstep(0.97, 1.65, age))
	if _echo_in_clock:
		# A gesture passes inside the factory clock glass, away from all order hatches.
		var px := 171 + roundi(motion * 4) * _echo_side
		box(px - 2, 30, 5, 2, Color("#514452a2"))
		box(px - 1 + _echo_side * 2, 28, 2, 3, Color("#514452aa"))
		return
	var height := roundi(8 * motion)
	var center := 240.0 + _echo_side * (4 + motion * 7)
	box(222, 71, 37, 2 + height, COAL)
	var gap := float(height) / 8.0
	if gap > 0.15:
		_draw_hand(Vector2(center, 73), Vector2(0.65 * _echo_side, 0.9), 0.27 * gap)

func _draw_windows(phase: String, dark: bool) -> void:
	var open: Dictionary = {}
	for info: Dictionary in view["windows"]:
		open[int(info["slot"])] = info
	for slot in range(SLOTS.size()):
		var cx: int = SLOTS[slot]
		if not open.has(slot):
			shutter(cx, dark)
			continue
		var item: Dictionary = open[slot]
		var look := str(item["look"])
		# During the tutorial a completed catch gets one familiar laugh.
		var laugh := int(view["night"]) == 1 and str(view["event"]) in ["deliver", "clockout"] and _clock - _spark_at < 0.45
		booth(cx, str(item["actor"]), look, _clock, phase != "serving", dark, laugh)
		if bool(view["bank"]) and phase == "serving":
			glass_guard(cx)

func _draw_rail_lights() -> void:
	if not bool(view["bank"]) or str(view["phase"]) != "serving":
		return
	for sign_x in [-1, 1]:
		var cx := 13 if sign_x == -1 else 465
		for y in range(103, 247, 18):
			box(cx, y, 2, 7, HONEY)
			box(cx, y + 7, 2, 2, COAL)

func _draw_aim(p: Vector2) -> void:
	var dir := (_aim - p).normalized()
	if dir.length_squared() < 0.1:
		return
	var start := p + dir * 15
	var soft := Color(WARM, 0.54)
	var ray_step := 10.0
	# The projected ricochet gives the player a usable shot during a guarded order.
	if not bool(view["bank"]):
		dots(start, start + dir * 20, soft, 5.0)
		return
	if dir.y >= -0.01:
		dots(start, start + dir * 30, soft, 6.0)
		return
	var t_north := (RECEIVE_Y - p.y) / dir.y
	var side := RIGHT_RAIL if dir.x > 0.0 else LEFT_RAIL
	var t_side := (side - p.x) / dir.x if absf(dir.x) > 0.0001 else INF
	if t_north <= t_side:
		dots(start, p + dir * t_north, Color(HONEY, 0.48), ray_step)
		return
	var bank_pos := p + dir * t_side
	var outgoing := Vector2(-dir.x, dir.y)
	var other_wall := LEFT_RAIL if dir.x > 0.0 else RIGHT_RAIL
	var t_end := minf((RECEIVE_Y - bank_pos.y) / dir.y, (other_wall - bank_pos.x) / outgoing.x)
	dots(start, bank_pos, soft, ray_step)
	dots(bank_pos, bank_pos + outgoing * t_end, Color(SEA, 0.72), ray_step)
	box(bank_pos.x - 1, bank_pos.y - 1, 3, 3, WARM)

func _draw_flying_bottle() -> void:
	var bottle: Variant = view["bottle"]
	if not bottle is Dictionary:
		return
	var p := _bottle_from.lerp(_bottle_to, _blend()) if _bottle_continuous else _bottle_to
	var vel := Vector2(float(bottle["vx"]), float(bottle["vy"]))
	draw_bottle(p, vel, bool(bottle["bounced"]))

func _draw_probe() -> void:
	var age := _clock - _cap_at
	if age < 0 or age > 0.52 or str(view["phase"]) != "serving":
		return
	var t := clampf(age / 0.27, 0.0, 1.0)
	if t < 1:
		var p := _cap_from.lerp(_cap_to, t)
		p.y -= sin(t * PI) * 12.0
		cap_sprite(p)
	elif age <= 0.52:
		impact(_cap_to, (age - 0.27) / 0.25, HONEY)

func _draw_intrusion(p: Vector2, phase: String) -> void:
	var age := maxf(0, _clock - _intrusion_at)
	cabinet_hand(_counter_x, age)
	if _chase_visible:
		var actors: Array = view["windows"]
		var actor := "frog" if actors.is_empty() else str(actors[0]["actor"])
		pursuer(_chase_from.lerp(_chase_to, _blend()), p, actor, age)
	# A single, fading color change accompanies the unlocked cabinet.
	var reveal := _clock - _flash_at
	if reveal >= 0 and reveal < 0.36:
		box(0, 0, WORLD.x, WORLD.y, Color(0.47, 0.12, 0.15, 0.24 * (1.0 - reveal / 0.36)))
	if phase == "escaping":
		var frames_left := int(view["escapeTicks"])
		var opacity := 0.20 if frames_left > 80 else 0.41
		for i in range(4):
			var border := Color(0.28, 0.07, 0.13, opacity * (1.0 - i / 4.0))
			box(0, i * 2, WORLD.x, 2, border)
			box(0, WORLD.y - 2 - i * 2, WORLD.x, 2, border)
			box(i * 2, 0, 2, WORLD.y, border)
			box(WORLD.x - 2 - i * 2, 0, 2, WORLD.y, border)

func _draw_pressure(p: Vector2, phase: String) -> void:
	var left := int(view["pressure"])
	if left < 0 or left > 200 or phase != "serving" or view["bottle"] != null:
		return
	var s := _clock * 2.8
	var x := p.x + (-11 if _facing == 3 else 11)
	var rise := fmod(s, 1.0)
	box(x + sin(s) * 2, p.y - 12 - rise * 8, 2, 2, Color(WARM, 0.8 * (1.0 - rise)))
