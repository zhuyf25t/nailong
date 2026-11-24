extends "res://night/world_ink.gd"

# The absolute coordinates in this layer are the simulation's drawing surface.
# Dynamic props, figures and holes always use the coordinates from the snapshot.
const TAR := Color("#141417")
const SOOT := Color("#262526")
const PAPER := Color("#ece2c8")
const ASH := Color("#989486")
const BLOOD := Color("#bc2434")
const FRESH := Color("#f64b4a")
const DRIED := Color("#6e202a")
const STEEL := Color("#43575f")
const FROST := Color("#a7c5c7")

var _horror: Dictionary[String, Texture2D] = {}
var _print_cast: Dictionary[String, Texture2D] = {}
var _stamp_font := SystemFont.new()

func load_story_art() -> void:
	_stamp_font.font_names = PackedStringArray(["Microsoft YaHei UI", "Noto Sans CJK SC", "sans-serif"])
	_stamp_font.font_weight = 650
	for asset: String in ["torn_hand", "palm_mark", "glass_grin", "woodcut_screen", "clock_jaw", "frog_ring", "window_lunge"]:
		_horror[asset] = _texture("res://assets/night/horror/%s.png" % asset)
	for actor: String in ["dragon", "frog", "egg"]:
		var source: Texture2D = dragon_art if actor == "dragon" else (frog_art if actor == "frog" else egg_art)
		if source:
			_print_cast[actor] = _cut_texture(source)

func _cut_texture(source: Texture2D) -> Texture2D:
	var image := source.get_image()
	if image.is_compressed():
		image.decompress()
	image.convert(Image.FORMAT_RGBA8)
	for y in image.get_height():
		for x in image.get_width():
			var col := image.get_pixel(x, y)
			if col.a < 0.05:
				continue
			var value := col.r * 0.32 + col.g * 0.54 + col.b * 0.14
			var stroke := posmod(x + y * 2, 8)
			var tint := TAR
			if value > 0.76:
				tint = PAPER
			elif value > 0.48:
				tint = ASH if stroke == 0 else PAPER
			elif value > 0.25:
				tint = TAR if stroke < 3 else ASH
			if col.r > col.g * 1.6 and value > 0.21:
				tint = BLOOD
			image.set_pixel(x, y, Color(tint, col.a))
	return ImageTexture.create_from_image(image)

func _decal(asset: String, frame: int, frames: int, target: Rect2, tint: Color = Color.WHITE) -> void:
	var sheet: Texture2D = _horror.get(asset)
	if sheet:
		var frame_size := Vector2(sheet.get_width() / float(frames), sheet.get_height())
		draw_texture_rect_region(sheet, target, Rect2(Vector2(frame * frame_size.x, 0), frame_size), tint)

func _panel(x: int, y: int, w: int, h: int, material: Color, edge: Color) -> void:
	box(x, y, w, h, TAR)
	box(x + 1, y + 1, w - 2, h - 2, material)
	box(x + 2, y + 1, w - 4, 1, edge)
	box(x + 1, y + 2, 1, h - 4, edge)
	for dx: int in [3, w - 5]:
		for dy: int in [3, h - 5]:
			box(x + dx, y + dy, 2, 2, TAR)
			box(x + dx, y + dy, 1, 1, edge)

func _picket(x: int, y: int, w: int, teeth: int, depth: int, tint: Color) -> void:
	for i in range(teeth):
		var px := x + i * w / float(teeth)
		var edge := Vector2(px, y)
		draw_colored_polygon(PackedVector2Array([edge, edge + Vector2(7, 0), edge + Vector2(3, depth)]), tint)

func _floorboards(printed: bool, base: Color, line: Color) -> void:
	box(0, 92, 480, 196, base)
	for y in range(95, 289, 18):
		box(0, y, 480, 1, line)
		var shift := posmod(y * 23, 73)
		for x in range(shift - 73, 480, 73):
			box(x, y, 1, 17, line)
			var s := posmod(x * 13 + y, 19)
			box(x + 6 + s, y + 4, 8 + s, 1, Color(line, 0.48))
			if printed:
				line_px(Vector2(x + s + 9, y + 14), Vector2(x + s + 17, y + 11), line)
				box(x + 3, y + 3, 1, 1, line)

func _scratch_block(x: int, y: int, width_px: int, height_px: int, color: Color, seed_value: int) -> void:
	for line_index in range(maxi(4, width_px / 3)):
		var px := x + posmod(line_index * 19 + seed_value * 3, maxi(1, width_px - 9))
		var py := y + posmod(line_index * 31 + seed_value * 7, maxi(1, height_px - 5))
		var run := 3 + posmod(seed_value + line_index, 6)
		line_px(Vector2(px, py + 2), Vector2(px + run, py), color)

func _cable(a: Vector2, b: Vector2, sag: float, tint: Color, thickness: float = 2) -> void:
	var path := PackedVector2Array()
	for i in range(13):
		var t := i / 12.0
		path.append((a.lerp(b, t) + Vector2.DOWN * sin(t * PI) * sag).round())
	draw_polyline(path, tint, thickness, false)

func _wall_pipe(x: int, height_px: int, dark: Color, bright: Color) -> void:
	box(x, 0, 8, height_px, TAR)
	box(x + 1, 0, 6, height_px, dark)
	box(x + 2, 0, 1, height_px, bright)
	for y in range(6, height_px, 21):
		box(x - 2, y, 12, 3, TAR)
		box(x - 2, y, 12, 1, bright)

func _hanging_light(x: int, y: int, light: Color, shadow: Color) -> void:
	box(x, 0, 1, y - 4, shadow)
	box(x - 6, y - 4, 13, 3, shadow)
	box(x - 12, y, 25, 4, shadow)
	box(x - 8, y + 3, 17, 2, light)
	draw_colored_polygon(PackedVector2Array([Vector2(x - 8, y + 5), Vector2(x + 8, y + 5),
		Vector2(x + 52, y + 90), Vector2(x - 52, y + 90)]), Color(light, 0.055))

func _smear(start: Vector2, finish: Vector2, amount: int, tint: Color) -> void:
	var axis := finish - start
	var cross := Vector2(-axis.y, axis.x).normalized()
	for i in range(amount):
		var t := i / float(maxi(1, amount - 1))
		var wobble := sin(i * 1.9) * 2 + sin(t * PI * 2) * 3
		var p := start + axis * t + cross * wobble
		var w := (1.0 - t) * 3.0 + 1.0
		line_px(p, p + axis.normalized() * (4 + posmod(i * 7, 9)), tint, w)
		if i % 4 == 0:
			var speck := p + cross * (4 + posmod(i * 5, 11))
			box(speck.x, speck.y, 2, 1, tint)

