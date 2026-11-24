extends "res://night/story_world.gd"

const COPPER := Color("#b78054")
const BRASS := Color("#edc77b")
const VIRIDIAN := Color("#69ac96")
const DRINK := Color("#74ead3")
const ECHO_VIOLET := Color("#c7acf2")

# All physical coordinates come from the authoritative relay snapshot. Interpolate only
# objects in transit. Pick-up rings, shutters and hazards use the current judged position.
var _relay_from: Dictionary = {}
var _relay_to: Dictionary = {}
var _relay_history: Dictionary = {}
var _relay_art: Dictionary[String, Texture2D] = {}
var _rail_starts: Dictionary = {}

func load_relay_art() -> void:
	for name_key: String in ["cargo", "echo", "pipe_rivet", "label_hand", "near_glass"]:
		_relay_art[name_key] = _texture("res://assets/night/relay/%s.png" % name_key)

func _relay_still(name_key: String, frame: int, target: Rect2, flip: bool = false) -> bool:
	var sheet: Texture2D = _relay_art.get(name_key)
	if not sheet:
		return false
	var frame_size := Vector2(sheet.get_width() / 3.0, sheet.get_height())
	if flip:
		var coords := PackedVector2Array([target.position, target.position + Vector2(target.size.x,0),
			target.end, target.position + Vector2(0,target.size.y)])
		var u0 := frame / 3.0
		var u1 := (frame + 1) / 3.0
		draw_polygon(coords,PackedColorArray([Color.WHITE]),PackedVector2Array([
			Vector2(u1,0),Vector2(u0,0),Vector2(u0,1),Vector2(u1,1)]),sheet)
	else:
		draw_texture_rect_region(sheet, target, Rect2(Vector2(frame * frame_size.x,0), frame_size))
	return true

func _relay_xy(item: Dictionary) -> Vector2:
	return Vector2(item.x, item.y)

func relay_snapshot(r: Dictionary, reset: bool, previous_blend: float) -> void:
	if reset:
		_relay_from.clear()
		_relay_to.clear()
		_relay_history.clear()
		_rail_starts.clear()
	var positions := {}
	for bottle: Dictionary in r.get("bottles", []):
		var key := "b%d/%s" % [int(bottle.id), bottle.state]
		positions[key] = _relay_xy(bottle)
		if String(bottle.state) in ["inbound","lower","loop"] and (not _relay_to.has(key) or not _rail_starts.has(key)):
			_rail_starts[key] = _relay_xy(bottle)
	var cap: Variant = r.get("cap")
	if cap is Dictionary:
		positions["cap"] = _relay_xy(cap)
	var starts := {}
	for key: String in positions:
		var destination: Vector2 = positions[key]
		var previous: Vector2 = _relay_to.get(key, destination)
		var first: Vector2 = _relay_from.get(key, previous)
		var jumped := destination.distance_squared_to(previous) > 66 * 66
		starts[key] = destination if jumped else first.lerp(previous, previous_blend)
		var trail: PackedVector2Array = _relay_history.get(key, PackedVector2Array())
		if jumped or not _relay_to.has(key):
			trail.clear()
		if key == "cap" and cap is Dictionary and bool(cap.bounced):
			for ev: Dictionary in r.get("events", []):
				if ev.kind == "cap_bounce" and int(ev.atTick) == int(r.tick):
					trail.append(_relay_xy(ev))
		trail.append(destination)
		if trail.size() > 7:
			trail.remove_at(0)
		_relay_history[key] = trail
	_relay_from = starts
	_relay_to = positions

func _relay_at(key: String, item: Dictionary, blend: float) -> Vector2:
	var end: Vector2 = _relay_to.get(key, _relay_xy(item))
	var start: Vector2 = _relay_from.get(key, end)
	return start.lerp(end, blend)

