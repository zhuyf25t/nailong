extends Control

const WORLD := Vector2(480, 288)
const SLOTS := [104, 240, 376]
const COAL := Color("#211d29")
const INK := Color("#17262e")
const GLASS := Color("#35454b")
const TEAL := Color("#6c9994")
const SEA := Color("#a6d6b4")
const WARM := Color("#ffe7a3")
const HONEY := Color("#e2aa62")
const RUST := Color("#c66a54")
const ALERT := Color("#fb9471")
const LAVENDER := Color("#a8a5be")

var floor_art: Texture2D
var dragon_art: Texture2D
var frog_art: Texture2D
var egg_art: Texture2D
var hand_art: Texture2D

func load_world_art() -> void:
	floor_art = _texture("res://assets/night/factory/floor.png")
	dragon_art = _texture("res://assets/night/cast/dragon.png")
	frog_art = _texture("res://assets/night/cast/frog.png")
	egg_art = _texture("res://assets/night/cast/egg.png")
	hand_art = _texture("res://assets/night/cast/hand.png")

func _texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path):
		return load(path) as Texture2D
	return null

func box(x: float, y: float, w: float, h: float, color: Color) -> void:
	draw_rect(Rect2(roundf(x), roundf(y), w, h), color)

func line_px(a: Vector2, b: Vector2, color: Color, width: float = 1) -> void:
	draw_line(a.round(), b.round(), color, width, false)

func dots(a: Vector2, b: Vector2, color: Color, step: float, span: float = 1.0) -> void:
	var delta := b - a
	var length := delta.length()
	if length < 1.0:
		return
	var dir := delta / length
	for i in range(0, ceili(length), maxi(1, roundi(step))):
		var p := (a + dir * float(i)).round()
		box(p.x, p.y, span, span, color)

func _arrow(p: Vector2, heading: int, color: Color, large: bool = false) -> void:
	var k: int = 2 if large else 1
	box(p.x - 3 * k, p.y, 7 * k, k, color)
	for i in range(1, 4):
		var x := p.x + heading * (4 - i) * k
		box(x, p.y - i * k, k, k, color)
		box(x, p.y + i * k, k, k, color)

func base_room(dark: bool, panic: bool) -> void:
	if floor_art:
		draw_texture(floor_art, Vector2.ZERO)
	else:
		box(0, 0, WORLD.x, WORLD.y, GLASS)
	if dark:
		box(0, 0, WORLD.x, WORLD.y, Color("#1418318b"))
		box(0, 95, WORLD.x, 160, Color("#1822381c"))
	if panic:
		box(0, 0, WORLD.x, WORLD.y, Color("#5022325c"))

func shutter(cx: int, dark: bool) -> void:
	var light := Color("#4b565b") if dark else Color("#667574")
	var shadow := Color("#313846") if dark else Color("#485357")
	box(cx - 40, 26, 80, 49, INK)
	for y in range(28, 69, 6):
		box(cx - 38, y, 76, 4, light)
		box(cx - 38, y + 1, 76, 2, shadow)
	box(cx - 38, 70, 76, 4, shadow)
	box(cx - 7, 70, 14, 3, INK)
	box(cx - 5, 70, 10, 1, TEAL)

func booth(cx: int, actor: String, look: String, clock: float, quiet: bool, dim: bool, first_laugh: bool) -> void:
	var heading: int = -1 if look == "left" else (1 if look == "right" else 0)
	# The colored light and number identify an open window even during a blackout.
	var rim := SEA if dim else WARM
	box(cx - 38, 27, 76, 1, Color(rim, 0.40))
	box(cx - 37, 73, 74, 1, Color(rim, 0.5))
	box(cx - 22, 71, 44, 2, Color("#20243189"))
	var frame: int = 3 if first_laugh else (1 if heading < 0 else (2 if heading > 0 else 0))
	var sheet: Texture2D = frog_art if actor == "frog" else egg_art
	var breath := 1 if sin(clock * 2.7 + cx) > 0.68 else 0
	if quiet:
		breath = 0
	if sheet:
		var position_px := Vector2(cx - 24 + heading, 26 + breath)
		var tint := Color("#c2c9b8") if dim else Color.WHITE
		draw_texture_rect_region(sheet, Rect2(position_px, Vector2(48, 48)),
			Rect2(frame * 48, 0, 48, 48), tint)
	if heading != 0:
		# Two redundant cues accompany the face: the cap-side lamp and its arrow.
		var px := cx + heading * 29
		box(px - 6, 51, 13, 9, INK)
		box(px - 5, 51, 11, 1, Color(TEAL, 0.85))
		_arrow(Vector2(px, 55), heading, WARM)
		box(px - 5, 72, 11, 1, WARM)
		box(px - 3, 71, 7, 1, HONEY)