func _maintenance(study: bool) -> void:
	if not study:
		# Above the hatch the familiar shift has not lost its warm overhead lamps.
		base_room(false, false)
		for cx: int in SLOTS:
			shutter(cx, false)
		return
	box(0, 0, 480, 288, Color("#10171c"))
	_floorboards(false, Color("#344249"), Color("#27333a"))
	# Cross section of the suspended floor. Rebars and wrists bear its weight.
	for row in range(2):
		for x in range(-30 + row * 16, 480, 33):
			var sag := posmod(x * 7, 3)
			_panel(x, row * 9 + sag, 32, 9, STEEL, Color("#76878a"))
	box(0, 21, 480, 3, Color("#6e6862"))
	for x in range(3, 480, 11):
		line_px(Vector2(x, 22), Vector2(x + 4, 25 + posmod(x * 13, 11)), STEEL)
	for x in [16, 160, 308, 459]:
		_wall_pipe(x, 89, STEEL, Color("#80979d"))
	for cx: int in SLOTS:
		_panel(cx - 43, 31, 86, 64, Color("#2b363c"), FROST)
		box(cx - 36, 38, 72, 49, Color("#0c151c"))
		for yy in range(39, 85, 4):
			box(cx - 35, yy, 70, 1, Color("#263642"))
		box(cx - 34, 88, 20, 2, Color("#93aca6"))
		box(cx + 29, 88, 3, 2, BLOOD)
	for x in [42, 184, 320, 443]:
		var f := posmod(x, 3)
		_decal("torn_hand", f, 3, Rect2(x - 12, 16, 26, 52))
		_panel(x - 11, 65, 24, 6, STEEL, Color("#70828b"))
		box(x - 8, 70, 5, 20, Color("#29353b"))
		box(x + 6, 70, 3, 20, Color("#29353b"))
	for x in [58, 207, 412]:
		_decal("palm_mark", 0, 1, Rect2(x, 102 + x % 16, 22, 20), Color("#a99e9ab7"))
	for x in [25, 443]:
		_hanging_light(x, 25, FROST, STEEL)
	box(0, 91, 480, 3, TAR)
	for x in range(8, 480, 22):
		box(x, 92, 3, 1, STEEL)
	_smear(Vector2(26, 154), Vector2(141, 171), 21, Color("#663039"))
	# Floor-edge channels descend another storey. The ladder drops out of frame.
	for x in [3, 452]:
		_panel(x, 161, 25, 97, Color("#16242b"), STEEL)
		for y in range(167, 254, 7):
			line_px(Vector2(x + 3, y + 3), Vector2(x + 21, y - 1), Color("#3e4d52"), 2)
	box(0, 269, 480, 19, Color("#1b272e"))
	for x in range(-12, 480, 32):
		line_px(Vector2(x, 287), Vector2(x + 23, 270), STEEL, 3)
		line_px(Vector2(x + 5, 270), Vector2(x + 26, 287), Color("#314049"), 3)
	box(0, 269, 480, 2, Color("#61727a"))
	for x in [80, 92]:
		box(x, 260, 3, 28, TAR)
		box(x, 260, 1, 28, FROST)
	for y in range(263, 288, 6):
		box(82, y, 11, 2, STEEL)
	_cable(Vector2(1, 0), Vector2(167, 4), 22, TAR)
	_cable(Vector2(335, 0), Vector2(477, 4), 19, TAR, 3)
	_scratch_block(54, 202, 64, 46, Color("#43535a"), 6)
	_scratch_block(307, 146, 96, 51, Color("#2c393f"), 9)

func _wheel(center: Vector2, radius: int, edge: Color, fill: Color, theta: float) -> void:
	draw_circle(center, radius, TAR)
	draw_circle(center, radius - 2, edge)
	draw_circle(center, radius - 4, fill)
	for i in range(6):
		var end := center + Vector2(radius - 4, 0).rotated(i * TAU / 6 + theta)
		line_px(center, end, edge, 2)
	draw_circle(center, 3, TAR)

func _signature_room(printed: bool, phase_time: float) -> void:
	var paper := PAPER if printed else Color("#bdab87")
	var light := ASH if printed else Color("#879f93")
	var steel := SOOT if printed else Color("#4b6869")
	box(0, 0, 480, 288, steel)
	_floorboards(printed, Color("#a9a596") if printed else Color("#a2957b"), Color("#716f65") if printed else Color("#887f6e"))
	# Rollers feed one continuous sheet through three steel printing stations.
	box(0, 12, 480, 13, TAR)
	box(0, 14, 480, 3, light)
	for cx in [74, 238, 405]:
		_panel(cx - 58, 26, 116, 59, steel, light)
		for yy in range(34, 67, 4):
			line_px(Vector2(cx - 52, yy), Vector2(cx - 31, yy - 4), light)
		_wheel(Vector2(cx, 40), 16, light, steel, phase_time * 0.24)
		_wheel(Vector2(cx + 34, 39), 9, light, steel, -phase_time * 0.32)
		_cable(Vector2(cx - 5, 23), Vector2(cx + 36, 29), -2, TAR, 2)
		box(cx - 32, 57, 65, 12, TAR)
		box(cx - 24, 64, 48, 18, paper)
		for row in range(4):
			box(cx - 19, 66 + row * 3, 8 + posmod(row * 13 + cx, 27), 1, steel)
		box(cx + 7, 68, 8, 7, steel)
		box(cx + 9, 69, 4, 3, paper)
		box(cx + 8, 73, 6, 2, paper)
		for y in [54, 70]:
			box(cx - 40, y, 81, 3, TAR)
			box(cx - 40, y, 81, 1, light)
		box(cx - 55, 85, 9, 8, TAR)
		box(cx + 46, 85, 9, 8, TAR)
	if printed:
		for x in range(2, 480, 7):
			line_px(Vector2(x, 0), Vector2(x - 8, 9), ASH)
		_smear(Vector2(257, 92), Vector2(377, 137), 26, DRIED)
		_smear(Vector2(308, 207), Vector2(442, 242), 31, BLOOD)
		_decal("palm_mark", 0, 1, Rect2(373, 114, 26, 23))
		for cx in [63, 238, 405]:
			_picket(cx - 24, 72, 48, 7, 6, BLOOD)
			for i in range(4):
				box(cx - 20 + i * 11, 75, 2, 4 + (cx * i) % 12, DRIED)
		for sx in [4, 108, 191, 294, 434]:
			_scratch_block(sx, 102 + sx % 58, 41, 28, Color("#817f75"), sx)
		# Piled galley proofs in the margins carry the same face over and over.
		for side in [0, 1]:
			var x: int = 4 if side == 0 else 438
			for i in range(5):
				var y: int = 230 + i * 7
				var left: int = x + posmod(i * 7, 9)
				box(left + 2, y + 2, 31, 17, TAR)
				box(left, y, 31, 17, PAPER)
				box(left + 2, y + 2, 26, 1, TAR)
				box(left + 3, y + 5, 9, 7, SOOT)
				box(left + 6, y + 6, 3, 2, PAPER)
				for j in range(3):
					box(left + 14, y + 5 + j * 3, 7 + j, 1, SOOT)
				box(left + 16, y + 13, 11, 2, BLOOD)
		for i in range(22):
			var x := posmod(i * 37 + 6, 479)
			var h := 2 + posmod(i * 17, 9)
			line_px(Vector2(x, 288), Vector2(x + 5, 288 - h), TAR, 2)
	else:
		_hanging_light(149, 10, WARM, TAR)
		_hanging_light(321, 10, WARM, TAR)