func _belt(a: Vector2, b: Vector2, width: float, brass: Color, phase: float) -> void:
	var axis := a.direction_to(b)
	if axis.is_zero_approx():
		return
	var cross := Vector2(-axis.y, axis.x)
	line_px(a + Vector2(0, 3), b + Vector2(0, 3), Color("#17161f80"), width + 5)
	line_px(a, b, TAR, width + 3)
	line_px(a, b, Color("#40494a"), width + 1)
	line_px(a - cross * width * 0.5, b - cross * width * 0.5, brass)
	line_px(a + cross * width * 0.5, b + cross * width * 0.5, brass.darkened(0.33))
	var total := a.distance_to(b)
	var d := fposmod(phase, 10.0)
	while d < total - 2:
		var p := a + d * axis
		line_px(p - cross * (width * 0.5 - 2), p + cross * (width * 0.5 - 2), Color("#737b71"))
		d += 10

func _relay_mat(x: int, y: int, w: int, h: int) -> void:
	box(x,y,w,h,Color("#24433bc5"))
	box(x,y,w,2,Color("#718c7c"))
	box(x,y+h-2,w,2,Color("#243731"))
	for yy in range(y + 8, y + h - 3, 12):
		for xx in range(x + 6, x + w - 5, 12):
			line_px(Vector2(xx, yy + 2), Vector2(xx + 4, yy), Color("#536d5f"))
			line_px(Vector2(xx+4, yy), Vector2(xx + 8, yy+2), Color("#334d44"))
	for dx in [4,w-6]:
		for dy in [4,h-6]:
			box(x+dx,y+dy,2,2,COPPER)

func _pipe_mouth(p: Vector2, facing: int, awake: bool) -> void:
	_panel(int(p.x - 8), int(p.y - 9), 17, 18, Color("#75594f"), BRASS)
	box(p.x - 5, p.y - 6, 10, 12, TAR)
	for y in range(-5, 6, 4):
		box(p.x - 4, p.y + y, 8, 1, COPPER)
	if awake:
		for i in range(3):
			var at := p + Vector2(facing * (9 + i * 3), 0)
			line_px(at + Vector2(0, -2-i), at + Vector2(facing, 2+i), ALERT)

func _feeder(p: Vector2, echo: bool) -> void:
	var tint := ECHO_VIOLET if echo else COPPER
	_panel(int(p.x-12),int(p.y-14),24,18,Color("#594b48"),tint)
	for i in range(3):
		box(p.x-7+i*5,p.y-10,3,7,Color("#24272d"))
		box(p.x-7+i*5,p.y-10,1,4,tint)
	box(p.x-8,p.y,16,4,TAR)
	box(p.x-8,p.y,16,1,BRASS)

func _pipe_supply(at: Vector2, face: int) -> void:
	var wall := 20 if face == 1 else 460
	var bend := Vector2(wall,at.y)
	line_px(Vector2(wall,91),bend,TAR,9)
	line_px(bend,at,TAR,9)
	line_px(Vector2(wall,91),bend,COPPER,5)
	line_px(bend,at,COPPER,5)
	line_px(bend-Vector2(0,1),at-Vector2(0,1),BRASS)
	for i in range(12, floori(bend.distance_to(at)), 16):
		var px := wall + face*i
		box(px-1,at.y-4,3,9,SOOT)
		box(px,at.y-3,1,7,BRASS)
	_relay_still("pipe_rivet",0,Rect2(at+Vector2(face*7-9,-8),Vector2(18,11)))

func _switch_plate(p: Vector2, route: String) -> void:
	draw_circle(p + Vector2(0,2), 10, TAR)
	draw_circle(p, 9, BRASS)
	draw_circle(p, 7, Color("#435354"))
	var sign_x := -1 if route == "left" else 1
	var end := p + Vector2(sign_x * 7, -5)
	line_px(p + Vector2(0, 3), end, TAR, 4)
	line_px(p + Vector2(0, 3), end, BRASS, 2)
	box(end.x - 2, end.y - 1, 5, 3, FROST)
	box(p.x - 20, p.y + 8, 40, 10, TAR)
	draw_string(_stamp_font, p + Vector2(-18,16), "拨片", HORIZONTAL_ALIGNMENT_CENTER, 26, 8, PAPER)
	_arrow(p + Vector2(12,12), sign_x, BRASS)

