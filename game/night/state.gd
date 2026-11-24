class_name NightState
extends RefCounted

const PHASES := ["serving", "escaping", "clockout", "won", "escaped", "lost"]
const EVENTS := ["start", "probe", "throw", "bounce", "miss", "blocked", "deliver",
	"intruder", "lever", "escape", "lost", "clockout", "won"]
const MAX_WIRE_INT := 9007199254740991
const RELAY_EVENTS := ["incoming","catch","miss","lower","break","retry","release","loop","switch",
	"cap_fire","cap_bounce","cap_caught","cap_through","pipe","step","replay_step","replay_pipe",
	"replay_bell","hand_warn","hand_strike","window_hit","late","sign","side_face","empty","hiss"]

static func integer(value: Variant, low: int, high: int) -> bool:
	if typeof(value) != TYPE_FLOAT and typeof(value) != TYPE_INT:
		return false
	var number := float(value)
	return is_finite(number) and number == floor(number) and number >= low and number <= high

static func _number(value: Variant, low: float, high: float) -> bool:
	if typeof(value) != TYPE_FLOAT and typeof(value) != TYPE_INT:
		return false
	return is_finite(float(value)) and value >= low and value <= high

static func _choice(value: Variant, options: Array) -> bool:
	return typeof(value) == TYPE_STRING and value in options