func _clock_hall(phase_time: float, aim: Vector2) -> void:
	box(0, 0, 480, 288, SOOT)
	_floorboards(true, Color("#6a6660"), Color("#4e4c48"))
	# Rows of original punched cards line the wall. The missing sheets leave
	# rectangular black silhouettes between the employee records.
	var gaze := (aim - Vector2(240, 180)).normalized() if Rect2(Vector2.ZERO, WORLD).has_point(aim) else Vector2.ZERO
	for bank_center in [14, 287]:
		var bank := int(bank_center) + roundi(gaze.x * 4)
		var dy := roundi(gaze.y * 2)
		_panel(bank, 8 + dy, 179, 75, TAR, ASH)
		for row in range(3):
			for col in range(12):
				var x: int = bank + 7 + col * 14
				var y: int = 15 + row * 22 + dy
				if (col * 3 + row) % 9 == 0:
					continue
				box(x, y, 10, 15, ASH if (col + row) % 3 == 0 else PAPER)
				box(x + 1, y + 2, 7, 2, DRIED)
				for i in range(3):
					box(x + 2 + 2 * i, y + 8 + (i + col) % 3, 1, 2, TAR)
				box(x - 1, y + 12, 13, 3, SOOT)
	_panel(197, 0, 86, 96, SOOT, PAPER)
	_panel(203, 4, 74, 88, TAR, ASH)
	var c := Vector2(240, 32)
	draw_circle(c + Vector2(1, 2), 24, BLOOD)
	draw_circle(c, 24, TAR)
	draw_circle(c, 21, PAPER)
	for i in range(12):
		var axis := Vector2.UP.rotated(i * TAU / 12)
		line_px(c + axis * 16, c + axis * 19, TAR)
	line_px(c, c + Vector2(7, -12), TAR, 2)
	line_px(c, c + Vector2(-12, 3), TAR, 2)
	line_px(c, c + Vector2.UP.rotated(floorf(phase_time) * TAU / 60) * 17, BLOOD)
	box(218, 64, 44, 8, BLOOD)
	box(218, 65, 44, 4, TAR)
	_picket(219, 64, 43, 8, 3, PAPER)
	_smear(Vector2(238, 73), Vector2(218, 142), 17, DRIED)
	_smear(Vector2(345, 119), Vector2(429, 207), 26, BLOOD)
	for x in [12, 153, 309, 449]:
		_decal("palm_mark", 0, 1, Rect2(x, 81 + x % 7, 20, 18), Color("#cf8c80ce"))

func story_back(s: Dictionary, t: float, aim: Vector2) -> void:
	var step := String(s.get("step", ""))
	match String(s.get("room", "factory")):
		"maintenance":
			_maintenance(step != "enter_hatch")
		"signatures":
			_signature_room(is_printed(s), t)
		"sleepward":
			_clock_hall(t, aim)

func is_printed(s: Dictionary) -> bool:
	var room := String(s.get("room", "factory"))
	return room == "sleepward" or (room == "signatures" and String(s.get("step", "")) != "check_signature")

func story_tiles(s: Dictionary, t: float) -> void:
	var room := String(s.get("room", "factory"))
	var tile_size := Vector2(40, 32) if room == "signatures" else Vector2(24, 24)
	for tile: Dictionary in s.get("tiles", []):
		var p := Vector2(tile.x, tile.y)
		var at := p - tile_size / 2.0
		var w := tile_size.x
		var h := tile_size.y
		var state := String(tile.state)
		if state == "solid":
			box(at.x + 1, at.y + 1, w - 2, 1, Color(PAPER, 0.25))
			continue
		var warning := FRESH if is_printed(s) else Color("#f2a14f")
		var rim := warning if state == "warn" else ASH
		var body := Color("#73564d") if state == "warn" else (TAR if state == "hole" else STEEL)
		draw_rect(Rect2(at, tile_size), body)
		box(at.x, at.y, w, 2, rim)
		box(at.x, at.y, 1, h, Color(rim, 0.68))
		box(at.x + 1, at.y + h - 2, w - 2, 2, SOOT)
		if state == "warn":
			var crack := PackedVector2Array([p + Vector2(-w * 0.42, -4), p + Vector2(-3, -1),
				p + Vector2(-4, 3), p + Vector2(1, 1), p + Vector2(5, 6), p + Vector2(w * 0.42, 8)])
			draw_polyline(crack, TAR, 2, false)
			for i in range(3):
				box(at.x + 4 + i * 3, at.y + 4, 2, 2, rim if i < 1 + posmod(floori(t * 3), 3) else SOOT)
		elif state == "hole":
			for i in range(3):
				line_px(at + Vector2(4 + i * (w / 3), 2), at + Vector2(7 + i * (w / 3), 6 + i), STEEL, 2)
			box(at.x + 2, at.y + h - 5, w - 5, 1, DRIED)
		elif state == "mend":
			box(at.x + 1, at.y + h * 0.48, w - 2, h * 0.45, Color("#847d70"))
			for i in range(3):
				box(p.x - 5 + i * 3, p.y - 4 + abs(i - 1), 2, 5, FROST)
			box(p.x - 6, p.y, 12, 2, DRIED)

func _stamp(p: Vector2, words: String, tint: Color) -> void:
	var width := ceili(_stamp_font.get_string_size(words, HORIZONTAL_ALIGNMENT_LEFT, -1, 8).x) + 8
	var left := clampi(roundi(p.x - width * 0.5), 1, 478 - width)
	box(left, p.y - 8, width, 11, TAR)
	box(left, p.y - 8, 2, 11, tint)
	draw_string(_stamp_font, Vector2(left + 4, p.y), words, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, tint)

func _plate(p: Vector2, on: bool, edge: Color) -> void:
	_panel(int(p.x - 17), int(p.y - 7), 35, 14, SOOT, edge)
	box(p.x - 12, p.y - (1 if on else 4), 25, 5, edge)
	for i in range(5):
		box(p.x - 10 + 5 * i, p.y - (1 if on else 4), 2, 4, TAR)
	box(p.x - 10, p.y + 4, 21, 1, FRESH if on else ASH)

func _gate(p: Vector2, opened: bool, edge: Color, compact: bool) -> void:
	var x := roundi(p.x)
	var y := roundi(p.y)
	if not compact:
		for yy in range(100, 282, 5):
			if absi(yy - y) < 20:
				continue
			box(x - 3, yy, 6, 5, TAR)
			line_px(Vector2(x - 2, yy + 4), Vector2(x + 2, yy), edge)
	for sign_y in [-1, 1]:
		_panel(x - 5, y + sign_y * 18 - 4, 11, 8, SOOT, edge)
	if opened:
		for yy in range(y - 13, y + 14, 6):
			box(x, yy, 2, 2, edge)
		_arrow(Vector2(x + 5, y), 1, edge)
	else:
		box(x - 2, y - 15, 5, 31, TAR)
		for yy in range(y - 13, y + 14, 6):
			box(x - 1, yy, 3, 3, BLOOD)