func _return_socket(p: Vector2) -> void:
	_panel(int(p.x - 13), int(p.y - 6), 26, 13, STEEL, VIRIDIAN)
	box(p.x - 10, p.y - 3, 20, 6, TAR)
	for i in range(4):
		box(p.x - 8 + 5 * i, p.y - 2, 2, 4, TEAL)
	_brackets(p, 14, 7, DRINK)

func _rack(p: Vector2, caps: int) -> void:
	_panel(int(p.x - 14), int(p.y - 5), 29, 12, Color("#7b6450"), BRASS)
	for i in range(3):
		var x := p.x - 8 + i * 8
		box(x - 3, p.y - 2, 6, 5, TAR)
		if i < caps:
			box(x - 2, p.y - 2, 4, 3, BRASS)
			box(x - 1, p.y - 2, 2, 1, PAPER)
	_stamp(p + Vector2(0,17), "瓶盖架", BRASS)

func _sound_glyph(p: Vector2, kind: String, tint: Color) -> void:
	match kind:
		"step":
			box(p.x - 2, p.y - 2, 2, 3, tint)
			box(p.x + 1, p.y - 1, 2, 3, tint)
		"pipe":
			box(p.x - 2, p.y - 2, 2, 5, tint)
			box(p.x, p.y + 1, 3, 2, tint)
		"bell":
			box(p.x - 1, p.y - 2, 3, 3, tint)
			box(p.x - 2, p.y + 1, 5, 1, tint)
			box(p.x, p.y + 2, 1, 1, tint)

func _relay_bottle(p: Vector2, echo: bool, sounds: Array, frame: int) -> void:
	var fill := ECHO_VIOLET if echo else DRINK
	if not _relay_still("echo" if echo else "cargo",frame,Rect2(p.round()-Vector2(9,12),Vector2(18,24))):
		draw_bottle(p,Vector2.UP,echo)
	if not sounds.is_empty():
		# Marks are spaced by the recorded gaps; three adjacent marks mean three
		# beats together, widely separated marks mean a slower imitation.
		var centers := PackedInt32Array([4])
		for i in range(1,sounds.size()):
			centers.append(centers[-1] + 6 + clampi(roundi(float(sounds[i].gap) / 3),0,6))
		var width := centers[-1] + 5
		box(p.x - width * 0.5, p.y + 10, width, 7, TAR)
		for i in range(sounds.size()):
			_sound_glyph(p + Vector2(-width * 0.5 + centers[i], 13), String(sounds[i].kind), fill)

func _mouse_key(p: Vector2, held: bool, tint: Color) -> void:
	box(p.x, p.y, 8, 11, TAR)
	box(p.x + 1, p.y + 1, 6, 8, PAPER)
	box(p.x + 2, p.y + 2, 2, 3, tint if held else TAR)
	box(p.x + 4, p.y + 1, 1, 5, TAR)

