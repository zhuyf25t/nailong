extends Node2D

const MAP := "res://assets/arena/bottling_floor.png"
const CHARACTER_PATHS := ["dragon", "egg", "frog"]
const INK := Color("#2b243d")
const PAPER := Color("#fff5d9")
const MINT := Color("#71e5c6")
const BERRY := Color("#ff829d")
const GOLD := Color("#ffce65")
const TEAM_COLORS := [MINT, BERRY]
const SEAT_COLORS := [Color("#ffe382"), Color("#ff90ad"), Color("#83ebe1"), Color("#b3aeff")]
const TOOLS := [Color("#9cece2"), Color("#ffd567"), Color("#ba9dff")]
const SHOT_COLORS := [Color("#78e4eb"), Color("#ffbb64"), Color("#b390ff")]
const SHEET_SIZE := Vector2(32, 32)
const CENTER := Vector2(16, 20)
const PIXEL_RING := [
	Vector2(-7, 0), Vector2(-5, -2), Vector2(5, -2), Vector2(7, 0),
	Vector2(7, 2), Vector2(4, 4), Vector2(-4, 4), Vector2(-7, 2)
]

class Burst:
	var kind: StringName
	var at: Vector2
	var aim: Vector2
	var age := 0.0
	var ttl: float
	var seed_no: int
	var hue: Color

var cursor := Vector2.ZERO
var cursor_on := false
var _s: SodaState
var _local := -1
var _floor: Texture2D
var _sheets: Array[Texture2D] = []
var _bottle: Texture2D
var _flags: Array[Texture2D] = []
var _start := PackedVector2Array()
var _shown := PackedVector2Array()
var _move := PackedFloat32Array()
var _hurt := PackedFloat32Array()
var _shot_start: Dictionary[int, Vector2] = {}
var _shot_shown: Dictionary[int, Vector2] = {}
var _bursts: Array[Burst] = []
var _clock := 0.0
var _since := 0.0
var _period := 0.05
var _last_event := -1

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_floor = load(MAP) as Texture2D
	for skin: String in CHARACTER_PATHS:
		_sheets.append(load("res://assets/characters/%s_sheet.png" % skin) as Texture2D)
	_bottle = load("res://assets/arena/pickup_milk.png") as Texture2D
	for team: String in ["mint", "berry"]:
		_flags.append(load("res://assets/arena/flag_%s.png" % team) as Texture2D)
	_start.resize(4)
	_shown.resize(4)
	_move.resize(4)
	_hurt.resize(4)

func clear_match() -> void:
	_s = null
	_local = -1
	_last_event = -1
	_since = 0
	_period = 0.05
	_hurt.fill(0)
	_move.fill(0)
	_shot_start.clear()
	_shot_shown.clear()
	_bursts.clear()
	cursor_on = false
	queue_redraw()

func accept(s: SodaState, local_seat: int) -> void:
	var first := _s == null or s.tick < _s.tick
	_local = local_seat
	if first:
		clear_match()
		_local = local_seat
	if not first and s.tick == _s.tick:
		_s = s
		return
	_period = 0.05 if first else clampf((s.tick - _s.tick) * 0.05, 0.035, 0.16)
	_since = 0
	for f in s.fighters:
		var seat := f.seat
		var warp := first or _s.fighters[seat].respawn_ticks > 0 or _shown[seat].distance_squared_to(f.pos) > 1500
		_start[seat] = f.pos if warp else _shown[seat]
		_shown[seat] = _start[seat]
		var advance := 0.0 if first else _s.fighters[seat].pos.distance_to(f.pos)
		_move[seat] = 0.0 if warp else advance
	_shot_start.clear()
	for shot in s.shots:
		_shot_start[shot.id] = _shot_shown.get(shot.id, shot.pos)
	_shot_shown = _shot_start.duplicate()
	_s = s
	for event in s.events:
		if event.id > _last_event:
			_last_event = event.id
			if s.tick - event.tick <= 5:
				_add_burst(event)
	queue_redraw()