func _console(p: Vector2, tape: bool, active: bool, edge: Color) -> void:
	var x := int(p.x)
	var y := int(p.y)
	_panel(x - 14, y - 15, 29, 22, SOOT, edge)
	box(x - 11, y - 12, 23, 11, TAR)
	if tape:
		for dx in [-6, 6]:
			draw_circle(Vector2(x + dx, y - 7), 4, edge)
			draw_circle(Vector2(x + dx, y - 7), 2, TAR)
		box(x - 6, y - 5, 12, 1, edge)
	else:
		box(x - 7, y - 11, 14, 10, PAPER)
		for i in range(3):
			box(x - 5, y - 9 + i * 3, 5 + i, 1, BLOOD)
	box(x - 7, y + 2, 11, 2, ASH)
	box(x + 7, y + 1, 3, 3, FRESH if active else edge)

func _exit_prop(p: Vector2, tint: Color) -> void:
	_panel(int(p.x - 15), int(p.y - 26), 31, 33, SOOT, tint)
	box(p.x - 10, p.y - 21, 21, 23, TAR)
	box(p.x - 9, p.y - 21, 2, 23, tint)
	box(p.x - 8, p.y + 1, 18, 3, tint)
	_arrow(p + Vector2(0, -9), 1, tint)

func _record_lead(s: Dictionary) -> void:
	var plate_at := Vector2.ZERO
	var gate_at := Vector2.ZERO
	var active := false
	for m: Dictionary in s.get("marks", []):
		if String(m.kind) in ["plate", "plate_on"]:
			plate_at = Vector2(m.x, m.y)
			active = String(m.kind) == "plate_on"
		if String(m.kind) in ["gate", "gate_open"] and gate_at == Vector2.ZERO:
			gate_at = Vector2(m.x, m.y)
	if plate_at == Vector2.ZERO or gate_at == Vector2.ZERO:
		return
	var metal := FRESH if active else Color("#5c6562")
	var elbow := Vector2(gate_at.x - 10, plate_at.y)
	line_px(plate_at + Vector2(15, 1), elbow, TAR, 4)
	line_px(elbow, gate_at - Vector2(10, 0), TAR, 4)
	dots(plate_at + Vector2(15, 1), elbow, metal, 4)
	dots(elbow, gate_at - Vector2(10, 0), metal, 4)

func _floor_arrow(at: Vector2, axis: Vector2, ink: Color) -> void:
	var normal := Vector2(-axis.y, axis.x)
	var tip := at + 3 * axis
	for flank: int in [-1, 1]:
		var wing := at - 2 * axis + 3 * flank * normal
		line_px(wing, tip, TAR, 4)
		line_px(wing, tip, ink, 2)

func _signature_route(points: PackedVector2Array, gate_at: Vector2, time: float) -> void:
	if points.is_empty():
		return
	if gate_at != Vector2.ZERO and gate_at.distance_to(points[-1]) > 2:
		points.append(gate_at)
	var offset := fmod(time * 13.0, 15.0)
	for i in range(1, points.size()):
		var a := points[i - 1]
		var b := points[i]
		var axis := a.direction_to(b)
		var distance := a.distance_to(b)
		line_px(a, b, Color(TAR, 0.64), 3)
		dots(a, b, Color(PAPER, 0.72), 4)
		var d := offset
		while d < distance - 2:
			_floor_arrow(a + axis * d, axis, PAPER)
			d += 15.0
		if distance >= 6:
			_floor_arrow(b - axis * 3, axis, PAPER)

func _press_carriage(p: Vector2, warned: bool, time: float) -> void:
	# The right lip is exactly the front reported by the server. All the mass
	# and ink extend backwards, so the approaching contact point stays visible.
	var x := roundi(p.x)
	var top := 98
	var bottom := 268
	if warned:
		for y in range(top, bottom, 10):
			box(x - 2, y, 2, 6, BLOOD)
			line_px(Vector2(x - 9, y + 5), Vector2(x - 5, y + 2), DRIED, 2)
		_stamp(Vector2(x - 15, top + 10), "压辊预热", FRESH)
		return
	box(x - 42, top, 41, bottom - top, Color("#401e2447"))
	for y in range(top + 13, bottom - 7, 28):
		box(x - 47, y + 1, 26, 1, DRIED)
		box(x - 36, y + 3, 20, 2, BLOOD)
		box(x - 53, y + 6, 19, 1, DRIED)
	box(x - 24, top + 2, 24, bottom - top - 2, TAR)
	box(x - 21, top + 6, 18, bottom - top - 12, Color("#59252d"))
	box(x - 18, top + 6, 9, bottom - top - 12, BLOOD)
	box(x - 15, top + 9, 3, bottom - top - 19, Color("#e36a62"))
	var phase := posmod(floori(time * 12), 13)
	for y in range(top + 12 + phase, bottom - 13, 13):
		line_px(Vector2(x - 20, y + 3), Vector2(x - 6, y - 2), SOOT, 3)
	for y in [top, bottom - 10]:
		_panel(x - 26, y, 27, 12, SOOT, ASH)
		_wheel(Vector2(x - 14, y + 6), 6, PAPER, DRIED, time * 3.2)
	box(x - 2, top + 12, 2, bottom - top - 22, PAPER)
	box(x, top + 14, 1, bottom - top - 26, FRESH)
	_stamp(Vector2(x - 15, top - 3), "压印辊", FRESH)

func _signature_mechanisms(s: Dictionary, time: float) -> void:
	var route := PackedVector2Array()
	var gate_at := Vector2.ZERO
	for mark: Dictionary in s.get("marks", []):
		var p := Vector2(mark.x, mark.y)
		match String(mark.kind):
			"route_arrow":
				route.append(p)
			"gate", "gate_open":
				gate_at = p
			"press_warn", "press_shadow":
				_press_carriage(p, mark.kind == "press_warn", time)
	_signature_route(route, gate_at, time)

func _sill_sign(anchor: Vector2, words: String, tint: Color) -> void:
	var width := ceili(_stamp_font.get_string_size(words, HORIZONTAL_ALIGNMENT_LEFT, -1, 10).x) + 28
	var left := clampi(roundi(anchor.x - width / 2.0), 3, 477 - width)
	var y := roundi(anchor.y + 35)
	line_px(anchor + Vector2(2, 13), Vector2(anchor.x + 2, y - 9), TAR, 3)
	line_px(anchor + Vector2(2, 13), Vector2(anchor.x + 2, y - 9), tint)
	box(left, y - 10, width, 17, TAR)
	box(left, y - 10, width, 2, tint)
	draw_string(_stamp_font, Vector2(left + 5, y + 2), words, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, PAPER)
	_floor_arrow(Vector2(left + width - 11, y - 2), Vector2.RIGHT, tint)