func _relay_hatch(window: Dictionary, actor: String, late: bool, dispatch: bool, t: float) -> void:
	var p := _relay_xy(window)
	var slot := int(window.slot)
	var cx: int = SLOTS[clampi(slot, 0, 2)] if dispatch else roundi(p.x)
	var half := float(window.halfWidth)
	var reaction := String(window.reaction)
	var reaching := reaction in ["caught", "through"] and int(window.ticks) > 0
	var top := int(p.y - (51 if dispatch else 28))
	var w := 76 if dispatch else 41
	_panel(cx - w/2, top, w, int(p.y) - top - 5, SOOT, ASH if late else BRASS)
	box(cx - w * 0.5+3, top+3, w-6, p.y-top-10, Color("#233637") if not late else TAR)
	var sheet: Texture2D = _print_cast.get(actor) if late else (frog_art if actor == "frog" else egg_art)
	if sheet:
		var frame := 0 if not reaching else (1 if p.x < cx else 2)
		var breath := 1 if sin(t * 3.2 + cx) > 0.7 else 0
		var side := 36 if dispatch else 20
		draw_texture_rect_region(sheet, Rect2(cx-side*0.5,p.y-8-side+breath,side,side),Rect2(48*frame,0,48,48))
	box(cx - w * 0.5, p.y - 6, w, 13, TAR)
	box(cx - w * 0.5, p.y - 5, w, 3, Color("#878779"))
	box(cx - w * 0.5, p.y + 5, w, 2, Color("#494d49"))
	if bool(window.open):
		box(p.x - half, p.y - 4, 2 * half, 8, Color("#263c39"))
		line_px(p - Vector2(half,0), p + Vector2(half,0), DRINK, 2)
		_brackets(p, roundi(half), 5, PAPER)
		var ticks_to_close := int(window.get("openTicks",-1))
		if ticks_to_close >= 0 and ticks_to_close <= 8:
			box(p.x-half,p.y+4,half*2,2,TAR)
			box(p.x-half,p.y+4,half*2*ticks_to_close/8.0,2,ALERT)
	else:
		box(p.x - half, p.y - 4, 2 * half, 8, STEEL)
		for dx in range(-floori(half) + 2, ceili(half), 6):
			line_px(p + Vector2(dx-1,3), p + Vector2(dx+2,-3), TAR)
	if reaching:
		var wrist := Vector2(cx, p.y-10)
		line_px(wrist, p - Vector2(1,3), TAR, 5)
		line_px(wrist, p - Vector2(1,3), BRASS, 3)
		if reaction == "caught":
			cap_sprite(p - Vector2(0,3))
			_stamp(Vector2(cx,top-3), "接住", DRINK)
		else:
			dots(p + Vector2(0,1), p - Vector2(0,12), ECHO_VIOLET, 3)
			if late:
				_decal("glass_grin",1,3,Rect2(cx-16,top+5,32,28))
			_stamp(Vector2(cx,top-3), "穿过", ECHO_VIOLET)

func _sound_travel(h: Dictionary, now: float) -> void:
	var mode := String(h.state)
	var hunter := _relay_xy(h)
	var target := Vector2(h.targetX,h.targetY)
	if mode == "quiet":
		return
	var direction := hunter.direction_to(target)
	var nudge := 1 + int(now * 9) % 3
	var distance := hunter.distance_to(target)
	for i in range(0, 9):
		var at := hunter + direction * minf(distance, i * 7)
		var lifted := 4 if i % 4 == nudge else 1
		box(at.x - 2, at.y, 4, 1, SOOT)
		box(at.x - 1, at.y - lifted, 2, lifted, BRASS)
		box(at.x - 2, at.y - lifted, 4, 1, PAPER)
		if i > 0 and i % 3 == 0:
			_relay_still("pipe_rivet",2 if lifted>1 else 1,Rect2(at - Vector2(9,8),Vector2(18,11)))
	if mode in ["turn", "chase"]:
		var toward := -1 if target.x < hunter.x else 1
		_arrow(hunter + Vector2(0,-9), toward, ALERT)
		box(hunter.x - 7, hunter.y - 3, 15, 6, Color("#47232b"))
		for i in range(4):
			box(hunter.x - 5 + i * 3, hunter.y - 4, 1, 3, PAPER)
	elif mode in ["warn","strike"]:
		draw_arc(target, 14, 0, TAU, 32, TAR, 3)
		draw_arc(target, 14, 0, TAU, 32, FRESH, 1)
		_brackets(target, 16, 12, FRESH)
		var reach := Rect2(target - Vector2(11,21),Vector2(22,34))
		if mode == "strike":
			reach = Rect2(target - Vector2(16,40),Vector2(32,52))
		if not _relay_still("label_hand",2 if mode == "strike" else 0,reach):
			_decal("torn_hand", 2 if mode == "strike" else 0, 3, reach)

