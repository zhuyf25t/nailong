class_name NightState
extends RefCounted

const PHASES := ["serving", "escaping", "clockout", "won", "escaped", "lost"]
const EVENTS := ["start", "probe", "throw", "bounce", "miss", "blocked", "deliver",
	"intruder", "lever", "escape", "lost", "clockout", "won"]
const MAX_WIRE_INT := 9007199254740991

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