func _signature_last_press(s: Dictionary, gate_at: Vector2, exit_at: Vector2) -> void:
	var step := String(s.step)
	var ticks := int(s.get("stageTick", 0))
	# While the gap is open the main press spits out a sheet carrying the echo's
	# palm. The paper tears free when the shutter falls behind the player.
	var extension := clampi(ticks * 3 + 5, 5, 34) if step == "help_hold" else 34
	var torn := step != "help_hold"
	var sheet_y := 73 + (4 if torn else 0)
	box(213, sheet_y, 54, extension, TAR)
	box(215, sheet_y, 50, extension - 1, PAPER)
	box(217, sheet_y, 2, extension - 1, DRIED)
	for i in range(3):
		var row := 5 + i * 4
		if row < extension - 2:
			box(221, sheet_y + row, 8 + i * 4, 1, TAR)
	if extension > 19:
		_decal("palm_mark", 0, 1, Rect2(237, sheet_y + extension - 19, 22, 19))
	if torn:
		_picket(214, sheet_y - 5, 52, 8, 4, PAPER)
		_picket(215, sheet_y, 50, 8, 3, TAR)
	if step == "sill_clear" and gate_at != Vector2.ZERO:
		var hit := clampf(ticks / 9.0, 0, 1)
		var p := gate_at.round()
		box(p.x - 2, p.y - 15, 5, 31, DRIED)
		for i in range(6):
			var scatter := p + Vector2(-3 - (4 + i * 2) * hit, (i - 3) * 3 + 9 * hit * hit)
			box(scatter.x, scatter.y, 3, 2, BLOOD)
		line_px(p - Vector2(2, 13), p + Vector2(-2, 13), PAPER)
	if exit_at != Vector2.ZERO:
		for dx in [-18, -10]:
			_floor_arrow(exit_at + Vector2(dx, 0), Vector2.RIGHT, PAPER)

func _signature_front(s: Dictionary, cue_age: float) -> void:
	var step := String(s.step)
	var gate_at := Vector2.ZERO
	var exit_at := Vector2.ZERO
	var wait_at := Vector2.ZERO
	var plate_at := Vector2.ZERO
	var sealed := false
	var filling := false
	for mark: Dictionary in s.get("marks", []):
		var p := Vector2(mark.x, mark.y)
		match String(mark.kind):
			"gate", "gate_open":
				gate_at = p
			"exit":
				exit_at = p
			"stand_here":
				wait_at = p
			"record_fill":
				plate_at = p
				filling = true
			"seal_ready":
				plate_at = p
				sealed = true
			"plate":
				if step.begins_with("take"):
					plate_at = p
			"plate_on":
				if step.begins_with("take"):
					plate_at = p
					filling = true
	if plate_at != Vector2.ZERO and step.begins_with("take"):
		var ticks := 40 if sealed else clampi(int(s.get("plateTicks", 0)), 0, 40)
		var caption := "踩住踏板 · 2 秒"
		if filling:
			caption = "录制 %.1f / 2.0 秒" % (ticks / 20.0)
		if sealed:
			caption = "已录满 · 点击封存"
		_stamp(plate_at + Vector2(0, 19), caption, PAPER)
		box(plate_at.x - 20, plate_at.y + 23, 40, 5, TAR)
		box(plate_at.x - 19, plate_at.y + 24, 38 * ticks / 40.0, 3, PAPER)
		for i in range(1, 4):
			box(plate_at.x - 20 + i * 10, plate_at.y + 24, 1, 3, SOOT)
	if step in ["help_hold", "sill_clear", "exit_signature"]:
		_signature_last_press(s, gate_at, exit_at)
	if step == "sill_wait" and wait_at != Vector2.ZERO:
		_sill_sign(wait_at, "站在框内　按住 D", PAPER)
	elif step == "help_hold" and gate_at != Vector2.ZERO:
		_sill_sign(gate_at, "闸已开　按住 D", FRESH)
	elif step in ["sill_clear", "exit_signature"] and exit_at != Vector2.ZERO:
		_sill_sign(exit_at, "向右冲进出口", PAPER)
	if step == "play_two" and cue_age < 1.4 and s.get("cue") in ["press_caught", "tape_rewind"]:
		_stamp(Vector2(79, 115), "压辊撞上 · 录像倒带" if s.cue == "press_caught" else "裂砖塌落 · 录像倒带", FRESH)
		for dx in [20, 27]:
			_floor_arrow(Vector2(dx, 111), Vector2.LEFT, PAPER)