func _catch_mark(item: Dictionary, show_caption: bool, panes: Array) -> void:
	var goal := Vector2(item.catchX, item.catchY)
	var radius := float(item.radius)
	var echo: bool = item.kind == "echo"
	var ink := ECHO_VIOLET if echo else DRINK
	var available := bool(item.catchable)
	var eta := int(item.eta)
	draw_arc(goal,radius,0,TAU,48,TAR,3,false)
	var in_time := absi(eta) <= int(item.window) / 2
	if available:
		draw_arc(goal,radius,0,TAU,48,PAPER,2,false)
	else:
		for i in range(8):
			var a := TAU * i / 8
			draw_arc(goal,radius,a,a+0.49,6,PAPER if in_time else ink,1,false)
	for heading: Vector2 in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
		line_px(goal + heading * (radius+1),goal + heading * (radius+3),ink)
	if not show_caption:
		return
	var text := "第四瓶" if echo else "接瓶"
	if available:
		text = "按左键接"
	elif eta > 0:
		text += " %.1f秒" % (eta / 20.0)
	var sign_x := -1.0 if goal.x < 240.0 else 1.0
	var caption := Vector2(clampf(goal.x+sign_x*(radius+36),34,446),goal.y + 11)
	if not panes.is_empty():
		var offsets := [caption-goal,Vector2(sign_x*32,-32),Vector2(sign_x*31,31),Vector2(-sign_x*42,-26)]
		var min_overlap := INF
		for offset: Vector2 in offsets:
			var candidate := (goal+offset).clamp(Vector2(35,100),Vector2(445,273))
			var label_rect := Rect2(candidate-Vector2(29,8),Vector2(58,12))
			var overlap := 0.0
			for pane: Dictionary in panes:
				var pane_at := _relay_xy(pane)
				overlap += label_rect.intersection(Rect2(pane_at-Vector2(25,20),Vector2(50,42))).get_area()
			if overlap < min_overlap:
				caption = candidate
				min_overlap = overlap
			if is_zero_approx(overlap):
				break
	var line_start := goal + Vector2(sign_x*(radius+2),2)
	var line_end := caption + Vector2(-sign_x*17,-5)
	line_px(line_start,line_end,TAR,3)
	line_px(line_start,line_end,ink)
	_stamp(caption,text,PAPER if available else ink)

func _rail_path(item: Dictionary) -> PackedVector2Array:
	var points := PackedVector2Array()
	for point: Dictionary in item.get("track",[]):
		points.append(_relay_xy(point))
	if points.size() >= 2:
		return points
	var key := "b%d/%s" % [int(item.id),item.state]
	var source: Vector2 = _rail_starts.get(key,_relay_xy(item))
	var target := Vector2(item.catchX,item.catchY)
	points.append(source)
	if item.state == "loop":
		points.append(Vector2((source.x+target.x)*0.5,source.y-18))
	points.append(target)
	return points

func _bottle_route(item: Dictionary, position_px: Vector2, path: PackedVector2Array) -> void:
	if not String(item.state) in ["inbound","lower","loop"]:
		return
	var target := Vector2(item.catchX,item.catchY)
	var distance := target.distance_to(position_px)
	if distance < 7:
		return
	var ink := ECHO_VIOLET if item.kind == "echo" else DRINK
	var active := 0
	var closest := INF
	for i in range(1,path.size()):
		var nearest := Geometry2D.get_closest_point_to_segment(position_px,path[i-1],path[i])
		var gap := position_px.distance_squared_to(nearest)
		if gap <= closest:
			active = i-1
			closest = gap
	var start := position_px
	for i in range(active+1,path.size()):
		dots(start,path[i],Color(TAR,0.84),7.0,3)
		dots(start,path[i],ink,7.0,1)
		start = path[i]
	var axis := path[-2].direction_to(target)
	var arrow := target - axis * (float(item.radius)+6)
	if arrow.distance_to(target) < distance-4:
		_floor_arrow(arrow, axis, ink)

func _relay_motion(key: String, ink: Color) -> void:
	var trail: PackedVector2Array = _relay_history.get(key,PackedVector2Array())
	for i in range(1,trail.size()):
		var alpha := i / float(trail.size()) * 0.68
		line_px(trail[i-1],trail[i],Color(ink,alpha),2)