func screen_position(seat: int) -> Vector2:
	return _shown[seat] if seat >= 0 and seat < _shown.size() else Vector2.ZERO

func actor_color(seat: int) -> Color:
	if _s.mode == SodaState.Mode.CTF:
		return TEAM_COLORS[_s.fighters[seat].team]
	return SEAT_COLORS[seat]

func _process(dt: float) -> void:
	if _s == null:
		return
	_clock += dt
	_since += dt
	var t := clampf(_since / _period, 0, 1)
	for f in _s.fighters:
		_shown[f.seat] = _start[f.seat].lerp(f.pos, t)
		_hurt[f.seat] = maxf(0, _hurt[f.seat] - dt)
	for shot in _s.shots:
		var from: Vector2 = _shot_start.get(shot.id, shot.pos)
		_shot_shown[shot.id] = from.lerp(shot.pos, t)
	for i in range(_bursts.size() - 1, -1, -1):
		var effect := _bursts[i]
		effect.age += dt
		if effect.age >= effect.ttl:
			_bursts.remove_at(i)
	queue_redraw()

func _draw() -> void:
	if _floor:
		draw_texture(_floor, Vector2.ZERO)
	if _s == null:
		return
	_draw_objects()
	var order: Array[SodaState.Fighter] = _s.fighters.duplicate()
	order.sort_custom(func(a: SodaState.Fighter, b: SodaState.Fighter) -> bool: return _shown[a.seat].y < _shown[b.seat].y)
	for f in order:
		if f.respawn_ticks == 0 and f.hp > 0:
			_draw_fighter(f)
	for shot in _s.shots:
		_draw_shot(shot)
	for effect in _bursts:
		_draw_burst(effect)
	if cursor_on and _local >= 0 and _s.fighters[_local].hp > 0 and _s.result == null:
		_draw_cursor(cursor.round())

func _draw_objects() -> void:
	for pickup in _s.pickups:
		var at := pickup.pos.round()
		if pickup.cooldown == 0:
			var bob := roundf(sin(_clock * 3.5 + at.y))
			_ground_shadow(at + Vector2(0, 4), 5)
			if _bottle:
				draw_texture(_bottle, at + Vector2(-8, -10 + bob))
		else:
			draw_rect(Rect2(at.x - 6, at.y + 4, 12, 3), INK)
			draw_rect(Rect2(at.x - 5, at.y + 5, roundf(10.0 * (1.0 - pickup.cooldown / 200.0)), 1), MINT)
	for flag in _s.flags:
		if flag.carrier < 0 and _flags[flag.team]:
			draw_texture(_flags[flag.team], flag.pos.round() - Vector2(5, 18))

func _draw_fighter(f: SodaState.Fighter) -> void:
	var at := _shown[f.seat].round()
	var hue := actor_color(f.seat)
	var feet := at + Vector2(0, 7)
	_ground_shadow(feet + Vector2(1, 1), 8)
	_oval(feet, hue, 1.0 if f.seat == _local else 0.7)
	var aim := f.aim
	if f.seat == _local and cursor_on and cursor.distance_squared_to(at) > 4:
		aim = at.direction_to(cursor)
	var row := _facing(aim)
	var walking := _move[f.seat] > 0.3 and _since < 0.24 and _s.result == null
	var col := 2 + (int(_clock * 10.0 + f.seat) % 4) if walking else int(fmod(_clock + f.seat * 0.35, 2.2) > 2.07)
	var behind := aim.y < -0.4
	if behind:
		_draw_tool(at + Vector2(0, -1), aim, f.weapon)
	var sprite := _sheets[f.skin]
	if sprite:
		var region := Rect2(Vector2(col, row) * SHEET_SIZE, SHEET_SIZE)
		var tint := Color("#ffbcba") if _hurt[f.seat] > 0.0 else Color.WHITE
		draw_texture_rect_region(sprite, Rect2(at - CENTER, SHEET_SIZE), region, tint)
	if not behind:
		_draw_tool(at + Vector2(0, -1), aim, f.weapon)
	if f.shield_ticks > 0 or f.invuln_ticks > 0:
		var shell := MINT if f.shield_ticks > 0 else PAPER
		_shell(at + Vector2(0, -2), shell, f.shield_ticks > 0)
	if f.carrying >= 0 and _flags[f.carrying]:
		draw_texture(_flags[f.carrying], at + Vector2(6 + roundf(sin(_clock * 9)), -25))