func story_props(s: Dictionary, t: float) -> void:
	var printed := is_printed(s)
	var room := String(s.get("room", "factory"))
	var step := String(s.get("step", ""))
	var edge := PAPER if printed else (FROST if room == "maintenance" else WARM)
	_record_lead(s)
	if room == "signatures":
		_signature_mechanisms(s, t)
	for m: Dictionary in s.get("marks", []):
		var p := Vector2(m.x, m.y)
		var kind := String(m.kind)
		match kind:
			"supply":
				_panel(int(p.x - 14), int(p.y - 10), 29, 19, Color("#806550"), HONEY)
				for i in range(3):
					draw_bottle(p + Vector2(i * 7 - 7, -2), Vector2.UP, false)
				_stamp(p + Vector2(0, 19), "取货", WARM)
			"safe", "bank":
				if kind == "bank":
					draw_circle(p, 11, Color("#776546"))
					draw_arc(p, 11, 0, TAU, 32, HONEY, 2, false)
				else:
					draw_arc(p, 16, 0, TAU, 32, Color(SEA,0.65), 1, false)
				_brackets(p, 13, 9, SEA if kind == "safe" else WARM)
				if kind == "bank":
					_stamp(p + Vector2(0, 15), "反弹", WARM)
				else:
					_stamp(p + Vector2(0, 20), "直投", SEA)
			"hand":
				if room == "sleepward":
					draw_circle(p, 14, Color("#481c29a8"))
					_decal("torn_hand", 2, 3, Rect2(p.x - 15, p.y - 43, 27, 52))
					_decal("palm_mark", 0, 1, Rect2(p.x - 7, p.y - 10, 27, 25))
				else:
					_decal("palm_mark", 0, 1, Rect2(p - Vector2(9, 8), Vector2(18, 16)))
					_decal("torn_hand", 1, 3, Rect2(p.x - 14, p.y - 31, 19, 38))
			"hand_warn":
				draw_arc(p, 16, 0, TAU, 28, FRESH, 2, false)
				for side in [-1,1]:
					line_px(p + Vector2(side * 5, -5), p + Vector2(-side * 5, 5), BLOOD, 2)
				_decal("palm_mark", 0, 1, Rect2(p.x - 8, p.y - 8, 16, 15))
			"brace", "brace_on":
				_panel(int(p.x - 14), int(p.y - 5), 29, 13, SOOT, PAPER)
				var tilted := -6 if kind == "brace" else 7
				line_px(p + Vector2(0, 1), p + Vector2(tilted, -14), TAR, 5)
				line_px(p + Vector2(0, 1), p + Vector2(tilted, -14), ASH, 2)
				box(p.x + tilted - 4, p.y - 16, 9, 4, FRESH if kind == "brace" else PAPER)
				_brackets(p, 18, 12, FRESH if kind == "brace" else PAPER)
			"spout":
				_console(p, false, true, PAPER)
			"hatch":
				_panel(int(p.x - 22), int(p.y - 11), 45, 21, STEEL, edge)
				for i in range(6):
					box(p.x - 17 + i * 6, p.y - 7, 2, 12, TAR)
				box(p.x + 6, p.y - 1, 10, 3, HONEY)
				_stamp(p + Vector2(0, 21), "检修井", edge)
			"window":
				var idx := clampi(roundi((p.x - 104.0) / 136.0), 0, 2)
				line_px(Vector2(p.x, 95), p - Vector2(0, 6), STEEL, 2)
				_plate(p, false, FROST)
				_stamp(p + Vector2(0, 19), "观测 0%d" % (idx + 1), edge)
			"plate", "plate_on":
				_plate(p, kind == "plate_on", edge)
				if not step.begins_with("take"):
					_stamp(p + Vector2(0, 19), "已压下" if kind == "plate_on" else "踏板", edge)
			"stand_here":
				if step == "sill_wait":
					box(p.x - 13, p.y - 7, 26, 14, Color("#2725247d"))
					_brackets(p, 14, 8, PAPER)
					for dy in [-3, 3]:
						box(p.x - 7, p.y + dy, 5, 2, PAPER)
						box(p.x - 1, p.y + dy, 2, 2, PAPER)
				_floor_arrow(p + Vector2(7, 0), Vector2.RIGHT, PAPER)
			"gate", "gate_open":
				_gate(p, kind == "gate_open", edge, absf(p.x - 410) < 3)
				if kind == "gate_open" and step == "help_hold":
					for dx in [4, 13, 22]:
						_floor_arrow(p + Vector2(dx, 0), Vector2.RIGHT, PAPER)
					_brackets(p, 13, 13, FRESH)
			"old_tape", "ledger", "panel":
				_console(p, kind != "ledger", step.begins_with("take"), edge)
				var legend := "旧录像" if kind == "old_tape" else ("签名" if kind == "ledger" else "录制台")
				_stamp(p + Vector2(0, 20), legend, edge)
			"divider":
				_panel(int(p.x - 5), int(p.y - 17), 10, 35, SOOT, PAPER)
				for i in range(5):
					line_px(p + Vector2(-3, i * 6 - 11), p + Vector2(2, i * 6 - 14), BLOOD)
			"crumb":
				_brackets(p, 19, 15, BLOOD)
			"exit":
				_exit_prop(p, edge)
				_stamp(p + Vector2(0, 18), "出口", edge)
	if room == "signatures" and (step.ends_with("two") or step in ["sill_wait", "help_hold", "sill_clear", "exit_signature"]):
		# The slit looks into the adjacent shop. Its workers are behind the glass.
		_panel(398, 95, 79, 46, TAR, ASH)
		_decal("woodcut_screen", 0, 1, Rect2(399, 99, 77, 37))
		box(399, 134, 77, 3, TAR)
		if step in ["help_hold", "sill_clear", "exit_signature"]:
			_decal("torn_hand", 2, 3, Rect2(412, 100, 18, 36))
			_decal("palm_mark", 0, 1, Rect2(448, 102, 24, 22))
		else:
			_stamp(Vector2(438, 146), "旁车间", ASH)
	if room == "signatures" and step.begins_with("take"):
		box(15, 107, 4, 4, FRESH)
		_stamp(Vector2(42, 112), "录制中", PAPER)

func _story_dragon(at: Vector2, row: int, frame: int, print_mode: bool, tint: Color, scale_px: Vector2) -> void:
	var sheet: Texture2D = _print_cast.get("dragon") if print_mode else dragon_art
	if not sheet:
		return
	var anchor := scale_px * Vector2(0.5, 0.725)
	draw_texture_rect_region(sheet, Rect2((at - anchor).round(), scale_px),
		Rect2(frame * 32, row * 40, 32, 40), tint)

func story_player(p: Vector2, row: int, frame: int, s: Dictionary) -> void:
	var print_mode := is_printed(s)
	box(p.x - 10, p.y + 7, 20, 3, Color("#1318238e"))
	_story_dragon(p, row, frame, print_mode, Color.WHITE, Vector2(32, 40))
	if print_mode:
		var wrist := p + Vector2(-7 if row == 3 else 7, -1)
		box(wrist.x, wrist.y, 3, 4, DRIED)
		box(wrist.x + 1, wrist.y + 3, 1, 4, BLOOD)

func _badge_space(feet: Vector2, badge_size: Vector2, side: float,
		separate: bool, reserved: Array[Rect2]) -> Rect2:
	var alternate := side * (badge_size.x * 0.5 + 7)
	var positions := [
		Vector2(alternate if separate else 0.0, -40),
		Vector2(alternate, -44), Vector2(-alternate, -45),
		Vector2(side * 27, -55), Vector2(-side * 27, -55),
		Vector2(side * 32, -24), Vector2(-side * 32, -24)]
	var best := Rect2()
	var least_overlap := INF
	for offset: Vector2 in positions:
		var top_left := (feet + offset - Vector2(badge_size.x * 0.5, 0)).round()
		var bounds := Rect2(top_left.clamp(Vector2.ONE, WORLD - badge_size - Vector2.ONE), badge_size)
		var overlaps := 0.0
		for block: Rect2 in reserved:
			overlaps += bounds.intersection(block).get_area()
		if overlaps < least_overlap:
			best = bounds
			least_overlap = overlaps
		if is_zero_approx(overlaps):
			break
	return best