func _relay_aim(player: Vector2, aim: Vector2, holding: bool) -> void:
	if not Rect2(Vector2.ZERO,WORLD).has_point(aim):
		return
	var dir := player.direction_to(aim)
	if dir.length_squared() < 0.1:
		return
	var tint := DRINK if holding else BRASS
	var end := aim if holding else player + dir * minf(46,player.distance_to(aim))
	dots(player + dir * 12,end,Color(TAR,0.55),8.0,2)
	dots(player + dir * 12,end,Color(tint,0.9),8.0)
	if absf(dir.x) > 0.01:
		# The cap reflects once from either white plate. Keep the reflected
		# guide local to the edge so it never identifies the genuine worker.
		var wall_x := 12.0 if dir.x < 0 else 468.0
		var contact := player + dir * ((wall_x-player.x)/dir.x)
		if contact.y>=60 and contact.y<=278 and absf(aim.x-wall_x)<54:
			var reflected := Vector2(-dir.x,dir.y)
			dots(player + dir*14,contact,Color(BRASS,0.67),11.0)
			dots(contact,contact+reflected*42,Color(PAPER,0.9),6.0)
			_brackets(contact,3,3,BRASS)
	_brackets(aim.round(),5,5,TAR)
	_brackets(aim.round(),4,4,PAPER)

func _relay_moments(r: Dictionary) -> void:
	for event: Dictionary in r.get("events",[]):
		var age := int(r.tick) - int(event.atTick)
		if age < 0 or age > 24:
			continue
		var p := _relay_xy(event)
		match String(event.kind):
			"side_face":
				# The face occupies the top glass only. The entire floor below y=94,
				# including cap targets and bottle rings, stays visible.
				var side := -1 if p.x < 240 else 1
				var swell := smoothstep(0,5,age) * (1 - smoothstep(16,24,age))
				var w := 45.0 + 77 * swell
				var x := 2.0 if side < 0 else 478-w
				var frame := clampi(age/5,0,2)
				if not _relay_still("near_glass",frame,Rect2(x,-5,w,w*0.8),side>0):
					_decal("glass_grin",frame,3,Rect2(x,-10,w,w*0.85))
			"catch", "sign", "cap_caught", "cap_bounce", "switch", "pipe":
				impact(p,age / 8.0,BRASS if String(event.kind).begins_with("cap") else DRINK)
			"break", "window_hit", "miss", "late":
				impact(p,age / 9.0,ALERT)
			"hand_strike":
				if age < 8:
					_relay_still("label_hand",2,Rect2(p-Vector2(14,36),Vector2(28,42)))
					impact(p,age/8.0,FRESH)
			"hiss":
				if age < 10:
					draw_arc(p,6+age,-PI*0.9,-PI*0.12,12,Color(PAPER,1.0-age/10.0),1,false)
			"step", "replay_step", "replay_pipe", "replay_bell":
				if age < 12:
					var replay := String(event.kind).begins_with("replay_")
					var tint := ECHO_VIOLET if replay else BRASS
					var at := p + Vector2(4,-3 - age * 0.6)
					_sound_glyph(at, String(event.kind).trim_prefix("replay_"),tint)
					if replay:
						draw_arc(p,4+age,0,TAU,24,Color(tint,0.75*(1.0-age/12.0)),1,false)
						if age < 8:
							var names := {"replay_step":"脚步", "replay_pipe":"管响", "replay_bell":"铃声"}
							_stamp(p + Vector2(-24,-16),"回声·"+String(names[event.kind]),tint)

func relay_dispatch_floor(night: int, tutorial: bool) -> void:
	base_room(night >= 3,false)
	if night >= 3:
		box(15,95,450,172,Color("#302d2b1c"))
		_decal("palm_mark",0,1,Rect2(24,104,19,16),Color("#b09f96be"))
	if night >= 4:
		_smear(Vector2(452,102),Vector2(405,144),14,Color("#66333a"))
		_decal("palm_mark",0,1,Rect2(418,121,21,18))
	if night >= 5:
		_smear(Vector2(389,91),Vector2(443,128),14,DRIED)
		_decal("palm_mark",0,1,Rect2(72,94,26,22))
	_relay_mat(16,99,126,168)
	_relay_mat(351,99,114,168)
	if not tutorial:
		_stamp(Vector2(87,260),"消音胶垫", SEA)
		_stamp(Vector2(390,260),"消音胶垫", SEA)
		_stamp(Vector2(240,260),"响铁板", BRASS)
	for x in [12,468]:
		box(x-2,98,4,168,TAR)
		box(x-1,99,2,166,PAPER)
		for y in range(108,265,21):
			box(x-2,y,4,3,COPPER)
	# The overhead sign is stamped into the existing factory beam.
	_stamp(Vector2(240,92),"回　收　线",BRASS)