static func valid_uuid(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != 36:
		return false
	var parts: PackedStringArray = value.split("-")
	if parts.size() != 5:
		return false
	var sizes := [8,4,4,4,12]
	for i in parts.size():
		if parts[i].length() != sizes[i] or not parts[i].is_valid_hex_number(false):
			return false
		for ch in parts[i]:
			if not ch in "0123456789abcdefABCDEF":
				return false
	return true

static func valid_token(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != 43:
		return false
	for ch in str(value):
		if not ch in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_":
			return false
	return true

static func terminal(view: Dictionary) -> bool:
	return view.get("phase", "") in ["won", "escaped", "lost"]

static func profile(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY or not integer(raw.get("unlocked"), 1, 8) or not integer(raw.get("bestClean"), 0, 3):
		return {}
	if typeof(raw.get("cleared")) != TYPE_ARRAY or raw.cleared.size() > 8:
		return {}
	var completed: Array[int] = []
	for night: Variant in raw.cleared:
		if not integer(night, 1, int(raw.unlocked)) or completed.has(int(night)):
			return {}
		completed.append(int(night))
	completed.sort()
	if completed.size() < 8 and int(raw.unlocked) != completed.size() + 1:
		return {}
	for i in completed.size():
		if completed[i] != i + 1:
			return {}
	return {"unlocked":int(raw.unlocked), "cleared":completed, "bestClean":int(raw.bestClean)}

static func _story_points(raw: Variant, group: String) -> Variant:
	if typeof(raw) != TYPE_ARRAY or raw.size() > 160:
		return null
	var result: Array[Dictionary] = []
	for item: Variant in raw:
		if typeof(item) != TYPE_DICTIONARY or not _number(item.get("x"), 0, 480) or not _number(item.get("y"), 0, 288):
			return null
		var point := {"x":float(item.x), "y":float(item.y)}
		if group == "tiles":
			if not _choice(item.get("state"), ["solid", "warn", "hole", "mend"]) or not integer(item.get("ticks"), 0, MAX_WIRE_INT):
				return null
			point.state = str(item.state)
			point.ticks = int(item.ticks)
		else:
			if typeof(item.get("kind")) != TYPE_STRING or item.kind.is_empty() or item.kind.length() > 48:
				return null
			point.kind = str(item.kind)
			if group == "people":
				if not integer(item.get("slot"), -1, 8):
					return null
				point.slot = int(item.slot)
		result.append(point)
	return result

static func _relay_xy(raw: Variant, x := "x", y := "y") -> bool:
	return typeof(raw) == TYPE_DICTIONARY and _number(raw.get(x), 0, 480) and _number(raw.get(y), 0, 288)

static func _point(raw: Dictionary) -> Dictionary:
	return {"x":float(raw.x), "y":float(raw.y)}

static func _relay_points(raw: Variant, minimum: int, maximum: int) -> Variant:
	if typeof(raw) != TYPE_ARRAY or raw.size() < minimum or raw.size() > maximum:
		return null
	var points: Array[Dictionary] = []
	for point: Variant in raw:
		if not _relay_xy(point):
			return null
		points.append(_point(point))
	return points

static func _sounds(raw: Variant) -> Variant:
	if typeof(raw) != TYPE_ARRAY or raw.size() > 3:
		return null
	var sounds: Array[Dictionary] = []
	for sound: Variant in raw:
		if typeof(sound) != TYPE_DICTIONARY or not _choice(sound.get("kind"), ["step","pipe","bell"]) or not integer(sound.get("gap"), 0, MAX_WIRE_INT):
			return null
		sounds.append({"kind":str(sound.kind),"gap":int(sound.gap)})
	return sounds

static func _relay_bottle(raw: Variant) -> Dictionary:
	if not _relay_xy(raw) or not _relay_xy(raw, "catchX", "catchY") or not integer(raw.get("id"), 1, 2):
		return {}
	if not _choice(raw.get("kind"), ["cargo","echo"]) or not _choice(raw.get("state"), ["inbound","lower","loop","held","flight","signed"]):
		return {}
	if not integer(raw.get("eta"), -MAX_WIRE_INT, MAX_WIRE_INT) or not integer(raw.get("window"), 0, MAX_WIRE_INT):
		return {}
	if not _number(raw.get("radius"), 0, 480) or typeof(raw.get("catchable")) != TYPE_BOOL:
		return {}
	var sounds: Variant = _sounds(raw.get("sounds"))
	if sounds == null:
		return {}
	var track: Variant = _relay_points(raw.get("track"),0,3)
	if track == null:
		return {}
	return {"id":int(raw.id), "kind":str(raw.kind), "state":str(raw.state), "x":float(raw.x), "y":float(raw.y),
		"catchX":float(raw.catchX), "catchY":float(raw.catchY), "eta":int(raw.eta), "window":int(raw.window),
		"radius":float(raw.radius), "catchable":bool(raw.catchable), "sounds":sounds,"track":track}

static func _relay(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY or not _choice(raw.get("leg"), ["dispatch","maintenance","signature","frog_switch","frog_lure"]):
		return {}
	if not _choice(raw.get("stage"), ["running","signed","complete"]) or not _choice(raw.get("route"), ["left","right"]):
		return {}
	if not integer(raw.get("tick"), 0, MAX_WIRE_INT) or not integer(raw.get("caps"), 0, 3) or typeof(raw.get("clean")) != TYPE_BOOL:
		return {}
	if typeof(raw.get("routed")) != TYPE_BOOL or typeof(raw.get("recaught")) != TYPE_BOOL:
		return {}
	if typeof(raw.get("objective")) != TYPE_STRING or raw.objective.length() > 240:
		return {}
	if typeof(raw.get("bottles")) != TYPE_ARRAY or raw.bottles.size() > 2:
		return {}
	var bottles: Array[Dictionary] = []
	var ids: Array[int] = []
	for item: Variant in raw.bottles:
		var bottle := _relay_bottle(item)
		if bottle.is_empty() or ids.has(bottle.id):
			return {}
		bottles.append(bottle)
		ids.append(bottle.id)
	if typeof(raw.get("windows")) != TYPE_ARRAY or raw.windows.size() > 4:
		return {}
	var panes: Array[Dictionary] = []
	var slots: Array[int] = []
	for pane: Variant in raw.windows:
		if not _relay_xy(pane) or not integer(pane.get("slot"), 0, 3) or slots.has(int(pane.slot)):
			return {}
		if not _number(pane.get("halfWidth"), 0, 240) or typeof(pane.get("open")) != TYPE_BOOL:
			return {}
		if not integer(pane.get("openTicks"), -1, 39) or pane.open != (pane.openTicks != 0):
			return {}
		if not _choice(pane.get("reaction"), ["none","caught","through"]) or not integer(pane.get("ticks"), 0, MAX_WIRE_INT):
			return {}
		slots.append(int(pane.slot))
		panes.append({"slot":int(pane.slot), "x":float(pane.x), "y":float(pane.y), "halfWidth":float(pane.halfWidth),
			"open":bool(pane.open), "openTicks":int(pane.openTicks), "reaction":str(pane.reaction), "ticks":int(pane.ticks)})
	if not raw.has("cap"):
		return {}
	var cap: Variant = null
	if raw.cap != null:
		if not _relay_xy(raw.cap) or typeof(raw.cap.get("bounced")) != TYPE_BOOL:
			return {}
		cap = {"x":float(raw.cap.x), "y":float(raw.cap.y), "bounced":bool(raw.cap.bounced)}
	for station: String in ["switch","inlet","rack"]:
		if not _relay_xy(raw.get(station)):
			return {}
	var pipes: Variant = _relay_points(raw.get("pipes"),2,2)
	if pipes == null:
		return {}
	var hunter: Variant = raw.get("hunter")
	if not _relay_xy(hunter) or not _relay_xy(hunter, "targetX", "targetY"):
		return {}
	if not _choice(hunter.get("state"), ["quiet","turn","chase","warn","strike"]) or not integer(hunter.get("ticks"), 0, MAX_WIRE_INT):
		return {}
	if typeof(raw.get("events")) != TYPE_ARRAY or raw.events.size() > 16:
		return {}
	var events: Array[Dictionary] = []
	var last_id := 0
	for event: Variant in raw.events:
		if not _relay_xy(event) or not integer(event.get("id"), last_id + 1, MAX_WIRE_INT) or not _choice(event.get("kind"), RELAY_EVENTS):
			return {}
		if not integer(event.get("slot"), -1, 3) or not integer(event.get("atTick"), 0, MAX_WIRE_INT):
			return {}
		last_id = int(event.id)
		events.append({"id":last_id, "kind":str(event.kind), "x":float(event.x), "y":float(event.y),
			"slot":int(event.slot), "atTick":int(event.atTick)})
	return {"leg":str(raw.leg), "tick":int(raw.tick), "stage":str(raw.stage), "route":str(raw.route),
		"caps":int(raw.caps), "clean":bool(raw.clean), "routed":bool(raw.routed), "recaught":bool(raw.recaught),
		"objective":str(raw.objective), "bottles":bottles, "cap":cap,
		"windows":panes, "switch":_point(raw.switch), "inlet":_point(raw.inlet), "rack":_point(raw.rack), "pipes":pipes,
		"hunter":{"x":float(hunter.x), "y":float(hunter.y), "targetX":float(hunter.targetX), "targetY":float(hunter.targetY),
			"state":str(hunter.state), "ticks":int(hunter.ticks)}, "events":events}

static func _story(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY:
		return {}
	for key: String in ["step", "room", "objective", "cue"]:
		if typeof(raw.get(key)) != TYPE_STRING or raw[key].length() > (240 if key == "objective" else 80):
			return {}
	if not integer(raw.get("stageTick"), 0, MAX_WIRE_INT) or not integer(raw.get("cueId"), 0, MAX_WIRE_INT):
		return {}
	var story := {"step":str(raw.step), "room":str(raw.room), "objective":str(raw.objective), "cue":str(raw.cue),
		"stageTick":int(raw.stageTick), "cueId":int(raw.cueId)}
	if not integer(raw.get("round"), 0, 3) or not integer(raw.get("sleepMax"), 0, 1200) or not integer(raw.get("braceMax"), 0, 120):
		return {}
	if not integer(raw.get("sleepTicks"), 0, int(raw.sleepMax)) or not integer(raw.get("braceTicks"), 0, int(raw.braceMax)):
		return {}
	for key: String in ["round", "sleepMax", "sleepTicks", "braceMax", "braceTicks"]:
		story[key] = int(raw[key])
	if raw.has("plateTicks"):
		if not integer(raw.plateTicks, 0, 40):
			return {}
		story.plateTicks = int(raw.plateTicks)
	for group: String in ["tiles", "people", "marks"]:
		var points: Variant = _story_points(raw.get(group), group)
		if points == null:
			return {}
		story[group] = points
	if raw.get("relay") != null:
		var relay := _relay(raw.relay)
		if relay.is_empty():
			return {}
		story.relay = relay
	elif raw.has("relay"):
		story.relay = null
	if raw.has("fourthSounds"):
		var sounds: Variant = _sounds(raw.fourthSounds)
		if sounds == null:
			return {}
		story.fourthSounds = sounds
	return story

static func snapshot(raw: Variant) -> Dictionary:
	if typeof(raw) != TYPE_DICTIONARY or not valid_uuid(raw.get("runId")):
		return {}
	if not integer(raw.get("ack"), -1, MAX_WIRE_INT) or not integer(raw.get("tick"), 0, MAX_WIRE_INT):
		return {}
	if not integer(raw.get("night"), 1, 8) or not integer(raw.get("order"), 1, 3) or not integer(raw.get("delivered"), 0, 3):
		return {}
	if not _choice(raw.get("phase"), PHASES) or not _choice(raw.get("event"), EVENTS) or not integer(raw.get("eventId"), 0, MAX_WIRE_INT):
		return {}
	if not _choice(raw.get("memory"), ["left","right"]) or not _choice(raw.get("probe"), ["none","left","right"]):
		return {}
	if not _choice(raw.get("lever"), ["left","right"]) or not integer(raw.get("belt"), -1, 1):
		return {}
	if not integer(raw.get("probeTicks"), 0, MAX_WIRE_INT) or not integer(raw.get("escapeTicks"), 0, MAX_WIRE_INT) or not integer(raw.get("pressure"), -1, MAX_WIRE_INT):
		return {}
	for key in ["dim", "bank", "latched"]:
		if typeof(raw.get(key)) != TYPE_BOOL:
			return {}
	if typeof(raw.get("paused", false)) != TYPE_BOOL:
		return {}
	var player: Variant = raw.get("player")
	if typeof(player) != TYPE_DICTIONARY or not _number(player.get("x"), 16, 464) or not _number(player.get("y"), 98, 267):
		return {}
	if not raw.has("chase"):
		return {}
	if raw.phase == "escaping":
		var chase: Variant = raw.chase
		if typeof(chase) != TYPE_DICTIONARY or not _number(chase.get("x"),16,464) or not _number(chase.get("y"),87,267):
			return {}
	elif raw.chase != null:
		return {}
	if not raw.has("bottle"):
		return {}
	if raw.bottle != null:
		var bottle: Variant = raw.bottle
		if typeof(bottle) != TYPE_DICTIONARY or not _number(bottle.get("x"), 0, 480) or not _number(bottle.get("y"), 0, 288):
			return {}
		if not _number(bottle.get("vx"), -480, 480) or not _number(bottle.get("vy"), -288, 288) or typeof(bottle.get("bounced")) != TYPE_BOOL:
			return {}
	var slots: Array
	if raw.night == 1:
		slots = [1]
	elif raw.night <= 4:
		slots = [0, 2]
	else:
		slots = [0, 1, 2]
	if typeof(raw.get("windows")) != TYPE_ARRAY or raw.windows.size() != slots.size():
		return {}
	var seen_slots: Array[int] = []
	var windows: Array[Dictionary] = []
	for window: Variant in raw.windows:
		if typeof(window) != TYPE_DICTIONARY or not integer(window.get("slot"), 0, 2) or int(window.slot) not in slots or seen_slots.has(int(window.slot)):
			return {}
		if not _choice(window.get("actor"), ["frog","egg"]) or not _choice(window.get("look"), ["still","left","right"]):
			return {}
		seen_slots.append(int(window.slot))
		windows.append({"slot":int(window.slot), "actor":str(window.actor), "look":str(window.look)})
	# Build the validated wire view once. JSON integers can arrive as floats in Godot.
	var view := {"runId":str(raw.runId), "phase":str(raw.phase), "event":str(raw.event), "memory":str(raw.memory),
		"probe":str(raw.probe), "lever":str(raw.lever), "player":{"x":float(player.x),"y":float(player.y)},
		"windows":windows, "bottle":null, "chase":null, "paused":bool(raw.get("paused", false))}
	for key in ["ack", "tick", "night", "order", "delivered", "eventId", "probeTicks", "escapeTicks", "pressure", "belt"]:
		view[key] = int(raw[key])
	for key in ["dim", "bank", "latched"]:
		view[key] = bool(raw[key])
	if raw.bottle != null:
		view.bottle = {"x":float(raw.bottle.x),"y":float(raw.bottle.y),"vx":float(raw.bottle.vx),
			"vy":float(raw.bottle.vy),"bounced":bool(raw.bottle.bounced)}
	if raw.chase != null:
		view.chase = {"x":float(raw.chase.x), "y":float(raw.chase.y)}
	if raw.has("story"):
		var story := _story(raw.story)
		if story.is_empty():
			return {}
		view.story = story
	return view