func signature_identity_tags(player: Vector2, echo: Vector2, s: Dictionary) -> void:
	# Keep the two labels legible when both recordings occupy the very same pixel.
	# These are interpolated sprite anchors, so the leader follows its own figure.
	var reserved: Array[Rect2] = [
		Rect2(player - Vector2(12, 24), Vector2(24, 33)),
		Rect2(echo - Vector2(12, 24), Vector2(24, 33))]
	for mark: Dictionary in s.marks:
		var at := Vector2(mark.x, mark.y)
		match String(mark.kind):
			"gate", "gate_open":
				reserved.append(Rect2(at - Vector2(10, 18), Vector2(20, 36)))
				if s.step == "help_hold":
					reserved.append(Rect2(at + Vector2(-62, 24), Vector2(124, 20)))
			"stand_here", "exit":
				reserved.append(Rect2(at + Vector2(-62, 24), Vector2(124, 20)))
			"plate", "plate_on", "panel":
				reserved.append(Rect2(at + Vector2(-21, 10), Vector2(42, 17)))
	var close := absf(player.x - echo.x) < 36 and absf(player.y - echo.y) < 35
	var side := -1.0 if player.x <= echo.x else 1.0
	var you := _badge_space(player, Vector2(19, 13), side, close, reserved)
	reserved.append(you.grow(2))
	var tape := _badge_space(echo, Vector2(35, 13), -side, close, reserved)
	var white := Color("#fff9e8")
	var film := Color("#efbe94")
	for endpoints: Array in [[you, player, white], [tape, echo, film]]:
		var bounds: Rect2 = endpoints[0]
		var feet: Vector2 = endpoints[1]
		var tint: Color = endpoints[2]
		var from := Vector2(clampf(feet.x, bounds.position.x + 3, bounds.end.x - 3), bounds.end.y - 1)
		line_px(from, feet - Vector2(0, 23), TAR, 3)
		line_px(from, feet - Vector2(0, 23), tint)
	# The player's tag is an ivory pointer. The echo's is a strip of black film.
	var a := you.position
	box(a.x, a.y, you.size.x, you.size.y, TAR)
	box(a.x + 1, a.y + 1, you.size.x - 2, you.size.y - 2, white)
	draw_string(_stamp_font, a + Vector2(0,10), "你", HORIZONTAL_ALIGNMENT_CENTER, you.size.x, 10, TAR)
	var b := tape.position
	box(b.x, b.y, tape.size.x, tape.size.y, TAR)
	for dx in [1, 30]:
		for dy in [2, 8]:
			box(b.x + dx, b.y + dy, 3, 2, film)
	draw_string(_stamp_font, b + Vector2(5,10), "录像", HORIZONTAL_ALIGNMENT_CENTER, 25, 9, film)
	var tip := player.round() + Vector2(0, 5)
	draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-5,6), tip + Vector2(5,6)]), TAR)
	draw_colored_polygon(PackedVector2Array([tip + Vector2(0,1), tip + Vector2(-3,5), tip + Vector2(3,5)]), white)

func is_rotating_window(kind: String) -> bool:
	return kind in ["sleep_frog", "sleep_decoy", "sleep_shutter", "wake_window", "wake_look", "ward_face"]

func story_actor_key(person: Dictionary) -> String:
	var kind := String(person.kind)
	var base := "ring" if is_rotating_window(kind) else kind.trim_suffix("_probe").trim_suffix("_turn")
	return "%s/%d" % [base, int(person.slot)]

func story_person(person: Dictionary, s: Dictionary, previous: Vector2, p: Vector2, t: float) -> void:
	var kind := String(person.kind)
	var print_mode := is_printed(s)
	var d := Vector2(person.x, person.y) - previous
	var face := 1 if d.x > 0 else 3
	if absf(d.y) >= absf(d.x):
		face = 0 if d.y >= 0 else 2
	var frame := (1 + posmod(floori(t * 7), 2)) if d.length_squared() > 0.01 else 0
	match kind:
		"monitor", "monitor_probe":
			_story_dragon(p, face, frame, false, Color("#bbd3d6"), Vector2(19, 24))
			if kind == "monitor_probe":
				cap_sprite(p + Vector2(9, -9))
		"delay", "echo":
			var ghost_tint := Color("#e2d9b8dc") if print_mode else Color("#a3c3c4cb")
			var fill := BLOOD if print_mode else FROST
			_story_dragon(p + Vector2(-1, 0), face, frame, print_mode, Color(fill, 0.64), Vector2(32, 40))
			_story_dragon(p + Vector2(1, 0), face, frame, print_mode, ghost_tint, Vector2(32, 40))
			for i in range(3):
				box(p.x - 6 + i * 6, p.y + 9, 3, 1, fill)
		"archive", "archive_turn":
			_story_dragon(p, 0 if kind == "archive_turn" else 2, 0, false, Color("#afbdb4"), Vector2(32, 40))
			if kind == "archive_turn":
				_decal("glass_grin", 1, 3, Rect2(p.x + 9, p.y - 30, 28, 25))
		"sleep_frog", "sleep_decoy", "sleep_shutter", "wake_window", "wake_look", "ward_face":
			_ward_window(p, kind, s, t)

func _ward_window(p: Vector2, kind: String, s: Dictionary, t: float) -> void:
	# Direction changes the carriage shadows at each berth, never the identity of a shutter.
	var center := Vector2(240, 180)
	var axis := (p - center).normalized()
	var shadow := Vector2(3 * axis.x, 2 + 3 * axis.y)
	var x := roundi(p.x)
	var y := roundi(p.y)
	box(x - 21 + shadow.x, y + 12 + shadow.y, 46, 7, Color("#211c20ab"))
	_panel(x - 23, y - 18, 46, 35, SOOT, ASH)
	box(x - 18, y - 13, 36, 24, TAR)
	for dx: int in [-17, 16]:
		box(x + dx, y + 16, 4, 3, TAR)
		box(x + dx, y + 17, 2, 2, PAPER)
	if kind == "sleep_shutter":
		for i in range(5):
			box(x - 18, y - 12 + i * 5, 36, 4, Color("#454346"))
			box(x - 18, y - 12 + i * 5, 36, 1, ASH)
		box(x - 5, y, 10, 3, TAR)
		box(x - 4, y, 8, 1, PAPER)
	elif kind == "sleep_frog" or kind == "wake_look":
		var pose := 2 if kind == "wake_look" else (1 if fmod(t, 2.4) < 0.8 else 0)
		_decal("frog_ring", pose, 3, Rect2(x - 17, y - 20, 34, 34))
		if kind == "wake_look":
			box(x - 18, y + 10, 36, 2, PAPER)
	elif kind == "ward_face":
		var age := float(s.get("stageTick", 0)) / 20
		var w := roundf(45 + 27 * smoothstep(0.0, 0.9, age))
		_decal("window_lunge", clampi(floori(age * 3), 0, 2), 3, Rect2(x - w / 2, y - w * 0.45, w, w * 0.9))
	else:
		_decal("window_lunge", 0, 3, Rect2(x - 21, y - 19, 42, 38))

func _ward_dial(s: Dictionary) -> void:
	# When the floor carries bottles, the overhead time clock displays the same
	# countdown. Its dial is clear of the moving shutters and the branch inlet.
	var center := Vector2(240,32) if s.get("relay") is Dictionary else Vector2(240,176)
	var left := int(s.get("sleepTicks", 0))
	var cap := maxi(1, int(s.get("sleepMax", 1)))
	var step := String(s.get("step", ""))
	var watching := step == "sleep_watch"
	draw_circle(center, 24, TAR)
	draw_circle(center, 22, SOOT)
	draw_arc(center, 22, 0, TAU, 52, ASH, 1, false)
	var lit := int(ceil(24 * clampf(left / float(cap), 0, 1))) if watching else (24 if step == "sleep_reveal" else 0)
	for i in range(24):
		var angle := -PI / 2 + TAU * i / 24
		draw_arc(center, 19, angle, angle + 0.17, 3, PAPER if i < lit else Color("#514345"), 3, false)
	var label := str(ceili(left / 20.0)) if watching else ("记" if step == "sleep_reveal" else "醒")
	draw_string(_stamp_font, center + Vector2(-14, 4), label, HORIZONTAL_ALIGNMENT_CENTER, 28, 11, PAPER)
	for i in range(3):
		box(center.x - 6 + 5 * i, center.y + 8, 3, 2, FRESH if i < int(s.get("round",1)) else ASH)