func relay_ground(r: Dictionary, state: Dictionary) -> void:
	var leg := String(r.leg)
	var t := float(r.tick) / 20
	var dispatch := leg == "dispatch"
	var tutorial := dispatch and int(state.night)==1 and int(state.order)==1
	var ward := leg in ["frog_switch","frog_lure"]
	var inlet := _relay_xy(r.inlet)
	var fork := _relay_xy(r.switch)
	# A continuous pair of brass rails still marks the normal delivery carriage
	# after the courier has lifted its bottle. The moving guide is laid over it.
	if dispatch:
		var destination := Vector2(312,210) if int(state.night) == 5 else Vector2(164,212)
		_belt(Vector2(235,153),destination,8,COPPER.darkened(0.2),r.tick * 0.4)
		if int(state.night) == 5:
			_belt(Vector2(185,156),Vector2(164,212),6,ECHO_VIOLET.darkened(0.35),r.tick*0.4)
		if not tutorial:
			var branch := Vector2(304,174) if r.route == "right" else Vector2(204,178)
			var elbow := Vector2((inlet.x+branch.x)*0.5,inlet.y-18)
			_belt(inlet,elbow,5,VIRIDIAN.darkened(0.3),r.tick*0.4)
			_belt(elbow,branch,5,VIRIDIAN.darkened(0.3),r.tick*0.4)
	elif not ward:
		for wall_x in [12,468]:
			dots(Vector2(wall_x,100),Vector2(wall_x,266),PAPER,7.0,2)
	for item: Dictionary in r.bottles:
		var state_key := String(item.state)
		if state_key in ["inbound","lower","loop"]:
			var path := _rail_path(item)
			for i in range(1,path.size()):
				_belt(path[i-1],path[i],4 if ward else 8,COPPER if state_key == "inbound" else VIRIDIAN,r.tick*0.67)
	if dispatch:
		var occupied := {}
		for w: Dictionary in r.windows:
			occupied[int(w.slot)] = true
		for i in range(SLOTS.size()):
			if not occupied.has(i):
				shutter(SLOTS[i],int(state.night)>=3)
	for w: Dictionary in r.windows:
		var actor := "frog"
		var cast: Array = state.get("windows",[])
		if not cast.is_empty():
			actor = String(cast[0].actor)
		_relay_hatch(w,actor,leg=="signature" or int(state.night)>=5,dispatch,t)
	if dispatch:
		_feeder(Vector2(235,153),false)
		if int(state.night)==5:
			_feeder(Vector2(185,156),true)
	if not tutorial:
		if leg != "frog_switch":
			_return_socket(inlet)
		if leg != "frog_lure":
			_switch_plate(fork,String(r.route))
	var pipes: Array = [] if tutorial else r.get("pipes",[])
	for pipe: Dictionary in pipes:
		var at := _relay_xy(pipe)
		var heard := false
		for e: Dictionary in r.events:
			if e.kind == "pipe" and int(r.tick)-int(e.atTick) < 12 and at.distance_to(_relay_xy(e)) < 12:
				heard = true
		var direction := 1 if at.x < 240 else -1
		if dispatch:
			_pipe_supply(at,direction)
		_pipe_mouth(at,direction,heard)
	# The rack sits directly under the old pressure plate in the maintenance leg.
	# Its small cap tray must not conceal the lever or the recorded footprints.
	if dispatch and not tutorial:
		_rack(_relay_xy(r.rack),int(r.caps))
		_stamp(inlet+Vector2(0,18),"回收入口",DRINK)
	for item: Dictionary in r.bottles:
		if String(item.state) in ["inbound","lower","loop"]:
			_bottle_route(item,_relay_xy(item),_rail_path(item))
			_catch_mark(item,leg != "frog_switch",state.story.get("people",[]) if ward else [])
	_sound_travel(r.hunter,t)