func glass_guard(cx: int) -> void:
	# The ribbed amber glass is continuous across the front; the two sides are open.
	box(cx - 34, 79, 68, 8, Color("#345862b8"))
	box(cx - 34, 79, 68, 1, Color("#91bab1"))
	box(cx - 34, 85, 68, 2, INK)
	for dx in [-30, -26, 25, 29]:
		line_px(Vector2(cx + dx, 84), Vector2(cx + dx + 3, 80), Color("#b5ccaf"))
	for dx in [-35, 32]:
		box(cx + dx, 78, 3, 9, COAL)
		box(cx + dx, 77, 3, 2, HONEY)
	for dx in [-9, -3, 3, 9]:
		line_px(Vector2(cx + dx, 84), Vector2(cx + dx + 3, 81), HONEY)

func conveyor(heading: int, clock: float) -> void:
	if heading == 0:
		return
	box(14, 167, 452, 2, Color("#252731bd"))
	box(14, 169, 452, 32, Color("#384047ad"))
	box(14, 200, 452, 3, Color("#293137e3"))
	box(14, 201, 452, 1, Color("#a5a19a"))
	var offset := posmod(roundi(clock * 18.0) * heading, 16)
	for x in range(17 + offset, 460, 16):
		line_px(Vector2(x, 171), Vector2(x - 3, 197), Color("#7476718a"))
	for x in range(70, 460, 80):
		_arrow(Vector2(x, 185), heading, Color("#c9c3a5bd"))
	for y in [168, 200]:
		for x in range(22, 465, 22):
			box(x, y, 2, 1, TEAL)

func hardware(active_side: String, latched: bool, escaping: bool, clockout: bool, clock: float) -> void:
	var beat := (sin(clock * 3.8) + 1.0) * 0.5
	for side: String in ["left", "right"]:
		var cx := 46 if side == "left" else 434
		var active := escaping and side == active_side and not latched
		var thrown := escaping and side == active_side and latched
		var lamp := WARM if active else (SEA if thrown else Color("#718485"))
		box(cx - 7, 216, 14, 7, INK)
		box(cx - 5, 216, 10, 1, TEAL)
		var end := Vector2(cx + 4 if thrown else cx - 4, 213 if thrown else 211)
		line_px(Vector2(cx, 219), end, COAL, 4)
		line_px(Vector2(cx, 219), end, Color("#b8b6aa"), 2)
		box(end.x - 3, end.y - 1, 6, 3, lamp)
		if active:
			_brackets(Vector2(cx, 217), 13, 10, Color(WARM, 0.70 + 0.3 * beat))
			_down_chevron(Vector2(cx, 202 - floorf(beat * 2.0)), WARM)
	var exit_open := clockout or (escaping and latched)
	if exit_open:
		for i in range(3):
			var p := Vector2(240, 249 + i * 6 + floorf(beat * 2))
			_down_chevron(p, Color(SEA, 0.52 + i * 0.17))
		box(218, 269, 45, 2, SEA)
		_brackets(Vector2(240, 261), 22, 10, Color(SEA, 0.83))

func _down_chevron(p: Vector2, color: Color) -> void:
	for i in range(4):
		box(p.x - 3 + i, p.y + i, 1, 2, color)
		box(p.x + 3 - i, p.y + i, 1, 2, color)

func _brackets(p: Vector2, rx: int, ry: int, color: Color) -> void:
	for x in [-1, 1]:
		for y in [-1, 1]:
			var corner := p + Vector2(x * rx, y * ry)
			line_px(corner, corner - Vector2(x * 5, 0), color)
			line_px(corner, corner - Vector2(0, y * 4), color)

func player_sprite(p: Vector2, row: int, frame: int, carrying: bool) -> void:
	var w := 11 if frame == 0 else 10
	box(p.x - w, p.y + 7, w * 2, 3, Color("#24233377"))
	box(p.x - w + 2, p.y + 9, w * 2 - 4, 2, Color("#24233344"))
	if dragon_art:
		draw_texture_rect_region(dragon_art, Rect2(p.round() - Vector2(16, 29), Vector2(32, 40)),
			Rect2(frame * 32, row * 40, 32, 40))
	if carrying:
		var offset := Vector2(-10, -4) if row == 3 else Vector2(9, -4)
		draw_bottle(p + offset, Vector2.UP, false, true)

func draw_bottle(p: Vector2, velocity: Vector2, bounced: bool, small: bool = false) -> void:
	var axis := velocity.normalized()
	if axis == Vector2.ZERO:
		axis = Vector2.UP
	var right := Vector2(-axis.y, axis.x)
	var along := 2.0 if small else 3.0
	var width := 1.0 if small else 2.0
	var tail := p - axis * along
	var neck := p + axis * along
	line_px(tail, neck, INK, width * 2 + 2)
	line_px(tail, neck, Color("#6cb7a1") if not bounced else WARM, width * 2)
	line_px(p - axis, p + axis, Color("#f2d79a"), width * 2 + 1)
	line_px(neck, neck + axis * 2, SEA, 2)
	line_px(neck + axis * 3 - right, neck + axis * 3 + right, RUST, 2)
	if not small:
		line_px(tail - axis * 3, tail - axis * 8, Color(SEA, 0.7), 2)
		line_px(tail - axis * 11, tail - axis * 13, Color(SEA, 0.4))