func _ground_shadow(at: Vector2, half: int) -> void:
	var shade := Color("#25243d55")
	draw_rect(Rect2(at.x - half, at.y - 1, half * 2, 3), shade)
	draw_rect(Rect2(at.x - half + 2, at.y + 2, half * 2 - 4, 1), shade)

func _oval(feet: Vector2, hue: Color, opacity: float) -> void:
	var tint := Color(hue, opacity)
	for i in PIXEL_RING.size():
		draw_line(feet + PIXEL_RING[i], feet + PIXEL_RING[(i+1) % PIXEL_RING.size()], tint, 1.0)

func _shell(at: Vector2, hue: Color, active: bool) -> void:
	var points := PackedVector2Array()
	for n in 12:
		points.append((at + Vector2.from_angle(TAU * n / 12.0) * Vector2(13, 15)).round())
	points.append(points[0])
	if active:
		draw_colored_polygon(points.slice(0, 12), Color(hue, 0.15))
	draw_polyline(points, Color(hue, 0.85), 1.0)
	var glint := int(_clock * 9.0) % 12
	draw_line(points[glint], points[glint + 1], PAPER, 1)

static func _facing(aim: Vector2) -> int:
	if absf(aim.x) > absf(aim.y):
		return 1 if aim.x >= 0 else 3
	return 0 if aim.y >= 0 else 2

func _draw_tool(center: Vector2, aim: Vector2, weapon: int) -> void:
	var angle := snappedf(aim.angle(), TAU / 16.0)
	var dir := Vector2.from_angle(angle)
	var at := (center + dir * 6).round()
	draw_set_transform(at, angle)
	match weapon:
		0:
			draw_rect(Rect2(0,-2,9,4), INK)
			draw_rect(Rect2(1,-1,6,2), TOOLS[0])
			draw_rect(Rect2(6,-2,3,2), PAPER)
		1:
			draw_rect(Rect2(0,-2,5,4), INK)
			draw_rect(Rect2(4,-3,5,6), INK)
			draw_rect(Rect2(2,-1,5,2), TOOLS[1])
			draw_rect(Rect2(7,-2,2,4), TOOLS[1])
			draw_rect(Rect2(7,-2,2,1), PAPER)
		2:
			draw_rect(Rect2(0,-2,4,4), INK)
			draw_rect(Rect2(3,-3,7,6), INK)
			draw_rect(Rect2(4,-2,4,4), TOOLS[2])
			draw_rect(Rect2(5,-2,2,1), PAPER)
			draw_rect(Rect2(9,-2,2,4), INK)
	draw_set_transform(Vector2.ZERO, 0)

func _draw_shot(shot: SodaState.Shot) -> void:
	var at: Vector2 = _shot_shown.get(shot.id, shot.pos)
	at = at.round()
	var forward := shot.velocity.normalized()
	var tail := (at - forward * (6 if shot.weapon == 2 else 4)).round()
	var hue: Color = SHOT_COLORS[shot.weapon]
	var wake := (tail - forward * 3.0).round()
	draw_line(wake, tail, Color(actor_color(shot.owner), 0.9), 2)
	draw_line(tail, at, Color(hue, 0.8), 2)
	match shot.weapon:
		0:
			draw_rect(Rect2(at - Vector2(2,2), Vector2(4,4)), INK)
			draw_rect(Rect2(at - Vector2(1,2), Vector2(2,3)), hue)
			draw_rect(Rect2(at - Vector2(1,2), Vector2.ONE), PAPER)
		1:
			_star(at, hue, 3)
		2:
			draw_circle(at, 4, INK)
			draw_circle(at, 3, hue)
			draw_rect(Rect2(at.x - 2, at.y - 2, 2, 1), PAPER)