func relay_objects(r: Dictionary, p: Vector2, aim_from: Vector2, aim: Vector2, blend: float, tutorial: bool) -> void:
	var held := false
	for item: Dictionary in r.bottles:
		var state_key := String(item.state)
		var echo: bool = item.kind == "echo"
		var key := "b%d/%s" % [int(item.id),state_key]
		var at := _relay_at(key,item,blend)
		var frame := 0
		if state_key == "signed":
			continue
		if bool(item.catchable):
			at = _relay_xy(item)
			frame = 1 + (int(r.tick) / 3) % 2
		if state_key == "held":
			held = true
			var side := -1 if aim.x >= 0 and aim.x < p.x else 1
			at = p + Vector2(11*side,-5)
			_mouse_key(Vector2(13,275),true,DRINK)
			_stamp(Vector2(56,283),"已接住 · 松开送瓶",DRINK)
		elif state_key == "flight":
			_relay_motion(key,PAPER if echo else DRINK)
		_relay_bottle(at,echo,item.sounds,frame)
	var cap: Variant = r.get("cap")
	if cap is Dictionary:
		var at := _relay_at("cap",cap,blend)
		_relay_motion("cap",PAPER if bool(cap.bounced) else BRASS)
		cap_sprite(at)
		if bool(cap.bounced):
			_brackets(at,5,3,PAPER)
	if String(r.stage) == "running":
		_relay_aim(aim_from,aim,held)
	if tutorial:
		var at := p.round() + Vector2(-8,-40)
		box(at.x,at.y,17,13,TAR)
		box(at.x+1,at.y+1,15,11,PAPER)
		draw_string(_stamp_font,at+Vector2(0,10),"你",HORIZONTAL_ALIGNMENT_CENTER,17,10,TAR)
		line_px(at+Vector2(8,13),p-Vector2(0,24),PAPER)
	_relay_moments(r)

func fourth_bottle_marks(s: Dictionary) -> void:
	var tick := int(s.get("stageTick",0))
	_belt(Vector2(424,175),Vector2(88,175),10,ECHO_VIOLET,tick*0.6)
	_feeder(Vector2(424,175),true)
	for mark: Dictionary in s.get("marks",[]):
		var k := String(mark.kind)
		if k.begins_with("echo_"):
			var p := _relay_xy(mark)
			draw_arc(p,16,0,TAU,24,Color(ECHO_VIOLET,0.8),2,false)
			_sound_glyph(p+Vector2(0,-18),k.trim_prefix("echo_"),PAPER)

func ward_relay_marks(s: Dictionary, player: Vector2, aim: Vector2) -> void:
	for mark: Dictionary in s.get("marks",[]):
		if mark.kind == "lured_pane":
			var at := _relay_xy(mark) + Vector2(0,20)
			_sound_glyph(at,"step",ECHO_VIOLET)
			for dx in [-7,7]:
				line_px(at + Vector2(dx,-2),at + Vector2(dx,2),ECHO_VIOLET)
		elif mark.kind == "ward_bottle":
			var side := -1 if aim.x >= 0 and aim.x < player.x else 1
			_relay_bottle(player + Vector2(11 * side,-5),false,[],0)

func signature_echo_face(s: Dictionary, echo: Vector2) -> void:
	if s.get("step") != "sill_clear" or s.get("cue") != "press_slam":
		return
	var ticks := int(s.get("stageTick",0))
	var reach := smoothstep(0.0,6.0,ticks)
	_decal("glass_grin",clampi(ticks/3,0,2),3,Rect2(echo-Vector2(13,30),Vector2(27,24)))
	var width := 36 + 79 * reach
	_relay_still("near_glass",clampi(ticks/3,0,2),Rect2(-6,-8,width,width*0.8))