func cap_sprite(p: Vector2) -> void:
	box(p.x - 3, p.y - 1, 7, 3, INK)
	box(p.x - 2, p.y - 2, 5, 3, HONEY)
	box(p.x - 1, p.y - 2, 3, 1, WARM)
	box(p.x - 1, p.y - 1, 2, 1, RUST)

func impact(p: Vector2, progress: float, color: Color) -> void:
	if progress < 0.0 or progress >= 1.0:
		return
	for i in range(8):
		var direction := Vector2.RIGHT.rotated(TAU * i / 8.0)
		var inner := 3.0 + progress * 9.0
		var outer := inner + (1.0 - progress) * 4.0
		line_px(p + direction * inner, p + direction * outer, Color(color, 1.0 - progress))

func cabinet_hand(cx: float, age: float) -> void:
	var emerge := clampf(age * 2, 0.0, 1.0)
	var sway := sin(age * 2.2)
	var reach := Vector2(0, 2 + 12 * emerge)
	var tip := Vector2(cx + sway * 2, 82) + reach
	var root_point := Vector2(cx + 9, 84)
	var elbow := Vector2(lerpf(root_point.x, tip.x, 0.5) + 8, lerpf(root_point.y, tip.y, 0.55))
	var open := roundi(emerge * 6)
	box(cx - 19, 82, 39, 4 + open, COAL)
	box(cx - 17, 82 + open, 35, 1, RUST)
	box(cx - 15, 83 + open, 31, 2, Color("#5d4d51"))
	if age > 1.25:
		return
	line_px(root_point, elbow, Color("#27212d"), 8)
	line_px(elbow, tip, Color("#27212d"), 7)
	line_px(root_point + Vector2(2, 1), elbow + Vector2(2, 0), Color("#786058"), 2)
	_draw_hand(tip, Vector2(-0.4, 1.0), 0.78)

func pursuer(p: Vector2, target: Vector2, actor: String, age: float) -> void:
	# Its foot-level contact patch stays on the authoritative position.
	var out := smoothstep(0.62, 1.56, age)
	if out < 0.02:
		return
	var side: float = signf(target.x - p.x)
	var reach := (target - p).normalized()
	var step := sin(age * 7.5)
	var radius := 4 + int(out * 9)
	box(p.x - radius, p.y + 1, 2 * radius, 3, Color("#1b2029b7"))
	box(p.x - radius + 1, p.y + 3, radius * 2 - 2, 2, Color("#24212c9e"))
	for i in [-1, 1]:
		var wrist := p + Vector2(i * (7 + out * 3), step * i * 1.5)
		_draw_hand(wrist, (reach + Vector2(i * 0.7, 0.45)).normalized(), 0.39 * out)
	var sheet: Texture2D = frog_art if actor == "frog" else egg_art
	if sheet:
		var frame := 1 if side < -0.3 else (2 if side > 0.3 else 0)
		var height := roundi(35.0 * out)
		var dest := Rect2(roundf(p.x - 18), roundf(p.y - height + 2 + step), 36, height)
		draw_texture_rect_region(sheet, dest, Rect2(frame * 48, 0, 48, 48), Color("#918184"))

func latch_closeup(age: float, lever_side: String) -> void:
	if not hand_art or age < 0.0 or age > 2.3:
		return
	# A foreground counter latch is pulled from this side of the glass.
	# It only occupies the corner opposite the lit escape lever.
	var slide := smoothstep(0.0, 0.38, age) * (1.0 - smoothstep(1.45, 2.3, age))
	if slide < 0.01:
		return
	var side := 1 if lever_side == "left" else -1
	var x := 448.0 if side == 1 else 32.0
	var y := roundf(303.0 - slide * 31.0)
	for i in range(4):
		box(x - 32 + i * 2, y - 1 - i, 64 - i * 2, 22, Color("#362e32"))
	box(x - 26, y - 4, 53, 5, Color("#9b7f67"))
	box(x - 23, y - 4, 46, 1, WARM)
	for end in [-1, 1]:
		box(x + end * 17 - 3, y - 7, 6, 8, INK)
		box(x + end * 17 - 2, y - 6, 4, 4, HONEY)
	var bolt := smoothstep(0.62, 0.98, age)
	box(x - 17 + side * (bolt - 0.5) * 10, y - 6, 35, 2, Color("#edc487"))
	var wrist := Vector2(x + side * (17 + (1.0 - bolt) * 9), y + 36)
	_draw_hand(wrist, Vector2(-side * 0.43, -1.0), 1.24)

func _draw_hand(wrist: Vector2, heading: Vector2, factor: float) -> void:
	if not hand_art:
		return
	var rotation_delta := heading.angle() - Vector2(-0.43, -1.0).angle()
	var corners := PackedVector2Array()
	for corner: Vector2 in [Vector2.ZERO, Vector2(32, 0), Vector2(32, 40), Vector2(0, 40)]:
		corners.append((wrist + (corner - Vector2(25, 36)).rotated(rotation_delta) * factor).round())
	var uv := PackedVector2Array([Vector2.ZERO, Vector2.RIGHT, Vector2.ONE, Vector2.DOWN])
	draw_polygon(corners, PackedColorArray([Color.WHITE]), uv, hand_art)