func _star(at: Vector2, hue: Color, radius: int) -> void:
	draw_rect(Rect2(at.x - radius, at.y - 1, radius * 2 + 1, 3), INK)
	draw_rect(Rect2(at.x - 1, at.y - radius, 3, radius * 2 + 1), INK)
	draw_rect(Rect2(at.x - radius + 1, at.y, radius * 2 - 1, 1), hue)
	draw_rect(Rect2(at.x, at.y - radius + 1, 1, radius * 2 - 1), hue)
	draw_rect(Rect2(at, Vector2.ONE), PAPER)

func _draw_cursor(at: Vector2) -> void:
	var r := 5
	var tint := Color("#fff8db")
	for dir in [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]:
		var start: Vector2 = at + dir * r
		draw_line(start - dir, start + dir * 2, INK, 3.0)
		draw_line(start, start + dir * 2, tint, 1.0)

func _add_burst(event: SodaState.MatchEvent) -> void:
	var b := Burst.new()
	b.kind = event.kind
	b.at = event.pos
	b.seed_no = event.id
	b.aim = _s.fighters[event.seat].aim
	b.hue = actor_color(event.seat)
	match b.kind:
		&"fire":
			b.ttl = 0.105
			b.at = _s.fighters[event.seat].pos + b.aim * 14
			b.hue = TOOLS[_s.fighters[event.seat].weapon]
		&"hit":
			b.ttl = 0.18
			if event.target >= 0:
				_hurt[event.target] = 0.12
		&"pop": b.ttl = 0.48
		&"heal", &"take", &"capture", &"respawn", &"return": b.ttl = 0.54
		&"dash", &"shield": b.ttl = 0.25
		_: return
	_bursts.append(b)

func _draw_burst(b: Burst) -> void:
	var t := clampf(b.age / b.ttl, 0.0, 1.0)
	var origin := b.at.round()
	match b.kind:
		&"fire": _star(origin, b.hue, 2 if t > 0.55 else 3)
		&"hit": _confetti(b, t, 5, 9.0)
		&"pop": _confetti(b, t, 14, 21.0)
		&"heal":
			for i in 3:
				var at := (origin + Vector2((i - 1) * 5, -3 - t * 15 - (i % 2) * 3)).round()
				draw_rect(Rect2(at.x - 2, at.y, 5, 1), MINT)
				draw_rect(Rect2(at.x, at.y - 2, 1, 5), MINT)
		&"dash":
			var side := Vector2(-b.aim.y, b.aim.x)
			for i in 3:
				var at := origin + (i-1) * side * 3 - b.aim * t * 6
				draw_line(at.round(), (at - b.aim * (8 - t * 6)).round(), Color(PAPER, 1.0-t), 1)
		&"shield", &"take", &"capture", &"respawn", &"return":
			var tint := GOLD if b.kind == &"capture" or b.kind == &"take" else b.hue
			var rad := 4.0 + t * (22.0 if b.kind == &"capture" else 13.0)
			var poly := PackedVector2Array()
			for i in 9:
				poly.append((origin + Vector2.from_angle(i * TAU / 8.0) * Vector2(rad,rad * 0.65)).round())
			draw_polyline(poly, Color(tint, 1.0 - t), 1)

func _confetti(b: Burst, t: float, count: int, distance: float) -> void:
	for n in count:
		var phase := TAU * float(n) / count + fmod(b.seed_no * 0.41, TAU)
		var radius := distance * (1.0 - (1.0 - t) * (1.0 - t)) * (0.65 + 0.35 * absf(sin(n * 4.1)))
		var p := (b.at + Vector2.from_angle(phase) * radius + Vector2(0, t * t * 5)).round()
		var color := PAPER if n % 3 == 0 else (GOLD if n % 3 == 1 else b.hue)
		var width := 2 if t < 0.65 and n % 2 == 0 else 1
		draw_rect(Rect2(p, Vector2(width, width)), Color(color, minf(1, (1.0-t) * 2.5)))