func story_ring(s: Dictionary, aim: Vector2, tracks: Dictionary) -> void:
	# The rails stay in screen space. Only distant inlay/metal shifts with the gaze.
	var center := Vector2(240, 180)
	var look := (aim - center).normalized() if Rect2(Vector2.ZERO, WORLD).has_point(aim) else Vector2.ZERO
	var radius := Vector2(150, 65)
	for rail in range(2):
		var rail_points := PackedVector2Array()
		for i in range(65):
			var theta := TAU * i / 64
			rail_points.append((center + (radius + Vector2(rail * 3, rail * 2)) * Vector2(cos(theta), sin(theta))).round())
		draw_polyline(rail_points, TAR if rail == 0 else ASH, 2 if rail == 0 else 1)
	for i in range(48):
		var angle := TAU * i / 48
		var axis := Vector2(cos(angle), sin(angle))
		var foot := center + axis * (radius - Vector2(3, 2))
		line_px(foot, foot + axis * 6 + look * 1.5, SOOT)
	var labels := ["北", "东", "南", "西"]
	var anchor_offsets := [Vector2(0,-92), Vector2(192,0), Vector2(0,96), Vector2(-192,0)]
	for i in range(4):
		var offset: Vector2 = anchor_offsets[i]
		var active := look.dot(offset.normalized()) > 0.70
		var ink := PAPER if active else ASH
		var at := center + offset
		draw_circle(at + look * 2, 8, TAR)
		draw_arc(at + look * 2, 8, 0, TAU, 24, FRESH if active else ASH, 1, false)
		draw_string(_stamp_font, at + look * 2 + Vector2(-6, 3), labels[i], HORIZONTAL_ALIGNMENT_CENTER, 12, 7, ink)
	for key: String in tracks:
		var track: PackedVector2Array = tracks[key]
		for i in range(1, track.size()):
			var intensity := (i + 1) / float(track.size()) * 0.6
			line_px(track[i - 1] + Vector2(0, 4), track[i] + Vector2(0, 4), Color(PAPER, intensity), 2)
	_ward_dial(s)

func ward_operating_lamp(s: Dictionary) -> void:
	for mark: Dictionary in s.get("marks", []):
		var kind := String(mark.kind)
		if kind not in ["brace", "brace_on"]:
			continue
		var anchor := Vector2(mark.x, mark.y)
		# Route the control caption toward its closest sidewall. It remains visible
		# if a shutter rolls over the actual handwheel without marking any shutter.
		var callout := Vector2(28 if anchor.x < 240 else 450, clampf(anchor.y + 27, 128, 251))
		var toward := 1 if anchor.x < 240 else -1
		line_px(callout + Vector2(toward * 10, -5), anchor + Vector2(-toward * 17, 9), Color(PAPER, 0.58))
		_stamp(callout, "已撑住" if kind == "brace_on" else "按住撑机", PAPER)
		var ratio := clampf(float(s.get("braceTicks", 0)) / maxf(1, float(s.get("braceMax", 14))), 0, 1)
		box(callout.x - 15, callout.y + 4, 30, 4, TAR)
		box(callout.x - 14, callout.y + 5, 28 * ratio, 2, PAPER)

func _lunge_cutout(at: Vector2, width: float, rotation_angle: float, frame: int, flipped: bool) -> void:
	var image: Texture2D = _horror.get("window_lunge")
	if not image:
		return
	var quad := PackedVector2Array()
	for corner: Vector2 in [Vector2(-0.5,-0.45),Vector2(0.5,-0.45),Vector2(0.5,0.45),Vector2(-0.5,0.45)]:
		quad.append((at + (corner * width).rotated(rotation_angle)).round())
	var u0 := frame / 3.0
	var u1 := (frame + 1) / 3.0
	if flipped:
		u0 = (frame + 1) / 3.0
		u1 = frame / 3.0
	var uv := PackedVector2Array([Vector2(u0,0),Vector2(u1,0),Vector2(u1,1),Vector2(u0,1)])
	draw_polygon(quad, PackedColorArray([Color.WHITE]), uv, image)

func story_front(s: Dictionary, cue_age: float) -> void:
	if s.get("room") == "signatures":
		_signature_front(s, cue_age)
		return
	if s.get("room") != "sleepward":
		return
	var step := String(s.get("step", ""))
	var stage := int(s.get("stageTick", 0))
	var cue := String(s.get("cue", "none"))
	if step in ["sleep_watch", "sleep_reveal"] and cue in ["hand_warn", "ward_slip", "brace_missed"] and cue_age < 1.4:
		var bite := smoothstep(0,0.27,cue_age) * (1 - smoothstep(0.82,1.4,cue_age))
		var repeat_id := int(s.get("cueId", 0))
		var left := posmod(repeat_id, 2) == 0
		var w := (53.0 if cue == "hand_warn" else 91.0) * bite + 10
		var x := -6.0 if left else 486.0 - w
		_decal("window_lunge", 1 if cue == "hand_warn" else 2, 3, Rect2(x, -14, w, w * 0.9))
	if step == "ward_face":
		var approach := smoothstep(0, 23, stage)
		box(0, 0, 480, 288, Color(0.04, 0.025, 0.03, 0.32 * approach))
		for i in range(4):
			var local_age := maxi(0, stage - i * 3)
			var impact_amount := smoothstep(0, 14, local_age)
			# Each glass breaks a few frames after its neighbour. Its frame follows
			# the momentum past the sill and then settles against the viewer.
			var settle := exp(-maxf(0, local_age - 14) * 0.16) * sin(maxf(0,local_age - 14) * 0.46)
			var from: Vector2 = [Vector2(240,-34),Vector2(502,134),Vector2(240,322),Vector2(-22,134)][i]
			var to: Vector2 = [Vector2(240,54),Vector2(383,145),Vector2(240,237),Vector2(97,145)][i]
			var at := from.lerp(to, impact_amount + settle * 0.06)
			var width := 42.0 + (77 + i * 5) * impact_amount + settle * 7
			var tilt: float = [-0.10,-0.25,0.09,0.22][i]
			_lunge_cutout(at, width, tilt * (0.5 + 0.5 * impact_amount), clampi(local_age / 7,0,2), i in [1,3])
		if stage > 13:
			var width := (stage - 13.0) / 23.0 * 85 + 89
			_decal("clock_jaw", clampi(stage / 9,0,2), 3, Rect2(240 - width / 2, 139 - width * 0.27, width, width * 0.54))
